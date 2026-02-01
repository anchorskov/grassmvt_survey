-- db/migrations/0015_add_district_to_user_address_verification.sql
-- Migration: 0015_add_district_to_user_address_verification.sql
-- Purpose: Add district column for user_address_verification (US House / at-large)

ALTER TABLE user_address_verification ADD COLUMN district TEXT;

CREATE INDEX IF NOT EXISTS idx_user_address_verification_district ON user_address_verification (district);
