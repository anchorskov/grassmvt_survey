#!/bin/bash

BASE="http://127.0.0.1:8787"
ORIGIN="http://127.0.0.1:8787"
EMAIL="test+fresh$(date +%s%N)@example.com"

echo "=== Test 1: First Signup (should succeed with 200) ==="
curl -s -i -H "content-type: application/json" -H "Origin: $ORIGIN" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"password123456\",\"turnstileToken\":\"\"}" \
  "$BASE/api/auth/signup"
echo ""
echo ""

echo "=== Test 2: Duplicate Signup (should return 409 EMAIL_EXISTS) ==="
curl -s -i -H "content-type: application/json" -H "Origin: $ORIGIN" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"differentpass1234\",\"turnstileToken\":\"\"}" \
  "$BASE/api/auth/signup"
echo ""
echo ""

echo "=== Test 3: Login with Wrong Password (should return 401 PASSWORD_INCORRECT) ==="
curl -s -i -H "content-type: application/json" -H "Origin: $ORIGIN" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrongpass1234\",\"turnstileToken\":\"\"}" \
  "$BASE/api/auth/login"
echo ""
echo ""

echo "=== Test 4: Login with Non-existent Email (should return 404 ACCOUNT_NOT_FOUND) ==="
curl -s -i -H "content-type: application/json" -H "Origin: $ORIGIN" \
  -d "{\"email\":\"test+nope@example.com\",\"password\":\"whatever123456\",\"turnstileToken\":\"\"}" \
  "$BASE/api/auth/login"
echo ""
