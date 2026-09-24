# Third-party design sources

This repository intentionally keeps project-owned code thin. The following MIT-licensed projects were reviewed for the V1 Aside/Jev provider design.

## himomohi/aside-jev

Used as the reference for the bounded candidate contract, abstain behavior, confidence gating, and the pattern of exposing Jev decision tools to Aside over MCP.

Source: https://github.com/himomohi/aside-jev

## openchamber/openchamber

Used as the reference for OpenCode Zen's System One transport and the versioned free model id `jev-1.13-free`. OpenChamber uses its own approved `x-opencode-client` identity. This project deliberately uses its own identity instead of copying `openchamber`.

Source: https://github.com/openchamber/openchamber

## Loule95450/jev-free-router

Used as a reference for Jev/OpenCode provider boundaries, session-aware routing, and fail-closed handling of free-tier availability. Its requirement to preserve OpenCode identity applies to normal Zen free chat models; the V1 implementation here targets the separate System One endpoint.

Source: https://github.com/Loule95450/jev-free-router

## Ying-Kai-Liao/jev-browser

Used as a reference for batching multiple bounded Jev questions into one System One request and for keeping browser execution outside the decision model.

Source: https://github.com/Ying-Kai-Liao/jev-browser

## bastani-inc/atomic

Reviewed as a second independent example of treating OpenCode Zen Jev as a structured-decision provider rather than an OpenAI-style chat proxy. Its recent provider work reinforces the protocol boundary used here.

Source: https://github.com/bastani-inc/atomic

## ismaelsoilet/jev-harness

Reviewed for its multi-provider System One transport, OpenCode Zen endpoint/model defaults, and project-identifying User-Agent pattern. It is not a core V1 dependency because its optional simulation/fail-open behavior conflicts with this project's fail-closed provider policy.

Source: https://github.com/ismaelsoilet/jev-harness

No upstream repository is vendored wholesale in V1. Keep upstream notices and license requirements if future changes copy substantial source.
