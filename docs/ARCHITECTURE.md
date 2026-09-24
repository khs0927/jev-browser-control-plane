# Architecture

## Design target

The repository is an integration layer, not a new browser engine. Jev is the bounded decision layer; mature open-source projects own browser observation and execution.

## Aside V1 path

1. Aside or the browser runtime observes the current page.
2. The caller builds a finite table of executable, already-authorized candidates.
3. `jev_step` sends only the goal, bounded observation, history, and candidate descriptions to Jev System One.
4. The provider validates the returned candidate id and confidence.
5. Only the original tool and arguments owned by the caller are returned for execution.
6. The browser runtime executes the action and must observe again before another decision.
7. Completion is verified independently; a model decision is never proof of success.

Default decision transport:

```text
Aside skill
  -> stdio MCP
  -> jev-control-plane
  -> OpenCode Zen /v1/systemone
  -> jev-1.13-free
```

The free transport uses this project's own `x-opencode-client` and User-Agent identity. It never copies another application's identity. A 401/403, timeout, malformed response, or low-confidence result fails closed rather than silently switching to a simulated or paid provider.

## What "automatic" means in V1

V1 automation is MCP + task-instruction based. When the Aside Jev skill is active, bounded browser action selection is directed through `jev_step` without the user naming Jev on each turn.

V1 does **not** claim native interception of every built-in Aside browser action. Hard enforcement would require an Aside runtime/extension hook that owns the tool-dispatch boundary. That is a Phase 2 integration, not something the MCP server can prove by itself.

## Existing fast path

1. A planner supplies a goal only when decomposition is needed.
2. Jev makes bounded choices over observed state.
3. browser-use/jev-ultrafast can own a fast action-and-target loop where appropriate.
4. browser-harness owns the local CDP session and existing browser profile.
5. An application-specific verifier checks the outcome independently.

## Remote path

The already deployed browser bridge remains the Windows transport. This repository talks to its loopback operator API instead of creating another websocket or browser protocol implementation.

## Optional layers

- workflow-use: convert successful repeated tasks into deterministic workflows.
- Browser Use: larger fallback agent for surfaces the ultrafast path does not cover well.
- MCP routing: use Jev to shortlist tools before a planner sees them.
- Native Aside hook: Phase 2 hard enforcement so browser actions cannot bypass Jev when the mode is enabled.

## Code ownership rule

Before adding project code, check whether the behavior already exists upstream. Prefer dependency, adapter, or configuration over a fork. Fork only for a bug fix that cannot be upstreamed immediately.

## Confidence policy

The existing control-plane policy remains conservative for general routing:

- 0.88 or higher: eligible for automatic low-risk execution.
- 0.62 to 0.88: escalate to the planner.
- below 0.62: re-observe before doing anything.

The new `jev_step` MCP starts with a 0.70 minimum confidence because its candidate table is already bounded by the caller. These are bootstrap defaults, not correctness guarantees; tune them with task-specific evaluation data.

## Non-goals for V1

- reimplementing DOM extraction;
- reimplementing CDP;
- reproducing Jev locally;
- silently simulating Jev when the live free provider fails;
- building a new general planner;
- replacing the existing secure browser bridge;
- claiming native interception of all Aside browser tools.
