#!/bin/bash

# Give server time to be ready
sleep 5

BASE=http://127.0.0.1:8787
ORIGIN=http://127.0.0.1:8787

echo "=== Test 1: Signup #1 ===" 
curl -s -i \
  -H "content-type: application/json" \
  -H "Origin: $ORIGIN" \
  -d '{"email":"test+dup@example.com","password":"password123456","turnstileToken":""}' \
  "$BASE/api/auth/signup"

echo ""
echo ""
echo "=== Test 2: Signup #2 (same email, different password) ===" 
curl -s -i \
  -H "content-type: application/json" \
  -H "Origin: $ORIGIN" \
  -d '{"email":"test+dup@example.com","password":"differentpass1234","turnstileToken":""}' \
  "$BASE/api/auth/signup"

echo ""
echo ""
echo "=== Test 3: Login wrong password ===" 
curl -s -i \
  -H "content-type: application/json" \
  -H "Origin: $ORIGIN" \
  -d '{"email":"test+dup@example.com","password":"wrongpass1234","turnstileToken":""}' \
  "$BASE/api/auth/login"

echo ""
echo ""
echo "=== Test 4: Login non-existent email ===" 
curl -s -i \
  -H "content-type: application/json" \
  -H "Origin: $ORIGIN" \
  -d '{"email":"test+nope@example.com","password":"whatever123456","turnstileToken":""}' \
  "$BASE/api/auth/login"
