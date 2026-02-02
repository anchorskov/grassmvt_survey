-- Migration 0019: Add legislators table and district voter counts
-- Purpose: Store Wyoming state legislators and voter registration counts by district

-- Table: legislators
-- Stores current elected representatives for Wyoming state house/senate districts
CREATE TABLE IF NOT EXISTS legislators (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'WY',
  chamber TEXT NOT NULL,  -- 'house' or 'senate'
  district_number INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  party TEXT,  -- 'Republican', 'Democrat', 'Independent', etc.
  phone TEXT,
  email TEXT,
  website TEXT,
  office_address TEXT,
  capitol_office TEXT,
  district_office TEXT,
  photo_url TEXT,
  biography TEXT,
  term_start TEXT,  -- ISO8601 date
  term_end TEXT,    -- ISO8601 date
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_legislators_chamber_district ON legislators(chamber, district_number);
CREATE INDEX idx_legislators_state_chamber ON legislators(state, chamber);

-- Table: district_voter_counts
-- Aggregated voter registration counts per district from voter file
-- Refreshed periodically from voters_addr_norm via background job
CREATE TABLE IF NOT EXISTS district_voter_counts (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'WY',
  chamber TEXT NOT NULL,  -- 'house' or 'senate'
  district_number INTEGER NOT NULL,
  voter_count INTEGER NOT NULL DEFAULT 0,
  last_refreshed TEXT NOT NULL,  -- ISO8601 timestamp of last count refresh
  source TEXT DEFAULT 'voters_addr_norm',  -- where the data came from
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_district_voter_counts_unique ON district_voter_counts(state, chamber, district_number);
CREATE INDEX idx_district_voter_counts_state ON district_voter_counts(state);
