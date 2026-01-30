# OAuth Login Test Plan
**Date:** January 29, 2026  
**Status:** ⚠️ BLOCKED - Secrets not configured  
**Scope:** Google OAuth + Apple OAuth + Regression tests

---

## Prerequisites

### Secrets Required (Not Yet Set)
You need to set these secrets before testing:

```bash
# Google OAuth secrets
wrangler secret put GOOGLE_CLIENT_SECRET

# Apple OAuth secrets  
wrangler secret put APPLE_PRIVATE_KEY
```

### Current Configuration Status

**wrangler.jsonc vars:**
```json
{
  "GOOGLE_CLIENT_ID": "",           // ← Empty (needs value)
  "GOOGLE_CLIENT_SECRET": "",       // ← Empty (needs secret)
  "GOOGLE_REDIRECT_URI": "",        // Auto: {base}/api/auth/oauth/google/callback
  "APPLE_CLIENT_ID": "",            // ← Empty (needs value)
  "APPLE_TEAM_ID": "",              // ← Empty (needs value)
  "APPLE_KEY_ID": "",               // ← Empty (needs value)
  "APPLE_PRIVATE_KEY": "",          // ← Empty (needs secret)
  "APPLE_REDIRECT_URI": "",         // Auto: {base}/api/auth/oauth/apple/callback
  "OAUTH_REDIRECT_BASE": ""         // Auto: derived from request
}
```

---

## Part 1: Local Testing (wrangler dev)

### Setup
1. Ensure migration 0013_oauth_tables.sql has been run on local D1
2. Start: `npx wrangler dev --local --config wrangler.jsonc`
3. Open: http://localhost:8787/auth/login/

### Test 1.1: OAuth Unavailable (Current State)

**Given:** OAuth secrets not configured  
**When:** User clicks "Continue with Google" or "Continue with Apple"  
**Expected:** Redirect to login modal with error message

**Test Steps:**
1. Open http://localhost:8787/auth/login/
2. Click "Continue with Google" button
3. Observe in Network tab:
   - Request: `GET /api/auth/oauth/google/start`
   - Response: 302 redirect
   - Location header: `http://localhost:8787/auth/login/?error=oauth_unavailable`

**Manual Check:**
```bash
curl -v http://localhost:8787/api/auth/oauth/google/start
# Expected: 302 with Location pointing to login with error param
```

**Pass Criteria:**
- ✓ 302 status code
- ✓ Location contains `error=oauth_unavailable`
- ✓ No 500 errors in Worker logs
- ✓ Browser shows user-facing error: "OAuth is not configured. Please sign in with email and password."

---

### Test 1.2: OAuth State Creation in D1

**Setup:** Configure dummy OAuth secrets in .dev.vars (not production):

```env
GOOGLE_CLIENT_ID=test-client-id
GOOGLE_CLIENT_SECRET=test-secret
APPLE_CLIENT_ID=test-apple-id
APPLE_TEAM_ID=test-team-id
APPLE_KEY_ID=test-key-id
APPLE_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIJmOy...=\n-----END EC PRIVATE KEY-----
```

**When:** User clicks "Continue with Google"  
**Expected:** State record created in oauth_states table with expiration

**Test Steps:**
1. Click "Continue with Google"
2. Browser should redirect to accounts.google.com (or error if credentials invalid)
3. Query local D1:
   ```bash
   npx wrangler d1 execute wy_local --local --command "SELECT * FROM oauth_states LIMIT 5"
   ```

**Inspect:** Show state record created with:
- `state` (random string)
- `provider` = "google"
- `code_verifier` (PKCE value)
- `created_at` (current timestamp)

**Pass Criteria:**
- ✓ Row inserted into oauth_states
- ✓ code_verifier is 32-byte base64url string
- ✓ created_at is recent timestamp (within last 5 seconds)

---

### Test 1.3: OAuth State Expiration & Cleanup

**Setup:** Same as 1.2

**When:** Old states are queried  
**Expected:** Cleanup removes states older than 10 minutes

**Test Steps:**
1. Insert a test state with `created_at` in the past:
   ```bash
   npx wrangler d1 execute wy_local --local --command \
     "INSERT INTO oauth_states VALUES ('old-state', 'google', 'verifier', 1000000000)"
   ```

2. Call OAuth start endpoint (triggers cleanup):
   ```bash
   curl http://localhost:8787/api/auth/oauth/google/start
   ```

