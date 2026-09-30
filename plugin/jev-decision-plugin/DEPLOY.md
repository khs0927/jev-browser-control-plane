# Private JEV Gateway deployment

Manufact deploys plugin/jev-decision-plugin from branch feat/jev-decision-private-plugin using Dockerfile. Do not set build/start command overrides. Docker launches python hosted.py on port 8080 as non-root. HTTPS MCP endpoint: https://bold-forge-l9kqr.run.mcp-use.com/mcp

Current provider is upstream FastMCP 3.4.7 GitHubProvider with owner ID 130247531 required after upstream token validation. Supply JEV_AUTH_PROVIDER=github, JEV_GITHUB_CLIENT_ID, sensitive JEV_GITHUB_CLIENT_SECRET, JEV_RESOURCE_URL and sensitive TYPESAFE_API_KEY through the hosting environment. See OAUTH_SETUP.md for the GitHub app callback.

JEV_INFERENCE_ENABLED=true enables the user-authorized official metered TypeSafe API. No key belongs in Skill files or MCP headers. GitHub client callbacks are limited to ChatGPT connector callbacks and the exact Manufact Inspector callback. OAuth storage is encrypted but container-local, so replacement deployments may require reauthentication.

Owner-authenticated status and live Noul/Choice/Score batch passed through Manufact. Register the verified endpoint with ChatGPT, complete ChatGPT's own OAuth flow, and test mobile availability separately. Deployment watches gateway files and Dockerfile so documentation/plugin metadata edits do not replace the running OAuth container.
