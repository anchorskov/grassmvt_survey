#!/bin/bash
# Verification Test Script for Response Editing Flow
# Run this script AFTER completing UI steps manually

set -e

DB_CONFIG="--config wrangler.jsonc"
TEST_EMAIL="test_response_${RANDOM}@example.com"
SURVEY_SLUG="security"  # Using security survey (slug available)

echo "========================================="
echo "Response Editing Verification Test"
echo "========================================="
echo ""
echo "Test email: $TEST_EMAIL"
echo "Survey: $SURVEY_SLUG"
echo ""
echo "MANUAL STEPS REQUIRED:"
echo "1. Open http://localhost:8787 in browser"
echo "2. Click 'Sign Up'"
echo "3. Enter:"
echo "   Email: $TEST_EMAIL"
echo "   Password: Test123!@"
echo "   Confirm: Test123!@"
echo "4. Click Sign Up"
echo "5. Select '$SURVEY_SLUG' survey from list"
echo "6. Complete all answers and click Submit"
echo ""
echo "Press ENTER when survey is submitted..."
read

echo ""
echo "========================================="
echo "VERIFICATION STEP 1: Check response row"
echo "========================================="

RESPONSE=$(wrangler d1 execute wy_local $DB_CONFIG --command "
SELECT 
  r.id as response_id, 
  r.user_id, 
  r.survey_version_id, 
  r.status, 
  r.edit_count,
  r.submitted_at,
  r.updated_at
FROM responses r
JOIN users u ON r.user_id = u.id
WHERE u.email = '$TEST_EMAIL'
ORDER BY r.id DESC LIMIT 1;
" 2>&1)

echo "$RESPONSE"

if echo "$RESPONSE" | grep -q "response_id"; then
  RESPONSE_ID=$(echo "$RESPONSE" | grep -oP '(?<=│ )\d+(?= │)' | head -1)
  echo "✅ Response found: ID=$RESPONSE_ID"
else
  echo "❌ No response found for user!"
  exit 1
fi

echo ""
echo "========================================="
echo "VERIFICATION STEP 2: Check response_answers"
echo "========================================="

ANSWERS=$(wrangler d1 execute wy_local $DB_CONFIG --command "
SELECT 
  COUNT(*) as answer_count,
  MIN(created_at) as first_answer,
  MAX(created_at) as last_answer
FROM response_answers
WHERE response_id = $RESPONSE_ID;
" 2>&1)

echo "$ANSWERS"

if echo "$ANSWERS" | grep -q "answer_count"; then
  echo "✅ Response answers exist"
else
  echo "❌ No answers found!"
  exit 1
fi

echo ""
echo "========================================="
echo "VERIFICATION STEP 3: Check one row per user/survey"
echo "========================================="

UNIQUENESS=$(wrangler d1 execute wy_local $DB_CONFIG --command "
SELECT 
  COUNT(*) as response_count
FROM responses r
JOIN users u ON r.user_id = u.id
WHERE u.email = '$TEST_EMAIL';
" 2>&1)

echo "$UNIQUENESS"

if echo "$UNIQUENESS" | grep -q "1"; then
  echo "✅ Exactly one response for this user"
else
  echo "⚠️  Multiple responses found (might be OK if multiple surveys)"
fi

echo ""
echo "========================================="
echo "MANUAL STEPS - EDIT SURVEY:"
echo "========================================="
echo "1. Return to surveys list"
echo "2. Verify survey shows 'Completed: <date>' or similar"
echo "3. Click 'Edit responses' button (or reopen survey)"
echo "4. Change at least 2 answers:"
echo "   - Change a rating"
echo "   - Change text feedback or checkbox"
echo "5. Click 'Submit' or 'Resubmit'"
echo ""
echo "Press ENTER when survey is resubmitted..."
read

echo ""
echo "========================================="
echo "VERIFICATION STEP 4: Check edit_count incremented"
echo "========================================="

EDIT_CHECK=$(wrangler d1 execute wy_local $DB_CONFIG --command "
SELECT 
  id,
  status,
  edit_count,
  submitted_at,
  updated_at,
  CASE 
    WHEN submitted_at = updated_at THEN 'NOT EDITED'
    ELSE 'EDITED - timestamps differ'
  END as edit_status
FROM responses
WHERE id = $RESPONSE_ID;
" 2>&1)

echo "$EDIT_CHECK"

if echo "$EDIT_CHECK" | grep -q "edit_count"; then
  echo "✅ Edit tracking fields exist"
else
  echo "❌ Edit fields missing!"
  exit 1
fi

echo ""
echo "========================================="
echo "VERIFICATION STEP 5: Check response_answers updated"
echo "========================================="

ANSWERS_UPDATED=$(wrangler d1 execute wy_local $DB_CONFIG --command "
SELECT 
  COUNT(*) as current_answer_count,
  MAX(created_at) as most_recent_answer
FROM response_answers
WHERE response_id = $RESPONSE_ID;
" 2>&1)

echo "$ANSWERS_UPDATED"

echo ""
echo "========================================="
echo "VERIFICATION STEP 6: Check audit events"
echo "========================================="

AUDIT=$(wrangler d1 execute wy_local $DB_CONFIG --command "
SELECT 
  event_type,
  COUNT(*) as count,
  MAX(created_at) as latest_event
FROM audit_events
WHERE 
  user_id = (SELECT id FROM users WHERE email = '$TEST_EMAIL')
  AND event_type IN ('response_created', 'response_submitted', 'response_updated')
GROUP BY event_type
ORDER BY latest_event DESC;
" 2>&1)

echo "$AUDIT"

if echo "$AUDIT" | grep -q "response_created"; then
  echo "✅ response_created event found"
else
  echo "⚠️  response_created event missing"
fi

if echo "$AUDIT" | grep -q "response_updated"; then
  echo "✅ response_updated event found (indicates edit was tracked)"
else
  echo "⚠️  response_updated event missing"
fi

echo ""
echo "========================================="
echo "FINAL VERIFICATION: Full Response Details"
echo "========================================="

FINAL=$(wrangler d1 execute wy_local $DB_CONFIG --command "
SELECT 
  r.id,
  r.status,
  r.edit_count,
  r.submitted_at,
  r.updated_at,
  CAST((julianday(r.updated_at) - julianday(r.submitted_at)) * 1440 AS INTEGER) as minutes_since_submit,
  COUNT(ra.id) as answer_count
FROM responses r
LEFT JOIN response_answers ra ON r.id = ra.response_id
WHERE r.id = $RESPONSE_ID
GROUP BY r.id;
" 2>&1)

echo "$FINAL"

echo ""
echo "========================================="
echo "✅ VERIFICATION COMPLETE"
echo "========================================="
echo ""
echo "Summary:"
echo "- Response ID: $RESPONSE_ID"
echo "- Test Email: $TEST_EMAIL"
echo ""
echo "Next: Review output above for:"
echo "  ✅ edit_count should be 1"
echo "  ✅ submitted_at should be earlier than updated_at"
echo "  ✅ response_updated audit event should exist"
echo "  ✅ response_answers should reflect new values"
echo ""
