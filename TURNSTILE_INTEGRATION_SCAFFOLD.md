<!-- CLOUDFLARE TURNSTILE INTEGRATION SCAFFOLD -->
<!-- Comprehensive plan for wiring Turnstile keys into grassmvt_survey -->

# CLOUDFLARE TURNSTILE INTEGRATION SCAFFOLD

**Goal:** Wire Cloudflare Turnstile keys into the project for remote testing of signup/login.

---

## CURRENT STATE (SCAN RESULTS)

### A) UI Location
- **Status:** signup/login UI lives in Worker-served assets
- **Modal HTML:** `public/partials/footer.html` (lines 11-60)
  - Contains `auth-modal` with form fields for email, password
  - Has placeholder div: `<div class="form-row" id="auth-modal-turnstile"></div>`
  - Has hidden input for token: `<input type="hidden" id="auth-modal-token" name="turnstileToken" />`
- **JS Handler:** `public/js/auth.js` (188 lines)
  - `fetchTurnstileConfig()` at line 63 calls `/api/auth/turnstile` endpoint
  - `renderTurnstile()` at line 78 renders widget in modal
  - `submitAuth()` at line 120+ sends `turnstileToken` in POST body

### B) Environment Variables
- **Current .dev.vars:** Contains empty placeholders
  ```
  TURNSTILE_SITE_KEY=
  TURNSTILE_SECRET_KEY=
  TURNSTILE_BYPASS=true
  ENVIRONMENT=local
  ```
- **wrangler.jsonc:** No [vars] section yet (needs to be added for site key)

### C) Server-Side Code
- **Turnstile Verification:** `src/worker.js` lines 172-201
  ```javascript
  const shouldBypassTurnstile = (env) =>
    isLocalEnv(env) && (env.TURNSTILE_BYPASS || '').toLowerCase() === 'true';
  
  const verifyTurnstile = async (token, request, env) => {
    if (shouldBypassTurnstile(env)) {
      return { ok: true };  // bypass for local dev
    }
    // ... POST to https://challenges.cloudflare.com/turnstile/v0/siteverify
  ```
- **Integration Points:**
  - `handleAuthSignup()` line 413 calls `verifyTurnstile(turnstileToken, request, env)`
  - `handleAuthLogin()` line 479 calls `verifyTurnstile(turnstileToken, request, env)`
- **Config Endpoint:** `src/worker.js` line 1150-1153
  ```javascript
  if (request.method === 'GET' && pathParts[2] === 'turnstile') {
    return jsonResponse({
      siteKey: env.TURNSTILE_SITE_KEY || '',
      bypass: shouldBypassTurnstile(env),
    });
  ```

---

## IMPLEMENTATION PLAN

### STEP 1: Add Site Key to wrangler.jsonc

**File:** `wrangler.jsonc`

Add a [vars] section at the top level (after "assets" and before "d1_databases"):

```jsonc
  "vars": {
    "TURNSTILE_SITE_KEY": ""
  },
```

**Note:** The site key is public, not secret. It goes in [vars], not [secrets].

---

### STEP 2: Update .dev.vars for Local Development

**File:** `.dev.vars`

Replace the empty TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY placeholders with your actual keys from Cloudflare.

```plaintext
TURNSTILE_SITE_KEY=<your_public_site_key>
TURNSTILE_SECRET_KEY=<your_private_secret_key>
TURNSTILE_BYPASS=true
ENVIRONMENT=local
```

**Important:** Never commit .dev.vars with real keys. It is in .gitignore already.

---

### STEP 3: Set Secret Key Using Wrangler CLI

After you have the TURNSTILE_SECRET_KEY from Cloudflare dashboard:

Run **BOTH** of these commands in your terminal:

```bash
# For local/default environment
wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.jsonc

# For production environment (if you have one)
wrangler secret put TURNSTILE_SECRET_KEY --env production --config wrangler.jsonc
```

When prompted, paste your secret key. It will NOT echo on screen.

---

### STEP 4: Verify Server-Side Code (ALREADY IMPLEMENTED)

The following code is already in place and does NOT need changes:

- **verifyTurnstile() function** (lines 172-201): Handles both bypass for local dev AND remote verification
- **shouldBypassTurnstile()** (lines 172-173): Respects TURNSTILE_BYPASS=true and ENVIRONMENT=local
- **Config endpoint** (lines 1150-1153): Serves site key and bypass flag to frontend
- **Integration in handlers:** Both `handleAuthSignup()` and `handleAuthLogin()` call `verifyTurnstile()`

