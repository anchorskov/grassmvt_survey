-- db/migrations/0022_survey_flow_meta.sql
-- Migration: 0022_survey_flow_meta.sql
-- Purpose: Add flow metadata for multi-part surveys

ALTER TABLE surveys ADD COLUMN flow_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE surveys ADD COLUMN flow_meta TEXT;
