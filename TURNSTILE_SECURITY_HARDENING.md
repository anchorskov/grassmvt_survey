<!-- TURNSTILE_SECURITY_HARDENING.md -->
# Cloudflare Turnstile Integration - Security & Debugging

## Overview

This project uses Cloudflare Turnstile for bot prevention on signup and login endpoints. This document covers setup, configuration, debugging, and production safety.

---

## Configuration

### Site Key (Public)
- **Storage:** `wrangler.jsonc` in `[vars]` section (environment-specific)
- **Access:** Sent to frontend via `/api/auth/turnstile` endpoint
- **Required Hostnames:** Must be registered in Cloudflare Turnstile dashboard for:
  - Local: `localhost:8787`, `127.0.0.1:8787`
  - Remote: `grassmvtsurvey-production.anchorskov.workers.dev`
  - Custom domains: Add any production domains to Turnstile widget settings

### Secret Key (Private)
- **Storage:** Wrangler secrets vault (never in files)
- **Setup Command:**
  ```bash
  wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.jsonc
  # For production:
  wrangler secret put TURNSTILE_SECRET_KEY --env production --config wrangler.jsonc
  ```
- **Verification:** `wrangler secret list --config wrangler.jsonc`

### Environment Variables
- **TURNSTILE_SITE_KEY:** Public site key (in wrangler.jsonc [vars])
- **TURNSTILE_SECRET_KEY:** Private secret (via wrangler secret)
- **TURNSTILE_BYPASS:** Set to 'true' for local development only (respects ENVIRONMENT=local)
- **ENVIRONMENT:** Must be set to 'production' to disable bypass (security)

---

## Verification Logic

### Server-Side (src/worker.js)

**Bypass Decision:**
```javascript
const shouldBypassTurnstile = (env) => {
  const isLocal = isLocalEnv(env);
  const bypassEnabled = (env.TURNSTILE_BYPASS || '').toLowerCase() === 'true';
  const isProduction = (env.ENVIRONMENT || '').toLowerCase() === 'production';
  // Never bypass in production, even if flag is set
  if (isProduction) {
    return false;
  }
  return isLocal && bypassEnabled;
};
```

**Verification Flow:**
1. Check if bypass is enabled (local dev only)
2. Validate token is present
3. Validate TURNSTILE_SECRET_KEY is configured
4. POST token to `https://challenges.cloudflare.com/turnstile/v0/siteverify`
5. Return error codes and log Cloudflare error details server-side only

**Error Codes Returned:**
- `TURNSTILE_TOKEN_MISSING` - No token in request
- `TURNSTILE_MISCONFIGURED` - Secret key not set (production error)
- `TURNSTILE_VALIDATION_FAILED` - Cloudflare validation returned false
- `TURNSTILE_API_ERROR` - Network error calling Turnstile API

### Client-Side (public/js/auth.js)

**Debug Output:**
- Runs only on localhost/127.0.0.1
- Console logs: token presence (yes/no), token length (not the token itself)
- Console logs: widget errors, bypass mode, submission results
- View in browser DevTools: F12 > Console

**Widget Events:**
- `callback`: Token received (logs length only)
- `error-callback`: Widget validation failed
- `expired-callback`: Token expired

**Form Submission:**
1. Fetch Turnstile config from `/api/auth/turnstile`
2. Check if token present (or bypass enabled)
3. Send POST with `turnstileToken` field in JSON body
4. Log response code and error message (no tokens/secrets)

---

## Production Safety Checks

### Startup Check
If `ENVIRONMENT=production` and `TURNSTILE_SECRET_KEY` is missing:
- All requests return HTTP 500
- Response: `{ error: 'Server configuration error.', code: 'TURNSTILE_MISCONFIGURED' }`
- Server log: `[ERROR] Production environment requires TURNSTILE_SECRET_KEY to be set via wrangler secret put`

### Bypass Enforcement
- Bypass is disabled in production, even if `TURNSTILE_BYPASS=true` is set
- Production always requires valid Turnstile token
- Cannot be overridden by environment variables

### Audit Logging
All Turnstile verification attempts are logged to `audit_events` table:
- `eventType: 'signup_failed'` or `'login_failed'`
- `metadata.reason: 'turnstile_failed'`
- `metadata.code: <error code>`
- Tokens and secrets are never logged

---

## Debugging Checklist

### Widget Not Rendering
1. Open browser DevTools: F12 > Console
2. Look for: `[Auth Debug] Turnstile...` messages
3. Check `/api/auth/turnstile` returns `siteKey` (not empty)
4. Check Turnstile script loaded: verify `window.turnstile` exists
5. Check container ID matches form type: `turnstile-signup` or `turnstile-login`

### Widget Rendering but Token Not Submitting
1. Check DevTools Console: `[Auth Debug] Turnstile token received, length: XXX`
2. If no token message: widget callback never fired (widget validation pending)
3. If token message: check form submission doesn't clear token
4. Try completing the widget challenge (click, puzzle, etc.)

