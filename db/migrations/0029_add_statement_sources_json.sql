-- db/migrations/0029_add_statement_sources_json.sql
-- Migration: 0029_add_statement_sources_json.sql
-- Purpose: Add optional source URL storage for Town Hall statements.

ALTER TABLE townhall_statements
ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]';
