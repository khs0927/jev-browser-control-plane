# Verification receipt — 2026-10-13

Environment: transient Linux execution workspace, not the target VPS.
Controller repository base: `be90100d5ebcdaa4750e1b2fcc4f32ebfa49e141`.
ChatCMD source: `e604ac8cb53322082887f97efdcdd647193de768`.

| Check | Result |
| --- | --- |
| ChatCMD frontend dependency installation | Passed (`npm ci --ignore-scripts`) |
| Upstream bridge test suite | 225 passed, 0 failed, 0 skipped |
| ChatCMD frontend production build | Passed (TypeScript + Vite) |
| Deployment Python compilation | Passed |
| Shell syntax | Passed |
| Compose YAML parsing and loopback-port checks | Passed |
| Immutable source preparation | ChatCMD plus 4 inactive alternatives checked out |
| Existing GitHub repository access | Confirmed |
| Docker / Cargo in current workspace | Not installed; runtime build not executed here |
| Target VPS access | Not established |
| Cloudflare account and personal domain | Sign-in required; not inspected |
| Doppler account | Google device verification pending |
| Remote desktop | Existing Windows device offline; not used for deployment |
| OAuth MCP, live ChatGPT login and mobile E2E | Not performed |
| Goal-completion loop and restart recovery | Not performed |

Frontend build emits upstream chunk-size warnings. These do not establish runtime
correctness. Bridge fixtures do not establish compatibility with today's live
ChatGPT UI. No production endpoint or logged-in worker is claimed by this receipt.

Secrets and authentication values are excluded. Source availability is separately
recorded in `upstreams.lock.json`; unavailable alternatives are not installed.
