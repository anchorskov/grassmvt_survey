#!/bin/bash

# Complete Signup → Passkey Nudge Flow Test
# Tests: signup → verify session → check passkey list → redirect

BASE="http://127.0.0.1:8787"
ORIGIN="http://127.0.0.1:8787"

# Unique test email
EMAIL="test-$(date +%s)@example.com"
PASSWORD="SecurePass123456!"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   SIGNUP → PASSKEY NUDGE FLOW TEST                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Test Email:    $EMAIL"
echo "Test Password: $PASSWORD"
echo "Base URL:      $BASE"
echo ""

# ============================================================================
# STEP 1: SIGNUP
# ============================================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}[STEP 1] Create New Account${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "POST /api/auth/signup"
echo "  Body: { email, password, turnstileToken }"
echo ""

SIGNUP=$(curl -s -w "\n%{http_code}" \
  -H "content-type: application/json" \
  -H "Origin: $ORIGIN" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"turnstileToken\":\"\"}" \
  -c /tmp/test_cookies.txt \
  "$BASE/api/auth/signup")

HTTP_CODE=$(echo "$SIGNUP" | tail -1)
BODY=$(echo "$SIGNUP" | head -n -1)

echo "Status: $HTTP_CODE"
echo "Response: $BODY"
echo ""

if [ "$HTTP_CODE" == "200" ]; then
  echo -e "${GREEN}✓ Signup successful${NC}"
else
  echo -e "${RED}✗ Signup failed (expected 200, got $HTTP_CODE)${NC}"
  exit 1
fi
echo ""

# ============================================================================
# STEP 2: VERIFY SESSION
# ============================================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}[STEP 2] Verify Session Established${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "GET /api/auth/me"
echo ""

ME=$(curl -s \
  -H "content-type: application/json" \
  -H "Origin: $ORIGIN" \
  -b /tmp/test_cookies.txt \
  "$BASE/api/auth/me")

echo "Response: $ME"
echo ""

if echo "$ME" | grep -q '"authenticated":true'; then
  echo -e "${GREEN}✓ Session verified (authenticated: true)${NC}"
  AUTHENTICATED_EMAIL=$(echo "$ME" | grep -o '"email":"[^"]*' | cut -d'"' -f4)
  echo "  User: $AUTHENTICATED_EMAIL"
else
  echo -e "${RED}✗ Session not authenticated${NC}"
  exit 1
fi
echo ""

# ============================================================================
# STEP 3: FETCH PASSKEY LIST
# ============================================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}[STEP 3] Check Passkey List${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "GET /api/auth/passkey/list"
echo "  (This is what login modal calls to check if passkey nudge should show)"
echo ""

PASSKEYS=$(curl -s \
  -H "content-type: application/json" \
  -H "Origin: $ORIGIN" \
  -b /tmp/test_cookies.txt \
  "$BASE/api/auth/passkey/list")

echo "Response: $PASSKEYS"
echo ""

if echo "$PASSKEYS" | grep -q '"ok":true'; then
  PASSKEY_COUNT=$(echo "$PASSKEYS" | grep -o '\[' | wc -l)
  echo -e "${GREEN}✓ Passkey list retrieved${NC}"
  
  if echo "$PASSKEYS" | grep -q '\[\]'; then
    echo -e "${GREEN}✓ No passkeys registered (passkey nudge SHOULD show)${NC}"
  else
    echo -e "${YELLOW}⚠ User has passkeys (passkey nudge will NOT show)${NC}"
  fi
else
  echo -e "${RED}✗ Failed to fetch passkey list${NC}"
  exit 1
fi
echo ""

# ============================================================================
# STEP 4: SIMULATE LOGIN MODAL BEHAVIOR
# ============================================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}[STEP 4] Simulate Login Modal Opening${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "When login modal opens, these are the checks it makes:"
echo ""
echo "  1. Check if authenticated?"
echo -e "     → ${GREEN}YES${NC} (just signed up)"
echo ""
echo "  2. Check if auth-just-signed-up flag is set?"
echo -e "     → ${GREEN}YES${NC} (signup modal set this)"
echo ""
echo "  3. Fetch passkey list"
echo -e "     → ${GREEN}Done (see Step 3)${NC}"
echo ""
echo "  4. Does user have passkeys?"
if echo "$PASSKEYS" | grep -q '\[\]'; then
  echo -e "     → ${GREEN}NO${NC} → Show Passkey Nudge"
  SHOW_NUDGE="yes"
else
  echo -e "     → ${YELLOW}YES${NC} → Skip Passkey Nudge"
  SHOW_NUDGE="no"
fi
echo ""
echo ""

# ============================================================================
# STEP 5: DISPLAY FLOW SUMMARY
# ============================================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}[STEP 5] Expected User Experience${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "1. User fills signup form"
echo "2. User clicks 'Sign Up'"
echo "3. ✓ Account created"
echo "4. ✓ Session cookie set"
echo "5. ✓ Signup modal shows 'Account created. Signing you in.'"
echo "6. ✓ Signup modal closes automatically"
echo "7. ✓ Login modal opens"

if [ "$SHOW_NUDGE" == "yes" ]; then
  echo "8. ✓ Passkey nudge appears (no passkeys registered)"
  echo "   - User can click 'Register Passkey' to add one"
  echo "   - User can click 'Not Now' to skip"
  echo "9. ✓ Either action redirects to /surveys/list/"
else
  echo "8. ✓ Login modal shows logged-in state"
  echo "   (User already has passkeys, no nudge needed)"
  echo "9. ✓ Modal auto-closes, redirect to /surveys/list/"
fi

echo ""
echo ""

# ============================================================================
# STEP 6: CLEANUP & TEST RESULT
# ============================================================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}[SUMMARY] Test Complete${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}✓ Signup flow works correctly${NC}"
echo -e "${GREEN}✓ Session established after signup${NC}"
echo -e "${GREEN}✓ Passkey list fetched${NC}"

if [ "$SHOW_NUDGE" == "yes" ]; then
  echo -e "${GREEN}✓ Passkey nudge will show (no passkeys)${NC}"
else
  echo -e "${GREEN}✓ Passkey nudge will NOT show (has passkeys)${NC}"
fi

echo ""
echo "Test Account Created:"
echo "  Email:    $EMAIL"
echo "  Password: $PASSWORD"
echo ""
echo "Next Steps (Manual Browser Test):"
echo "  1. Go to: http://localhost:8787/"
echo "  2. Sign up with the email above"
echo "  3. Complete Turnstile"
echo "  4. Click 'Sign Up'"
echo "  5. Watch for:"
if [ "$SHOW_NUDGE" == "yes" ]; then
  echo "     - 'Account created. Signing you in.' message"
  echo "     - Signup modal closes"
  echo "     - Login modal opens with passkey nudge"
  echo "     - Click 'Not Now' to test skip flow"
else
  echo "     - 'Account created. Signing you in.' message"
  echo "     - Auto-redirect to /surveys/list/"
fi
echo ""
echo "To debug in browser console:"
echo "  window.AuthUI.state        // Current auth state"
echo "  window.AuthModals.registry // Open modals"
echo ""

rm -f /tmp/test_cookies.txt

echo -e "${BLUE}═════════════════════════════════════════════════════════${NC}"
echo ""
