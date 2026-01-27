#!/usr/bin/env bash
# scripts/test-auth.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
ORIGIN_HEADER="${ORIGIN_HEADER:-http://localhost:8787}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/grassmvt_auth.cookies}"
ENVIRONMENT="${ENVIRONMENT:-local}"
TURNSTILE_BYPASS="${TURNSTILE_BYPASS:-true}"

email="test+$(date +%s)@example.com"
password="testpassword123"

function note() {
  printf "\n== %s ==\n" "$1"
}

function assert_status() {
  local expected="$1"
  local actual="$2"
  if [ "$expected" != "$actual" ]; then
    echo "Expected status $expected, got $actual"
    exit 1
  fi
}

note "1) /api/auth/me unauthenticated"
status=$(curl -s -o /tmp/auth_me_anon.json -w "%{http_code}" "$BASE_URL/api/auth/me")
assert_status 200 "$status"
if ! rg -q '"authenticated"\s*:\s*false' /tmp/auth_me_anon.json; then
  echo "Expected authenticated false"
  cat /tmp/auth_me_anon.json
  exit 1
fi

token=""
if [ "$ENVIRONMENT" = "local" ] && [ "$TURNSTILE_BYPASS" = "true" ]; then
  token=""
fi

note "2) Signup creates session"
status=$(curl -s -o /tmp/auth_signup.json -w "%{http_code}" \
  -c "$COOKIE_JAR" \
  -H "content-type: application/json" \
  -H "Origin: $ORIGIN_HEADER" \
  -d "{\"email\":\"$email\",\"password\":\"$password\",\"turnstileToken\":\"$token\"}" \
  "$BASE_URL/api/auth/signup")
assert_status 200 "$status"
if ! rg -q '"ok"\s*:\s*true' /tmp/auth_signup.json; then
  echo "Expected ok true"
  cat /tmp/auth_signup.json
  exit 1
fi

note "3) /api/auth/me authenticated"
status=$(curl -s -o /tmp/auth_me.json -w "%{http_code}" \
  -b "$COOKIE_JAR" \
  "$BASE_URL/api/auth/me")
assert_status 200 "$status"
if ! rg -q '"authenticated"\s*:\s*true' /tmp/auth_me.json; then
  echo "Expected authenticated true"
  cat /tmp/auth_me.json
  exit 1
fi

note "4) Logout clears session"
status=$(curl -s -o /tmp/auth_logout.json -w "%{http_code}" \
  -b "$COOKIE_JAR" \
  -H "content-type: application/json" \
  -H "Origin: $ORIGIN_HEADER" \
  -d '{}' \
  "$BASE_URL/api/auth/logout")
assert_status 200 "$status"
if ! rg -q '"ok"\s*:\s*true' /tmp/auth_logout.json; then
  echo "Expected ok true"
  cat /tmp/auth_logout.json
  exit 1
fi

note "5) /api/auth/me unauthenticated after logout"
status=$(curl -s -o /tmp/auth_me_after.json -w "%{http_code}" \
  -b "$COOKIE_JAR" \
  "$BASE_URL/api/auth/me")
assert_status 200 "$status"
if ! rg -q '"authenticated"\s*:\s*false' /tmp/auth_me_after.json; then
  echo "Expected authenticated false"
  cat /tmp/auth_me_after.json
  exit 1
fi

note "All auth tests passed"