3. Query oauth_states:
   ```bash
   npx wrangler d1 execute wy_local --local --command \
     "SELECT COUNT(*) as count FROM oauth_states WHERE state='old-state'"
   ```

**Pass Criteria:**
- ✓ Old state deleted
- ✓ New state created
- ✓ Only unexpired states remain

---

### Test 1.4: Invalid State Callback

**Given:** User has old/invalid state from DB  
**When:** OAuth callback received with invalid state  
**Expected:** Redirect to error page without 500

**Test Steps:**
1. Hit callback with non-existent state:
   ```bash
   curl -v "http://localhost:8787/api/auth/oauth/google/callback?code=fake&state=invalid-state"
   ```

2. Observe response:
   - Status: 302
   - Location: `http://localhost:8787/auth/login/?error=state_invalid`
   - No exception in Worker logs

**Pass Criteria:**
- ✓ 302 status
- ✓ Graceful error redirect
- ✓ No 500 errors
- ✓ No database exceptions

---

### Test 1.5: Missing Code/State in Callback

**When:** OAuth provider returns callback without code or state  
**Expected:** Clean error redirect

**Test Steps:**
```bash
# Missing code
curl -v "http://localhost:8787/api/auth/oauth/google/callback?state=test"
# Missing state
curl -v "http://localhost:8787/api/auth/oauth/google/callback?code=test"
# Missing both
curl -v "http://localhost:8787/api/auth/oauth/google/callback"
```

**Pass Criteria:**
- ✓ All return 302
- ✓ Location contains `error=provider_error`
- ✓ No 500 errors

---

## Part 2: Production Smoke Tests

### Prerequisites
1. All OAuth secrets configured via `wrangler secret put`
2. Google/Apple OAuth apps configured with correct redirect URIs
3. Live at https://grassrootsmvt.org/

### Test 2.1: Google OAuth Redirect URL

**When:** User clicks "Continue with Google"  
**Expected:** Redirect to accounts.google.com with correct client_id and redirect_uri

**Test Steps:**
1. Open https://grassrootsmvt.org/auth/login/
2. Open DevTools Network tab
3. Click "Continue with Google"
4. Inspect Network → start request → Headers/Response
5. Look for 302 with Location header pointing to accounts.google.com

**Expected URL Pattern:**
```
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=YOUR_GOOGLE_CLIENT_ID
  &redirect_uri=https://grassrootsmvt.org/api/auth/oauth/google/callback
  &response_type=code
  &scope=openid email profile
  &state=[random]
  &code_challenge=[pkce_value]
  &code_challenge_method=S256
  &prompt=select_account
```

**Pass Criteria:**
- ✓ 302 status from /api/auth/oauth/google/start
- ✓ redirect_uri matches expected domain
- ✓ state parameter is present
- ✓ code_challenge and code_challenge_method present (PKCE)
- ✓ scope includes openid, email, profile

**Failure Scenarios to Check:**
- ❌ Client ID invalid → Should see Google error page
- ❌ Redirect URI mismatch → Google rejects with error
- ❌ Missing PKCE params → RFC 8252 violation

---

### Test 2.2: Google OAuth Callback

**Setup:** You'll need a valid Google OAuth code (from real sign-in or test account)

**When:** User completes Google sign-in and returns to callback  
**Expected:** Session created, redirected to /account or return_to page

**Test Steps:**
1. Complete actual Google sign-in (or simulate callback with valid code)
2. Inspect Network tab for callback request
3. Expected request: `GET /api/auth/oauth/google/callback?code=...&state=...`
4. Expected response:
   - 302 status
   - Set-Cookie header with session cookie
   - Location: /account or original return_to page

**Check Set-Cookie:**
```
Set-Cookie: auth_session=...; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
```

**Pass Criteria:**
- ✓ 302 status
- ✓ Session cookie set
- ✓ Cookie has HttpOnly flag (security)
- ✓ Cookie has Secure flag (HTTPS)
- ✓ Cookie expires in 30 days

**After Redirect:**
1. Verify /api/auth/me returns the signed-in user:
   ```bash
   curl -H "Cookie: auth_session=..." https://grassrootsmvt.org/api/auth/me
   ```

**Expected Response:**
```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Pass Criteria:**
- ✓ authenticated = true
- ✓ user.email matches OAuth email
- ✓ user.id is valid UUID

---

### Test 2.3: Apple OAuth Flow

**Same as 2.1-2.2 but for Apple**

**Expected URL Pattern:**
```
https://appleid.apple.com/auth/authorize?
  client_id=YOUR_APPLE_CLIENT_ID
  &redirect_uri=https://grassrootsmvt.org/api/auth/oauth/apple/callback
  &response_type=code
  &response_mode=form_post
  &scope=openid email name
  &state=[random]
  &code_challenge=[pkce_value]
  &code_challenge_method=S256
