-- db/migrations/0004_survey_tokens.sql
-- Migration: 0004_survey_tokens.sql
-- Purpose: Add survey token tracking for multi-survey receipts

-- ============================================================================
-- 1. survey_tokens table
-- ============================================================================
CREATE TABLE IF NOT EXISTS survey_tokens (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL
);

-- ============================================================================
-- 2. survey_token_submissions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS survey_token_submissions (
  token TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  survey_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (token, submission_id),
  FOREIGN KEY(token) REFERENCES survey_tokens(token),
  FOREIGN KEY(submission_id) REFERENCES survey_submissions(id),
  FOREIGN KEY(survey_id) REFERENCES surveys(id)
);

CREATE INDEX IF NOT EXISTS idx_survey_token_submissions_token
  ON survey_token_submissions (token);
