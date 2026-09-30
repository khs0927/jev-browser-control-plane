# Connection status — 0.1.2

Private plugin installed; MCP remains unconnected.

Completed: official TypeSafe SDK API smoke test in an earlier run (Noul/Choice/Score). Container packaging, explicit inference enablement, DNS rebinding protection and owner-specific OAuth token verification are prepared. 16 offline tests passed; these are not live OAuth or deployment verification.

Blocked: Manufact account API returned HTTP 401 Unauthorized. No authenticated hosting account, deployed HTTPS endpoint, OAuth issuer/client configuration or mobile end-to-end verification is available. Generic remote connector is not retried. Deployment through an authenticated supported hosting account remains within the requested task.

API keys belong in the hosting secret store. No key is embedded in this plugin. Official provider inference is metered; free entitlement and account billing are not verified. mcp.json remains empty until a real authenticated endpoint is validated.
