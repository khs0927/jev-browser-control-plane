# Upstream integration matrix

This file records which upstream behavior is reused, adapted, or deliberately not copied.

| Upstream | Reuse directly | Adapt locally | Do not copy |
| --- | --- | --- | --- |
| `himomohi/aside-jev` | Candidate-owned action contract, abstain/confidence gate, persistent observe-decide-execute loop, completion/risk assessment pattern | Map its Aside runtime calls onto this repository's existing BrowserBridge; keep this project's MCP names and policy boundaries | TypeSafe-only credential path as the only live backend |
| `openchamber/openchamber` | Zen System One endpoint shape and versioned `jev-1.13-free` model behavior | Use this project's own `x-opencode-client` and User-Agent; preserve no-credential Zen free transport only while accepted by Zen | `x-opencode-client: openchamber` or any other third-party identity |
| `Loule95450/jev-free-router` | Provider/runtime separation, fail-closed availability handling, session-aware design ideas | Keep only concepts that fit a decision provider; normal chat-model routing stays outside this package | OpenCode chat-provider impersonation, model-ranking router, paid automatic fallback |
| `Ying-Kai-Liao/jev-browser` | Batch independent browser questions into one System One request | Final completion + risk are evaluated together after DOM verification | Giving the model arbitrary selectors or direct execution authority |

## Local ownership

Project-owned code should remain limited to:

- Zen/TypeSafe transport selection and response normalization;
- bounded candidate validation;
- BrowserBridge adaptation;
- Aside MCP registration;
- final fail-closed policy and verification.

Everything else should remain upstream-owned or configuration-driven.

## V1 execution path

```text
Aside
  -> skill / MCP
  -> jev_step
  -> System One Choice
  -> validate id + confidence
  -> BrowserBridge executes original action
  -> fresh browser snapshot
  -> System One Noul + Score in one request
  -> verified / assessment_uncertain
```

The final assessment is deliberately separate from the action choice. Visible completion text is necessary but not sufficient when the evaluator is available.