```

**Differences from Google:**
- ✓ Endpoint: appleid.apple.com/auth/authorize
- ✓ response_mode=form_post (Apple uses POST, not GET)
- ✓ Scope includes "name" instead of "profile"

---

### Test 2.4: Password Login Still Works

**When:** User bypasses OAuth and logs in with email/password  
**Expected:** All existing password flows work unchanged

**Test Steps:**
1. Open https://grassrootsmvt.org/auth/login/
2. Enter test email + password
3. Verify:
   - Turnstile challenge appears and passes
   - Session created
   - Redirected to /surveys/list/

**Pass Criteria:**
- ✓ Password login unaffected by OAuth code
- ✓ Turnstile still works
- ✓ Session management unchanged

---

### Test 2.5: Passkey Register/List/Login Still Works

**Setup:** Logged-in user

**Test Steps:**
1. Go to Account page: https://grassrootsmvt.org/account/
2. Scroll to Security section
3. Click "Add passkey"
4. Complete WebAuthn registration
5. Verify passkey appears in list
6. Log out
7. Sign in with passkey
8. Verify it works

**Pass Criteria:**
- ✓ Passkey list loads
- ✓ Registration works
- ✓ Passkey login succeeds
- ✓ No conflicts with OAuth

---

## Part 3: Regression Checks

### Test 3.1: CSP Violations

**When:** OAuth page loads and buttons clicked  
**Expected:** No CSP violations in DevTools Console

**Test Steps:**
1. Open https://grassrootsmvt.org/auth/login/
2. Open DevTools → Console
3. Check for CSP violation messages
4. Check Network tab for requests rejected by CSP

**Pass Criteria:**
- ✓ No "Refused to..."  CSP errors
- ✓ All OAuth buttons load cleanly
- ✓ Google/Apple domain loads correctly

---

### Test 3.2: No Turnstile on OAuth Routes

**When:** User navigates OAuth start/callback  
**Expected:** No Turnstile widget challenge on /api/auth/oauth/* routes

**Test Steps:**
1. Navigate to `/api/auth/oauth/google/start`
2. Observe: Should redirect immediately without Turnstile
3. Check Network: No request to challenges.cloudflare.com

**Pass Criteria:**
- ✓ No Turnstile widget shown
- ✓ Redirect happens before Turnstile loads
- ✓ No Turnstile API calls

---

### Test 3.3: Environment Configuration

**When:** Deployment to production  
**Expected:** No localhost-only values, all required vars set

**Check in wrangler.jsonc:**

**production env vars required:**
```json
{
  "ENVIRONMENT": "production",
  "APP_BASE_URL": "https://grassrootsmvt.org",
  "GOOGLE_CLIENT_ID": "set",
  "GOOGLE_CLIENT_SECRET": "(via secret)",
  "GOOGLE_REDIRECT_URI": "https://grassrootsmvt.org/api/auth/oauth/google/callback",
  "APPLE_CLIENT_ID": "set",
  "APPLE_TEAM_ID": "set",
  "APPLE_KEY_ID": "set",
  "APPLE_PRIVATE_KEY": "(via secret)",
  "APPLE_REDIRECT_URI": "https://grassrootsmvt.org/api/auth/oauth/apple/callback"
}
```

**Errors to Check:**
- ❌ APP_BASE_URL = "http://localhost:8787"
- ❌ Empty GOOGLE_CLIENT_ID
- ❌ Missing APPLE_TEAM_ID
- ❌ Secrets not set in production

**Pass Criteria:**
- ✓ No localhost URLs in production config
- ✓ All required vars populated or set as secrets
- ✓ Callback URLs match OAuth app configuration

---

### Test 3.4: Error Codes in Login Modal

**When:** OAuth callback fails  
**Expected:** User sees helpful error messages

**Error code mappings (login-modal.js):**
```javascript
{
  oauth_unavailable: 'OAuth is not configured. Please sign in with email and password.',
  // Other errors:
  state_invalid: 'Your sign-in session expired. Please try again.',
  provider_error: 'The OAuth provider returned an error. Please try again.',
  token_exchange_failed: 'Unable to verify your identity. Please try again.',
  id_token_invalid: 'Unable to verify your identity. Please try again.',
  account_link_failed: 'Unable to create or link your account. Please try again.',
  email_missing: 'Your OAuth provider did not return an email. Please sign in another way.',
}
```

**Test Steps:**
1. Trigger each error (manually or via test account):
   - Valid state, invalid code → provider_error
   - Valid code, modified token → id_token_invalid
   - No email in OAuth response → email_missing
2. Verify error message displays in login modal

**Pass Criteria:**
- ✓ All error codes return 302 redirect (not 500)
- ✓ Error param in redirect URL matches above list
- ✓ User sees non-technical error message

---

## Test Checklist

### Part 1: Local Testing (Blocked - Requires .dev.vars)
- [ ] Test 1.1: OAuth unavailable error flows
- [ ] Test 1.2: OAuth state created in D1
- [ ] Test 1.3: OAuth state expiration cleanup
- [ ] Test 1.4: Invalid state callback (no 500)
- [ ] Test 1.5: Missing code/state in callback (no 500)

### Part 2: Production Smoke Tests (After Secrets Configured)
- [ ] Test 2.1: Google OAuth redirect URL correct
- [ ] Test 2.2: Google OAuth callback → session + user
- [ ] Test 2.3: Apple OAuth flow similar to Google
- [ ] Test 2.4: Password login still works
- [ ] Test 2.5: Passkey flows still work

### Part 3: Regression Checks
- [ ] Test 3.1: No CSP violations on OAuth pages
- [ ] Test 3.2: No Turnstile on OAuth routes
- [ ] Test 3.3: No localhost URLs in production config
- [ ] Test 3.4: OAuth errors show user-friendly messages

---

## Failure Scenarios & Debug Guide

### Scenario: Worker returns 500 on /api/auth/oauth/google/start

**Debug Steps:**
1. Check Worker logs:
   ```bash
   wrangler tail -e production
   ```
2. Look for requestId from the failed request
3. Check for:
   - `Database binding not available` → DB config issue
   - `GOOGLE_CLIENT_ID` undefined → Env var missing
   - SQL error in state creation → Migration missing

**D1 Migration Check:**
```bash
# Verify migration 0013 was run
npx wrangler d1 execute wy --command "SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_states'"
```

**Expected Output:**
```
┌─────────────┐
│ name        │
├─────────────┤
│ oauth_states│
└─────────────┘
```

If missing, run:
```bash
npx wrangler d1 migrations apply wy --remote
```

---

### Scenario: Google redirects back with error=invalid_client

**Cause:** GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET mismatch  
**Fix:**
1. Verify Google OAuth app credentials
2. Confirm secret matches in Cloudflare Workers secrets
3. Check redirect URI matches exactly in Google Console

---

### Scenario: Session not created after callback

**Debug:**
1. Check if user/profile tables exist:
   ```bash
   npx wrangler d1 execute wy --command "SELECT COUNT(*) FROM user"
   ```
2. Check if oauth_accounts row was created:
   ```bash
   npx wrangler d1 execute wy --command "SELECT * FROM oauth_accounts LIMIT 1"
   ```
3. Check if session cookie is in response:
   ```bash
   curl -v https://grassrootsmvt.org/api/auth/oauth/google/callback?...
   # Look for Set-Cookie header
   ```

---

## Next Steps

1. **Set secrets:**
   ```bash
   wrangler secret put GOOGLE_CLIENT_SECRET
   wrangler secret put APPLE_PRIVATE_KEY
   ```

2. **Update .dev.vars** (local testing only):
   ```env
   GOOGLE_CLIENT_ID=your-test-client-id
   GOOGLE_CLIENT_SECRET=your-test-secret
   APPLE_CLIENT_ID=your-test-apple-id
   APPLE_TEAM_ID=your-team-id
   APPLE_KEY_ID=your-key-id
   APPLE_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"
   ```

3. **Deploy migration:**
   ```bash
   npx wrangler d1 migrations apply wy --remote
   ```

4. **Deploy worker:**
   ```bash
   wrangler deploy -e production
   ```

5. **Run Part 2 smoke tests** on production

---

## References

- OAuth State: [public/js/login-modal.js](public/js/login-modal.js#L411-L415)
- OAuth Handlers: [src/worker.js](src/worker.js#L1202-L1400)
- OAuth Tables: [db/migrations/0013_oauth_tables.sql](db/migrations/0013_oauth_tables.sql)
- Button Elements: [public/partials/footer.html](public/partials/footer.html#L27-L31)