### Signup/Login Fails with "Unable to verify request"
1. Check response code in DevTools Network tab
2. Response JSON shows `code: 'TURNSTILE_...'`
3. If `TURNSTILE_TOKEN_MISSING`: widget didn't produce token
4. If `TURNSTILE_VALIDATION_FAILED`: token invalid or expired
5. If `TURNSTILE_MISCONFIGURED`: secret key not set (production error)
6. If `TURNSTILE_API_ERROR`: Turnstile service unreachable

### Server-Side Logging
Local dev (see console):
```bash
npx wrangler dev --local --config wrangler.jsonc 2>&1 | grep Turnstile
```

Production (check Cloudflare Workers dashboard logs):
- Dashboard: https://dash.cloudflare.com/?to=/:account/workers/view/...
- Or: `wrangler tail --env production`

---

## Testing

### Local Development
1. Start worker:
   ```bash
   npx wrangler dev --local --config wrangler.jsonc
   ```
2. Open http://localhost:8787
3. Click "Sign in"
4. With TURNSTILE_BYPASS=true: widget should not appear, form submits directly
5. Open DevTools Console: should see `[Auth Debug] Turnstile bypass enabled (local dev mode)`

### Local Testing with Real Turnstile Widget
1. Edit .dev.vars: set `TURNSTILE_BYPASS=false`
2. Restart worker
3. Open http://localhost:8787
4. Click "Sign in"
5. Widget should appear and require challenge completion
6. DevTools Console: `[Auth Debug] Turnstile token received, length: XXX`
7. Fill form and submit to test verification flow

### Remote Testing (Production)
1. Open https://grassmvtsurvey-production.anchorskov.workers.dev in browser
2. Click "Sign in"
3. Widget should appear (no bypass in production)
4. Complete Turnstile challenge
5. Enter email and password
6. Click signup/login
7. Monitor Network tab: POST /api/auth/signup or /api/auth/login
8. Check response for `"ok": true` or error code

### Verify Secret Key is Set
```bash
# List secrets (shows names only, not values)
wrangler secret list --config wrangler.jsonc

# Output should include:
# TURNSTILE_SECRET_KEY

# For production:
wrangler secret list --env production --config wrangler.jsonc
```

### Verify Site Key Configuration
```bash
# Local dev
curl -s http://localhost:8787/api/auth/turnstile | jq .

# Remote
curl -s https://grassmvtsurvey-production.anchorskov.workers.dev/api/auth/turnstile | jq .

# Both should return:
# {
#   "siteKey": "0x4AAAAAACUGQXNTcuo9SlgJ",
#   "bypass": false   (or true for local with bypass enabled)
# }
```

---

## Required Hostnames in Turnstile Dashboard

Register these hostnames in your Cloudflare Turnstile widget settings:

| Environment | Hostname | Notes |
|-------------|----------|-------|
| Local Dev | localhost:8787 | For local development with real widget |
| Local Dev | 127.0.0.1:8787 | Alternative localhost IP |
| Remote | grassmvtsurvey-production.anchorskov.workers.dev | Production Workers domain |
| Custom | yourdomains.com | Any custom domains pointing to Worker |

**Important:** Turnstile widget will only work on registered hostnames. If widget appears but doesn't load (blank), check that your current hostname is registered.

---

## CSP (Content Security Policy)

This project does NOT currently set a strict CSP header. If CSP is added in the future, include:

```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' https://challenges.cloudflare.com;
  frame-src https://challenges.cloudflare.com;
  connect-src 'self' https://challenges.cloudflare.com;
```

---

## Error Reference

| Code | HTTP | Meaning | Action |
|------|------|---------|--------|
| `TURNSTILE_TOKEN_MISSING` | 403 | No token in request body | Widget didn't produce token - check widget console logs |
| `TURNSTILE_MISCONFIGURED` | 403/500 | Secret key not set | Run `wrangler secret put TURNSTILE_SECRET_KEY` |
| `TURNSTILE_VALIDATION_FAILED` | 403 | Cloudflare rejected token | Token invalid, expired, or wrong domain - retry widget |
| `TURNSTILE_API_ERROR` | 403 | Network error to Turnstile | Transient service issue - retry in a moment |

---

## Files Changed

| File | Change | Why |
|------|--------|-----|
| `src/worker.js` | Enhanced `verifyTurnstile()` with error codes and logging | Diagnosable failures, production safety |
| `src/worker.js` | Added production environment check in fetch handler | Prevent misconfiguration in production |
| `public/js/auth.js` | Added debug logging for token presence and flow | Browser console visibility for troubleshooting |
| `wrangler.jsonc` | Already has site key in [vars] for both environments | Required for deployment |
| `.dev.vars` | Placeholder for secret key (local dev) | Local testing with real Turnstile |

---

## Summary

- **Site Key:** Public, in wrangler.jsonc [vars]
- **Secret Key:** Private, set via `wrangler secret put` (never in files)
- **Bypass:** Disabled in production, always requires valid token
- **Debugging:** Use browser console logs (localhost only) and audit tables
- **Hostnames:** Register all domains in Turnstile dashboard
- **Production Safety:** Server returns 500 if secret key missing

