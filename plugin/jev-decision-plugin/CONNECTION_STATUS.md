# Connection status — 2026-09-30

- Package: private Skill plus MCP/Gateway source.
- MCP registration: intentionally empty until a real HTTPS endpoint and OAuth are verified.
- Hosting: not deployed. Sites Workers cannot run the reused Python SDK directly;
  no existing Python Gateway endpoint or approved deployment identity was available.
- Secrets: existing secure store not accessed; no key copied or disclosed.
- Inference: disabled by default. Official API charges per input token; no free
  entitlement verified. Setting JEV_NO_COST_ACCESS_VERIFIED requires actual account evidence.
- Mobile: not tested. Registration is not evidence of mobile tool availability.
- Remote: excluded by user instruction; no retries or alternate remote path.

## Server deployment contract

Install gateway/requirements.txt in Python 3.12+. Run gateway/server.py --http
behind a trusted HTTPS reverse proxy. HTTP startup refuses missing OAuth configuration.
Provide a verified issuer supporting MCP OAuth client registration, JWKS, audience,
owner subject and client identity. Inject these through deployment environment:
JEV_OAUTH_ISSUER, JEV_OAUTH_JWKS_URL, JEV_RESOURCE_URL, JEV_OWNER_SUBJECT,
JEV_OAUTH_CLIENT_ID. Do not expose server port directly or publish an unauthenticated tunnel.
The current verifier is for RS256 JWT providers only and must be tested against the chosen provider.
TYPESAFE_API_KEY must come from the authorized secure store. No environment template contains values.
Use actual initialization, tools/list and jev_status calls to verify the deployed MCP.
Only after verification add that exact streamable-http URL to mcp.json and update
this same private plugin. Connect OAuth using the host UI, then test a mobile chat.

Local stdio is for offline development verification only; it is not a mobile connection.
