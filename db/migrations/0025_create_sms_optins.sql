-- Migration 0025: Create sms_optins table
CREATE TABLE IF NOT EXISTS sms_optins (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  phone_hash TEXT NOT NULL,
  opted_in INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sms_optins_phone_hash ON sms_optins(phone_hash);
CREATE INDEX IF NOT EXISTS idx_sms_optins_user_id ON sms_optins(user_id);
