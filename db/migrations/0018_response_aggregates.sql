-- db/migrations/0018_response_aggregates.sql
-- Migration: 0018_response_aggregates.sql
-- Purpose: Add tables for aggregated survey results with tier and geography support
-- Note: Enables fast public results without scanning raw response tables

-- ============================================================================
-- 1. response_aggregates table
-- Stores per-question, per-choice counts for each tier/geography combination
-- ============================================================================
CREATE TABLE IF NOT EXISTS response_aggregates (
  id TEXT PRIMARY KEY,
  survey_id INTEGER NOT NULL,
  survey_version_id INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  geo_type TEXT NOT NULL,
  geo_key TEXT NOT NULL,
  question_name TEXT NOT NULL,
  choice_value TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(survey_id) REFERENCES surveys(id),
  FOREIGN KEY(survey_version_id) REFERENCES survey_versions(id)
);

-- Primary lookup index for fetching results
CREATE INDEX IF NOT EXISTS idx_ra_lookup
  ON response_aggregates (survey_id, survey_version_id, tier, geo_type, geo_key, question_name);

-- Index for finding stale aggregates
CREATE INDEX IF NOT EXISTS idx_ra_updated
  ON response_aggregates (updated_at);

-- Unique constraint to prevent duplicate rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_ra_unique
  ON response_aggregates (survey_id, survey_version_id, tier, geo_type, geo_key, question_name, choice_value);

-- ============================================================================
-- 2. aggregate_rollups table
-- Tracks total response count for each tier/geography combination
-- Used for suppression checks (n < MIN_PUBLISH_N)
-- ============================================================================
CREATE TABLE IF NOT EXISTS aggregate_rollups (
  id TEXT PRIMARY KEY,
  survey_id INTEGER NOT NULL,
  survey_version_id INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  geo_type TEXT NOT NULL,
  geo_key TEXT NOT NULL,
  response_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(survey_id) REFERENCES surveys(id),
  FOREIGN KEY(survey_version_id) REFERENCES survey_versions(id)
);

-- Unique constraint for rollups
CREATE UNIQUE INDEX IF NOT EXISTS idx_rollups_unique
  ON aggregate_rollups (survey_id, survey_version_id, tier, geo_type, geo_key);

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_rollups_lookup
  ON aggregate_rollups (survey_id, survey_version_id, tier, geo_type, geo_key);
