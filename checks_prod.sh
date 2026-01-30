#!/bin/bash
# ./checks_prod.sh
# Production diagnostics script - runs wrangler and curl checks, writes to checks_findings.txt
# Purpose: Capture worker, D1, auth endpoint, and migration state for debugging
# Note: All D1 commands use --remote to target production database, not local

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="$REPO_ROOT/checks_findings.txt"
TEMP_BODY="/tmp/checks_auth_me_body_$$.txt"

trap "rm -f '$TEMP_BODY'" EXIT

# Initialize output file with header (overwrite any existing file)
{
  echo "==============================================================================="
  echo "PRODUCTION DIAGNOSTICS CHECK"
  echo "==============================================================================="
  echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "Hostname: $(hostname)"
  echo "Repo Root: $REPO_ROOT"
  echo ""
  echo "⚠️  IMPORTANT: All D1 checks use --remote flag"
  echo "This means we are querying the PRODUCTION database in Cloudflare, not local."
  echo ""
  
  # Git info
  if command -v git &> /dev/null; then
    echo "Git Status:"
    git -C "$REPO_ROOT" branch --show-current 2>/dev/null | sed 's/^/  Branch: /'
    git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null | sed 's/^/  Latest commit: /'
    echo ""
  fi
  
  echo "==============================================================================="
  echo "A) WORKER IDENTITY"
  echo "==============================================================================="
  echo ""
  echo "Command: wrangler --version"
  wrangler --version 2>&1 || echo "ERROR: wrangler not found"
  echo ""
  
  echo "Command: wrangler whoami --config ./wrangler.jsonc"
  wrangler whoami --config "$REPO_ROOT/wrangler.jsonc" 2>&1 || echo "ERROR: whoami failed"
  echo ""
  
  echo "==============================================================================="
  echo "B) WORKER DEPLOYMENT STATUS"
  echo "==============================================================================="
  echo ""
  
  echo "Command: wrangler deployments list --config ./wrangler.jsonc --env production --name grassmvtsurvey"
  if wrangler deployments list --config "$REPO_ROOT/wrangler.jsonc" --env production --name grassmvtsurvey 2>&1; then
    echo "✓ Deployment list succeeded"
  else
    echo "✗ Deployment list command failed (check wrangler configuration)"
  fi
  echo ""
  
  echo "==============================================================================="
  echo "C) PRODUCTION AUTH ENDPOINT HEALTH"
  echo "==============================================================================="
  echo ""
  
  echo "Command: curl -sS -D - https://grassrootsmvt.org/api/auth/me -o /tmp/auth_me_body.txt"
  echo ""
  
  # Run curl and capture headers and status
  HTTP_CODE=$(curl -sS -D - -o "$TEMP_BODY" -w "%{http_code}" https://grassrootsmvt.org/api/auth/me 2>&1 | tail -1 || echo "000")
  
  # Extract headers (lines before blank line)
  echo "Response Headers:"
  sed -n '1,/^[[:space:]]*$/p' "$TEMP_BODY" 2>/dev/null | head -20 || echo "(Could not extract headers)"
  echo ""
  
  echo "HTTP Status: $HTTP_CODE"
  echo ""
  
  echo "Response Body (first 100 lines):"
  head -100 "$TEMP_BODY" 2>/dev/null || echo "(No body captured)"
  echo ""
  
  echo "==============================================================================="
  echo "D) D1 SCHEMA VERIFICATION (Production Database - using --remote)"
  echo "==============================================================================="
  echo ""
  
  echo "Command: wrangler d1 execute wy --remote --env production --command \"PRAGMA table_info(session);\""
  wrangler d1 execute wy --remote --env production --command "PRAGMA table_info(session);" 2>&1 || echo "ERROR: session table info failed"
  echo ""
  
  echo "Command: wrangler d1 execute wy --remote --env production --command \"PRAGMA table_info(user);\""
  wrangler d1 execute wy --remote --env production --command "PRAGMA table_info(user);" 2>&1 || echo "ERROR: user table info failed"
  echo ""
  
  echo "Command: SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('session','user');"
  wrangler d1 execute wy --remote --env production --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('session','user');" 2>&1 || echo "ERROR: table schema query failed"
  echo ""
  
  echo "==============================================================================="
  echo "E) MIGRATION STATE (Production Database - using --remote)"
  echo "==============================================================================="
  echo ""
  
  echo "Command: wrangler d1 migrations list wy --remote --env production"
  wrangler d1 migrations list wy --remote --env production 2>&1 || echo "ERROR: migrations list failed"
  echo ""
  
  echo "Local migrations directory:"
  if [ -d "$REPO_ROOT/db/migrations" ]; then
    echo "  Found: db/migrations"
    ls -la "$REPO_ROOT/db/migrations" | head -20
  else
    echo "  Not found: db/migrations"
  fi
  echo ""
  
  if [ -d "$REPO_ROOT/migrations" ]; then
    echo "  Found: migrations"
    ls -la "$REPO_ROOT/migrations" | head -20
  else
    echo "  Not found: migrations"
  fi
  echo ""
  
  echo "==============================================================================="
  echo "END OF DIAGNOSTICS"
  echo "==============================================================================="
  echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  
} > "$OUTPUT_FILE"

# Clean up temp file
rm -f "$TEMP_BODY"

# Report success
echo ""
echo "✅ Production checks completed."
echo "📄 Results written to: $OUTPUT_FILE"
echo ""
echo "To view results:"
echo "  cat $OUTPUT_FILE"
echo "  or"
echo "  sed -n '1,200p' $OUTPUT_FILE"
