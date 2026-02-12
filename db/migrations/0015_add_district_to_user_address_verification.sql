-- db/migrations/0015_add_district_to_user_address_verification.sql
-- Migration: 0015_add_district_to_user_address_verification.sql
-- Purpose: Historical migration marker for district support.
-- NOTE:
-- - The `district` column is already created in 0014_user_address_verification.sql.
-- - Keeping this migration as a no-op avoids duplicate-column failures on fresh/local runs.

CREATE INDEX IF NOT EXISTS idx_user_address_verification_district ON user_address_verification (district);
