# Private JEV Gateway deployment

Build from this plugin directory using the supplied Dockerfile. The image runs
Python 3.12 and the pinned official TypeSafe and MCP SDKs as a non-root user.
The server listens on port 8080 and exposes Streamable HTTP at /mcp.

Before starting production, use the hosting secret store to supply TYPESAFE_API_KEY,
JEV_OAUTH_ISSUER, JEV_OAUTH_JWKS_URL, JEV_RESOURCE_URL, JEV_OWNER_SUBJECT and
JEV_OAUTH_CLIENT_ID. The resource URL is the exact public HTTPS /mcp endpoint.
The issuer must offer an OAuth flow compatible with the chosen ChatGPT client.
Issuer, signing keys, token audience, owner identity, client identity and jev:decide
scope are all verified. Missing configuration stops startup. Other callers are
rejected. DNS rebinding protection accepts the configured resource host.

JEV_INFERENCE_ENABLED defaults to false. Set it to true only for the user's
requested use of the official metered API; this does not imply free access.
No API key or OAuth credential belongs in plugin files or literal MCP headers.

Verify HTTPS initialization and tools/list first. Authenticate as the owner and
call jev_status, then make one small jev_batch request. Verify returned model,
typed results, token usage and billed access. Register only the actual verified
URL in mcp.json. Check desktop and mobile availability separately.

The current package has no deployed MCP URL. It is not a connected service.
