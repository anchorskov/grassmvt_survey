-- db/migrations/0040_voter_quiz_responses.sql
-- Voter's own position and issue weight per guide_questions row.
-- user_id references user_profile(user_id), matching the ballot_responses (0036)
-- convention -- every account gets a user_profile row at creation time.

CREATE TABLE IF NOT EXISTS voter_quiz_responses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  question_id  INTEGER NOT NULL REFERENCES guide_questions(id),
  position     TEXT
    CHECK (position IS NULL OR position IN (
      'strongly_support','support','neutral','oppose','strongly_oppose'
    )),
  weight       TEXT    NOT NULL DEFAULT 'medium'
    CHECK (weight IN ('high','medium','low','skip')),
  updated_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_voter_quiz_user
  ON voter_quiz_responses (user_id);
CREATE INDEX IF NOT EXISTS idx_voter_quiz_question
  ON voter_quiz_responses (question_id);
