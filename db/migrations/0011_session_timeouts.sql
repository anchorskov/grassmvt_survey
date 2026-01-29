-- db/migrations/0011_session_timeouts.sql
-- Migration: 0011_session_timeouts.sql
-- Purpose: Add session timestamps for idle and absolute timeouts.

ALTER TABLE session ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE session ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE session
SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
    last_seen_at = COALESCE(last_seen_at, CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_session_last_seen_at ON session (last_seen_at);
