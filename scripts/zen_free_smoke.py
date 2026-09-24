from __future__ import annotations

import json
import os
import sys

from jev_control_plane.provider import JevProviderError, ZenFreeProvider


def main() -> int:
    provider = ZenFreeProvider(
        client_id=os.environ.get(
            "JEV_ZEN_CLIENT_ID", "jev-browser-control-plane"
        )
    )
    try:
        result = provider.system_one(
            state={
                "task": "Connectivity smoke test only.",
                "facts": ["The expected answer is ready."],
            },
            questions={
                "status": {
                    "type": "choice",
                    "instructions": "Choose the statement supported by the supplied facts.",
                    "criteria": {
                        "ready": "The supplied facts say the test is ready.",
                        "not_ready": "The supplied facts say the test is not ready.",
                    },
                }
            },
        )
    except JevProviderError as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "code": error.code,
                    "status": error.status,
                    "message": str(error),
                },
                ensure_ascii=False,
            )
        )
        return 2

    answer = result.get("answers", {}).get("status", {})
    ok = answer.get("choice") == "ready"
    print(
        json.dumps(
            {
                "ok": ok,
                "provider": provider.status().to_dict(),
                "answer": answer,
            },
            ensure_ascii=False,
        )
    )
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
