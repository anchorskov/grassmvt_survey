-- db/migrations/0027_create_townhall_tables.sql
-- Migration: 0027_create_townhall_tables.sql
-- Purpose: Add Town Hall topic/statements/reactions/moderation/receipts tables
-- Notes:
-- - Binds Town Hall topics to canonical survey slugs in surveys.slug.
-- - Uses TEXT primary keys to align with existing UUID-style IDs used in this repo.

-- ==========================================================================
-- 1) townhall_topics
-- ==========================================================================
CREATE TABLE IF NOT EXISTS townhall_topics (
  id TEXT NOT NULL PRIMARY KEY,
  survey_slug TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (survey_slug) REFERENCES surveys(slug)
);

-- Required: unique canonical binding to survey topic
CREATE UNIQUE INDEX IF NOT EXISTS idx_townhall_topics_survey_slug_unique
  ON townhall_topics (survey_slug);

-- Optional separate Town Hall slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_townhall_topics_slug_unique
  ON townhall_topics (slug);

CREATE INDEX IF NOT EXISTS idx_townhall_topics_status_created
  ON townhall_topics (status, created_at);

-- ==========================================================================
-- 2) townhall_statements
-- ==========================================================================
CREATE TABLE IF NOT EXISTS townhall_statements (
  id TEXT NOT NULL PRIMARY KEY,
  topic_id TEXT NOT NULL,
  user_id TEXT,
  body TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (topic_id) REFERENCES townhall_topics(id),
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_townhall_statements_topic_created
  ON townhall_statements (topic_id, created_at);

CREATE INDEX IF NOT EXISTS idx_townhall_statements_status_created
  ON townhall_statements (status, created_at);

-- ==========================================================================
-- 3) townhall_reactions
-- ==========================================================================
CREATE TABLE IF NOT EXISTS townhall_reactions (
  id TEXT NOT NULL PRIMARY KEY,
  statement_id TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (statement_id) REFERENCES townhall_statements(id),
  UNIQUE (statement_id, actor_key, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_townhall_reactions_statement
  ON townhall_reactions (statement_id);

-- ==========================================================================
-- 4) townhall_reports
-- ==========================================================================
CREATE TABLE IF NOT EXISTS townhall_reports (
  id TEXT NOT NULL PRIMARY KEY,
  statement_id TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (statement_id) REFERENCES townhall_statements(id),
  UNIQUE (statement_id, actor_key)
);

CREATE INDEX IF NOT EXISTS idx_townhall_reports_statement_status
  ON townhall_reports (statement_id, status);

-- ==========================================================================
-- 5) townhall_moderation_actions
-- ==========================================================================
CREATE TABLE IF NOT EXISTS townhall_moderation_actions (
  id TEXT NOT NULL PRIMARY KEY,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  reviewer_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_townhall_moderation_item
  ON townhall_moderation_actions (item_type, item_id, created_at);

CREATE INDEX IF NOT EXISTS idx_townhall_moderation_reviewer
  ON townhall_moderation_actions (reviewer_id, created_at);

-- ==========================================================================
-- 6) townhall_receipts
-- ==========================================================================
CREATE TABLE IF NOT EXISTS townhall_receipts (
  id TEXT NOT NULL PRIMARY KEY,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES townhall_topics(id)
);

CREATE INDEX IF NOT EXISTS idx_townhall_receipts_topic_created
  ON townhall_receipts (topic_id, created_at);
