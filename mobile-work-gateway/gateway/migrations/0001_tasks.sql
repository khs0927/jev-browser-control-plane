CREATE TABLE IF NOT EXISTS tasks (
 task_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, request_key TEXT NOT NULL,
 digest TEXT NOT NULL, task_type TEXT NOT NULL, ref TEXT NOT NULL, sha TEXT NOT NULL,
 dispatch_state TEXT NOT NULL, run_id TEXT UNIQUE, created_at INTEGER NOT NULL,
 UNIQUE(owner_id, request_key)
);
CREATE TABLE IF NOT EXISTS results (
 task_id TEXT NOT NULL REFERENCES tasks(task_id), run_attempt INTEGER NOT NULL,
 payload TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(task_id, run_attempt)
);
