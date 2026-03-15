-- db/migrations/0032_add_townhall_user_tracking_columns.sql
-- Migration: 0032_add_townhall_user_tracking_columns.sql
-- Purpose: Add explicit internal user_id tracking columns for Town Hall reactions and reports

ALTER TABLE townhall_reactions
ADD COLUMN user_id TEXT REFERENCES user(id);

UPDATE townhall_reactions
SET user_id = actor_key
WHERE user_id IS NULL
  AND actor_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_townhall_reactions_user_id
  ON townhall_reactions (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_townhall_reactions_statement_user_reaction
  ON townhall_reactions (statement_id, user_id, reaction_type)
  WHERE user_id IS NOT NULL;

ALTER TABLE townhall_reports
ADD COLUMN user_id TEXT REFERENCES user(id);

UPDATE townhall_reports
SET user_id = actor_key
WHERE user_id IS NULL
  AND actor_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_townhall_reports_user_id
  ON townhall_reports (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_townhall_reports_statement_user
  ON townhall_reports (statement_id, user_id)
  WHERE user_id IS NOT NULL;
