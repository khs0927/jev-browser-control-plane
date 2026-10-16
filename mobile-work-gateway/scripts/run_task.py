"""Allowlisted task dispatcher for Mobile Work Gateway. Inputs arrive via env, never via shell interpolation."""
import ipaddress
import json
import os
import platform
import socket
import subprocess
import sys
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

OUT = Path("mobile-work-results")
GATEWAY = Path("mobile-work-gateway/gateway")


def base(task_type, passed, summary, findings):
    return {
        "schema_version": 1,
        "task_type": task_type,
        "python_version": platform.python_version(),
        "test_passed": passed,
        "commit_sha": os.environ.get("GITHUB_SHA"),
        "run_id": os.environ.get("GITHUB_RUN_ID"),
        "run_attempt": int(os.environ.get("GITHUB_RUN_ATTEMPT", "1")),
        "summary": summary[:1000],
        "findings": findings[:20],
        "evidence": ["result.json", "report.md"],
    }


def gateway_tests():
    log = []
    ok = True
    for step in (["npm", "ci"], ["npm", "run", "check"], ["npm", "test"]):
        proc = subprocess.run(step, cwd=GATEWAY, capture_output=True, text=True, timeout=420, check=False)
        log.append(f"## {' '.join(step)}: exit {proc.returncode}\n\n```\n{(proc.stdout + proc.stderr)[-4000:]}\n```\n")
        if proc.returncode != 0:
            ok = False
            break
    summary = "Gateway check and tests passed." if ok else "Gateway check or tests failed; see report.md."
    return base("gateway_tests", ok, summary, [] if ok else [{"code": "gateway_tests_failed"}]), "\n".join(log)



@lru_cache(maxsize=64)
def _public_dns(host):
    """Reject every host that resolves to any non-global address."""
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        return bool(addresses) and all(
            ipaddress.ip_address(entry[4][0]).is_global for entry in addresses
        )
    except (OSError, ValueError):
        return False


def safe_browser_url(url, expected_host):
    """Fail closed for redirects and requests outside the reviewed public host."""
    try:
        parts = urlparse(url)
        host = (parts.hostname or "").lower().rstrip(".")
        if (
            parts.scheme != "https" or not host or
            parts.username or parts.password or
            parts.port not in (None, 443) or
            host != expected_host or
            host in ("localhost",) or
            host.endswith((".local", ".internal", ".localhost", ".test", ".invalid", ".home.arpa"))
        ):
            return False
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            pass
        return _public_dns(host)
    except (ValueError, TypeError):
        return False


def browser_check():
    url = os.environ.get("MWG_TARGET_URL", "")
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    if not safe_browser_url(url, host):
        return base("browser_check", False, "Rejected non-public target URL.", [{"code": "invalid_target_url"}]), "Rejected URL\n"
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            service_workers="block",
            accept_downloads=False,
        )
        page = context.new_page()
        def guard(route):
            if safe_browser_url(route.request.url, host):
                route.continue_()
            else:
                route.abort("blockedbyclient")
        page.route("**/*", guard)
        try:
            resp = page.goto(url, wait_until="load", timeout=30000)
            status = resp.status if resp else 0
            title = page.title()[:200]
            page.screenshot(path=str(OUT / "screenshot.png"), full_page=False)
            ok = 200 <= status < 400
            result = base("browser_check", ok, f"Loaded {parsed.hostname} with HTTP {status}.", [] if ok else [{"code": "http_error"}])
            result["page_title"] = title
            result["http_status"] = status
            result["evidence"].append("screenshot.png")
        except Exception as exc:  # noqa: BLE001 - intentional fail-closed boundary
            result = base("browser_check", False, f"Navigation failed: {type(exc).__name__}", [{"code": "navigation_failed"}])
        finally:
            browser.close()
    return result, f"Hostname: {host}\n\nTitle: {result.get('page_title', '')}\n\nHTTP: {result.get('http_status', '')}\n"


def environment_check():
    sys.path.insert(0, str(Path(__file__).parent))
    from environment_check import collect
    r = collect()
    return r, f"Python: {r['python_version']}\n\nFixture passed: {r['test_passed']}\n"


TASKS = {"environment_check": environment_check, "gateway_tests": gateway_tests, "browser_check": browser_check}

if __name__ == "__main__":
    task_type = os.environ.get("MWG_TASK_TYPE") or "environment_check"
    if task_type not in TASKS:
        raise SystemExit("Unsupported task type")
    OUT.mkdir(exist_ok=True)
    result, detail = TASKS[task_type]()
    (OUT / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    (OUT / "report.md").write_text(f"# {task_type}\n\nCommit: {result['commit_sha']}\n\nPassed: {result['test_passed']}\n\n{detail}", encoding="utf-8")
    raise SystemExit(0 if result["test_passed"] else 1)
