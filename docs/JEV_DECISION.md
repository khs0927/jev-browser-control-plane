# Jev decision layer

## Purpose

Jev is TypeSafe's System One decision model, not a conversational model and not a browser agent. This control plane uses it as an auxiliary decision plane for bounded semantic judgments while the browser runtime owns observation and execution.

```text
user goal
  -> planner
  -> Jev choice / noul / score decision (bounded, advisory)
  -> DecisionPolicy threshold gate
  -> browser runtime (jev-ultrafast -> browser-harness) or human confirmation
  -> verifier.require
```

## Primitives

`JevRouter` wraps the official `typesafe-sdk` and exposes the three System One question types.

| Method | Question | Answer fields | Use for |
| --- | --- | --- | --- |
| `choose` | `Choice` | `choice`, `confidence`, `probabilities` | one option from a known set, routing, classification |
| `noul` | `Noul` | `noul` | the probability that a single statement is true |
| `score` | `Score` | `score`, `confidence`, `legend`, `probabilities` | a position on an ordered rubric |

All three return the responding `model` string so a decision can be traced to a model version.

`Score.criteria` must be a non-empty ordered list, lowest level first, with each entry defining one level starting at zero. One level carries no ordering information, so use at least two in practice. The SDK enforces non-empty only.

`ScoreDecision.score` is a **float**, because the SDK's wire schema types `ScoreAnswer.score` as one even though a rubric normally yields a whole level. Do not round it. `legend` and `probabilities` are keyed by integer level; a non-string legend entry is serialized to compact JSON so the rubric stays readable.

`Noul` returns a probability, not a label, and carries no confidence field. Choose a threshold explicitly in code, record it, and use `disposition_for_noul` rather than `DecisionPolicy.disposition`.

## Verified request and response

The following exchange was verified against the live API on 2026-09-24 in the source project, with the anonymous OpenCode Zen free endpoint. The shapes match what the official SDK returns.

Request:

```json
{
  "model": "jev-1.13-free",
  "state": "결제 실패가 3일째 계속되어 판매를 잃고 있습니다. 지금 asap로 도와주세요.",
  "questions": {
    "is_urgent": {
      "type": "noul",
      "instructions": "이 메시지는 긴급함 또는 시간 민감성을 나타내는가?"
    },
    "department": {
      "type": "choice",
      "instructions": "어느 팀이 처리해야 하는가?",
      "criteria": {
        "billing": "결제와 구독 문제",
        "technical": "버그와 연동 문제",
        "other": "위 항목에 해당하지 않음"
      }
    }
  }
}
```

Response:

```json
{
  "model": "jev-1.13-free",
  "answers": {
    "is_urgent": { "type": "noul", "noul": 0.98 },
    "department": {
      "type": "choice",
      "choice": "billing",
      "confidence": 0.99,
      "probabilities": { "billing": 0.99, "technical": 0.01, "other": 0 }
    }
  },
  "cost": "0"
}
```

These values are an integration smoke test, not a benchmark and not a universal confidence threshold. The Korean `state` above shows that CJK input works; it does not establish that confidence levels are calibrated for a Korean domain.

`scripts/jev_smoke.py` runs one question of each type against the live API:

```bash
TYPESAFE_API_KEY=... PYTHONPATH=src python scripts/jev_smoke.py
```

It is read-only and performs no browser work. The key is read from the environment; never pass it as an argument or write it into a project file.

## Model and endpoint pairing

Every direct System One request must name a model. A conversational prompt, or a request with no model, is invalid and can fail authentication or validation.

This repository uses exactly one transport: the official `typesafe-sdk` against `https://api.typesafe.ai/v1/systemone`, with a model available to the account and `TYPESAFE_API_KEY` from the environment.

| Transport | Status | Note |
| --- | --- | --- |
| Official `typesafe-sdk` | **the only supported path** | authenticated, contract-covered, retry handled upstream |
| OpenCode Zen free (`jev-1.13-free`) | **rejected by project decision** | see below |

### Why the Zen free endpoint is not used

An earlier in-progress branch in this repository proposed a second transport over `https://opencode.ai/zen/v1/systemone` with `jev-1.13-free`, a hand-written client, and a project-specific client identity. It was never merged and the direction was rejected.

Do not reintroduce it. The reasons:

- It creates a second Jev transport beside the official SDK path. Two transports means two credential models, two failure taxonomies, and two places where a decision can diverge.
- The free model is a limited-time offer. A production dependency cannot rest on it.
- The official SDK already owns the wire format, retry, and error taxonomy. A hand-written client is a weaker duplicate, which the code ownership rule in `docs/ARCHITECTURE.md` forbids.
- A client identity that a third-party server happens to accept is not a supported contract.

If a future decision reopens this, it belongs in a decision record, not in an implementation.

## Browser handoff checkpoint

A Jev decision is advisory classification evidence, not permission. `checkpoint.py` records the decision together with the browser action it precedes:

- the source tab ID, URL, and page title when available;
- the purpose of the judgment;
- the model and the typed answer;
- the next browser action;
- `requires_fresh_snapshot: true`;
- `browser_action_authorized: false`.

The last two fields are `init=False` on a frozen dataclass, so a caller cannot construct a checkpoint that claims the action was already authorized. In the TypeScript original these were literal types, which are erased at runtime.

After the decision, reattach to the same tab, take a fresh snapshot, and call `assert_resume_allowed(checkpoint, fresh_snapshot_taken=True)`. The page may have changed while Jev was deciding, so the decision must never be applied to a stale view.

On an authentication or validation error, correct the request and resume from the unchanged browser state. Do not change tabs and do not retry the browser action.

## Why Jev is not the planner

Jev returns typed judgments and probabilities, not generated prose. A conversational adapter can echo a requested schema without evaluating it, so selecting Jev as the main planning model is semantically wrong. The planner and the browser runtime stay general-purpose.

Use Jev only when the desired result is one of: one option from a known set, the probability that a single statement is true, or a weighted position on an ordered rubric. Use normal code for exact arithmetic, database lookups, dates, counts, permissions, and every final side effect.

## Limits

- Jev is a proprietary hosted model. The SDK and workflow code are open source; the weights and the inference implementation are not published.
- Confidence thresholds in `policy.py` are bootstrap defaults, not correctness guarantees. Tune them with task-specific evaluation data.
- English is the primary supported language. Validate representative cases before relying on other languages.
- Never paste or persist a Jev or TypeSafe API key in a conversation, a skill file, or a project file.

## Sources
- TypeSafe documentation: https://docs.typesafe.ai/
- TypeSafe models and limits: https://docs.typesafe.ai/models
- System One concept: https://docs.typesafe.ai/concepts/system-one
- Noul primitive: https://docs.typesafe.ai/primitives/noul
- Choice primitive: https://docs.typesafe.ai/primitives/choice
- Score primitive: https://docs.typesafe.ai/primitives/score
- Python SDK: https://github.com/typesafe-ai/typesafe-sdk-python
- Open-weight alternative: https://github.com/ikermoel/open-alternative-jev

## Licensing boundary

The TypeSafe agent skill and the official SDKs are MIT-licensed. The notice required by that license is kept at `docs/licenses/TYPE_SAFE_AI_LICENSE.txt`. Jev itself is not open source. An open-source alternative may implement a similar decision layer, but it must not be described as the hosted Jev model.
