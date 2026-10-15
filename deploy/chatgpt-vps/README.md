# ChatGPT VPS worker

Purpose: iPhone ChatGPT Work delegates work to an authenticated MCP gateway;
ChatCMD on an always-on VPS manages a persistent ChatGPT browser worker.
No personal Windows computer is required. This package prepares the runtime;
it does not claim a deployed or logged-in worker before live verification.

## Components

- ChatCMD Rust server and its official repository's Chromium bridge extension.
- Debian Chromium, Xvfb, Fluxbox, x11vnc/noVNC, Supervisor and Tini.
- One persistent volume for browser profile, SQLite, workspace and logs.
- Cloudflare Named Tunnel sidecar, initially inactive.
- Existing Jev integration remains advisory and uses the official TypeSafe SDK.
- Auto Browser, Playwright VNC, browser-container and extension alternatives are
  checked out under `vendor/` at recorded commits for inspection or fallback.
  Only ChatCMD is loaded into the active browser. Alternative senders stay inactive.
  Missing upstreams are recorded instead of silently substituting a different repo.

## Install on the authorized Linux VPS

Requires Docker Engine + Compose plugin, Git, Python 3, a working browser sandbox,
amd64 or a compatible multiarch toolchain, and sufficient disk/RAM for Rust builds.
Start with one browser worker. Resource needs must be measured before scaling.

```sh
cd deploy/chatgpt-vps
sh install.sh
```

The installer pins source commits, preserves modified checkouts, prepares inactive
alternatives, builds the runtime and starts only that runtime. Existing secrets are
not overwritten. Source bootstrap is not equivalent to installing a ChatGPT plugin.
The entrypoint reads owner-only mounted secrets, then drops to the runner user for
the browser and services. It does not mount the Docker socket or disable
the Chromium sandbox. If sandbox startup fails, stop and diagnose the VPS kernel
and container configuration; do not add `--no-sandbox` to conceal the failure.

## Cloudflare, Doppler and authentication

Retrieve runtime secrets through an authorized Doppler service identity; do not
put tokens or exported browser storage in Git or model-visible logs.
The tunnel token is mounted as `secrets/tunnel_token`. The VNC password is generated
locally on first installation and mounted as a secret. For interactive sign-in,
use the protected noVNC UI; never request ChatGPT passwords in conversation text.

Configure the existing named tunnel with a stable hostname to the runtime's
`http://127.0.0.1:6080`, protected by Cloudflare Access for the owner. The tunnel
shares the runtime network namespace, so it can reach the internal loopback server.
Do not expose noVNC or the ChatCMD admin API without owner authentication.

For Work, reuse the existing OAuth/PKCE MCP gateway and route only the required
MCP tools to ChatCMD. ChatCMD's token-in-path endpoint is a separate upstream
credential, not a substitute for public OAuth. Keep it server-side. Browser-only
Cloudflare Access login cannot be assumed to work as MCP OAuth.

Do not activate the public tunnel until both route authentication and owner access
have been checked. After the named tunnel is configured and authenticated:

```sh
docker compose --profile tunnel up -d tunnel
```

Inside the noVNC desktop, ChatCMD and ChatGPT tabs open together. Log into
ChatGPT on the VPS, confirm the bridge extension is loaded, create a scoped MCP
profile in ChatCMD, enable the desired child-worker count, and connect the external
Work client via the OAuth gateway. All steps can be performed on iPhone.

## Acceptance checks

1. Container build, health and Chromium sandbox startup pass.
2. Profile retains sign-in across a controlled container restart.
3. Work can initialize MCP, list tools and create a disposable child task.
4. Prompt receipt is tied to the intended conversation; response is captured once.
5. Busy/thinking is distinguished from ready, challenge, rate-limit and error states.
6. A queued follow-up waits while generating and sends only when ready.
7. Cancellation stops the intended task; timeout does not cause blind resubmission.
8. Child completion is validated against acceptance evidence, not a model DONE claim.
9. Close the iPhone app during a test: VPS remains running and stores the result.
10. Reboot VPS and verify Docker restart plus persisted database/profile recovery.

ChatCMD marks interrupted executions after restart; exactly-once continuation
across all failures is not assumed. A goal loop and its next-instruction policy
must be tested separately from browser queue delivery. A saved queue alone does
not prove autonomous goal completion or wake the parent Work conversation.

## Verification and recovery

```sh
python3 preflight.py
docker compose ps
docker compose exec -T runtime python3 /usr/local/bin/runtime_health.py
docker compose logs --tail 100 runtime
```

Logs can contain conversation text; inspect privately and redact before sharing.
Back up SQLite with its online backup API rather than copying a live WAL database.
Browser profiles and backups are sensitive. Keep backups owner-only and encrypted.
Rollback uses the previous lock file and image; do not delete volumes or downgrade
the database without a tested restore point.

## Current execution record

The container healthcheck requires the expected Chromium browser process, an X11
socket, ChatCMD HTTP readiness, and the noVNC listener. Known sandbox-disabling
flags cause failure. Flag inspection does not prove kernel sandbox isolation;
verify that separately on the target host. Health output contains booleans only
and never treats process readiness as ChatGPT login, bridge delivery or goal success.
Offline regression checks: `python3 -m unittest discover -s deploy/chatgpt-vps -p test_runtime_health.py`.

Actual receipts are recorded in `VERIFICATION.md`. Public OAuth,
ChatGPT sign-in, mobile-only runtime and restart recovery remain unverified until
they have been performed on the target VPS.
