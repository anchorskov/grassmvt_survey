-- db/migrations/0045_poll_invite_tokens_add_geo.sql
-- Adds county/city/precinct_code so the poll can resolve County, City, and
-- precinct-scoped races the same way the Candidates sub-project's own
-- ballot-lookup flow does (offices/candidates directly, not race_candidates,
-- for these three levels). Denormalized at mint time by skovgard2026-api
-- (which already resolves house/senate/party the same way) rather than
-- re-resolved here, keeping this repo's D1 access simple for /api/poll/races.

ALTER TABLE poll_invite_tokens ADD COLUMN county TEXT;
ALTER TABLE poll_invite_tokens ADD COLUMN city TEXT;
ALTER TABLE poll_invite_tokens ADD COLUMN precinct_code TEXT;
