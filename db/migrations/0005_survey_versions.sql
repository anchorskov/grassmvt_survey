-- db/migrations/0005_survey_versions.sql
-- Migration: 0005_survey_versions.sql
-- Purpose: Add survey versioning and SurveyJS response storage

-- ============================================================================
-- 1. surveys index for slug lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_surveys_slug
  ON surveys (slug);

-- ============================================================================
-- 2. survey_versions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS survey_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  json_text TEXT NOT NULL,
  json_hash TEXT NOT NULL,
  changelog TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  FOREIGN KEY(survey_id) REFERENCES surveys(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_versions_unique
  ON survey_versions (survey_id, version);

CREATE INDEX IF NOT EXISTS idx_survey_versions_survey_id
  ON survey_versions (survey_id);

CREATE INDEX IF NOT EXISTS idx_survey_versions_published_at
  ON survey_versions (survey_id, published_at);

-- ============================================================================
-- 3. responses table
-- ============================================================================
CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  survey_id INTEGER NOT NULL,
  survey_version_id INTEGER NOT NULL,
  version_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_flag INTEGER NOT NULL DEFAULT 0,
  district TEXT,
  ip_hash TEXT,
  user_hash TEXT,
  FOREIGN KEY(survey_id) REFERENCES surveys(id),
  FOREIGN KEY(survey_version_id) REFERENCES survey_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_responses_survey_id
  ON responses (survey_id);

CREATE INDEX IF NOT EXISTS idx_responses_created_at
  ON responses (created_at);

-- ============================================================================
-- 4. response_answers table
-- ============================================================================
CREATE TABLE IF NOT EXISTS response_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id TEXT NOT NULL,
  question_name TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(response_id) REFERENCES responses(id)
);

CREATE INDEX IF NOT EXISTS idx_response_answers_response_id
  ON response_answers (response_id);

CREATE INDEX IF NOT EXISTS idx_response_answers_created_at
  ON response_answers (created_at);

-- ============================================================================
-- 5. survey_flags table
-- ============================================================================
CREATE TABLE IF NOT EXISTS survey_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL,
  survey_version_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  flag_type TEXT NOT NULL,
  message TEXT,
  contact_optional TEXT,
  FOREIGN KEY(survey_id) REFERENCES surveys(id),
  FOREIGN KEY(survey_version_id) REFERENCES survey_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_survey_flags_survey_id
  ON survey_flags (survey_id);

CREATE INDEX IF NOT EXISTS idx_survey_flags_created_at
  ON survey_flags (created_at);
