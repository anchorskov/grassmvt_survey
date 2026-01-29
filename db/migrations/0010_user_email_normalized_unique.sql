-- db/migrations/0010_user_email_normalized_unique.sql
-- Migration: 0010_user_email_normalized_unique.sql
-- Purpose: Enforce normalized email uniqueness.

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_normalized ON user (lower(email));
