-- db/migrations/0033_race_candidates.sql
-- Migration: 0033_race_candidates.sql
-- Purpose: Add race_candidates table for race polling hub
-- Notes:
-- - Stores race identity and candidate metadata only.
-- - Does NOT store responses, voter data, or legislator contact info.
-- - survey_slug links to surveys.slug when a race reuses the existing
--   SurveyJS submission and aggregate reporting path.
-- - wy_legislator_name is a soft reference for display; contact info is
--   read at query time from wy_legislators, not copied here.
-- - is_active = 0 retires placeholder rows without deleting them.

CREATE TABLE IF NOT EXISTS race_candidates (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Race identity
  race_slug        TEXT NOT NULL,    -- e.g. 'us-senate-2026'; matches /races/<slug> route
  race_title       TEXT NOT NULL,    -- e.g. 'U.S. Senate, Wyoming, 2026'
  election_year    INTEGER NOT NULL,
  office_name      TEXT NOT NULL,    -- e.g. 'U.S. Senator'
  race_category    TEXT NOT NULL,    -- 'Federal' | 'Statewide' | 'State Legislature' |
                                     --   'County' | 'Local Board' | 'Judicial Retention'
  jurisdiction     TEXT NOT NULL,    -- e.g. 'Wyoming'
  district_type    TEXT,             -- 'state_house' | 'state_senate' | null for statewide/federal
  district_number  TEXT,             -- e.g. '01'; TEXT to match wy_legislators.district

  -- Candidate identity
  candidate_name   TEXT NOT NULL,
  candidate_slug   TEXT NOT NULL,    -- e.g. 'candidate-a'; used as sub-key in poll form

  -- Filing / status
  filing_status    TEXT,             -- 'declared' | 'exploratory' | 'placeholder'

  -- Public contact (nullable; placeholder until verified from public source)
  campaign_website TEXT,
  public_email     TEXT,
  public_phone     TEXT,

  -- Source tracking
  source_url       TEXT,
  source_note      TEXT,

  -- Existing data links (nullable)
  wy_legislator_name TEXT,           -- name from wy_legislators for incumbent link; do NOT copy contact info
  survey_slug        TEXT REFERENCES surveys(slug),  -- connects race to existing survey poll

  -- Display and lifecycle
  display_order    INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,  -- 0 = retired or placeholder hidden from UI
  last_reviewed_at TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Primary race page lookup: all active candidates for a race in display order
CREATE INDEX IF NOT EXISTS idx_race_candidates_race_slug
  ON race_candidates (race_slug, is_active, display_order);

-- Candidate-level lookup within a race
CREATE INDEX IF NOT EXISTS idx_race_candidates_candidate_slug
  ON race_candidates (race_slug, candidate_slug);

-- Survey link lookup: find race(s) connected to a given survey slug
CREATE INDEX IF NOT EXISTS idx_race_candidates_survey_slug
  ON race_candidates (survey_slug);

-- Legislator link lookup: find race candidates linked to a legislator by name
CREATE INDEX IF NOT EXISTS idx_race_candidates_legislator_name
  ON race_candidates (wy_legislator_name)
  WHERE wy_legislator_name IS NOT NULL;
