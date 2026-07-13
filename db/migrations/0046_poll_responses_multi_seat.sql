-- db/migrations/0046_poll_responses_multi_seat.sql
-- Some offices elect more than one seat (offices.seats_available, e.g. Natrona
-- County Commissioner = 3, many precinct committee races = 2-8) -- the original
-- UNIQUE(poll_slug, voter_id, race_slug) only allowed one candidate per race per
-- voter, which can't represent a multi-seat pick. Rebuild with candidate_slug
-- added to the uniqueness key so a voter can hold multiple rows for the same
-- race. SQLite requires a full table rebuild to change a UNIQUE constraint.
-- Table has only a handful of real/test rows at this point -- low-risk rebuild.

CREATE TABLE poll_responses_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_slug        TEXT    NOT NULL DEFAULT '2026-primary',
  voter_id         TEXT    NOT NULL,
  race_slug        TEXT    NOT NULL,
  candidate_slug   TEXT    NOT NULL,
  wy_candidate_id  INTEGER,
  chosen           INTEGER NOT NULL DEFAULT 1 CHECK (chosen IN (0,1)),
  updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (poll_slug, voter_id, race_slug, candidate_slug)
);

INSERT INTO poll_responses_new
  (id, poll_slug, voter_id, race_slug, candidate_slug, wy_candidate_id, chosen, updated_at, created_at)
SELECT id, poll_slug, voter_id, race_slug, candidate_slug, wy_candidate_id, chosen, updated_at, created_at
FROM poll_responses;

DROP TABLE poll_responses;
ALTER TABLE poll_responses_new RENAME TO poll_responses;

CREATE INDEX IF NOT EXISTS idx_poll_responses_race_candidate
  ON poll_responses (poll_slug, race_slug, candidate_slug, chosen);
CREATE INDEX IF NOT EXISTS idx_poll_responses_voter
  ON poll_responses (poll_slug, voter_id, race_slug);
