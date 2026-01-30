# Passkey Login: Test Execution Guide (Browser-Based)

## Overview
This guide walks you through reproducing the 400 error on `POST /api/auth/passkey/login/verify` after logout/login using your actual device's passkey.

**Prerequisites:**
- Development server running: `startDev.sh` ✅
- Browser with WebAuthn support (Chrome, Firefox, Safari, Edge)
- Device with authenticator capability (Windows Hello, Touch ID, Face ID, security key, etc.)
- Debug helper loaded: `public/js/passkey-debug.js` in HTML

---

## Test Scenario: Logout → Login 400 Error

### Part A: Initial Setup (5 minutes)

1. **Open browser to http://localhost:8787**
   - ✅ Should see login/signup page
   - ✅ "Sign in with Passkey" button visible

2. **Sign up with test account**
   - Email: `passkey-test-$(date +%s)@example.com` (use unique email)
   - Password: `TestPassword123456!`
   - Click "Sign Up"
   - ✅ Should redirect to `/account` or show signed-in state

3. **Open DevTools (F12)**
   - Network tab: enabled
   - Console tab: ready for debug commands
   - Set filter to show XHR/Fetch requests

4. **Navigate to Account page**
   - Click "Account" or go to http://localhost:8787/account
   - ✅ Should show "Add Passkey" button

### Part B: Register a Passkey (5 minutes)

5. **Add Passkey**
   - Click "Add Passkey" button
   - Nickname: `Test Device` (optional)
   - Click "Register"

6. **Complete WebAuthn Registration**
   - Browser will prompt for device authentication
   - On Windows: Windows Hello dialog
   - On Mac: Touch ID dialog
   - On Linux: Security key dialog (if available)
   - Complete the authentication

7. **Capture Registration Request (Network tab)**
   - Look for: `POST /api/auth/passkey/register/verify`
   - Status should be: **200 OK**
   - Request body contains:
     - `assertionResponse.id` (should be base64url string)
     - `challengeId` (UUID)
   - **Save this challengeId** for comparison later

8. **Verify Passkey Added**
   - ✅ Success message should appear
   - ✅ Device should show in passkeys list

### Part C: Logout (1 minute)

9. **Log Out**
   - Click "Logout" or "Sign Out" button
   - Browser should clear session cookie
   - Should redirect to login page

10. **Verify Session Cleared (Network tab)**
    - Look for request to: `GET /api/auth/me`
    - Response should show: `"authenticated":false`
    - OR no session cookie in request headers

### Part D: Reproduce 400 Error (5 minutes)

11. **On Login Page: Click "Sign in with Passkey"**
    - Button becomes active/loading
    - **Network tab:** Observe `POST /api/auth/passkey/login/options`
    - Status: **200 OK**
    - Response contains:
      - `options.challenge` (base64 string)
      - `challengeId` (UUID)
    - **Record this challengeId (call it "challengeId_2")**

12. **Complete WebAuthn Authentication**
    - Browser prompts for device authentication again
    - Complete biometric/PIN verification
    - **Network tab:** Will show `POST /api/auth/passkey/login/verify` shortly

13. **Check /login/verify Response (THE KEY STEP)**
    - Look at response status: **Should be 200 OK, but if reproducing bug shows 400**
    - Response body:
      ```json
      {"ok":false,"code":"VERIFY_FAILED"}
      // or
      {"ok":false,"code":"UNKNOWN_CREDENTIAL"}
      ```
    - **Error message in browser:** "Passkey sign-in failed."

---

## Capturing Debug Data (When 400 Occurs)

### Console: View Passkey Debug Logs
```javascript
// In browser console (F12 → Console tab)
window.PasskeyDebug.getLogs()
```

**Look for entries like:**
```javascript
{
  event: "VERIFY_REQUEST",
  details: {
    url: "/api/auth/passkey/login/verify",
    method: "POST",
    challengeId: "246e0fa9-24cb-4179-98f5-28cfbaa158b4",
    assertionResponseId: {
      value: "base64url_string_or_ArrayBuffer",
      type: "string or object"  // ← KEY: should be "string", not "ArrayBuffer"
    }
  }
}
```

