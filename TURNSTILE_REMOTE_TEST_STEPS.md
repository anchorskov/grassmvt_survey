<!-- TURNSTILE_REMOTE_TEST_STEPS.md -->
# Remote Turnstile Testing Checklist

## Quick Verification

### Verify Secret Key is Set in Production
```bash
wrangler secret list --env production --config wrangler.jsonc
```

Expected output includes:
```
TURNSTILE_SECRET_KEY
```

### Verify Site Key Configuration
```bash
curl -s https://grassmvtsurvey-production.anchorskov.workers.dev/api/auth/turnstile | jq .
```

Expected output:
```json
{
  "siteKey": "0x4AAAAAACUGQXNTcuo9SlgJ",
  "bypass": false
}
```

---

## Full Remote Test (Browser)

### Step 1: Access Remote URL
1. Open new browser window
2. Navigate to: https://grassmvtsurvey-production.anchorskov.workers.dev
3. Confirm page loads (you should see survey list)

### Step 2: Open Sign In Modal
1. Click "Sign in" button (top right)
2. Auth modal should appear
3. Check for Turnstile widget in the modal (usually below email/password fields)

### Step 3: Verify Widget Renders
1. Widget should show Cloudflare challenge (checkbox, puzzle, etc.)
2. It should NOT show "Turnstile is not configured" error
3. If widget missing:
   - Open DevTools (F12)
   - Check Console for errors
   - Verify https://challenges.cloudflare.com is accessible
   - Check hostname is registered in Turnstile dashboard

### Step 4: Complete Challenge
1. Interact with widget (check box, complete puzzle, etc.)
2. Wait for token to be generated (widget changes appearance when done)
3. Open DevTools Console
4. No console errors should appear

### Step 5: Fill Out Form
1. Enter test email: `testuser123@example.com`
2. Enter password: `TempPassword123456` (must be 12+ chars)
3. Keep "Create account" tab selected (or use "Sign in" if you have existing account)

### Step 6: Submit Form
1. Click "Sign in" or "Create account" button
2. Watch Network tab in DevTools:
   - Should see POST request to `/api/auth/signup` or `/api/auth/login`
   - Status should be 200 (success) or 4xx (validation error)

### Step 7: Check Success
- If successful:
  - Modal closes
  - "Signed in" state appears
  - User row created in database
  - Session cookie set (check Cookies in DevTools)
  
- If fails with "Unable to verify request":
  - Check response in Network tab for error `code`
  - See Error Code Reference below

### Step 8: Verify Session
1. Open new DevTools Console tab
2. Run: `fetch('/api/auth/me', {credentials: 'include'}).then(r => r.json()).then(console.log)`
3. Should return: `{ authenticated: true, user: { email: 'testuser123@example.com' } }`

### Step 9: Logout
1. Click logout button in modal
2. Confirm modal closes and "Sign in" button returns
3. Run auth/me check again - should return `authenticated: false`

---

## Error Code Reference

If signup/login fails, check the error response:

| Code | Meaning | Next Step |
|------|---------|-----------|
| `TURNSTILE_TOKEN_MISSING` | Widget didn't produce token | Check DevTools Console for widget errors, retry challenge |
| `TURNSTILE_MISCONFIGURED` | Secret key not set in production | Run `wrangler secret put TURNSTILE_SECRET_KEY --env production` |
| `TURNSTILE_VALIDATION_FAILED` | Token invalid or expired | Token may have expired, refresh page and retry |
| `TURNSTILE_API_ERROR` | Turnstile service unreachable | Transient network issue, retry in a few moments |

---

## Database Verification

After successful signup, verify user created:

```bash
# Connect to remote D1
wrangler d1 execute wy --remote --config wrangler.jsonc --command \
  "SELECT email, created_at FROM user ORDER BY created_at DESC LIMIT 1;"
```

Expected: Shows your test email with timestamp

---

## Debug Console Logs

If testing on localhost, check DevTools Console for debug messages:

```
[Auth Debug] Turnstile bypass enabled (local dev mode)
[Auth Debug] Turnstile token received, length: 301
[Auth Debug] Submitting signup, token present: yes (301 chars)
[Auth Debug] signup successful
```

Production removes these logs (localhost check prevents output).

---

## Hostname Registration

If widget doesn't load (appears blank or errors), hostname may not be registered:

1. Go to https://dash.cloudflare.com/?to=/:account/security/turnstile
2. Click on the Turnstile site
3. Under "Domains", add or verify:
   - `grassmvtsurvey-production.anchorskov.workers.dev`
   - Any custom domains

---

## Troubleshooting

### Widget appears blank
- Check hostname is registered in Turnstile dashboard
- Check browser console for CORS errors
- Verify https://challenges.cloudflare.com is accessible from your network

### Form submits but says "Unable to verify request"
- DevTools Network tab > POST /api/auth/signup
- Look at response JSON for error `code`
- Follow Error Code Reference above

### User not created but form seemed to succeed
- Check Network response code (should be 200 or error)
- Verify email is valid format
- Verify password is 12+ characters
- Check audit_events table for signup_failed entries

### Turnstile says "Invalid sitekey"
- Verify hostname matches Turnstile widget settings
- Check TURNSTILE_SITE_KEY in wrangler.jsonc matches Cloudflare dashboard
- Verify no extra spaces or typos in site key

---

## Success Criteria

All of the following must pass:

- [ ] Widget renders without "not configured" error
- [ ] Challenge can be completed
- [ ] Form submission succeeds (HTTP 200)
- [ ] User row created in database
- [ ] Session cookie set
- [ ] /api/auth/me returns authenticated=true
- [ ] Logout works and clears session
- [ ] Second /api/auth/me returns authenticated=false

---

## Performance Notes

- Turnstile widget loads from `https://challenges.cloudflare.com`
- First load may take 1-2 seconds
- Token generation usually instant after challenge completion
- If page is very slow, check Network tab for failed requests to Cloudflare

---

## Questions?

Check the full guide: [TURNSTILE_SECURITY_HARDENING.md](TURNSTILE_SECURITY_HARDENING.md)

Report issues: Include the response error `code` and any console errors.
