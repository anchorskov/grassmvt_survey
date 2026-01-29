-- db/migrations/0007_password_reset_tokens.sql
-- Migration: 0007_password_reset_tokens.sql
-- Purpose: Add password reset tokens table

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  request_ip_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens (expires_at);
