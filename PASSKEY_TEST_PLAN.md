# Passkey Login Debug & Test Plan

## Overview
This document provides a focused test plan and debug procedures for reproducing and resolving 400 errors on `POST /api/auth/passkey/login/verify` after logout/login cycles.

---

## Manual Test Checklist

### Setup Phase
- [ ] **T1:** Start dev server (`startDev.sh`) and open browser to http://localhost:8787
- [ ] **T2:** Create a test account via email/password signup
- [ ] **T3:** Register a passkey on the account (from `/account` page)
  - [ ] Verify success message appears
  - [ ] Check browser's passkey manager shows the credential
- [ ] **T4:** Log out completely (clear cookies if needed)

### Challenge ID Matching (Core Issue)
- [ ] **C1:** Open browser DevTools → Network tab
- [ ] **C2:** On login page, click "Sign in with Passkey"
- [ ] **C3:** Observe request to `POST /api/auth/passkey/login/options`
  - [ ] Response contains `challengeId` (UUID format)
  - [ ] Response contains `options.challenge` (base64 string)
  - [ ] Record both values for comparison
- [ ] **C4:** Complete passkey verification in your device/authenticator
- [ ] **C5:** Observe request to `POST /api/auth/passkey/login/verify`
  - [ ] Request body contains `challengeId` (should match C3)
  - [ ] Request body contains `assertionResponse.id` (base64url or ArrayBuffer)
  - [ ] **Use debug helper** (see below) to log exact types

### 400 Error Scenarios

