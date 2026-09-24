---
name: "aside-jev-auto"
description: "Use Jev System One automatically as the bounded decision layer for Aside browser actions."
---

# Aside Jev Auto

When this MCP is available, treat Jev as the default decision layer for browser action selection, not as a text-generation model.

1. For a browser task, observe the current page first.
2. Build a finite candidate table from actions that are actually available and authorized on the current observation.
3. Include an `abstain` path or allow the provider to add it.
4. Call `jev_step` before choosing a browser action yourself.
5. Execute only the exact `tool` and `arguments` returned by `jev_step` when `should_execute=true`.
6. If the result is `abstain`, confidence is below policy, the provider errors, or the page changed after the observation, do not guess. Re-observe or hand control back to the main Aside model.
7. Never let Jev invent free-form text, credentials, selectors, URLs, or tool arguments. Those must come from the user, the current page, or the main planner.
8. After execution, observe again. Do not reuse element references or decisions from the prior page state.
9. Use `jev_system_one` for batched Choice/Score/Noul checks such as completion, ambiguity, or risk when that avoids several independent calls.
10. A Jev decision never replaces user approval for payments, destructive actions, account changes, credential use, or other sensitive side effects.

The default backend is OpenCode Zen `jev-1.13-free` using this project's own `x-opencode-client` identity. Do not impersonate another client. If Zen rejects the client identity, stop and surface the provider error rather than spoofing OpenCode or OpenChamber.
