#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8787}"

check_redirect() {
  local provider="$1"
  local headers
  headers="$(curl -s -D - -o /dev/null "${BASE_URL}/api/auth/oauth/${provider}/start")"
  if ! echo "${headers}" | grep -q "^HTTP/.* 302"; then
    echo "[FAIL] ${provider}: expected 302 redirect"
    exit 1
  fi
  if ! echo "${headers}" | grep -q "^Location:"; then
    echo "[FAIL] ${provider}: missing Location header"
    exit 1
  fi
  echo "[OK] ${provider}: redirect present"
}

check_redirect "google"
