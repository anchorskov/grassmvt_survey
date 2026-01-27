-- db/migrations/0006_auth_tables.sql
-- Migration: 0006_auth_tables.sql
-- Purpose: Add Lucia auth tables and app profile tables

CREATE TABLE IF NOT EXISTS user (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT NOT NULL PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_session_user_id ON session (user_id);
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON session (expires_at);

CREATE TABLE IF NOT EXISTS user_profile (
  user_id TEXT NOT NULL PRIMARY KEY,
  email TEXT,
  state TEXT,
  wy_house_district TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_user_profile_state ON user_profile (state);

CREATE TABLE IF NOT EXISTS user_verification (
  user_id TEXT NOT NULL PRIMARY KEY,
  voter_match_status TEXT,
  residence_confidence TEXT,
  last_check_at TEXT,
  distance_bucket TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_user_verification_last_check ON user_verification (last_check_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash TEXT,
  user_agent_hash TEXT,
  metadata_json TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events (created_at);
