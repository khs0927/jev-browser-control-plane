# Verification

Earlier official API smoke test: typesafe-sdk 0.7.1, jev-1.13.0, shared-state Noul/Choice/Score; approximately 9012 ms, 382 input and 63 output tokens. Noul 0.99 without a confidence field, Choice blue confidence 1, Score 0 confidence 1.

Current offline gateway suite: 16 tests passed. Checks cover SDK question contracts, invalid input, disabled inference blocking upstream calls, missing OAuth startup rejection, fractional scores, MCP stdio tool discovery and blocked calls, valid owner JWT acceptance and rejection of wrong issuer/audience/owner/client/scope/expiry and malformed tokens.

No live HTTPS MCP, external OAuth-provider or mobile test has passed. No deployment or subscription was created. Billing was not verified.
