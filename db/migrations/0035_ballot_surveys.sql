-- Migration 0035: Ballot survey registry
--
-- ballot_surveys: one row per race/office that voters evaluate.
--   scope_type + scope_value define which voters see this survey:
--     ('state_house',   '29')   → HD-29 voters only
--     ('state_senate',  '28')   → SD-28 voters only
--     ('county',        'NATRONA') → Natrona County voters
--     ('statewide',     NULL)   → all Wyoming voters
--     ('federal',       NULL)   → all Wyoming voters
--
--   race_slug links to race_candidates.race_slug for candidate data.
--   wy_db_office_id links to offices.id in the wy D1 (same DB in production).
--   This is the WORM anchor: once created, ballot_surveys rows are immutable
--   except for display_order, active, and updated_at.
--
-- Also adds wy_candidate_id to race_candidates so the ballot page can join
-- race candidates to guide_rubric_evidence_links and docs_json in the wy D1.

CREATE TABLE IF NOT EXISTS ballot_surveys (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  race_slug        TEXT    NOT NULL UNIQUE,
  title            TEXT    NOT NULL,
  scope_type       TEXT    NOT NULL
    CHECK (scope_type IN ('federal','statewide','state_house','state_senate','county','local')),
  scope_value      TEXT,                    -- district number or county name; NULL for statewide/federal
  wy_db_office_id  INTEGER,                 -- offices.id in wy D1; populated during enrichment
  election_year    INTEGER NOT NULL DEFAULT 2026,
  display_order    INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fast lookup by scope: find all surveys a voter with a given HD/SD/county should see
CREATE INDEX IF NOT EXISTS idx_ballot_surveys_scope
  ON ballot_surveys(scope_type, scope_value, active, display_order);

-- Link race_candidates rows to their wy D1 candidate record.
-- Null until enrichment script matches candidate_name → candidates.slug in wy D1.
ALTER TABLE race_candidates ADD COLUMN wy_candidate_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_race_candidates_wy_candidate_id
  ON race_candidates(wy_candidate_id)
  WHERE wy_candidate_id IS NOT NULL;
