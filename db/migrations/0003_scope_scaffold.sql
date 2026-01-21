-- db/migrations/0003_scope_scaffold.sql
-- Migration: 0003_scope_scaffold.sql
-- Purpose: Scaffold scope session storage and event history for survey routing

-- ============================================================================
-- 1. scope_sessions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS scope_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL,
  match_source TEXT NOT NULL,
  match_quality TEXT NOT NULL,
  scope_level TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  geo_json TEXT NOT NULL,
  districts_json TEXT NOT NULL,
  risk_json TEXT NOT NULL,
  survey_slug TEXT
);

CREATE INDEX IF NOT EXISTS idx_scope_sessions_created_at
  ON scope_sessions (created_at);

CREATE INDEX IF NOT EXISTS idx_scope_sessions_status
  ON scope_sessions (status);

-- ============================================================================
-- 2. scope_events table
-- ============================================================================
CREATE TABLE IF NOT EXISTS scope_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  event_type TEXT NOT NULL,
  details_json TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES scope_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_scope_events_session
  ON scope_events (session_id);
