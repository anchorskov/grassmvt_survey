-- db/migrations/0031_add_townhall_statement_parent_id.sql
-- Migration: 0031_add_townhall_statement_parent_id.sql
-- Purpose: Add one-level reply support for Town Hall statements

ALTER TABLE townhall_statements
ADD COLUMN parent_statement_id TEXT REFERENCES townhall_statements(id);

CREATE INDEX IF NOT EXISTS idx_townhall_statements_parent_created
  ON townhall_statements (parent_statement_id, created_at);
