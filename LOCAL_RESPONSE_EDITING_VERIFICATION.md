# Local Verification Checklist: Response Editing Flow

Test "one response per user per survey version" with edit tracking.

---

## Prerequisites

- [ ] Migration 0009 applied to local D1 (see `D1_MIGRATION_0009_RUNBOOK.md`)
- [ ] Wrangler and Node.js installed
- [ ] Browser ready for testing

---

## Setup

### Start Dev Server

```bash
cd /home/anchor/projects/grassmvt_survey
npm run dev
```

Wait for output:
```
✅ Server running at http://localhost:8787
```

Keep terminal open. Note the process ID for later verification.

---

## Test Flow

### Step 1: Create Test User Account

**UI Steps:**
1. Open http://localhost:8787 in browser
2. Click "Sign Up" button
3. Enter test credentials:
   - Email: `test_response_edit@example.com`
   - Password: `TestPass123!`
   - Confirm: `TestPass123!`
4. Complete Turnstile (should auto-bypass in local)
5. Click "Sign Up"
6. Verify redirected to `/` (surveys list)

**Expected:**
- [ ] Account created successfully
- [ ] User authenticated and session set
- [ ] Redirected to surveys page

---

### Step 2: Start Survey Submission

**UI Steps:**
1. From surveys list, click on any survey (or "security" survey if available)
2. Complete all survey questions:
   - Page 1: Select ratings, check concerns, etc.
   - Page 2: Select verification options
   - Page 3: Enter open feedback text
3. Click "Submit"
4. Verify "Thank you" message or redirect to surveys list

**Expected:**
- [ ] Survey submits without error
- [ ] Page redirects to surveys list or thank you page
- [ ] No console errors

**Optional DB Verification (after submission):**

```bash
# Check response was created with initial values
wrangler d1 execute wy_local --command "
SELECT id, user_id, survey_version_id, status, edit_count, submitted_at, updated_at 
FROM responses 
WHERE user_id = (SELECT id FROM users WHERE email = 'test_response_edit@example.com')
ORDER BY id DESC LIMIT 1;
" --config wrangler.jsonc
```

Expected output:
```
┌────┬─────────┬─────────────────────┬──────────┬────────────┬────────────────────┬────────────────────┐
│ id │ user_id │ survey_version_id   │ status   │ edit_count │ submitted_at       │ updated_at         │
├────┼─────────┼─────────────────────┼──────────┼────────────┼────────────────────┼────────────────────┤
│ 1  │ 2       │ 1                   │ submitted│ 0          │ 2026-01-28 20:15:... │ 2026-01-28 20:15:... │
└────┴─────────┴─────────────────────┴──────────┴────────────┴────────────────────┴────────────────────┘
```

Key observations:
- [ ] `status` = "submitted"
- [ ] `edit_count` = 0
- [ ] `submitted_at` and `updated_at` set to current time

---

### Step 3: Verify "Completed" in Surveys List

**UI Steps:**
1. Return to or stay on surveys list (`/surveys`)
2. Look for the survey you just submitted
3. Find its status badge or indicator

**Expected:**
- [ ] Survey shows "Completed" or checkmark status
- [ ] Survey row is visually distinguished from unstarted surveys

**Optional DB Verification:**

```bash
# Check response status in database
wrangler d1 execute wy_local --command "
SELECT 
  s.slug,
  r.status,
  r.edit_count,
  COUNT(ra.id) as answer_count
FROM responses r
JOIN survey_versions sv ON r.survey_version_id = sv.id
JOIN surveys s ON sv.survey_id = s.id
LEFT JOIN response_answers ra ON r.id = ra.response_id
WHERE r.user_id = (SELECT id FROM users WHERE email = 'test_response_edit@example.com')
GROUP BY r.id
ORDER BY r.id DESC LIMIT 1;
" --config wrangler.jsonc
```

Expected:
- [ ] `status` = "submitted"
- [ ] `edit_count` = 0
- [ ] `answer_count` > 0 (number of answers submitted)

---

### Step 4: Reopen Survey for Editing

**UI Steps:**
1. Click on the survey again (from completed status)
2. Survey form should pre-populate with your previous answers
3. Verify you can see all your previous responses

**Expected:**
- [ ] Survey form loads
- [ ] All previous answers are pre-filled
- [ ] Button changes from "Submit" to "Resubmit" or "Save Changes" (if implemented)