### Check Error Details
```javascript
window.PasskeyDebug.getLastError()
// Returns most recent error entry with code and status
```

### Export Full Debug Log
```javascript
// Copy-paste result into file for analysis
JSON.stringify(window.PasskeyDebug.getLogs(), null, 2)
```

---

## Key Comparisons (To Diagnose Root Cause)

### Challenge ID Matching
```
After /passkey/login/options:
  challengeId_2 = "246e0fa9-24cb-4179-98f5-28cfbaa158b4"

In /passkey/login/verify request:
  challengeId = "246e0fa9-24cb-4179-98f5-28cfbaa158b4"

✓ MATCH = OK
✗ MISMATCH = Bug (cached challenge?)
```

### Assertion Response Type
```javascript
// In debug logs, check:
assertionResponseId.type

Expected: "string(28)" or similar
          (base64url encoded credential ID)

If seeing: "object"
          "ArrayBuffer"
          "Uint8Array"
          → This is the root cause!
```

### Credential ID Encoding
Compare the credential ID from:
1. **Registration** (Step 7): `passkey/register/verify` request
   - `assertionResponse.id` = first passkey
   
2. **Login** (Step 13): `passkey/login/verify` request
   - `assertionResponse.id` = should match format

```javascript
// In console:
const logs = window.PasskeyDebug.getLogs();
const registerLog = logs.find(e => e.event.includes('REGISTER'));
const loginLog = logs.find(e => e.event.includes('LOGIN'));

console.log("Register ID type:", registerLog.details.assertionResponseId.type);
console.log("Login ID type:", loginLog.details.assertionResponseId.type);
// Should both be "string" if formats match
```

---

## Network Tab: Detailed View

### Registration Verify Request
```
POST /api/auth/passkey/register/verify
Headers:
  - Content-Type: application/json
  - Origin: http://localhost:8787
  - Cookie: session=...

Body:
{
  "assertionResponse": {
    "id": "AQIDBA...",  ← base64url
    "rawId": "AQIDBA...",
    "type": "public-key",
    "response": {
      "clientDataJSON": "eyJjaGF...",
      "attestationObject": "o2NmZm...",
      ...
    }
  },
  "challengeId": "f6a7a7e3-8252-4afa-b401-ca04621b8ae0"
}

Response:
{
  "ok": true,
  "credentials": [{
    "id": "...",
    "nickname": "Test Device",
    "createdAt": "2026-01-30T04:30:00Z"
  }]
}
```

### Login Options Request
```
POST /api/auth/passkey/login/options
Headers:
  - Content-Type: application/json
  - Origin: http://localhost:8787
  - (NO session cookie - we're logged out)

Body: {}

Response:
{
  "ok": true,
  "options": {
    "challenge": "gP9g8RKY...",  ← base64
    "rpId": "127.0.0.1",
    "allowCredentials": [],
    "timeout": 60000,
    "userVerification": "preferred"
  },
  "challengeId": "246e0fa9-24cb-4179-98f5-28cfbaa158b4"
}
```

### Login Verify Request (THE PROBLEMATIC ONE)
```
POST /api/auth/passkey/login/verify
Headers:
  - Content-Type: application/json
  - Origin: http://localhost:8787
  - (NO session cookie - we're logged out)

Body:
{
  "assertionResponse": {
    "id": "AQIDBA...",  ← SHOULD match format from registration
    "rawId": "AQIDBA...",
    "type": "public-key",
    "response": {
      "clientDataJSON": "eyJjaGF...",
      "authenticatorData": "SZYN5Y...",
      "signature": "MEYCIQDc...",
      ...
    }
  },
  "challengeId": "246e0fa9-24cb-4179-98f5-28cfbaa158b4"  ← Must match options response
}

✓ EXPECTED Response (Success):
{
  "ok": true
}
Status: 200 OK

✗ ERROR Response (Bug):
{
  "ok": false,
  "code": "VERIFY_FAILED" or "UNKNOWN_CREDENTIAL"
}
Status: 400 Bad Request
```

---

