# Mobile Work Gateway: Remote Read-Only Repository Inspection

The **inspect_repository** MCP tool reads only the repository configured in `REPOSITORY`; callers cannot supply an arbitrary repository or URL.

It returns repository visibility, the reviewed Git ref/SHA, current GitHub branch HEAD, whether the reviewed SHA still matches, whether dispatch prerequisites are met, and up to five recent workflow-dispatch run statuses. It never starts GitHub Actions.

## Operational safety

* Changes are staged in a feature branch and Draft PR. No automatic merge or production Worker deployment.
* The existing `create_task`, `get_task`, and artifact APIs are unchanged.
* Updating a Worker does **not** automatically update ChatGPT's discovered tool catalog; reconnect or refresh tool discovery after deploying.
* Compare `current_head_sha` with `reviewed_sha` before any future task. Deployment must pin the reviewed commit through the existing audited process.
* Continue using `browser_check` and `gateway_tests` as the existing E2E baseline, subject to Actions quota.
* GitHub API calls still require configured read permissions. No new GitHub Actions minutes are consumed by this inspection tool.

## Activepieces risk found (2026-10-14)

The older enabled `MOBILE-GPT-WORKER-DISPATCH-V1` flow accepted a request-supplied `worker_gateway_url`, while its HTTP action attached privileged authorization-header templates, allowed redirects and used an unauthenticated webhook trigger. This creates a possible credential-exfiltration route if secrets are configured.

The flow was paused during review. Do not re-enable it unchanged. The isolated draft `REVIEW-ISOLATED-MOBILE-DISPATCH-20261014-1914-V1` restricts the destination in its validation step but still needs its HTTP step and target endpoint verified; it is NOT production ready.

Safe follow-up: pin HTTPS host and exact API path in step configuration, deny redirects, remove unrelated credentials, authenticate the inbound trigger, use task-type allowlisting, enforce owner/audience checks, and test rejection cases before publishing.
