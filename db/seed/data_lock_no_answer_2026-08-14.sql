-- db/seed/data_lock_no_answer_2026-08-14.sql
--
-- DO NOT RUN THIS BEFORE 2026-08-14. This is the Phase 3 "data lock" script.
--
-- What it does: for every active candidate x active question pair where no
-- *reviewed* answer exists, inserts an explicit 'no_answer' row so the
-- comparison view has a complete record. Safe to run more than once
-- (INSERT OR IGNORE + UNIQUE(wy_candidate_id, question_id) on guide_answers).
--
-- Context: POST /api/guide/submit-answer already stops accepting new
-- submissions on its own once the clock passes GUIDE_SUBMISSION_DEADLINE
-- (2026-08-14T23:59:59Z, see src/worker.js) -- returns 410 Gone. This script
-- is the separate, one-time backfill step that must be run manually after
-- that deadline passes; nothing runs it automatically.
--
-- Run against production:
--   cd /home/anchor/projects/grassmvt_survey
--   npx wrangler d1 execute wy --remote --file db/seed/data_lock_no_answer_2026-08-14.sql
--
-- Verify afterward:
--   SELECT COUNT(*) FROM guide_answers WHERE position = 'no_answer';
--   -- Spot check a candidate who never submitted anything has a full row set:
--   SELECT gq.id, ga.position FROM guide_questions gq
--   LEFT JOIN guide_answers ga ON ga.question_id = gq.id AND ga.wy_candidate_id = <id>
--   WHERE gq.active = 1;

INSERT OR IGNORE INTO guide_answers
  (wy_candidate_id, question_id, position, source_kind, reviewed, submitted_at, created_at, updated_at)
SELECT
  rc.wy_candidate_id,
  gq.id,
  'no_answer',
  'candidate_submission',
  1,
  datetime('now'),
  datetime('now'),
  datetime('now')
FROM race_candidates rc
CROSS JOIN guide_questions gq
WHERE rc.is_active = 1
  AND rc.wy_candidate_id IS NOT NULL
  AND gq.active = 1
  AND NOT EXISTS (
    SELECT 1 FROM guide_answers ga
    WHERE ga.wy_candidate_id = rc.wy_candidate_id
      AND ga.question_id = gq.id
      AND ga.reviewed = 1
  );
