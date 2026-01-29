-- db/migrations/0012_session_timestamps.sql
-- Migration: 0012_session_timestamps.sql
-- Purpose: Add timestamp columns to session table for session lifecycle tracking

ALTER TABLE session ADD COLUMN created_at TEXT;
ALTER TABLE session ADD COLUMN last_seen_at TEXT;

-- Update existing sessions with current timestamp
UPDATE session
SET created_at = CURRENT_TIMESTAMP,
    last_seen_at = CURRENT_TIMESTAMP
WHERE created_at IS NULL;

