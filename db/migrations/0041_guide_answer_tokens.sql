-- db/migrations/0041_guide_answer_tokens.sql
-- One reusable access token per candidate for the guide_answers questionnaire.
-- Unlike magic_link_tokens / email_verification_tokens, this token is NOT
-- single-use: candidates can return and resubmit/update answers any time
-- before expires_at (mirrors the existing guide_questionnaire_tokens pattern
-- in the Candidates project's admin rubric flow, a distinct table/purpose).

CREATE TABLE IF NOT EXISTS guide_answer_tokens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wy_candidate_id INTEGER NOT NULL UNIQUE,
  token_hash      TEXT    NOT NULL UNIQUE,
  sent_at         TEXT,
  expires_at      TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guide_answer_tokens_hash
  ON guide_answer_tokens (token_hash);
