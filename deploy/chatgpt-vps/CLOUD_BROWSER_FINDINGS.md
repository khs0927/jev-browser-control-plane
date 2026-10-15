# Cloud browser worker route — 2026-10-15

## Direct evidence

The owner-authenticated Mobile Work Gateway `browser_read` tool was invoked with
`profile=default`, `url=https://chatgpt.com/`. It returned final URL
`https://chatgpt.com/`, HTTP 403, and visible text `Unable to load site` followed
by `Please try again later`. No login screen, prompt submission or response
capture was reached. The tool transport itself returned successfully; this is
not evidence that its target website loaded successfully. No retry, proxy change,
fingerprint change, credential transfer or alternate login route was attempted.
The response alone does not establish the precise reason for rejection.

The live default profile summary previously had no chatgpt.com cookie domain.
That is absence of saved ChatGPT session evidence, not proof about all accounts.
Do not import or disclose other services' credentials to address this failure.

## Source evidence

Current main `mobile-work-gateway/gateway/src/browser.ts`, blob
`d356c19a1e33f8ea068671daada73fb51b4b469e`, launches a new browser/context/page
for each call, saves cookies only on explicit save_profile, then closes the
launched browser in `finally`. It has no cross-call session registry or worker
dispatch/goal loop. Saved cookies are not a running browser process.

## Official capability, distinct from deployed support

Cloudflare documents `acquire` + `connect` session reuse for Playwright. Closing a
connected client disconnects it, while closing a launched client ends its session.
An active session has no fixed maximum lifetime; it is subject to inactivity,
eviction and account usage limits. Therefore a separate VPS is not an absolute
requirement for stateful browser operations. The current deployed tools simply
do not implement that mode. Session reuse does not establish access to ChatGPT.

References retrieved through the Cloudflare docs connector:
- https://developers.cloudflare.com/browser-run/playwright/
- https://developers.cloudflare.com/browser-run/limits/
- https://developers.cloudflare.com/browser-run/features/reuse-sessions/
- https://developers.cloudflare.com/agents/tools/browser/

## Acceptance gates before implementation/activation

1. An authorized target-site browser must actually load ChatGPT and permit owner
   login; HTTP 200 alone is insufficient. Do not evade access restrictions.
2. Use a dedicated owner session with a bounded idle lifetime, usage budget,
   per-job lease, cancellation and explicit recovery after eviction. Do not
   add an unbounded keepalive cron to consume the free allowance.
3. Bind the exact conversation, distinguish generating/ready/auth/error states,
   and capture a response before progressing. An uncertain send must not retry
   blindly. The existing generic click/fill tools do not establish this contract.
4. Prove an idle follow-up, final acceptance check and interrupted-run recovery
   in a disposable owner-selected conversation. Do not mark goal completion
   based on heartbeat success or a model's DONE text.

Status: BLOCKED_TARGET_ACCESS. The Docker/ChatCMD package is a prepared alternative,
not the only possible runtime. The PC-hosted ai-duet implementation is not a
cloud-only deployment. Changing to an API agent would change the execution and
billing model and requires the user's choice; it is not silently substituted.

## Free-only completion review — 2026-10-15, 21:29 KST request

The current user requires free Cloudflare/Workers + GitHub Actions only, with
explicit approval before production deployment, main merge, permissions, sending,
deletion or payment. The existing Docker runtime remains inactive reference code;
it is not a proposal to purchase a VPS.

The current Cloudflare Limits page (updated October 14) states that Workers Free
has 10 minutes of Browser Run time per account per day, three concurrent browsers,
and a daily-exhaustion 429 until the next UTC day. Session reuse does not remove
this account-wide browser time ceiling. Consequently a 24-hour browser worker
cannot meet this free-only requirement. A bounded daily batch is a different,
partial capability and must not be labelled continuous goal completion. Other
projects share the same account budget; a per-job timer alone cannot guarantee
account-wide availability. Do not add keepalive cron, raise plan limits, split
accounts to evade quotas, or use metered TinyFish/model calls as a free fallback.

The latest Drive ledger (modified 2026-10-15T12:24:57.820Z) reports a
browser_quota_exceeded call in another workstream and metered TinyFish. These are
retrieved reports, not fresh probes in this follow-up. No new browser launch or
target-site retry was made. The earlier direct ChatGPT403 remains the last
target-access evidence in this workstream.

Five runtime-health regression tests passed again in the local workspace. Source
and test blob identities were compared with commit56936884 before relying on
those results. This is offline health-check verification, not Docker startup,
kernel sandbox, live authentication or browser delegation verification.

Final acceptance remains BLOCKED_FREE_RUNTIME_AND_TARGET_ACCESS. Production
deployment approval would not solve the daily quota or the observed403; do not
ask the owner to approve a deployment as though it would complete this goal.
No user password, paid subscription or personal PC is requested. Further
continuation needs a materially changed, legitimate target-access condition and
an agreed bounded execution scope compatible with the free daily allowance.