No code changes needed here. The plumbing is complete.

---

### STEP 5: Verify Frontend Code (ALREADY IMPLEMENTED)

The following code is already in place and does NOT need changes:

- **auth.js fetchTurnstileConfig()** (lines 63-71): Fetches config from `/api/auth/turnstile`
- **auth.js renderTurnstile()** (lines 78-110): Renders widget, handles callbacks
- **auth.js submitAuth()** (lines 120+): Sends `turnstileToken` in POST body
- **footer.html modal**: Has container div with id `auth-modal-turnstile` and hidden token input

No code changes needed here. The UI is ready.

---

## FILES CHANGED SUMMARY

| File | Change | Why |
|------|--------|-----|
| `wrangler.jsonc` | Add [vars] section with TURNSTILE_SITE_KEY | Public key must be accessible to Worker env |
| `.dev.vars` | Update with real keys (local only) | Local development override |
| **NO other files** | **No changes** | All auth handlers, endpoints, and UI already wired |

---

## EXACT WRANGLER COMMANDS TO RUN

Once you have your Turnstile keys from Cloudflare dashboard (https://dash.cloudflare.com/?to=/:account/security/turnstile):

```bash
# Step 1: Set secret for default/local environment
wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.jsonc

# Step 2: Set secret for production environment (if applicable)
wrangler secret put TURNSTILE_SECRET_KEY --env production --config wrangler.jsonc
```

When prompted, paste the secret key (will not echo).

**Then update wrangler.jsonc with the site key value.**

---

## LOCAL DEV TEST CHECKLIST

**Before running:**
1. Update `.dev.vars` with real keys
2. Update `wrangler.jsonc` with TURNSTILE_SITE_KEY value
3. Restart worker: `npx wrangler dev --local --config wrangler.jsonc`

**Tests to run:**

- [ ] **Test 1: Widget Renders**
  - Open http://localhost:8787
  - Click "Sign in" button
  - Confirm Turnstile widget appears in modal
  - (With TURNSTILE_BYPASS=true, widget may auto-pass)

- [ ] **Test 2: Signup Success**
  - Enter valid email (e.g., test@example.com)
  - Enter password (12+ chars, e.g., TestPass1234)
  - Click signup tab, submit form
  - Confirm page shows "Sign in" button changed to "Signed in" state
  - Check browser DevTools: should see session cookie set

- [ ] **Test 3: Auth State Verified**
  - Refresh page
  - Confirm still shows "Signed in" state
  - Confirm `/api/auth/me` returns authenticated=true and email

- [ ] **Test 4: Logout Works**
  - Click logout button
  - Confirm page returns to "Sign in" button
  - Confirm `/api/auth/me` returns authenticated=false
  - Confirm session cookie deleted

- [ ] **Test 5: Login with Existing User**
  - Use same email from Test 2
  - Enter correct password
  - Confirm login success
  - Confirm `/api/auth/me` shows correct email

---

## REMOTE TESTING (PRODUCTION PREVIEW)

To test on your Cloudflare Pages preview URL:

1. Deploy with `wrangler deploy --env production`
2. Visit preview URL
3. Follow same checklist as Local Dev
4. Confirm Turnstile widget renders (not bypassed in production)
5. Confirm widget validates before form submission succeeds

---

## BYPASS BEHAVIOR REFERENCE

**Local environment (ENVIRONMENT=local and TURNSTILE_BYPASS=true):**
- Frontend `/api/auth/turnstile` returns `bypass: true`
- Frontend does NOT render widget (automatic pass)
- Backend `verifyTurnstile()` skips API call to Cloudflare

**Remote/Production environment:**
- Frontend `/api/auth/turnstile` returns `bypass: false`
- Frontend renders interactive Turnstile widget
- Backend `verifyTurnstile()` validates token with Cloudflare API
- Invalid tokens rejected with 403

---

## NOTES

- Site key (TURNSTILE_SITE_KEY) is public and goes in [vars]
- Secret key (TURNSTILE_SECRET_KEY) is private and goes in Wrangler secrets, never in files
- Server-side verification is already implemented and cannot be bypassed in production
- Modal HTML already has correct container IDs and input names
- Frontend already sends turnstileToken in auth requests
- No changes to src/worker.js auth handlers needed
