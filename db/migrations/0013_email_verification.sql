-- db/migrations/0013_email_verification.sql
-- Purpose: Add email verification support to Lucia auth system
-- Adds email_verified_at and account_status columns to user table
-- Creates email_verification_tokens table following password_reset_tokens pattern

-- Add email verification columns to user table
ALTER TABLE user ADD COLUMN email_verified_at TEXT;
ALTER TABLE user ADD COLUMN account_status TEXT NOT NULL DEFAULT 'pending';

-- Create email verification tokens table
-- Follows same secure pattern as password_reset_tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  request_ip_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token_hash ON email_verification_tokens (token_hash);

-- Index on user.account_status for quick filtering of pending/active accounts
CREATE INDEX IF NOT EXISTS idx_user_account_status ON user (account_status);
