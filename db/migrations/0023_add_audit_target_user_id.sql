-- db/migrations/0023_add_audit_target_user_id.sql
-- Migration 0023: Add audit_log columns for verified voter audit trails
-- Purpose: Ensure audit_log schema matches current worker inserts

ALTER TABLE audit_log ADD COLUMN target_user_id TEXT;
ALTER TABLE audit_log ADD COLUMN ip TEXT;
ALTER TABLE audit_log ADD COLUMN user_agent TEXT;
ALTER TABLE audit_log ADD COLUMN metadata_json TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_target_user_id ON audit_log(target_user_id);
