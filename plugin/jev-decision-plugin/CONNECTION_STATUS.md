# Connection status — 2026-10-01

- Package: private ChatGPT Skill with reusable MCP/Gateway source; installed in the user's account.
- MCP endpoint: not configured. The registered `mcp.json` remains empty.
- Hosting and OAuth: not deployed or connected. Follow the user's instruction to exclude remote connection attempts; do not retry or route around that restriction.
- API key: used for one sandbox smoke test only; no key is present in this repository, plugin package, or a deployed service.
- API smoke test: passed on 2026-09-30 with official `typesafe-sdk==0.7.1`, model `jev-1.13.0`, and a single shared-state System One request containing Noul, Choice, and Score.
- Cost: no-cost entitlement was not verified. The smoke test may be billed under the provider's published input-token pricing; the account's actual billing record was not checked.
- Inference through ChatGPT: unavailable while the MCP endpoint is unconfigured. No inference is enabled by this package.
- Mobile: not tested.
- Offline verification: 9 gateway tests passed; local stdio initialization, tools/list, and calls to all five tools passed.

## Server deployment contract

Install `gateway/requirements.txt` in Python 3.12+. Run `gateway/server.py --http`
behind a trusted HTTPS reverse proxy. HTTP startup refuses missing OAuth configuration.
Provide a verified issuer supporting MCP OAuth client registration, JWKS, audience,
owner subject and client identity. Inject these through deployment environment:
`JEV_OAUTH_ISSUER`, `JEV_OAUTH_JWKS_URL`, `JEV_RESOURCE_URL`, `JEV_OWNER_SUBJECT`,
`JEV_OAUTH_CLIENT_ID`. Do not expose the server port directly or publish an unauthenticated tunnel.
The verifier accepts RS256 JWTs and must be tested against the selected issuer.
`TYPESAFE_API_KEY` must be supplied through the host's secure secret store. No
environment template contains secret values.

After the user authorizes a host and verified OAuth configuration, test actual HTTP
initialization, `tools/list`, and `jev_status` before registering that exact
Streamable HTTP URL in `mcp.json`. Then test the connected desktop plugin and mobile
availability separately.

Local stdio is for offline development verification only; it is not a remote or mobile connection.
