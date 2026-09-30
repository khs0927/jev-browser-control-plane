# Verification — 2026-10-01

## Offline gateway

- 9 tests passed on Python 3.12.14 with `typesafe-sdk==0.7.1` and MCP SDK 1.30.0.
- SDK and native dependency imported successfully.
- Local stdio MCP initialization, `tools/list`, and all five tool calls passed.
- Inference tools returned blocked with `upstream_called=false` in the offline tests.
- Fixture tests preserve fractional Score and verify Noul has no confidence.
- HTTP startup correctly rejects missing OAuth configuration.

## Actual TypeSafe API smoke test

On 2026-09-30, one real shared-state request used the official SDK and
`jev-1.13.0` with Noul, Choice, and Score questions. The call succeeded in about
9 seconds (382 input tokens, 63 output tokens). The returned values passed six
contract checks: Noul was within [0,1] and had no confidence field; Choice selected
the requested option with a valid probability distribution; Score was in range
with probabilities summing to 1.

This was a real provider inference request, separate from the offline fixtures.
The account's billing record was not checked. No subscription or plan change was
made. A successful API call does not establish a free entitlement.

## Not verified

No remote Gateway deployment, OAuth provider, HTTPS MCP connection, ChatGPT tool
call, or mobile operation has been verified. The private plugin remains installed
as a request-preparation Skill with Gateway source; `mcp.json` stays empty until
a deployment host and OAuth setup are authorized and verified. No secret values
are included in the repository or plugin package.
