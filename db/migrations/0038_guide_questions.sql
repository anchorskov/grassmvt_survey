-- db/migrations/0038_guide_questions.sql
-- Issue questions shared by the voter quiz and the candidate questionnaire.
-- Same question set and answer choices for every candidate in a given office level.

CREATE TABLE IF NOT EXISTS guide_questions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  question_text   TEXT    NOT NULL,
  issue_category  TEXT    NOT NULL
    CHECK (issue_category IN (
      'economy','land_use','constitutional','health_care',
      'education','energy','local_control','other'
    )),
  applicable_to   TEXT    NOT NULL
    CHECK (applicable_to IN (
      'federal','statewide','state_house','state_senate',
      'county','city','all'
    )),
  display_order   INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guide_questions_scope
  ON guide_questions (applicable_to, active, display_order);
