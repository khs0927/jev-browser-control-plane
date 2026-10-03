"""Public, bounded environment fixture for Mobile Work Gateway."""
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

def collect():
    probe = subprocess.run(
        [sys.executable, "-c", "import json; assert json.loads(json.dumps(dict(ok=True)))['ok']"],
        capture_output=True, text=True, timeout=10,
    )
    return {
        "schema_version": 1,
        "task_type": "environment_check",
        "python_version": platform.python_version(),
        "test_passed": probe.returncode == 0,
        "commit_sha": os.environ.get("GITHUB_SHA"),
        "run_id": os.environ.get("GITHUB_RUN_ID"),
        "run_attempt": int(os.environ.get("GITHUB_RUN_ATTEMPT", "1")),
        "summary": "Python JSON fixture passed." if probe.returncode == 0 else "Python JSON fixture failed.",
        "findings": [] if probe.returncode == 0 else [{"code": "environment_fixture_failed"}],
        "evidence": ["result.json", "report.md"],
    }

if __name__ == "__main__":
    result = collect()
    output = Path("mobile-work-results")
    output.mkdir(exist_ok=True)
    (output / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    (output / "report.md").write_text(
        f"# Environment check\n\nPython: {result['python_version']}\n\n"
        f"Fixture passed: {result['test_passed']}\n\nCommit: {result['commit_sha']}\n", encoding="utf-8")
    raise SystemExit(0 if result["test_passed"] else 1)
