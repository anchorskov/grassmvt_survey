-- Migration 0016: Add wy_voter_id to user_verification table
-- Stores the matched Wyoming voter ID for verified users

ALTER TABLE user_verification ADD COLUMN wy_voter_id TEXT;

-- Index for looking up users by their voter ID
CREATE INDEX IF NOT EXISTS idx_user_verification_wy_voter_id ON user_verification(wy_voter_id);
