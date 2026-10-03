# Deployment and acceptance

The repository is public as verified on 2026-10-03. The JEV production deployment remains separate.
Gateway code uses the official MCP SDK (stateless Streamable HTTP), Cloudflare OAuth provider,
D1 owner/request uniqueness, SHA-pinned workflow dispatch and OIDC-verified result callbacks.
Only environment_check is enabled. The other requested task types and codegraph remain disabled.

## Required deployment configuration
1. Provision a D1 database named mobile-work-gateway and KV namespace for OAuth provider state.
2. Set repository/environment variables MWG_D1_ID, MWG_OAUTH_KV_ID, MWG_PUBLIC_URL,
   MWG_REVIEWED_SHA and MWG_RESULT_ENDPOINT (PUBLIC_URL + /internal/results).
3. Worker secrets: GITHUB_TOKEN (only this repository, Actions write/Contents read),
   GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET for a new OAuth app callback PUBLIC_URL/callback.
   Do not copy the JEV connector client registration or its callback.
4. Deployment credentials: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the
   mobile-work-production environment. The worker must stay on the Free plan.
5. Put reviewed workflow on main, select its current audited SHA, then run deployment workflow.
   Head updates invalidate REVIEWED_SHA: review and update explicitly before dispatch.
6. Keep the official provider's KV limitations in mind: its cookie-bound consent helpers do not
   claim atomic single-use under concurrent requests. Task ownership/results/idempotency use D1.
7. Register the real HTTPS /mcp address, complete owner-only OAuth, and update the skills-only
   Plugin with the actual MCP URL only after authenticated discovery succeeds.

Current runtime has no Cloudflare or GitHub token environment variables. Connector access can
write GitHub code but cannot export secrets or provision Cloudflare bindings. Deployment is
therefore blocked on configuration, not represented as complete. The Plugin initially contains
skills only, no invented endpoint. Production deploy workflow is manual, never automatic.

## Evidence gates
Local: typecheck, SDK initialize/tools/list, owner/request policy tests and Worker dry-run.
GitHub: record CI run/conclusion and read actual environment Artifact.
Cloudflare: /health, auth denial, OAuth callback, authenticated initialize/tools/list; measure CPU.
End-to-end: create task, response timeout recovery, cancellation, callback and Artifact agreement.
Mobile: actual iOS ChatGPT Plugin tool-call record is required separately.

## Result integrity limits
Callbacks bind GitHub issuer/audience/repository ID/workflow ref/SHA/run ID/attempt and request.
Retry is immutable per task/attempt. Summary reads require a real, unexpired run Artifact.
Public summaries are allowlisted and size limited, not a private data vault.
GitHub and D1 cannot commit atomically; uncertain dispatch is retained, never retried blindly.
Unknown-run reconciliation scans the latest 100 workflow runs; older uncertain tasks may require
operator reconciliation. No exactly-once guarantee is made.
