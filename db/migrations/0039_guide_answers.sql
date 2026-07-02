-- db/migrations/0039_guide_answers.sql
-- Candidate answers to guide_questions, one row per candidate x question.
-- wy_candidate_id is a plain reference to candidates.id in the wy D1 (shared
-- production database, separate local D1) -- not a live FK, see GuideConcept.md.

CREATE TABLE IF NOT EXISTS guide_answers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  wy_candidate_id  INTEGER NOT NULL,
  question_id      INTEGER NOT NULL REFERENCES guide_questions(id),
  position         TEXT    NOT NULL
    CHECK (position IN (
      'strongly_support','support','neutral',
      'oppose','strongly_oppose','no_answer'
    )),
  explanation      TEXT    CHECK (length(explanation) <= 500),
  source_url       TEXT,
  firmness         TEXT
    CHECK (firmness IS NULL OR firmness IN ('core','leaning','open')),
  is_top_priority  INTEGER NOT NULL DEFAULT 0 CHECK (is_top_priority IN (0,1)),
  source_kind      TEXT    NOT NULL DEFAULT 'candidate_submission'
    CHECK (source_kind IN ('candidate_submission','public_record','inferred')),
  reviewed         INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0,1)),
  submitted_at     TEXT,
  created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (wy_candidate_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_guide_answers_candidate
  ON guide_answers (wy_candidate_id, reviewed);
CREATE INDEX IF NOT EXISTS idx_guide_answers_question
  ON guide_answers (question_id, reviewed);