---

### Step 5: Edit Response

**UI Steps:**
1. Change at least one answer:
   - Modify a rating scale answer
   - Change a checkbox selection
   - Edit the open feedback text
2. Do NOT submit yet

**Expected:**
- [ ] Form accepts edits without error
- [ ] Changed values are visible in the form

---

### Step 6: Resubmit Survey

**UI Steps:**
1. Click "Resubmit" or "Submit" button again
2. Verify success message or redirect

**Expected:**
- [ ] No error on resubmit
- [ ] Redirected back to surveys list
- [ ] Page indicates response was updated (if UI shows "Updated" status)

**Optional DB Verification (after resubmit):**

```bash
# Check that edit_count incremented, status changed, updated_at refreshed
wrangler d1 execute wy_local --command "
SELECT id, user_id, survey_version_id, status, edit_count, submitted_at, updated_at 
FROM responses 
WHERE user_id = (SELECT id FROM users WHERE email = 'test_response_edit@example.com')
ORDER BY id DESC LIMIT 1;
" --config wrangler.jsonc
```

Expected changes:
- [ ] `status` = "submitted" (or "updated" if implemented)
- [ ] `edit_count` = 1 (incremented from 0)
- [ ] `submitted_at` = unchanged (original submission time)
- [ ] `updated_at` = new timestamp (should be ~seconds ago)

---

### Step 7: Verify "Edited" Status in Surveys List

**UI Steps:**
1. Return to surveys list
2. Find the survey row you just re-edited
3. Check for status indicator change

**Expected:**
- [ ] Survey shows "Edited" or updated status badge (if implemented)
- [ ] UI indicates response was modified after initial submission
- [ ] Timestamp shows recent update time

---

## Database Verification Queries

### Query 1: Verify Only One Response Per User Per Survey Version

```bash
wrangler d1 execute wy_local --command "
SELECT 
  s.slug,
  COUNT(r.id) as response_count,
  GROUP_CONCAT(r.id) as response_ids
FROM responses r
JOIN survey_versions sv ON r.survey_version_id = sv.id
JOIN surveys s ON sv.survey_id = s.id
WHERE r.user_id = (SELECT id FROM users WHERE email = 'test_response_edit@example.com')
GROUP BY sv.id
HAVING COUNT(r.id) > 1;
" --config wrangler.jsonc
```

**Expected Result:**
```
(no rows returned)
```

This confirms only one response exists per survey version.

---

### Query 2: Verify response_answers Replaced on Edit

```bash
wrangler d1 execute wy_local --command "
SELECT 
  r.id as response_id,
  r.status,
  r.edit_count,
  COUNT(ra.id) as current_answer_count,
  MAX(ra.created_at) as latest_answer_time
FROM responses r
LEFT JOIN response_answers ra ON r.id = ra.response_id
WHERE r.user_id = (SELECT id FROM users WHERE email = 'test_response_edit@example.com')
GROUP BY r.id
ORDER BY r.id DESC LIMIT 1;
" --config wrangler.jsonc
```

**Expected:**
- [ ] `current_answer_count` matches the number of questions in survey
- [ ] `latest_answer_time` is recent (after resubmit)
- [ ] All old answer rows should be gone (deleted before new insert)

---

### Query 3: Verify edit_count Increments

```bash
wrangler d1 execute wy_local --command "
SELECT 
  id,
  status,
  edit_count,
  submitted_at,
  updated_at,
  (julianday(updated_at) - julianday(submitted_at)) * 24 * 60 AS minutes_since_submit
FROM responses
WHERE user_id = (SELECT id FROM users WHERE email = 'test_response_edit@example.com')
ORDER BY id DESC LIMIT 1;
" --config wrangler.jsonc
```

**Expected:**
- [ ] `edit_count` = 1 (or higher if multiple edits)
- [ ] `submitted_at` < `updated_at` (update time is after initial submit)
- [ ] `minutes_since_submit` > 0 (time elapsed)

---

### Query 4: Verify Audit Events Logged

```bash
wrangler d1 execute wy_local --command "
SELECT 
  event_type,
  COUNT(*) as count,
  MAX(created_at) as latest,
  GROUP_CONCAT(metadata) as details
FROM audit_events
WHERE 
  user_id = (SELECT id FROM users WHERE email = 'test_response_edit@example.com')
  AND event_type IN ('response_created', 'response_submitted', 'response_updated')
GROUP BY event_type
ORDER BY latest DESC;
" --config wrangler.jsonc
```

