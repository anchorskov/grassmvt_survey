-- db/migrations/0044_poll_config.sql
-- Reveal-flag + lock-date switch for the informal 2026 primary poll, admin-
-- editable with no redeploy. results_visible defaults to 0 (hidden) because
-- whether results are shown live or held back is an explicitly deferred
-- product decision -- this column is the switch that lets that decision be
-- made later without a schema change.

CREATE TABLE IF NOT EXISTS poll_config (
  poll_slug       TEXT    PRIMARY KEY,
  vote_lock_at    TEXT,
  results_visible INTEGER NOT NULL DEFAULT 0 CHECK (results_visible IN (0,1)),
  updated_by      TEXT,
  updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO poll_config (poll_slug, vote_lock_at, results_visible)
VALUES ('2026-primary', NULL, 0);
