"""Live smoke test for the Jev decision layer.

Runs one question of each System One type against the official TypeSafe API.
Read-only and harmless: it classifies a fixed sentence and a fixed table. It
performs no browser work and no external effect.

    TYPESAFE_API_KEY=... PYTHONPATH=src python scripts/jev_smoke.py

The key is read from the environment by the SDK. Never pass it as an argument and
never paste it into a conversation, a skill file, or a project file.
"""

from __future__ import annotations

import json
import os
import sys

STATE = "결제 실패가 3일째 계속되어 판매를 잃고 있습니다. 지금 asap로 도와주세요."

CANDIDATES = {
    "billing": "결제와 구독 문제",
    "technical": "버그와 연동 문제",
    "other": "위 항목에 해당하지 않음",
}

SEVERITY = ["낮음", "중간", "높음"]


def main() -> int:
    if not os.environ.get("TYPESAFE_API_KEY"):
        print("TYPESAFE_API_KEY is not set.", file=sys.stderr)
        print("Get one at https://console.typesafe.ai/", file=sys.stderr)
        return 2

    from typesafe_sdk import TypeSafeClient

    from jev_control_plane.policy import DecisionPolicy, disposition_for_noul
    from jev_control_plane.router import JevRouter

    router = JevRouter(client=TypeSafeClient())
    policy = DecisionPolicy()

    noul = router.noul(
        state=STATE,
        instructions="이 메시지는 긴급함 또는 시간 민감성을 나타내는가?",
        question_name="is_urgent",
    )
    print("noul")
    print(f"  noul       = {noul.noul}")
    print(f"  model      = {noul.model}")
    print(f"  disposition= {disposition_for_noul(policy, noul.noul).value}")

    choice = router.choose(
        state=STATE,
        instructions="어느 팀이 처리해야 하는가?",
        candidates=CANDIDATES,
        question_name="department",
    )
    print("choice")
    print(f"  choice     = {choice.choice}")
    print(f"  confidence = {choice.confidence}")
    print(f"  probs      = {json.dumps(choice.probabilities, ensure_ascii=False)}")
    print(f"  model      = {choice.model}")
    if choice.confidence is not None:
        print(f"  disposition= {policy.disposition(choice).value}")

    score = router.score(
        state=STATE,
        instructions="이 상황의紧急성 수준은 어느 정도인가?",
        criteria=SEVERITY,
        question_name="severity",
    )
    print("score")
    print(f"  score      = {score.score}")
    print(f"  confidence = {score.confidence}")
    print(f"  legend     = {json.dumps(score.legend, ensure_ascii=False)}")
    print(f"  probs      = {json.dumps(score.probabilities, ensure_ascii=False)}")
    print(f"  model      = {score.model}")
    if score.confidence is not None:
        print(f"  disposition= {policy.disposition(score).value}")

    print()
    print(
        "These values are an integration smoke test, not a benchmark. Do not "
        "treat the thresholds in DecisionPolicy as calibrated."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
