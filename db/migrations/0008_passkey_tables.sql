-- db/migrations/0008_passkey_tables.sql
-- Migration: 0008_passkey_tables.sql
-- Purpose: Add passkey credential and WebAuthn challenge tables

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports_json TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  nickname TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_passkey_user_id ON passkey_credentials (user_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id TEXT,
  challenge TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  request_ip_hash TEXT,
  request_ua_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires_at ON webauthn_challenges (expires_at);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user_kind ON webauthn_challenges (user_id, kind);
