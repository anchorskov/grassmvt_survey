#!/usr/bin/env bash
# Verify local SurveyJS flow for wy-household-economic-outlook on localhost.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
SLUG="wy-household-economic-outlook"
PASS_COUNT=0
FAIL_COUNT=0

pass() {
  echo "PASS: $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

echo "Local survey flow test"
echo "BASE_URL: $BASE_URL"
echo "SLUG: $SLUG"
echo

if ! curl -sS -m 5 "$BASE_URL/" >/dev/null 2>&1; then
  echo "Server is not reachable at $BASE_URL."
  echo "Start it first with: npm run dev:worker"
  exit 1
fi

api_resp="$(curl -sS -m 10 "$BASE_URL/api/surveys/$SLUG" || true)"
if [ -z "$api_resp" ]; then
  fail "GET /api/surveys/$SLUG returned empty response"
else
  if printf '%s' "$api_resp" | node -e "
let body = '';
process.stdin.on('data', (d) => body += d);
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(body);
    if (!j.versionId || !j.versionHash || !j.surveyJson || !j.surveyJson.title) {
      process.exit(2);
    }
    if (j.surveyJson.title !== 'Wyoming Household Economic Outlook') {
      process.exit(3);
    }
    process.exit(0);
  } catch {
    process.exit(4);
  }
});
"; then
    pass "GET /api/surveys/$SLUG returns published SurveyJS payload"
  else
    fail "GET /api/surveys/$SLUG payload is invalid or wrong title"
  fi
fi

html_resp="$(curl -sS -m 10 "$BASE_URL/surveys/$SLUG" || true)"
if [ -z "$html_resp" ]; then
  fail "GET /surveys/$SLUG returned empty response"
else
  if printf '%s' "$html_resp" | grep -q "id=\"surveyjs-root\""; then
    pass "Survey page includes surveyjs-root"
  else
    fail "Survey page is missing surveyjs-root"
  fi

  if printf '%s' "$html_resp" | grep -q "data-slug=\"$SLUG\""; then
    pass "Survey page includes correct data-slug"
  else
    fail "Survey page missing expected data-slug"
  fi

  if printf '%s' "$html_resp" | grep -q "surveyjs-bundle.js"; then
    pass "Survey page includes surveyjs-bundle.js"
  else
    fail "Survey page missing surveyjs-bundle.js include"
  fi
fi

catalog_resp="$(curl -sS -m 10 "$BASE_URL/data/surveys.json" || true)"
if [ -z "$catalog_resp" ]; then
  fail "GET /data/surveys.json returned empty response"
else
  if printf '%s' "$catalog_resp" | node -e "
let body = '';
process.stdin.on('data', (d) => body += d);
process.stdin.on('end', () => {
  try {
    const arr = JSON.parse(body);
    const row = Array.isArray(arr) ? arr.find((x) => x && x.id === 'wy-household-economic-outlook') : null;
    if (!row) process.exit(2);
    if (row.status !== 'active') process.exit(3);
    if (row.href !== '/surveys/wy-household-economic-outlook') process.exit(4);
    process.exit(0);
  } catch {
    process.exit(5);
  }
});
"; then
    pass "Survey catalog contains active wy-household-economic-outlook entry"
  else
    fail "Survey catalog missing or mismatching wy-household-economic-outlook entry"
  fi
fi

echo
echo "Results: $PASS_COUNT passed, $FAIL_COUNT failed"
if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
