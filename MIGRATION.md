# Migration: ASIDE-GPT Jev layer

What was taken from `khs0927/ASIDE-GPT` at commit `ad9bcc7`, and what was deliberately left behind.

## Why not the TypeScript client

ASIDE-GPT talks to Jev over raw HTTP with a hand-written `fetch` client. This repository already depends on the official `typesafe-sdk`, which handles the wire format, retry, and validation. Porting the HTTP client would have been a second, weaker implementation of something upstream already owns, which the code ownership rule in `docs/ARCHITECTURE.md` explicitly forbids.

What was actually missing here was narrower: two of the three System One question types, and the browser handoff record.

## Carried over

| Source | Destination | Change |
| --- | --- | --- |
| `packages/decisions/jev.ts` `noul` and `score` types | `src/jev_control_plane/router.py` | Reimplemented against the official SDK. `Noul` and `Score` are constructed through lazy imports, injected for tests, exactly like the existing `Choice` path. |
| `packages/policies` threshold bands | `src/jev_control_plane/policy.py` | `disposition_for_noul` added, because a noul probability is not a confidence. |
| `packages/decisions/jev.ts` `createJevDecisionCheckpoint` | `src/jev_control_plane/checkpoint.py` | Strengthened. The TypeScript version declared `requiresFreshSnapshot: true` and `browserActionAuthorized: false` as literal types, which TypeScript erases at runtime. Here both are `init=False` on a frozen dataclass, so they cannot be supplied or mutated. |
| `plugin/skills/jev-decision` | `skills/jev-decision` | Retargeted. Executor references now name `JevRouter`, `DecisionPolicy`, `create_checkpoint`, and `verifier.require`. |
| `plugin/skills` browser-task, research, authenticated-web, shopping, multi-site-workflow | `skills/` | Retargeted the same way. The read / write / external-effect discipline, the credential rules, and the evidence requirements were kept intact. |
| `scripts/validate-skills.ts` | `scripts/validate_skills.py` | Ported, with one rule deliberately inverted. See below. |
| `docs/JEV_DECISION_PROVIDER.md` | `docs/JEV_DECISION.md` | Adapted. The verified request and response, the model and endpoint pairing rules, and the limits were kept. |
| `docs/licenses/TYPE_SAFE_AI_LICENSE.txt` | `docs/licenses/TYPE_SAFE_AI_LICENSE.txt` | Copied unchanged. Still required. |

## Left behind

| Source | Reason |
| --- | --- |
| `packages/gemini-bridge/**`, `packages/gemini-web/**` | Separate local bridge track. Excluded by request. |
| `packages/local-model.ts`, `gemini-transports.ts`, `reasoning-providers.ts`, `browser-backend.ts` | Provider-selection contracts for the other project. |
| `packages/runtime/**`, `orchestration/**`, `policies/**`, `approvals/**`, `evidence/**`, `providers/**` | Task ledger, dispatch reconciliation, and remote adapter contract. Belongs to the mobile remote track, which is blocked on an unpublished vendor contract. `policy.py` and `verifier.py` already cover the gate and the evidence check here, and the threshold bands were reused for `disposition_for_noul`. |
| `legacy/local-node/**` | Archived first prototype. The source README states it is not part of the target architecture. |
| `plugin/skills/aside-remote` | Fail-closed on a vendor contract that is not published. |
| `plugin/skills/orchestration` | Duplicates rules already distributed across the five workflow skills. |
| `plugin/skills/gemini-web` | Belongs to the excluded bridge track. |
| `tests/jev.test.ts` | Asserts on the raw HTTP request shape, which no longer applies. Replaced by SDK-level stub tests. |

Also not carried over: branch `fix/gemini-web-model-id` and open pull request 24, which fails CI with an unresolved P1 review comment, plus eight branches that have been idle since 2026-09-12.

## One deliberate deviation

The original validator rejected any skill body containing `localhost` or `127.0.0.1`. That rule existed because ASIDE-GPT's target architecture was PC-free and mobile-only. This repository legitimately talks to a loopback operator API through `bridge.py`, so carrying the rule over would have been wrong. It was replaced with the opposite guard: the validator now fails if the body contains vocabulary from the source project, which is the realistic regression risk here. `tests/test_skills.py` pins that decision.

## Known gaps left open

- `JevRouter` still has no `list_models` call, so an unavailable or renamed model surfaces only as a request failure. The SDK exposes `ListModelsResponse`; it was not wired because nothing in this repository needs to enumerate models.
- `DecisionPolicy` thresholds are still the bootstrap defaults, and nothing here has been tuned against evaluation data.
- The live path is unverified. See the section above.

One inconsistency was found and closed during the port. `DecisionPolicy.disposition` reads `decision.confidence`, which `NoulDecision` does not carry, because a noul probability is a different quantity from a choice confidence. Passing a noul result to `disposition` now raises instead of silently misbehaving, and `disposition_for_noul` applies the same bands explicitly. `ScoreDecision` does carry `confidence`, so it works with `disposition` unchanged.

## Verified against the real SDK, and what that caught

Stub-based tests can only prove that the router agrees with the stubs. Reading the installed `typesafe-sdk` 0.7.1 schemas directly caught a real defect that every stub test had passed:

`ScoreAnswer.score` is typed `float` in the SDK wire schema, not `int`. The first version of this port coerced it with `int()`, which would have silently truncated a fractional score. The type is now `float`, and `tests/test_sdk_contract.py` pins the behaviour against the SDK's own answer models.

`tests/test_sdk_contract.py` is skipped when `typesafe_sdk` is not importable, so the unit suite still runs without the dependency. Run it with the SDK installed to get the real assertions. `scripts/jev_smoke.py` covers the live path and needs `TYPESAFE_API_KEY`.

A third check was not possible in the development environment and is still open: a live API call. The sandbox blocks loading `pydantic_core`, so the SDK cannot be imported there at all. `scripts/jev_smoke.py` has never been executed. Run it once on a normal machine before claiming the Jev path works end to end.

## A prior direction, rejected

The `feat/aside-jev-zen-free-provider` branch carried an alternative Jev transport over the OpenCode Zen free endpoint, with a hand-written client, its own candidate contract, `browser_loop.py`, an Aside MCP server, and an `aside-jev` skill. It overlaps this work on noul, score, and skills.

The Zen free direction was rejected. The official `typesafe-sdk` is the only supported transport. `docs/JEV_DECISION.md` records the reasons so the second transport is not reintroduced. `skills/aside-jev` is not carried over; `skills/jev-decision` is the skill for this path.
