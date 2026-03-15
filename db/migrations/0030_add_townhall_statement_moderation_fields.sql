-- db/migrations/0030_add_townhall_statement_moderation_fields.sql
-- Migration: 0030_add_townhall_statement_moderation_fields.sql
-- Purpose: Add moderation metadata columns for Town Hall statements

ALTER TABLE townhall_statements
ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'unchecked';

ALTER TABLE townhall_statements
ADD COLUMN moderation_provider TEXT;

ALTER TABLE townhall_statements
ADD COLUMN moderation_flags_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE townhall_statements
ADD COLUMN moderation_reason TEXT;
