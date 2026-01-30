-- db/migrations/0013_oauth_tables.sql
-- Migration: 0013_oauth_tables.sql
-- Purpose: Add OAuth state tracking and account linkage tables

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_sub),
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts (user_id);