#### Scenario A: UNKNOWN_CREDENTIAL
- [ ] **A1:** Use passkey from Device A on Device B (where credential doesn't exist)
- [ ] **A2:** Expect 400 with `code: 'UNKNOWN_CREDENTIAL'`
- [ ] **A3:** Error message: "No matching passkey found on this device..."
- [ ] **A4:** Check audit logs for `passkey_login_failed` with reason `unknown_credential`

#### Scenario B: CHALLENGE_INVALID or CHALLENGE_EXPIRED
- [ ] **B1:** Get to verification step (C3-C4)
- [ ] **B2:** Wait 15+ minutes before submitting verification
- [ ] **B3:** Expect 400 with `code: 'CHALLENGE_EXPIRED'`
- [ ] **B4:** (For CHALLENGE_INVALID: attempt to reuse a used challengeId)

#### Scenario C: VERIFY_FAILED (Root cause for most 400s)
- [ ] **C1:** Start passkey verification normally
- [ ] **C2:** Inject debug logging (see `passkey-debug.js`) before submission
- [ ] **C3:** Log `assertionResponse.id` and `assertionResponse.rawId` types
  - [ ] If `id` is ArrayBuffer, check if server is expecting base64url string
  - [ ] If `rawId` is Uint8Array, check conversion
- [ ] **C4:** Check server logs for exact error message from `verifyAuthenticationResponse()`
- [ ] **C5:** Common causes:
  - [ ] credentialID mismatch (raw bytes vs base64url encoding)
  - [ ] challenge mismatch (verify encoding matches `challengeRecord.challenge`)
  - [ ] origin mismatch (check HTTP vs HTTPS, localhost vs domain)
  - [ ] counter verification failure (rare, indicates cloned authenticator)

#### Scenario D: Logout → Login Cycle (Original Bug)
- [ ] **D1:** Successfully log in with passkey
- [ ] **D2:** Click logout button
- [ ] **D3:** Verify session is cleared (check cookies: should see session-removed or empty)
- [ ] **D4:** Attempt passkey login again
- [ ] **D5:** If 400 occurs:
  - [ ] Check if `challengeId` from step C3 differs from step D4
  - [ ] Check if `assertionResponse.id` encoding differs
  - [ ] Review audit events for both attempts
  - [ ] Compare `passkey_auth_options_issued` vs `passkey_login_failed` metadata

---

## Client-Side Debug Helper

### Usage
Include the debug helper **before** `auth.js` in your HTML:

```html
<script src="/js/passkey-debug.js"></script>
<script src="/js/auth.js"></script>
```

### What It Does
1. **Intercepts passkey flow** at critical points
2. **Logs assertionResponse details:**
   - `id` type and value (ArrayBuffer vs string)
   - `rawId` type and value
   - `type`, `response.clientDataJSON`, etc.
3. **Logs challengeId** from options endpoint
4. **Stores log in localStorage** under key `passkey_debug_logs`
5. **Provides `window.PasskeyDebug` API** for manual inspection

### API
```javascript
// View all logged events
window.PasskeyDebug.getLogs()

// Clear logs
window.PasskeyDebug.clearLogs()

// Export as JSON
console.log(JSON.stringify(window.PasskeyDebug.getLogs(), null, 2))

// View most recent failure
window.PasskeyDebug.getLastError()
```

---

## Server-Side Normalization: ArrayBuffer Handling

### The Problem
The browser's WebAuthn API returns `assertionResponse.id` as a **base64url-encoded string** (via SimpleWebAuthn). However, some older implementations or custom WebAuthn code might return it as an **ArrayBuffer** or **Uint8Array**.

The server endpoint currently uses:
```javascript
const credentialId = assertionResponse?.id || assertionResponse?.rawId || '';
```

This assumes `id` is a string. If it's an ArrayBuffer, it will stringify as `[object ArrayBuffer]` and fail credential lookup.

### Server-Side Fix

Add normalization at the top of `handlePasskeyLoginVerify` in `src/worker.js`:

```javascript
// Normalize assertionResponse.id to base64url string
let credentialId = assertionResponse?.id || assertionResponse?.rawId || '';

// Handle ArrayBuffer or Uint8Array
if (credentialId instanceof ArrayBuffer) {
  credentialId = isoBase64URL.fromBuffer(credentialId);
} else if (credentialId instanceof Uint8Array) {
  credentialId = isoBase64URL.fromBuffer(Buffer.from(credentialId));
} else if (typeof credentialId !== 'string') {
  credentialId = '';
}

credentialId = credentialId.toString().trim();

if (!credentialId) {
  await env.DB.prepare('UPDATE webauthn_challenges SET used_at = ? WHERE id = ?')
    .bind(nowIso(), challengeRecord.id)
    .run();
  return jsonResponse({ ok: false, code: 'UNKNOWN_CREDENTIAL' }, { status: 400 });
}
```

### Defensive Logging
Add logging for audit/debug:
```javascript
if (process.env.DEBUG_PASSKEY) {
  console.log('[PasskeyLogin]', {
    credentialIdType: typeof assertionResponse.id,
    credentialIdConstructor: assertionResponse.id?.constructor?.name,
    credentialIdLength: credentialId.length,
    credentialIdSample: credentialId.substring(0, 20) + '...'
  });
}
```

---

## Debugging Steps

### Step 1: Capture Raw Request
1. Open DevTools → Network tab
2. Click "Fetch/XHR" filter
3. Attempt passkey login
4. Right-click on `/api/auth/passkey/login/verify` request
5. Copy as **cURL** or view **Payload** tab
6. **Note the exact format of `assertionResponse.id` and `challengeId`**

### Step 2: Check Challenge Record
Query the database directly:
```sql
SELECT id, challenge, expires_at, used_at
FROM webauthn_challenges
WHERE kind = 'authentication'
ORDER BY created_at DESC
LIMIT 5;
```
- [ ] Verify most recent `challengeId` is not `used_at`
- [ ] Verify `expires_at` is in the future

### Step 3: Check Credential Record
```sql
SELECT id, user_id, credential_id, last_used_at
FROM passkey_credentials
WHERE user_id = ?;
```
- [ ] Verify `credential_id` matches `assertionResponse.id` **exactly**
- [ ] Compare encoding (base64url vs hex vs raw bytes)

### Step 4: Check Audit Events
```sql
SELECT event_type, metadata, created_at
FROM audit_events
WHERE user_id = ? OR metadata LIKE '%login%'
ORDER BY created_at DESC
LIMIT 20;
```
- [ ] Look for `passkey_auth_options_issued` (should have the challengeId)
- [ ] Look for `passkey_login_failed` (should show reason: `verify_failed`, `challenge_invalid`, etc.)
- [ ] Match challengeIds across events

### Step 5: Enable Server Debug Logging
Uncomment or add this to `src/worker.js` in `handlePasskeyLoginVerify`:
```javascript
console.error('[PasskeyLoginVerify]', {
  challengeId,
  credentialId,
  credentialIdType: typeof credentialId,
  hasCredential: !!credential,
  challengeRecordExists: !!challengeRecord,
  challengeUsed: challengeRecord?.used_at,
  challengeExpired: new Date(challengeRecord?.expires_at).getTime() <= Date.now(),
});
```

---

## Common Root Causes & Fixes

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| **400 UNKNOWN_CREDENTIAL** | Credential not registered on this device | Register passkey on the current device |
| **400 VERIFY_FAILED** | credentialID encoding mismatch | Add ArrayBuffer normalization (see above) |
| **400 VERIFY_FAILED** | Challenge mismatch after logout | Verify challenge isn't being cached or reused |
| **400 CHALLENGE_EXPIRED** | Took >10 min between options & verify | Reduce WEBAUTHN_CHALLENGE_TTL_MINUTES or retest faster |
| **401 after success** | Session not created/cookie not set | Check Set-Cookie header in response, verify credentials mode |
| **logout→login 400** | New challengeId not being fetched | Ensure `/api/auth/passkey/login/options` is called fresh each time |

---

## Expected vs Actual Behavior

### Expected Flow
1. **OPTIONS**: `POST /api/auth/passkey/login/options` → 200 with `{options, challengeId}`
2. **VERIFY**: `POST /api/auth/passkey/login/verify` with matching `challengeId` → 200 with session cookie
3. **AUTH CHECK**: `GET /api/auth/me` → 200 with authenticated user

### Common Failure: Logout→Login
1. ✅ OPTIONS (first login): gets `challengeId: "abc-123"`, succeeds
2. ✅ Logout: session cookie cleared
3. ❌ OPTIONS (after logout): gets `challengeId: "xyz-789"`, but VERIFY somehow uses old `"abc-123"`
   - [ ] Check if `challengeId` is cached in sessionStorage/localStorage
   - [ ] Check if options request is being bypassed

---

## References
- **SimpleWebAuthn Docs:** https://simplewebauthn.dev/
- **WebAuthn Spec:** https://www.w3.org/TR/webauthn/
- **Server Code:** `src/worker.js` lines 1805–1977 (`handlePasskeyLoginOptions` & `handlePasskeyLoginVerify`)
- **Client Code:** `public/js/auth.js` lines 566–650 (passkey login button handler)
- **Debug Helper:** `public/js/passkey-debug.js`