## If You See 400 UNKNOWN_CREDENTIAL

1. **The issue:** Server can't find the credential you just registered
2. **Likely cause:** `assertionResponse.id` encoding mismatch
3. **Check these:**
   ```javascript
   // In console:
   const logs = window.PasskeyDebug.getLogs();
   const verify = logs.find(e => e.event === 'VERIFY_REQUEST');
   
   // Is ID an ArrayBuffer?
   console.log(verify.details.assertionResponseId);
   // If type is "object" → ArrayBuffer issue
   ```
4. **See:** `PASSKEY_SERVER_NORMALIZATION.md` for server-side fix

---

## If You See 400 VERIFY_FAILED

1. **The issue:** Signature verification failed
2. **Possible causes:**
   - Challenge mismatch (different challenge sent vs stored)
   - Origin mismatch (HTTP vs HTTPS, domain mismatch)
   - Credential ID encoding mismatch (ArrayBuffer vs string)
   - RP ID mismatch (127.0.0.1 vs localhost)
3. **Check these:**
   ```javascript
   // In console:
   const logs = window.PasskeyDebug.getLogs();
   const optionsLog = logs.find(e => e.event === 'OPTIONS_RESPONSE');
   const verifyLog = logs.find(e => e.event === 'VERIFY_REQUEST');
   
   console.log("Options challenge:", optionsLog.details.optionsChallenge);
   console.log("Verify request sent:", verifyLog.details);
   ```

---

## Automated Bash Test (Alternative)

For API-level testing without browser interaction:

```bash
bash test-passkey-flow.sh
```

This creates an account and tests endpoints, but doesn't include real WebAuthn (requires browser).

---

## Success Criteria

✅ **If test succeeds:**
- Sign up → register passkey → logout → login with passkey
- See session cookie set in response
- Redirected to authenticated area
- `window.PasskeyDebug.getLogs()` shows all 200 responses

❌ **If 400 occurs:**
- After logout → login, get `POST /api/auth/passkey/login/verify 400`
- Response contains `code: UNKNOWN_CREDENTIAL or VERIFY_FAILED`
- `window.PasskeyDebug.getLogs()` shows mismatch in challengeId or ID type
- See diagnostic steps above

---

## Database Queries (Advanced Debugging)

Run these in your database client:

**Check registered credentials:**
```sql
SELECT id, user_id, credential_id, created_at, last_used_at
FROM passkey_credentials
ORDER BY created_at DESC
LIMIT 10;
```

**Check challenge records:**
```sql
SELECT id, kind, challenge, created_at, expires_at, used_at
FROM webauthn_challenges
WHERE kind = 'authentication'
ORDER BY created_at DESC
LIMIT 10;
```

**Check audit trail:**
```sql
SELECT user_id, event_type, metadata, created_at
FROM audit_events
WHERE event_type LIKE '%passkey%' OR metadata LIKE '%passkey%'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Next Steps

1. **Run test now:** Follow Part A → D above
2. **If 400 occurs:** Share debug logs + database queries
3. **Apply fix:** See `PASSKEY_SERVER_NORMALIZATION.md`
4. **Verify fix:** Re-run test scenario, should now succeed

---

## Quick Reference: Expected Flow

```
User Action          → HTTP Request                    → Expected Response
─────────────────────────────────────────────────────────────────────────
Signup               POST /api/auth/signup             200 {ok: true}
Add Passkey          POST /api/auth/passkey/register/*  200 {ok: true}
Logout               POST /api/auth/logout             200 {}
Click Passkey Login  POST /api/auth/passkey/login/options  200 {options, challengeId}
Auth Device          (browser handles)                 (device response)
Submit Auth          POST /api/auth/passkey/login/verify  200 {ok: true}
Check Session        GET /api/auth/me                  200 {authenticated: true}
```

---

## Support

**Stuck?** Check these files:
- Test plan: `PASSKEY_TEST_PLAN.md`
- Debug helper: `public/js/passkey-debug.js`
- Server fix: `PASSKEY_SERVER_NORMALIZATION.md`
- Quick start: `PASSKEY_DEBUG_QUICKSTART.md`
