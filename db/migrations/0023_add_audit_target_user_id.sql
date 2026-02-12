-- db/migrations/0023_add_audit_target_user_id.sql
-- Purpose: historical compatibility marker.
-- NOTE:
-- - target_user_id, ip, user_agent, and metadata_json are already present from 0021.
-- - Re-adding columns here causes duplicate-column failures on fresh/local runs.
-- - Keep only idempotent index creation.

CREATE INDEX IF NOT EXISTS idx_audit_log_target_user_id ON audit_log(target_user_id);
