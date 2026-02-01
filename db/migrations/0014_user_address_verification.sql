-- db/migrations/0014_user_address_verification.sql
-- Migration: 0014_user_address_verification.sql
-- Purpose: Store address verification results for geolocation-based access control

CREATE TABLE IF NOT EXISTS user_address_verification (
  user_id TEXT NOT NULL PRIMARY KEY,
  state_fips TEXT,
  district TEXT,
  addr_lat REAL,
  addr_lng REAL,
  device_lat REAL,
  device_lng REAL,
  distance_m INTEGER,
  accuracy_m INTEGER,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Indexes for quick lookup
CREATE INDEX IF NOT EXISTS idx_user_address_verification_verified_at ON user_address_verification (verified_at);
CREATE INDEX IF NOT EXISTS idx_user_address_verification_updated_at ON user_address_verification (updated_at);
CREATE INDEX IF NOT EXISTS idx_user_address_verification_state_fips ON user_address_verification (state_fips);
CREATE INDEX IF NOT EXISTS idx_user_address_verification_district ON user_address_verification (district);
