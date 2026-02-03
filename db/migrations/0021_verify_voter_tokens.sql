-- db/migrations/0021_verify_voter_tokens.sql
-- Migration: 0021_verify_voter_tokens.sql
-- Purpose: Add verified voter tokens, audit log, roles, step-up sessions, and user verification fields

ALTER TABLE user ADD COLUMN is_verified_voter INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user ADD COLUMN verified_at TEXT;
ALTER TABLE user ADD COLUMN verification_method TEXT;
ALTER TABLE user ADD COLUMN verified_scope TEXT;
ALTER TABLE user ADD COLUMN verified_district TEXT;

CREATE TABLE IF NOT EXISTS voter_verify_tokens (
  id TEXT NOT NULL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  target_user_id TEXT,
  target_email TEXT,
  issued_by_user_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by_user_id TEXT,
  notes TEXT,
  FOREIGN KEY (target_user_id) REFERENCES user(id),
  FOREIGN KEY (issued_by_user_id) REFERENCES user(id),
  FOREIGN KEY (used_by_user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_voter_verify_tokens_expires_at ON voter_verify_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_voter_verify_tokens_target_user_id ON voter_verify_tokens (target_user_id);
CREATE INDEX IF NOT EXISTS idx_voter_verify_tokens_target_email ON voter_verify_tokens (target_email);

CREATE TABLE IF NOT EXISTS audit_log (
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

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user_id ON audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role),
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles (role);

CREATE TABLE IF NOT EXISTS passkey_stepup_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stepup_sessions_user_session ON passkey_stepup_sessions (user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_stepup_sessions_expires_at ON passkey_stepup_sessions (expires_at);
