from __future__ import annotations

import json
import os
import sys
import time

from jev_control_plane.bridge import BrowserBridge
from jev_control_plane.router import JevRouter


def main() -> int:
    if not os.getenv("TYPESAFE_API_KEY"):
        print("FAIL typesafe credential unavailable", file=sys.stderr)
        return 2

    started = time.perf_counter()
    decision = JevRouter().choose(
        state={
            "goal": "Inspect the currently connected browser without changing page state.",
            "available_runtime": ["browser"],
        },
        instructions="Choose the runtime that should handle this task.",
        candidates={
            "browser": "Use the connected browser runtime.",
            "blocked": "No browser runtime is appropriate.",
        },
        question_name="runtime",
    )
    jev_ms = round((time.perf_counter() - started) * 1000)

    if decision.choice != "browser":
        print(json.dumps({
            "ok": False,
            "stage": "jev",
            "choice": decision.choice,
            "confidence": decision.confidence,
            "latency_ms": jev_ms,
        }))
        return 3

    bridge = BrowserBridge()
    health = bridge.health()
    if not health.get("agentConnected"):
        print(json.dumps({
            "ok": False,
            "stage": "browser",
            "jev_confidence": decision.confidence,
            "jev_latency_ms": jev_ms,
            "bridge_status": health.get("status"),
            "agent_connected": False,
        }))
        return 4

    browser_started = time.perf_counter()
    snapshot = bridge.call("browser_snapshot", {})
    browser_ms = round((time.perf_counter() - browser_started) * 1000)

    # Do not print browser content. Only report that a non-empty result arrived.
    result_size = len(json.dumps(snapshot, ensure_ascii=False))
    print(json.dumps({
        "ok": result_size > 2,
        "stage": "complete",
        "jev_confidence": decision.confidence,
        "jev_latency_ms": jev_ms,
        "browser_latency_ms": browser_ms,
        "snapshot_bytes": result_size,
    }))
    return 0 if result_size > 2 else 5


if __name__ == "__main__":
    raise SystemExit(main())
