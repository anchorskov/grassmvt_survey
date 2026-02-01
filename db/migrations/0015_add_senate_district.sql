-- Migration 0015: Add state senate and house district columns

-- Add state senate district to user_profile
ALTER TABLE user_profile ADD COLUMN state_senate_dist TEXT;

-- Add state senate district to user_address_verification
ALTER TABLE user_address_verification ADD COLUMN state_senate_dist TEXT;

-- Rename district to state_house_dist in user_address_verification
ALTER TABLE user_address_verification RENAME COLUMN district TO state_house_dist;

-- Add senate_district column to responses (for tracking senate district of response origin)
ALTER TABLE responses ADD COLUMN senate_district TEXT;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_user_addr_verify_senate_dist ON user_address_verification(state_senate_dist);
CREATE INDEX IF NOT EXISTS idx_user_profile_senate_dist ON user_profile(state_senate_dist);
CREATE INDEX IF NOT EXISTS idx_responses_senate_dist ON responses(senate_district);
