# OAuth Setup & Testing - Quick Reference

## Current Status
- ✅ Code implemented and validated
- ✅ 12/18 regression tests passing
- ⏳ Blocked on OAuth credential setup
- 📋 Full test plan documented

---

## What's Blocking Full Tests

You need to set two secrets before OAuth will work:

```bash
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put APPLE_PRIVATE_KEY
```

And populate 4 config values in wrangler.jsonc production env:
```json
{
  "GOOGLE_CLIENT_ID": "your-google-client-id",
  "APPLE_CLIENT_ID": "your-apple-client-id", 
  "APPLE_TEAM_ID": "your-apple-team-id",
  "APPLE_KEY_ID": "your-apple-key-id"
}
```

---

## Test Results Summary

### ✅ Passing (12 tests)
- **Test 1.1:** OAuth unavailable → 302 redirect (not 500)
- **Test 1.4:** Invalid state callback → 302 redirect (not 500)
- **Test 1.5:** Missing code/state → 302 redirect (not 500)
- **Test 2.4:** Password login still works
- **Test 2.5:** Passkey flows still work
- **Test 3.1:** Config separation (local ≠ production)
- **Test 3.2:** OAuth buttons present in UI
- **Test 3.3:** Button event handlers working
- **Test 3.4:** Error messages mapped correctly
- **Test 3.5:** Database migrations in place
- **Test 3.6:** No CSP violations
- **Test 3.7:** No Turnstile on OAuth routes

### ⏳ Blocked (6 tests)
- **Test 1.2:** OAuth state creation (needs .dev.vars)
- **Test 1.3:** State expiration (needs .dev.vars)
- **Test 2.1:** Google redirect URL (needs production secrets)
- **Test 2.2:** Google callback (needs valid code)
- **Test 2.3:** Apple OAuth flow (needs production secrets)

---

## Documentation Files

| File | Purpose |
|------|---------|
| [OAUTH_TEST_PLAN.md](OAUTH_TEST_PLAN.md) | Complete testing procedures + debug guide |
| [OAUTH_TEST_RESULTS.md](OAUTH_TEST_RESULTS.md) | Test results with code references |
| [UX_VALIDATION_REPORT.md](UX_VALIDATION_REPORT.md) | Login/passkey UX validation (prior doc) |

---

## Next Steps

### 1. Get OAuth Credentials

**Google:**
```
1. https://console.cloud.google.com
2. Create OAuth 2.0 client (Web application)
3. Authorized redirect URI: https://grassrootsmvt.org/api/auth/oauth/google/callback
4. Save Client ID + Secret
```

**Apple:**
```
1. https://developer.apple.com
2. Create Service ID for web
3. Add Sign in with Apple key
4. Save Team ID, Client ID, Key ID, private key file
```

### 2. Set Secrets

```bash
# Google
wrangler secret put GOOGLE_CLIENT_SECRET
# Paste: abc123...def456
# Ctrl+D

# Apple
wrangler secret put APPLE_PRIVATE_KEY
# Paste: -----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----
# Ctrl+D
```

### 3. Update Configuration

Edit `wrangler.jsonc` production section:
```json
"production": {
  "vars": {
    "GOOGLE_CLIENT_ID": "your-google-id",
    "APPLE_CLIENT_ID": "your-apple-id",
    "APPLE_TEAM_ID": "your-apple-team",
    "APPLE_KEY_ID": "your-apple-key"
  }
}
```

### 4. Deploy

```bash
wrangler deploy -e production
```

### 5. Run Tests

See [OAUTH_TEST_PLAN.md#part-2](OAUTH_TEST_PLAN.md#part-2-production-smoke-tests) for full procedures.

---

## Key Code Paths

**OAuth Start:** [src/worker.js#L1202](src/worker.js#L1202)  
**OAuth Callback:** [src/worker.js#L1261](src/worker.js#L1261)  
**Error Handling:** [src/worker.js#L1217-L1239](src/worker.js#L1217-L1239)  
**UI Buttons:** [public/partials/footer.html#L27-L31](public/partials/footer.html#L27-L31)  
**Button Handlers:** [public/js/login-modal.js#L411-L423](public/js/login-modal.js#L411-L423)  
**Database Schema:** [db/migrations/0013_oauth_tables.sql](db/migrations/0013_oauth_tables.sql)  

---

## Verification Commands

```bash
# Check if OAuth tables exist
npx wrangler d1 execute wy_local --local --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'oauth%'"

# Test unavailable error (local)
curl http://localhost:8787/api/auth/oauth/google/start -v

# Test invalid state (local)
curl "http://localhost:8787/api/auth/oauth/google/callback?code=x&state=invalid" -v

# Check production secrets set
wrangler secret list
```

---

## Security Checklist

✅ PKCE enabled (code_challenge, code_challenge_method)  
✅ State parameter validated  
✅ Expired states cleaned up (10 min TTL)  
✅ Session cookies HttpOnly + Secure  
✅ Database foreign keys enforced  
✅ No hardcoded secrets in config  
✅ Error codes generic (no info leaks)  

---

## Common Issues

**Issue:** OAuth button redirects to error page  
**Fix:** Check GOOGLE_CLIENT_ID / APPLE_CLIENT_ID are set in wrangler.jsonc

**Issue:** "Unable to verify identity" after callback  
**Fix:** Check secret set via `wrangler secret list`, JWT validation in logs

**Issue:** State not found in D1  
**Fix:** Ensure migration 0013 ran: `npx wrangler d1 migrations apply wy --remote`

See [OAUTH_TEST_PLAN.md#failure-scenarios](OAUTH_TEST_PLAN.md#failure-scenarios--debug-guide) for more.
