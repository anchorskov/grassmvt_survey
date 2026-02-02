-- Migration 0017: Add unique constraint on wy_voter_id
-- Prevents same Wyoming voter from registering multiple accounts

-- Create unique index on wy_voter_id (allowing NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_verification_wy_voter_id_unique 
  ON user_verification(wy_voter_id) WHERE wy_voter_id IS NOT NULL;
