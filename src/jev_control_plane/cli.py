from __future__ import annotations

import argparse
import json
import os

from .bridge import BrowserBridge
from .policy import DecisionPolicy
from .router import JevRouter


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="jevctl")
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("bridge-health")
    commands.add_parser("bridge-tools")

    aside = commands.add_parser("aside-setup")
    aside.add_argument("--profile", required=True, help="Aside accountRoot directory")
    aside.add_argument("--apply", action="store_true", help="Apply after previewing the account-scoped changes")

    route = commands.add_parser("route")
    route.add_argument("--state", required=True, help="JSON state")
    route.add_argument("--instructions", required=True)
    route.add_argument("--candidates", required=True, help="JSON object")
    return root


def main() -> int:
    args = parser().parse_args()

    if args.command == "bridge-health":
        print(json.dumps(BrowserBridge().health(), indent=2, ensure_ascii=False))
        return 0

    if args.command == "bridge-tools":
        print(json.dumps(BrowserBridge().tools(), indent=2, ensure_ascii=False))
        return 0

    if args.command == "aside-setup":
        from .aside_setup import apply as apply_aside
        from .aside_setup import plan as plan_aside

        if args.apply:
            output = apply_aside(args.profile)
        else:
            output = plan_aside(args.profile)[0].to_dict()
            output["applied"] = False
        print(json.dumps(output, indent=2, ensure_ascii=False))
        return 0

    if args.command == "route":
        decision = JevRouter().choose(
            state=json.loads(args.state),
            instructions=args.instructions,
            candidates=json.loads(args.candidates),
        )
        policy = DecisionPolicy(
            auto_confidence=float(os.getenv("JEV_AUTO_CONFIDENCE", "0.88")),
            planner_confidence=float(os.getenv("JEV_PLANNER_CONFIDENCE", "0.62")),
        )
        print(json.dumps({
            "choice": decision.choice,
            "confidence": decision.confidence,
            "probabilities": dict(decision.probabilities),
            "disposition": policy.disposition(decision).value,
        }, indent=2, ensure_ascii=False))
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
