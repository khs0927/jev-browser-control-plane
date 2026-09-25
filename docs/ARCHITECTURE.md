# Architecture

## Design target

The repository is an integration layer, not a new browser engine. Official Jev is the bounded decision layer; mature open-source projects own browser observation and execution.

## Fast path

1. A planner supplies a goal only when decomposition is needed.
2. Official Jev makes bounded choices over observed state.
3. browser-use/jev-ultrafast owns the fast action-and-target loop.
4. browser-harness owns the local CDP session and existing browser profile.
5. An application-specific verifier checks the outcome independently.

## Remote path

The already deployed browser bridge is kept as a separate transport for the Windows browser. This repository talks to its loopback operator API instead of creating another websocket or browser protocol implementation.

## Optional layers

- workflow-use: convert successful repeated tasks into deterministic workflows.
- Browser Use: larger fallback agent for surfaces that the ultrafast MVP does not cover well.
- MCP routing: use Jev to shortlist tools before a planner sees them.

## Decision primitives

Official Jev is reachable through `JevRouter` and covers the three System One question types.

| Question | Method | Answer |
| --- | --- | --- |
| `choice` | `JevRouter.choose` | one label, its confidence, and the label probabilities |
| `noul` | `JevRouter.noul` | the probability that one statement is true |
| `score` | `JevRouter.score` | a position on an ordered rubric, with the rubric and its distribution |

Use a bounded decision only where the result is one of those three shapes. Exact arithmetic, lookups, dates, permissions, and every side effect stay in code.

## Browser handoff

A Jev decision never authorizes a browser action. When a decision informs browser work, record it with `create_checkpoint(...)`, keep the existing tab, reattach to it, take a fresh snapshot, and then call `assert_resume_allowed(...)`. The checkpoint is a frozen dataclass whose `requires_fresh_snapshot` and `browser_action_authorized` fields cannot be set at construction, so no caller can manufacture an authorized action. See `JEV_DECISION.md`.

## Code ownership rule

Before adding project code, check whether the behavior already exists upstream. Prefer dependency, adapter, or configuration over a fork. Fork only for a bug fix that cannot be upstreamed immediately.

## Confidence policy

Default routing thresholds are deliberately conservative:

- 0.88 or higher: eligible for automatic low-risk execution.
- 0.62 to 0.88: escalate to the planner.
- below 0.62: re-observe before doing anything.

These numbers are bootstrap defaults, not correctness guarantees. Tune them using task-specific evaluation data.

## Non-goals for V1

- reimplementing DOM extraction;
- reimplementing CDP;
- reproducing Jev locally;
- building a new general planner;
- replacing the existing secure browser bridge.
