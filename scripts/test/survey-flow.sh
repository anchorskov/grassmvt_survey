#!/bin/bash

# scripts/test/survey-flow.sh - Test survey flow endpoints with wrangler dev

PORT=8787
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
    echo "🛑 Stopping wrangler dev (PID: $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

# Check if wrangler dev is already running
echo "🔍 Checking if wrangler dev is running on $BASE_URL..."
if curl -s "$BASE_URL/" > /dev/null 2>&1; then
  echo "✅ Wrangler dev already running"
else
  echo "🚀 Starting npx wrangler dev..."
  if npx wrangler dev > /tmp/wrangler-dev.log 2>&1 &
  then
    SERVER_PID=$!
    STARTED_SERVER=true
    echo "   PID: $SERVER_PID"
    # Wait for server to be ready
    echo "⏳ Waiting for wrangler to be ready..."
    for i in {1..30}; do
      if curl -s "$BASE_URL/" > /dev/null 2>&1; then
        echo "✅ Wrangler ready"
        break
      fi
      if [ $i -eq 30 ]; then
        echo "❌ Wrangler failed to start"
        echo "Log output:"
        tail -30 /tmp/wrangler-dev.log
        exit 1
      fi
      sleep 1
    done
  else
    echo "❌ Failed to start wrangler dev"
    exit 1
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Testing survey flow endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test function for page includes
test_page_includes() {
  local route=$1
  local label=$2
  local url="$BASE_URL$route"
  
  echo -n "Testing $label... "
  
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
  
  # Determine pass/fail
  if [ "$has_header" = true ] && [ "$has_footer" = true ]; then
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
    ((FAIL_COUNT++))
  fi
}

# Test function for specific element
test_page_element() {
  local route=$1
  local label=$2
  local element_pattern=$3
  local url="$BASE_URL$route"
  
  echo -n "Testing $label... "
  
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
  
  # Check for element
  if echo "$response" | grep -q "$element_pattern"; then
    echo -e "${GREEN}PASS${NC}"
    ((PASS_COUNT++))
  else
    echo -e "${RED}FAIL${NC}"
    echo "  ❌ Expected element not found: $element_pattern"
    ((FAIL_COUNT++))
  fi
}

# Test function for API endpoint
test_api_endpoint() {
  local endpoint=$1
  local label=$2
  local method=$3
  local data=$4
  
  echo -n "Testing $label... "
  
  local response=""
  local http_code=""
  
  if [ "$method" = "POST" ]; then
    response=$(curl -s -X POST \
      -H "Content-Type: application/json" \
      -d "$data" \
      -w "\n%{http_code}" \
      "$BASE_URL$endpoint" 2>/dev/null)
  else
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint" 2>/dev/null)
  fi
  
  # Extract HTTP code (last line)
  http_code=$(echo "$response" | tail -1)
  # Get response body (all but last line)
  body=$(echo "$response" | head -n -1)
  
  if [ "$http_code" != "200" ]; then
    echo -e "${RED}FAIL${NC} (HTTP $http_code)"
    ((FAIL_COUNT++))
    return
  fi
  
  # Check if response is valid JSON
  if echo "$body" | grep -q "^{" && echo "$body" | grep -q "}$"; then
    # Check for expected fields
    if echo "$body" | grep -q "scope" && echo "$body" | grep -q "match_quality"; then
      echo -e "${GREEN}PASS${NC}"
      ((PASS_COUNT++))
    else
      echo -e "${RED}FAIL${NC}"
      echo "  ❌ Missing expected JSON fields (scope, match_quality)"
      ((FAIL_COUNT++))
    fi
  else
    echo -e "${RED}FAIL${NC}"
    echo "  ❌ Response is not valid JSON"
    ((FAIL_COUNT++))
  fi
}

# Test pages with includes
echo "📄 Page Include Tests:"
test_page_includes "/" "Home (/)"
test_page_includes "/surveys/" "Surveys (/surveys/)"
test_page_includes "/surveys/list/" "Survey List (/surveys/list/)"
test_page_includes "/security/" "Security (/security/)"
test_page_includes "/bias/" "Bias (/bias/)"
test_page_includes "/open-source/" "Open Source (/open-source/)"

echo ""
echo "🔍 Page Element Tests:"
test_page_element "/surveys/" "Surveys - Scope Form" "scope"
test_page_element "/surveys/list/" "Survey List - Grid" "survey-grid"

echo ""
echo "🔌 API Tests:"
test_api_endpoint "/api/scope" "API - POST /api/scope" "POST" '{"industry":"tech","size":"small"}'

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
