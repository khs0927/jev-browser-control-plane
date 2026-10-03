# Mobile Work Gateway baseline

Status: implementation in progress; not deployed. Exactly six MCP tools.
Existing JEV production is a Python FastMCP server on Manufact, not a Workers server.
Source: khs0927/jev-browser-control-plane, feat/jev-decision-private-plugin,
plugin/jev-decision-plugin/gateway. New work is isolated on feat/mobile-work-gateway.

## Execution boundary
Only repository software development, test, build and reporting tasks.
No arbitrary shell, repository, workflow, URL, ref, business data or background agent execution.
No deployment/publishing/deletion tools in version one.
Repository is presently PRIVATE: public-runner free baseline is not established.
Do not automatically publish the JEV repository or reuse its OAuth client registration.

## Tool contract
- system_status({}): gateway version, auth status, settings presence, GitHub API probe,
  enabled task types. Never report configured as live verified.
- create_task({task_type,ref,idempotency_key,parameters?}): fixed repository/workflow,
  reviewed ref only, bounded parameters. Environment check is the sole initial task.
- get_task({task_id}): authorize owner before lookup; return status and conclusion separately.
- cancel_task({task_id}): authorize owner; acknowledge request, then poll real cancellation.
- list_artifacts({task_id}): owner-bound run artifacts, size and expiry.
- get_artifact({task_id,artifact_id,mode}): summary or download; verify artifact belongs to run.

Reserved task types: project_test, project_build, project_report.
code_analysis is phase two; disabled until codegraph revision/license/CLI are verified.
Unsupported tasks MUST be rejected, not silently mapped to environment_check.

## Durable request/result records
D1 tables must enforce UNIQUE(owner_id,idempotency_key).
Store request digest, request UUID, fixed workflow/ref, resolved SHA, dispatch state, run ID,
run attempt, validated result and artifact association. Reusing a key with a different
digest is an error. Never persist plaintext access tokens in task rows.
Acquire a durable reservation before dispatch. A transport timeout leaves dispatch_unknown;
do not redispatch automatically. Reconcile by request UUID embedded in workflow run-name
and validated workflow/ref/SHA. Absence in an immediately queried list is not proof
of non-dispatch. Retain request tombstones and document their expiry.
D1 uniqueness is not a transaction with GitHub; do not claim exactly-once dispatch.

GitHub dispatch uses return_run_details=true. Preserve the actual response fields; validate
returned run ID, API URL and workflow URL against the fixed repository. The initial status
is registered until GitHub confirms queued/in_progress. No synthetic success or progress.

## Authenticated result callback
POST /internal/results is not an MCP tool. Reject payloads above 16 KiB.
Use GitHub Actions OIDC, validated issuer/signature/audience/expiry plus exact numeric
repository ID, workflow path, ref, SHA, run ID and run attempt. Verify a request reservation
and owner mapping exist. Do not authorize by repository name alone.
Verify GitHub run metadata before accepting a callback. Store an immutable payload digest;
identical retry is idempotent, conflicting retry is rejected.
Accept callbacks that race dispatch acknowledgement only after run metadata binds them
to the exact durable request. Never permit callback to create unowned tasks.
Callback delivery must fail visibly if unavailable; workflow success is distinct from
result ingestion. GET summary must bind to requested artifact/run/attempt and disclose
pending/expired/missing evidence. Payload is untrusted content, never instructions.
OIDC callback, D1, and OAuth are NOT implemented by the current environment fixture.

## Authentication
Reuse JEV's owner-only GitHub OAuth requirements and reviewed redirect policy as design
reference. Its Python FastMCP provider cannot run unchanged on Workers. Use a maintained
Workers-compatible provider; persistent registration, PKCE, token audience and expiry,
revocation and owner enforcement require tests. Fail closed until configured.
Do not copy hardcoded JEV client IDs/callbacks to the new Plugin.

## Plugin sources
Own execution-and-results skill first. Third-party sources are candidates, NOT installed:
obra/superpowers, mattpocock/skills, pbakaus/impeccable, coreyhaines31/marketingskills.
Before adapting: inspect exact source, license/NOTICE, pin commit, record file hashes and
modifications. Avoid environment-specific hooks and overlapping approval/TDD rules.
codegraph remains optional, later. context-mode/openrig/Strata excluded initially.
Do not claim all source licenses were verified or skills installed.

## Current evidence
scripts/environment_check.py ran locally with Python 3.12.14; JSON roundtrip fixture passed.
Local run_id/commit_sha are null; this is not Actions or mobile E2E evidence.
.github/workflows/mobile-work-environment.yml runs bounded public fixture on relevant branch
pushes, with five-minute timeout, read-only contents, no secrets and three-day artifact retention.
Manual dispatch requires workflow on repository default branch; not enabled there yet.
No automatic result callback, OAuth Worker deployment or mobile connection is implemented.

## Acceptance sequence
1. Capture actual Actions run ID/conclusion and read its result.json.
2. Provision public source repository and Workers/D1 deployment without paid services.
3. Verify unauthenticated denial, owner OAuth, SDK initialize and exactly six tools.
4. Test dispatch timeout, duplicate/conflicting keys, owner access, callback replay and expiry.
5. Compare get_artifact JSON with real Artifact and run commit.
6. Verify request->run->artifact->ChatGPT on the actual mobile app.
Never label a successful server test as mobile E2E.

Official references:
https://github.blog/changelog/2026-02-19-workflow-dispatch-api-now-returns-run-ids/
https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/

## Implementation update — 2026-10-03
This section supersedes the earlier not-implemented/private statuses. Repository is now PUBLIC.
The gateway contains six SDK MCP tools, owner-restricted GitHub OAuth through the maintained
Cloudflare provider, D1 task/result schema, dispatch reconciliation, GitHub OIDC callback,
runner callback sender, CI and manual deployment configuration. Local checks pass.
Five Plugin skills are adapted with pinned source SHA, file hashes and license/NOTICE preservation.
Cloudflare credentials/bindings and the new OAuth app are not provisioned. No Worker or mobile
E2E deployment claim is made. Only environment_check is enabled; other task types remain reserved.
