-- Migration 0024: Recreate audit_log with TEXT id primary key
-- Purpose: Ensure audit_log.id is TEXT to accept UUIDs inserted by the worker

-- Create new table with TEXT id primary key
CREATE TABLE IF NOT EXISTS audit_log_new (
  id TEXT NOT NULL PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  created_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  metadata_json TEXT,
  FOREIGN KEY (actor_user_id) REFERENCES user(id),
  FOREIGN KEY (target_user_id) REFERENCES user(id)
);

-- Copy existing data, casting id to TEXT
INSERT OR IGNORE INTO audit_log_new (id, actor_user_id, action, target_user_id, created_at, ip, user_agent, metadata_json)
  SELECT CAST(id AS TEXT), actor_user_id, action, target_user_id, created_at, ip, user_agent, metadata_json
  FROM audit_log;

-- Drop old table and rename new
DROP TABLE IF EXISTS audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user_id ON audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_target_user_id ON audit_log(target_user_id);
