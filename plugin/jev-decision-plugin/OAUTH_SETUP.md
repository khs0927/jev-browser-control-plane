# Private GitHub OAuth setup

Upstream implementation: FastMCP 3.4.7 GitHubProvider. GitHub authentication requests only read:user, with consent enabled and ChatGPT connector callback URLs allowed. Access-token validation then requires immutable GitHub subject 130247531.

GitHub OAuth App:
- Name: JEV Decision Gateway
- Homepage: https://github.com/khs0927/jev-browser-control-plane
- Callback: https://bold-forge-l9kqr.run.mcp-use.com/auth/callback
- Wildcard and device flow disabled; expiring tokens enabled.

Store client ID as JEV_GITHUB_CLIENT_ID and client secret as sensitive JEV_GITHUB_CLIENT_SECRET in Manufact server environment variables. JEV_AUTH_PROVIDER=github is already configured. Never paste secrets into chat or commit them. Redeploy after configuration.

Default FastMCP storage encrypts tokens on disk. This container has no durable mounted volume, so deployments can require reauthentication; durable encrypted storage is required for persistent sessions. Signing keys derive from the server-side OAuth secret. No claim of live OAuth compatibility is made before a real owner flow passes.

Verify /health, OAuth metadata, unauthenticated /mcp denial, authenticated initialize/tools/list, jev_status and one small official TypeSafe batch before setting mcp.json. Inference is provider-metered.
