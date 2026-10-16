# Cloudflare idle lease event bridge — draft / opt-in

**Scope:** This file documents a reviewed event emitter only. It is NOT wired into a running production worker and does NOT resume ChatGPT chats.

## Current source of truth

Activepieces GPT-CONTINUITY-IDLE-WATCHDOG-V1 scans `GPT_CONTINUITY_JOBS` every 5 minutes, marking a RUNNING job STALE if its last heartbeat is 15+ minutes old. Activepieces quota errors now make this unreliable. The proposed Cloudflare Durable Objects v2 prototype uses a separate SQLite-backed one-shot alarm per job and accepts only authenticated `start`, `heartbeat`, and `finish` events.

**Not interchangeable yet:** the standalone Cloudflare prototype does NOT read or write the original Activepieces tables. Uninstrumented jobs would be invisible. Do not disable Activepieces monitoring before all worker types have trusted event adapters and a verified authoritative status/audit bridge.

## Emitter (local-only / no credentials in Git)

Script: `scripts/idle_lease_emitter.py`. Unit tests: `tests/test_idle_lease_emitter.py`.

After separate approval of an isolated review deployment and a trusted event source, configure:

- `IDLE_LEASE_URL` as the HTTPS hostname of the approved monitor (no trailing paths, query or credentials);
- `IDLE_LEASE_TOKEN` as a 32+ character secret from a secret store, never repository variables or logs;
- owner-approved `JOB_ID` (only the allowlisted job); and a unique `RUN_ID` per actual worker invocation.

For a reviewed external job wrapper:

```bash
python3 scripts/idle_lease_emitter.py start --job-id "$JOB_ID" --run-id "$RUN_ID" --seq 1
# Execute reviewed task. In long-running tasks, send monotonic heartbeat seq 2,3...
python3 scripts/idle_lease_emitter.py heartbeat --job-id "$JOB_ID" --run-id "$RUN_ID" --seq 2
python3 scripts/idle_lease_emitter.py finish --job-id "$JOB_ID" --run-id "$RUN_ID" --seq 3
```

The script emits one event per invocation, does not shell out, sends tokens only in the Authorization header, and refuses non-HTTPS URLs. Sequence numbers must be persistent and strictly increasing; retries of one event reuse the same sequence and deterministic event ID.

## Verification gates

1. Confirm **actual Cloudflare account subscription** is Workers Free or separately approve potential charges. Current API permission does not allow subscription/billing read; `default_usage_model=standard` alone is NOT proof of Free.
2. Separate operator approval before any production deployment or disabling the existing flow.
3. Configure a scoped, rotating secret on both sides and check the approved external worker's identity and exact task allowlist. Do not perform sensitive OAuth changes without approval.
4. Test actual signed start/heartbeat/finish and delayed heartbeat replay, 15-minute alarm, and failure alerts; record external run IDs and evidence.
5. Instrument all existing Activepieces RUNNING jobs or retain the old monitor. Only replace 5-minute monitoring after equal coverage and audit-record parity are established.
6. No automatic ChatGPT chat resume, no background infinite session, no native CAD write, no paid Actions or secret disclosure.

This branch is deliberately *non-production*: it contains only additive files, not changes to main runtime, workflow triggers or release configuration.