**Expected Result:**
```
┌──────────────────┬───────┬──────────────────────┬──────────────────────────┐
│ event_type       │ count │ latest               │ details                  │
├──────────────────┼───────┼──────────────────────┼──────────────────────────┤
│ response_updated │ 1     │ 2026-01-28 20:16:... │ {"survey_id":8,...}      │
│ response_created │ 1     │ 2026-01-28 20:15:... │ {"survey_id":8,...}      │
└──────────────────┴───────┴──────────────────────┴──────────────────────────┘
```

**Verify:**
- [ ] `response_created` event exists (initial submission)
- [ ] `response_updated` event exists (edit resubmit)
- [ ] Both events reference same user
- [ ] Timestamps match response timestamps

**Optional - Check full metadata:**

```bash
wrangler d1 execute wy_local --command "
SELECT 
  event_type,
  user_id,
  metadata,
  created_at
FROM audit_events
WHERE 
  user_id = (SELECT id FROM users WHERE email = 'test_response_edit@example.com')
  AND event_type IN ('response_created', 'response_submitted', 'response_updated')
ORDER BY created_at ASC;
" --config wrangler.jsonc
```

---

### Query 5: Verify Uniqueness Constraint Works

Try to submit a conflicting response (should fail if constraint is properly enforced):

```bash
wrangler d1 execute wy_local --command "
-- This should fail with UNIQUE constraint error if flow is correct
INSERT INTO responses (user_id, survey_version_id, status, submitted_at, updated_at, edit_count)
SELECT 
  (SELECT id FROM users WHERE email = 'test_response_edit@example.com'),
  1,  -- Same survey version
  'submitted',
  datetime('now'),
  datetime('now'),
  0
WHERE NOT EXISTS (
  SELECT 1 FROM responses 
  WHERE user_id = (SELECT id FROM users WHERE email = 'test_response_edit@example.com')
  AND survey_version_id = 1
);
" --config wrangler.jsonc
```

**Expected Result:**
```
✘ [ERROR] UNIQUE constraint failed: responses.user_id, responses.survey_version_id, responses.survey_version_id
```

This confirms the unique index prevents duplicate submissions.

---

## Summary Checklist

Use this to track completion:

- [ ] Dev server started successfully
- [ ] Test user created (sign up successful)
- [ ] Survey submitted without error
- [ ] "Completed" status visible in surveys list
- [ ] Survey reopened with pre-filled answers
- [ ] Answers edited successfully
- [ ] Resubmit successful
- [ ] "Edited" or updated status shown
- [ ] Only one response row in database
- [ ] response_answers replaced (old answers gone, new ones present)
- [ ] edit_count incremented to 1
- [ ] submitted_at unchanged, updated_at updated
- [ ] Audit events logged: response_created, response_updated
- [ ] Unique constraint prevents duplicate submissions

---

## Troubleshooting

### Response shows as "submitted" but not "Edited"

Check if UI distinguishes edit status:
- May require frontend code to show "Edited" badge
- API might return `updated_at > submitted_at` to indicate edit
- Consider implementing if not present

### Multiple response rows for same user/survey

Run Query 1 above and check for duplicates. If found:
- Verify unique index exists (see `D1_MIGRATION_0009_RUNBOOK.md`)
- Check if old responses exist before migration
- Consider data cleanup if needed

### edit_count not incrementing

Check application code:
```bash
grep -r "edit_count" src/ --include="*.js"
```

Verify that edit endpoint increments before UPDATE:
- Should be: `SET edit_count = edit_count + 1`
- Check if UPDATE statement is actually executing

### Audit events missing

Verify audit logging is called:
```bash
grep -r "response_updated\|response_created" src/ --include="*.js"
```

Ensure event is logged after database transaction commits.

### Wrangler command errors

If seeing "syntax error" or "SQLITE_ERROR":
- Avoid reserved keywords (like `unique` without backticks)
- Escape quotes in JSON strings
- Use `--file` for multi-line SQL instead of `--command`

---

## Next Steps

After verification passes:

1. Test with multiple surveys and users
2. Test edit conflict scenarios (simultaneous edits)
3. Test with different verification tiers
4. Load test: many users submitting/editing simultaneously
5. Verify response data exports include edit metadata
6. Update user-facing UI to show "Edited" status if not present

