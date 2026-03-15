-- db/migrations/0028_link_townhall_topics_to_surveys.sql
-- Migration: 0028_link_townhall_topics_to_surveys.sql
-- Purpose: Add an explicit survey_id link for Town Hall topics and backfill it from survey_slug

ALTER TABLE townhall_topics ADD COLUMN survey_id INTEGER REFERENCES surveys(id);

UPDATE townhall_topics
SET survey_id = (
  SELECT s.id
  FROM surveys s
  WHERE s.slug = townhall_topics.survey_slug
)
WHERE survey_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_townhall_topics_survey_id_unique
  ON townhall_topics (survey_id)
  WHERE survey_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_townhall_topics_survey_id
  ON townhall_topics (survey_id);
