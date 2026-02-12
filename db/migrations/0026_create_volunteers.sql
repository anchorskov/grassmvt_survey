-- Migration 0026: Create volunteers table
-- NOTE:
-- - Some environments already have a legacy `volunteers` table with different columns.
-- - Keep this migration schema-safe by creating the table if missing, without
--   assuming specific optional columns for index creation.
CREATE TABLE IF NOT EXISTS volunteers (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  phone_hash TEXT,
  zip TEXT,
  source TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT
);
