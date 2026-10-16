# Universal orchestration draft

This module is not wired to the production Worker or public MCP tools. It reserves dry-run requests, never dispatches external actions and cannot authorize a write operation.

The D1 schema must remain un-applied until concurrent write tests, approved deployment and owner-authentication review are complete.

## Wiring

`mcp.ts` exposes `orch_reserve_task` only when `ORCH_LEDGER_ENABLED=true` **and** a dedicated `ORCH_DB` D1 binding exist. Neither is set in `wrangler.jsonc`, so production behaviour is unchanged. The owner hash is `sha256('github-owner:' + <OAuth-verified owner id>)`; callers cannot supply it. The tool still never dispatches or executes anything.
