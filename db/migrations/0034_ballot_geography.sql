-- Migration 0034: Add ballot geography fields to user_address_verification
-- Captures county, city, and precinct from Candidates ballot-lookup API
-- during address verification so ballot surveys can be scoped correctly.

ALTER TABLE user_address_verification ADD COLUMN county TEXT;
ALTER TABLE user_address_verification ADD COLUMN city TEXT;
ALTER TABLE user_address_verification ADD COLUMN precinct TEXT;

CREATE INDEX IF NOT EXISTS idx_user_addr_verify_county ON user_address_verification(county);
