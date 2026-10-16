-- DRAFT only: not in migrations and never applied automatically.
CREATE TABLE IF NOT EXISTS orch_tasks_v1 (
 task_id TEXT PRIMARY KEY,
 owner_subject_hash TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 request_sha256 TEXT NOT NULL CHECK(length(request_sha256)=64),
 target TEXT NOT NULL,
 action TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RECEIVED','VALIDATED','REVIEW','APPROVED','BLOCKED','DISPATCHED','RUNNING','VERIFYING','DONE','FAILED','CANCELLED','DISPATCH_UNKNOWN')),
 budget_cents INTEGER NOT NULL DEFAULT 0 CHECK(budget_cents=0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(owner_subject_hash,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_orch_tasks_status_v1 ON orch_tasks_v1(status,updated_at);
CREATE TABLE IF NOT EXISTS orch_approvals_v1 (
 approval_id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES orch_tasks_v1(task_id),
 owner_subject_hash TEXT NOT NULL,
 signed_scope_sha256 TEXT NOT NULL CHECK(length(signed_scope_sha256)=64),
 decision TEXT NOT NULL CHECK(decision IN ('PENDING','APPROVED','DENIED','EXPIRED')),
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(task_id,signed_scope_sha256)
);
CREATE TABLE IF NOT EXISTS orch_events_v1 (
 task_id TEXT NOT NULL REFERENCES orch_tasks_v1(task_id),
 sequence_num INTEGER NOT NULL CHECK(sequence_num>0),
 event_type TEXT NOT NULL,
 evidence_sha256 TEXT CHECK(evidence_sha256 IS NULL OR length(evidence_sha256)=64),
 created_at TEXT NOT NULL,
 PRIMARY KEY(task_id,sequence_num)
);
CREATE TABLE IF NOT EXISTS orch_dispatch_attempts_v1 (
 task_id TEXT NOT NULL REFERENCES orch_tasks_v1(task_id),
 attempt_num INTEGER NOT NULL CHECK(attempt_num>0),
 external_request_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('PREPARED','SENT','ACKED','UNKNOWN','FAILED','VERIFIED')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(task_id,attempt_num)
);
