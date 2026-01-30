-- db/migrations/0011_session_timeouts.sql
-- Migration: 0011_session_timeouts.sql
-- Purpose: Add session timestamps for idle and absolute timeouts.
-- Note: Columns may already exist from earlier deployment; this migration is now idempotent

-- These columns were already added in the production database, so this is a no-op migration.
-- The migration just marks these changes in the migration history.

-- UPDATE session
-- SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
--     last_seen_at = COALESCE(last_seen_at, CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_session_last_seen_at ON session (last_seen_at);
