-- db/migrations/0009_response_editing.sql
-- Migration: 0009_response_editing.sql
-- Purpose: Add user tracking and edit support for survey responses

ALTER TABLE responses ADD COLUMN user_id TEXT;
ALTER TABLE responses ADD COLUMN submitted_at TEXT;
ALTER TABLE responses ADD COLUMN updated_at TEXT;
ALTER TABLE responses ADD COLUMN edit_count INTEGER NOT NULL DEFAULT 0;

UPDATE responses
SET submitted_at = COALESCE(submitted_at, created_at),
    updated_at = COALESCE(updated_at, created_at)
WHERE submitted_at IS NULL OR updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_responses_user_id ON responses (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_user_surveyver_unique
  ON responses (user_id, survey_version_id);
