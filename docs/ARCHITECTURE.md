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
