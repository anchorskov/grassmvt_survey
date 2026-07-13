-- db/migrations/0043_poll_responses.sql
-- One row per (voter, race) for the informal 2026 primary candidate-choice
-- poll. Parallel to ballot_responses (0036) but keyed by voter_id from a
-- poll_invite_tokens token instead of user_id from an account -- there is no
-- session/account for this feature. A re-vote is a plain UPDATE candidate_slug
-- on the existing row (single-choice-per-race, unlike ballot_responses).
--
-- candidate_slug/wy_candidate_id join back to the existing, already-populated
-- race_candidates table (0033) for display metadata -- this table does not
-- duplicate candidate data.

CREATE TABLE IF NOT EXISTS poll_responses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_slug        TEXT    NOT NULL DEFAULT '2026-primary',
  voter_id         TEXT    NOT NULL,
  race_slug        TEXT    NOT NULL,
  candidate_slug   TEXT    NOT NULL,
  wy_candidate_id  INTEGER,
  chosen           INTEGER NOT NULL DEFAULT 1 CHECK (chosen IN (0,1)),
  updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (poll_slug, voter_id, race_slug)
);

CREATE INDEX IF NOT EXISTS idx_poll_responses_race_candidate
  ON poll_responses (poll_slug, race_slug, candidate_slug, chosen);

CREATE INDEX IF NOT EXISTS idx_poll_responses_voter
  ON poll_responses (poll_slug, voter_id, race_slug);
