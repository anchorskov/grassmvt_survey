-- db/migrations/0037_magic_link_tokens.sql
-- Magic-link (passwordless) auth tokens. Follows the email_verification_tokens
-- pattern (migration 0013): random token hashed with HASH_SALT + SHA-256,
-- raw token sent in the email link, hash stored here.

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id              TEXT NOT NULL PRIMARY KEY,   -- UUID v4
  token_hash      TEXT NOT NULL UNIQUE,        -- SHA-256 of raw token sent in email
  user_id         TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at      TEXT NOT NULL,               -- ISO-8601; 1 hour from issue
  used_at         TEXT,                        -- NULL = not yet used
  request_ip_hash TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_user_id
  ON magic_link_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires_at
  ON magic_link_tokens (expires_at);
