-- db/migrations/0009_response_editing.sql
-- Migration: 0009_response_editing.sql
-- Purpose: Add user tracking and edit support for survey responses
-- Note: Columns may already exist from earlier deployment; this migration is now idempotent

-- Since SQLite doesn't support IF NOT EXISTS in ALTER TABLE ADD COLUMN,
-- we'll only add columns that don't exist yet. The columns have been added
-- in the production database already, so this is a no-op migration that marks
-- the migration as applied.

-- These columns were added in earlier deployments and already exist:
-- - user_id
-- - submitted_at
-- - updated_at  
-- - edit_count

-- Indexes were also already created in the production database.
-- This migration's purpose is to mark these changes in the migration history.

UPDATE responses
SET submitted_at = COALESCE(submitted_at, created_at),
    updated_at = COALESCE(updated_at, created_at)
WHERE submitted_at IS NULL OR updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_responses_user_id ON responses (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_user_surveyver_unique
  ON responses (user_id, survey_version_id);
