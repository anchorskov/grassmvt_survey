-- Migration 0036: Voter ballot responses
--
-- ballot_responses: one row per user × race × candidate.
--   chosen = 1 marks the voter's current preference for this race.
--   notes is the "Wyoming's Choice" free-text field from the ballot survey UI.
--   wy_candidate_id mirrors race_candidates.wy_candidate_id so the row is
--   self-contained for reporting without re-joining race_candidates.
--
-- WORM protocol: rows are inserted once and updated in place.
--   Do not DELETE rows. Set chosen = 0 and clear/update notes instead.
--   The updated_at timestamp is the authoritative "last changed" record.
--
-- A voter can mark at most one candidate per race as chosen = 1.
-- Enforced by application logic (not a DB constraint) because the user
-- may temporarily have 0 chosen while changing their preference.

CREATE TABLE IF NOT EXISTS ballot_responses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT    NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  race_slug        TEXT    NOT NULL,   -- ballot_surveys.race_slug
  candidate_slug   TEXT    NOT NULL,   -- race_candidates.candidate_slug
  wy_candidate_id  INTEGER,            -- race_candidates.wy_candidate_id (denormalized for reporting)
  chosen           INTEGER NOT NULL DEFAULT 0 CHECK (chosen IN (0,1)),
  notes            TEXT,               -- "Wyoming's Choice" rubric-aware free-text
  updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, race_slug, candidate_slug)
);

-- Primary ballot page query: load all responses for a voter
CREATE INDEX IF NOT EXISTS idx_ballot_responses_user
  ON ballot_responses(user_id, race_slug);

-- Aggregate query: count choices per candidate per race
CREATE INDEX IF NOT EXISTS idx_ballot_responses_race_candidate
  ON ballot_responses(race_slug, candidate_slug, chosen);

-- Evidence join path: find all voters who chose a specific wy D1 candidate
CREATE INDEX IF NOT EXISTS idx_ballot_responses_wy_candidate
  ON ballot_responses(wy_candidate_id)
  WHERE wy_candidate_id IS NOT NULL;
