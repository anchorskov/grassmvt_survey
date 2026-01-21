#!/bin/bash

# test-nav-footer.sh - Test header and footer includes across routes

PORT=8788
BASE_URL="http://localhost:$PORT"
SERVER_PID=""
STARTED_SERVER=false
PASS_COUNT=0
FAIL_COUNT=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
  if [ "$STARTED_SERVER" = true ] && [ -n "$SERVER_PID" ]; then
    echo ""
    echo "🛑 Stopping dev server (PID: $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

# Check if server is already running
echo "🔍 Checking if dev server is running on $BASE_URL..."
if curl -s "$BASE_URL/" > /dev/null 2>&1; then
  echo "✅ Dev server already running"
else
  echo "🚀 Starting npm run dev..."
  if npm run dev > /tmp/npm-dev.log 2>&1 &
  then
    SERVER_PID=$!
    STARTED_SERVER=true
    echo "   PID: $SERVER_PID"
    # Wait for server to be ready
    echo "⏳ Waiting for server to be ready..."
    for i in {1..30}; do
      if curl -s "$BASE_URL/" > /dev/null 2>&1; then
        echo "✅ Server ready"
        break
      fi
      if [ $i -eq 30 ]; then
        echo "❌ Server failed to start"
        echo "Log output:"
        tail -20 /tmp/npm-dev.log
        exit 1
      fi
      sleep 1
    done
  else
    echo "❌ Failed to start npm run dev"
    exit 1
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Testing header and footer includes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test routes
ROUTES=("/" "/surveys/" "/surveys/list/" "/donate/" "/security/" "/credits/")

test_route() {
  local route=$1
  local url="$BASE_URL$route"
  
  echo -n "Testing $route... "
  
  # Fetch the page with retries
  local response=""
  for attempt in {1..3}; do
    response=$(curl -s -m 5 "$url" 2>/dev/null)
    if [ -n "$response" ]; then
      break
    fi
    if [ $attempt -lt 3 ]; then
      sleep 1
    fi
  done
  
  # Check if we got an empty response
  if [ -z "$response" ]; then
    echo -e "${RED}FAIL${NC} (no response)"
    ((FAIL_COUNT++))
    return
  fi
  
  # Check for header include (either placeholder or injected content)
  has_header=false
  if echo "$response" | grep -q "data-include=\"/partials/header.html\"" || \
     echo "$response" | grep -q "<header" || \
     echo "$response" | grep -iq "navbar\|nav"; then
    has_header=true
  fi
  
  # Check for footer include (either placeholder or injected content)
  has_footer=false
  if echo "$response" | grep -q "data-include=\"/partials/footer.html\"" || \
     echo "$response" | grep -q "<footer" || \
     echo "$response" | grep -iq "copyright\|footer"; then
    has_footer=true
  fi
  
  # Optional route-specific checks
  has_grid=true
  if [ "$route" = "/surveys/list/" ]; then
    if echo "$response" | grep -q "id=\"survey-grid\""; then
      has_grid=true
    else
      has_grid=false
    fi
  fi

  # Determine pass/fail
  if [ "$has_header" = true ] && [ "$has_footer" = true ] && [ "$has_grid" = true ]; then
    echo -e "${GREEN}PASS${NC}"
    ((PASS_COUNT++))
  else
    echo -e "${RED}FAIL${NC}"
    if [ "$has_header" = false ]; then
      echo "  ❌ Header include not found"
    fi
    if [ "$has_footer" = false ]; then
      echo "  ❌ Footer include not found"
    fi
    if [ "$has_grid" = false ]; then
      echo "  ❌ Survey grid not found"
    fi
    ((FAIL_COUNT++))
  fi
}

# Run tests
for route in "${ROUTES[@]}"; do
  test_route "$route"
done

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -n "📊 Results: "
if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED ($PASS_COUNT/$((PASS_COUNT + FAIL_COUNT)))${NC}"
else
  echo -e "${RED}❌ TESTS FAILED ($FAIL_COUNT failed, $PASS_COUNT passed)${NC}"
  exit 1
fi
