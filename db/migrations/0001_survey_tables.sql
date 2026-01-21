-- Migration: 0001_survey_tables.sql
-- Purpose: Create survey storage tables with JSON-based question format
-- Note: Extends existing wy_local/wy D1 database without modifying voter tables

-- ============================================================================
-- 1. surveys table
-- ============================================================================
CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  scope TEXT NOT NULL,      -- 'wy' or 'public'
  title TEXT NOT NULL,
  status TEXT NOT NULL,     -- 'active' or 'coming_soon'
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. survey_questions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS survey_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL,
  question_key TEXT NOT NULL,    -- e.g., 'main_question_01'
  question_json TEXT NOT NULL,   -- JSON string: {prompt, policy_1..policy_5}
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(survey_id) REFERENCES surveys(id)
);

-- ============================================================================
-- 3. survey_submissions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS survey_submissions (
  id TEXT PRIMARY KEY,           -- UUID receipt id
  survey_id INTEGER NOT NULL,
  status TEXT NOT NULL,          -- 'unverified' or 'verified'
  fn TEXT,
  ln TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  FOREIGN KEY(survey_id) REFERENCES surveys(id)
);

-- ============================================================================
-- 4. survey_answers table
-- ============================================================================
CREATE TABLE IF NOT EXISTS survey_answers (
  submission_id TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  selected_key TEXT NOT NULL,    -- 'policy_1'..'policy_5'
  biased INTEGER NOT NULL DEFAULT 0,   -- 0/1
  bias_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (submission_id, question_id),
  FOREIGN KEY(submission_id) REFERENCES survey_submissions(id),
  FOREIGN KEY(question_id) REFERENCES survey_questions(id)
);

-- ============================================================================
-- 5. bias_reports table (optional, separate from survey_answers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bias_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL,
  submission_id TEXT,
  question_id INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(survey_id) REFERENCES surveys(id),
  FOREIGN KEY(submission_id) REFERENCES survey_submissions(id),
  FOREIGN KEY(question_id) REFERENCES survey_questions(id)
);

-- ============================================================================
-- SEED DATA: Insert first survey (abortion-policy)
-- ============================================================================
INSERT INTO surveys (slug, scope, title, status, created_at)
VALUES (
  'abortion-policy',
  'wy',
  'Abortion Policy Survey',
  'active',
  CURRENT_TIMESTAMP
);

-- ============================================================================
-- SEED DATA: Insert first question with JSON content
-- ============================================================================
INSERT INTO survey_questions (survey_id, question_key, question_json, created_at)
SELECT
  s.id,
  'main_question_01',
  json('{"prompt":"Which abortion policy approach do you most support?","policy_1":"Full legal protection from conception, with very limited exceptions","policy_2":"Legal protection early in pregnancy, with defined exceptions","policy_3":"Legal protection after viability, with defined exceptions","policy_4":"Legal access early in pregnancy, with limits later","policy_5":"Full legal access, with personal decision making throughout"}'),
  CURRENT_TIMESTAMP
FROM surveys s
WHERE s.slug = 'abortion-policy';
