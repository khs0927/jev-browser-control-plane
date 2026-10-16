#!/usr/bin/env python3
"""Authenticated lease event emitter for a reviewed external worker (opt-in)."""
import argparse
import hashlib
import json
import os
import re
import sys
from urllib import error, parse, request

ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$")


def prepare(event: str, job_id: str, run_id: str, seq: int, url: str, token: str):
    if event not in ("start", "heartbeat", "finish"):
        raise ValueError("unrecognized_event")
    if not ID_RE.fullmatch(job_id) or not ID_RE.fullmatch(run_id):
        raise ValueError("invalid_job_or_run_id")
    if seq < 1 or seq > 2**53 - 1 or (event == "start" and seq != 1) or (event != "start" and seq == 1):
        raise ValueError("invalid_sequence")
    target = parse.urlsplit(url)
    if (target.scheme != "https" or not target.netloc or target.username or
            target.password or target.query or target.fragment or
            target.path not in ("", "/")):
        raise ValueError("invalid_monitor_url")
    if not re.fullmatch(r"[A-Za-z0-9._~-]{32,256}", token):
        raise ValueError("invalid_token_configuration")
    digest = hashlib.sha256(f"{run_id}\0{event}\0{seq}".encode()).hexdigest()
    body = json.dumps({"type": event, "run_id": run_id, "seq": seq,
                       "event_id": digest}, separators=(",", ":")).encode()
    target_url = url.rstrip("/") + "/v1/jobs/" + parse.quote(job_id, safe="") + "/events"
    return request.Request(target_url, data=body, method="POST", headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "jev-idle-lease-emitter/1",
    })


def main(argv=None):
    p = argparse.ArgumentParser(description="Send one scoped idle lease event")
    p.add_argument("event", choices=("start", "heartbeat", "finish"))
    p.add_argument("--job-id", required=True)
    p.add_argument("--run-id", required=True)
    p.add_argument("--seq", required=True, type=int)
    args = p.parse_args(argv)
    try:
        req = prepare(args.event, args.job_id, args.run_id, args.seq,
                      os.environ.get("IDLE_LEASE_URL", ""),
                      os.environ.get("IDLE_LEASE_TOKEN", ""))
        with request.urlopen(req, timeout=12) as resp:
            if resp.status not in (200, 201):
                raise RuntimeError("unexpected_http_status")
            result = json.load(resp)
        if result.get("status") not in ("RUNNING", "FINISHED"):
            raise RuntimeError("unexpected_monitor_state")
        print(f"lease event acknowledged: {args.event}; state={result['status']}")
        return 0
    except error.HTTPError as exc:
        print(f"idle lease emitter failed: http_{exc.code}", file=sys.stderr)
    except (ValueError, RuntimeError, error.URLError, OSError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"idle lease emitter failed: {type(exc).__name__}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
