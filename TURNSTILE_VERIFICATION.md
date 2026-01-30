# Turnstile JS Fixes Verification Checklist

## Test Environment
- **URL:** http://127.0.0.1:8787
- **Dev Server Status:** ✅ Running (bash startDev.sh)
- **Browser:** Chrome/Firefox/Safari (any modern browser with DevTools)

---

## Pre-Test Setup

1. Open **DevTools** (F12)
2. Go to **Network** tab
3. Set filter to search for: `api.js`
4. Open **Console** tab
5. Keep both visible side-by-side

---

## Test 1: Initial Page Load - Check API.js Load Count

### Steps:
1. Navigate to http://127.0.0.1:8787 (homepage)
2. In **Network tab**, filter for `api.js`
3. **Expected:** 0 api.js requests (homepage doesn't use Turnstile)
4. Note: You should see api.js request only when visiting /auth/login or /auth/signup

### ✓ Pass Criteria:
- [ ] Homepage loads with 0 api.js requests
- [ ] No console errors about Turnstile

---

## Test 2: Login Page - Single API.js Load

### Steps:
1. Navigate to http://127.0.0.1:8787/auth/login
2. Wait for page to fully load (~2-3 seconds)
3. In **Network tab**, count requests to `api.js?render=explicit`
4. Check **Console** for errors

### ✓ Pass Criteria:
- [ ] Exactly **1** request to `api.js?render=explicit` in Network tab
- [ ] **No** errors in Console containing:
  - "size="invisible"" 
  - "already executing"
  - "Turnstile already exists"
  - "double load"
- [ ] Status code for api.js is **200 OK**

### ✗ Fail Indicators:
- [ ] Multiple api.js requests (2+) = DOUBLE LOAD BUG
- [ ] Error: "size="invisible"" = Wrong size parameter
- [ ] Error: "already executing" = execute() called twice

---

## Test 3: Modal Open/Close Cycle - No Re-rendering

### Steps:
1. **Still on login page** from Test 2
2. Clear Network filter (show all requests)
3. Scroll down to see "Need an account? Create one" link
4. Click it to open signup modal
5. **Check Console:** Any errors?
6. Close modal (click X or ESC)
7. Repeat steps 4-6 **two more times** (3 total)
8. Filter Network for `api.js` again

### ✓ Pass Criteria:
- [ ] Still exactly **1** api.js request in Network (from Test 2)
- [ ] **No new api.js requests** for each modal open/close
- [ ] **No console errors** about:
  - "already executing"
  - "widget already rendered"
  - Turnstile rendering errors

### ✗ Fail Indicators:
- [ ] New api.js requests appear = Re-loading script
- [ ] 2+ api.js requests total = Double load in different scenario

---

## Test 4: Email/Password Signup - Functional Test

### Steps:
1. Open signup modal (or go to http://127.0.0.1:8787/auth/signup)
2. Fill in form:
   - Email: `test-$(date +%s)@example.com` (unique)
   - Password: `TestPassword123456!`
   - Confirm password: `TestPassword123456!`
3. **Wait for Turnstile widget to appear** (may show empty for testing)
4. Click "Create account" button
5. Check **Console** and **Network tab** for errors

### ✓ Pass Criteria:
- [ ] Turnstile widget appears and is interactive
- [ ] **No console errors** about Turnstile
- [ ] Form can be submitted (or gets validation feedback)
- [ ] **Only 1 api.js request** in Network tab throughout test

### ✗ Fail Indicators:
- [ ] Turnstile widget fails to load
- [ ] "size="invisible"" error appears
- [ ] Multiple api.js requests

---

## Test 5: Email/Password Login - Functional Test

### Steps:
1. Go to http://127.0.0.1:8787/auth/login
2. Fill in form:
   - Email: `test-$(date +%s)@example.com` (same from signup)
   - Password: `TestPassword123456!`
3. **Wait for Turnstile widget** (scroll down if needed)
4. Click "Sign in" button
5. Check **Console** for errors
6. Note Network requests

### ✓ Pass Criteria:
- [ ] Turnstile widget appears
- [ ] **No console errors** about Turnstile, size, or execute
- [ ] Form submission attempt (even if fails auth, UI should work)
- [ ] **Only 1 api.js request** total in Network tab

---

## Test 6: Password Reset Modal - No Double Load

### Steps:
1. On login page, look for "Forgot password?" link
2. Click it to open password reset modal
3. **Check Console:** Any errors?
4. Check **Network tab** for api.js requests
5. Close modal and open again 2 more times

### ✓ Pass Criteria:
- [ ] Modal opens without console errors
- [ ] **Still only 1 api.js request** in Network (from initial page load)
- [ ] **No "already executing"** or similar errors
- [ ] Modal can be opened/closed repeatedly

---

## Test 7: Passkey Login - No Turnstile Conflicts

### Steps:
1. On login page, click "Sign in with passkey" button
2. **Check Console** for errors
3. Check Network for:
   - `/api/auth/passkey/login/options` request (should appear)
   - **Only 1** api.js request total

### ✓ Pass Criteria:
- [ ] Passkey flow starts without console errors
- [ ] Turnstile and Passkey don't conflict
- [ ] **Only 1 api.js request** in Network

---

## Test 8: Console Error Summary

### In DevTools Console, run:
```javascript
// Check for any Turnstile-related errors in logs
const logs = console.log.toString();
console.log("✓ Turnstile verification complete - check for errors above");
```

### ✓ Pass Criteria:
- [ ] **No red errors** (❌) in console
- [ ] **No warnings** (⚠️) about Turnstile, double-loading, or execute
- [ ] **No messages** mentioning "invisible" size
- [ ] **No messages** about "widget already exists"

---

## Test 9: Network Tab Final Verification

### In Network tab:
1. Filter for `api.js`
2. **Count total requests:** Should be **exactly 1**
3. Click on it and check:
   - **URL:** `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`
   - **Status:** 200 OK
   - **Size:** ~40-50 KB (gzipped)
   - **Time:** should complete in <1s
4. Check **Initiator** to confirm it's from `turnstile-client.js` or `turnstile-loader.js`

### ✓ Pass Criteria:
- [ ] Exactly **1 api.js request** total
- [ ] Status code is **200 OK** (not 304 cached)
- [ ] URL matches expected format
- [ ] Initiator is NOT `<script>` multiple times

---

## Troubleshooting: If Tests Fail

### If you see 2+ api.js requests:
1. Check which files initiated them:
   - Note the "Initiator" column in Network tab
   - Open DevTools > Sources > Network requests
   - Click on api.js and note the full URL

2. Run in Console:
```javascript
console.log("Script sources:", document.querySelectorAll('script[data-turnstile-api]').length);
console.log("Load promise exists:", !!window.__turnstilePromise);
console.log("Loader loaded:", !!window.__turnstileLoaderLoaded);
```

3. Expected output:
   - `Script sources: 1`
   - `Load promise exists: true` (or `false`)
   - `Loader loaded: true`

### If you see "size="invisible"" error:
1. Check `public/js/auth/turnstile-client.js` line 13-16
2. Should see: `normalizeSize('invisible')` returns `'normal'`
3. Look for where widgets are rendered and ensure `size` parameter is normalized

### If you see "already executing" error:
1. Check in Console:
```javascript
console.log("Execute call count:", window.TurnstileClient?.executionByWidget?.size);
```
2. Should be 0 when idle
3. Check `public/js/auth/turnstile-client.js` line 126-135
4. Verify only one `window.turnstile.execute()` call per widget

---

## Verification Checklist Summary

| Test | Description | Status |
|------|-------------|--------|
| Test 1 | Homepage - 0 api.js | ✓ Pass / ✗ Fail |
| Test 2 | Login page - 1 api.js | ✓ Pass / ✗ Fail |
| Test 3 | Modal cycle - no new loads | ✓ Pass / ✗ Fail |
| Test 4 | Signup form - functional | ✓ Pass / ✗ Fail |
| Test 5 | Login form - functional | ✓ Pass / ✗ Fail |
| Test 6 | Password reset - no double load | ✓ Pass / ✗ Fail |
| Test 7 | Passkey flow - no conflicts | ✓ Pass / ✗ Fail |
| Test 8 | Console - no errors | ✓ Pass / ✗ Fail |
| Test 9 | Network - exactly 1 api.js | ✓ Pass / ✗ Fail |

---

## Console Commands for Quick Testing

Copy and paste into DevTools Console:

```javascript
// Check Turnstile state
console.log("=== TURNSTILE STATE ===");
console.log("window.turnstile exists:", !!window.turnstile);
console.log("TurnstileClient loaded:", !!window.TurnstileClient);
console.log("TurnstileLoader loaded:", !!window.TurnstileLoader);
console.log("Script count:", document.querySelectorAll('script[data-turnstile-api]').length);
console.log("Load promise active:", !!window.__turnstilePromise);

// Check for multiple loads
console.log("\n=== MULTIPLE LOAD CHECK ===");
const scripts = Array.from(document.querySelectorAll('script')).filter(s => 
  s.src.includes('turnstile') && s.src.includes('api.js')
);
console.log("api.js script tags:", scripts.length, "(should be 1)");
scripts.forEach((s, i) => console.log(`  [${i}]`, s.src, s.getAttribute('data-turnstile-api')));

// Check for errors
console.log("\n=== ERROR CHECK ===");
const hasErrors = !!document.body.innerText.match(/error|Error|ERROR|failed|Failed/i);
console.log("Visual errors on page:", hasErrors);

// Check widget state
console.log("\n=== WIDGET STATE ===");
console.log("Execution queue size:", window.TurnstileClient?.executionByWidget?.size || 0);
```

---

## Final Verification

When all tests pass, you should see:

✅ **Exactly 1 api.js load** across all page interactions  
✅ **No console errors** about Turnstile, size, or execute  
✅ **No warning** messages in Network or Console  
✅ **All forms functional** (Turnstile widget loads and appears)  
✅ **Modal cycles** work without re-rendering  
✅ **Passkey and Turnstile** work together without conflicts  

---

## Notes for Development

**Files being tested:**
- `public/js/turnstile-loader.js` - Global loader
- `public/js/auth/turnstile-client.js` - Render and execute manager
- `public/auth/login/index.html` - Login page using both scripts
- `public/auth/signup/index.html` - Signup page using both scripts
- `public/partials/footer.html` - Modal definitions (login, signup, password-reset)

**Key fixes implemented:**
1. ✅ `normalizeSize()` prevents `size="invisible"` from being passed
2. ✅ `loadTurnstileOnce()` prevents script double-load
3. ✅ `executionByWidget` Map prevents double execute() calls
4. ✅ Script tag with `data-turnstile-api` prevents script duplication
5. ✅ Promise caching in `__turnstilePromise` ensures single load

---

## Passkey Debug Logging

To enable local passkey verify logs:

```bash
PASSKEY_DEBUG=1 npx wrangler dev --local --config wrangler.jsonc --port 8787
```

This logs a single safe line per 400 response from `/api/auth/passkey/login/verify` on localhost only.

---

**Test Date:** January 30, 2026  
**Status:** Ready for manual browser verification
