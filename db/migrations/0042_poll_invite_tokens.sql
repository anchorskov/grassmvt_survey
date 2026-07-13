-- db/migrations/0042_poll_invite_tokens.sql
-- Reusable (non-single-use) access token per voter for the informal 2026
-- primary "which candidate do you choose" poll. Modeled on
-- guide_answer_tokens (0041): a voter can return and change their vote any
-- time before expires_at, rather than the token being consumed on first use
-- (magic_link_tokens / email_verification_tokens pattern).
--
-- No user/session row is created for this -- identity comes entirely from
-- the token, minted server-to-server by skovgard2026-api's Blast pipeline
-- during the invite send (POST /api/poll/admin/mint-invite-token), which
-- already knows voter_id/district/party from a WY_DB voter_emails join.
-- house_district/senate_district/political_party are denormalized here at
-- mint time so the vote page never needs a second cross-database lookup
-- back into voters.

CREATE TABLE IF NOT EXISTS poll_invite_tokens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_slug       TEXT    NOT NULL DEFAULT '2026-primary',
  voter_id        TEXT    NOT NULL,        -- wy D1 voters.voter_id
  email_norm      TEXT    NOT NULL,        -- the voter_emails row this invite went to
  token_hash      TEXT    NOT NULL UNIQUE,
  house_district  TEXT,
  senate_district TEXT,
  political_party TEXT,
  sent_at         TEXT,
  expires_at      TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (poll_slug, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_invite_tokens_hash
  ON poll_invite_tokens (token_hash);
