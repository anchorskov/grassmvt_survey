<!-- TURNSTILE SETUP CHECKLIST & REFERENCE -->
# TURNSTILE SETUP CHECKLIST & COMMAND REFERENCE

**Status:** Ready to integrate. All server-side and UI code is already wired.

---

## QUICK START (5 MINUTES)

### Get Keys from Cloudflare
1. Go to https://dash.cloudflare.com/?to=/:account/security/turnstile
2. Click "Add site" or create new Turnstile domain
3. Copy **Site Key** (public) and **Secret Key** (private)

### Update Local Config
1. Edit `wrangler.jsonc`: Set TURNSTILE_SITE_KEY value in [vars] section
2. Edit `.dev.vars`: Set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY

### Set Secret Key Remotely
Run these commands in terminal from project root:

```bash
# For local/default environment
wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.jsonc
# (paste secret when prompted - it won't echo)

# For production environment  
wrangler secret put TURNSTILE_SECRET_KEY --env production --config wrangler.jsonc
# (paste secret when prompted - it won't echo)
```

### Test
```bash
# Restart worker
npx wrangler dev --local --config wrangler.jsonc

# Open browser
# http://localhost:8787
# Click "Sign in" and verify Turnstile widget appears
```

---

## CONFIGURATION REFERENCE

### wrangler.jsonc
Location: Top level, after "assets" section

```jsonc
  "vars": {
    "TURNSTILE_SITE_KEY": "<your_public_site_key_here>"
  },
```

Status: UPDATED with empty value, ready for your site key

### .dev.vars
Location: Project root (never commit with real keys)

```plaintext
TURNSTILE_SITE_KEY=<your_public_site_key>
TURNSTILE_SECRET_KEY=<your_private_secret_key>
TURNSTILE_BYPASS=true
ENVIRONMENT=local
```

Status: Already has placeholders, ready to fill in

---

## EXACT WRANGLER COMMANDS

**Copy and paste these after getting keys from Cloudflare:**

```bash
# 1. Set secret for default environment (local dev & preview)
wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.jsonc

# 2. Set secret for production environment
wrangler secret put TURNSTILE_SECRET_KEY --env production --config wrangler.jsonc

# 3. Verify secrets are set (shows names, not values)
wrangler secret list --config wrangler.jsonc
wrangler secret list --env production --config wrangler.jsonc
```

---

## FILE CHANGES SUMMARY

| File | Status | Change | Reason |
|------|--------|--------|--------|
| `wrangler.jsonc` | DONE | Added [vars] section with TURNSTILE_SITE_KEY | Site key must be in environment |
| `.dev.vars` | READY | Has placeholders, awaiting keys | Local override for site + secret |
| `TURNSTILE_INTEGRATION_SCAFFOLD.md` | NEW | Full implementation documentation | Reference guide |
| `setup-turnstile.sh` | NEW | Interactive setup guide | Quick reference |
| `src/worker.js` | NO CHANGE | Already wired (lines 172-201, 1150-1153) | Auth handlers already integrated |
| `public/js/auth.js` | NO CHANGE | Already renders widget (lines 63-110) | UI already integrated |
| `public/partials/footer.html` | NO CHANGE | Already has modal containers | UI already ready |

---

## BEHAVIOR BY ENVIRONMENT

### Local Development
- **ENVIRONMENT=local** and **TURNSTILE_BYPASS=true**
- Widget does not render
- Form submission succeeds without Turnstile validation
- Useful for rapid testing

### Remote Dev (Preview URL)
- **ENVIRONMENT not set to local** OR **TURNSTILE_BYPASS not true**
- Widget renders and validates
- Form submission requires valid Turnstile token
- Good for testing production behavior locally

### Production
- **No bypass active**
- Widget renders
- All form submissions validated against Cloudflare API
- Highest security

---

## TEST CHECKLIST

After setup, run these tests:

- [ ] Widget renders when opening signup/login modal
- [ ] Typing email and password shows form is active
- [ ] Submitting signup form shows success or error message
- [ ] `/api/auth/me` endpoint returns authenticated user
- [ ] Logout button works and clears session
- [ ] Page refresh maintains session state
- [ ] Invalid credentials show error message

---

## TROUBLESHOOTING

### "Turnstile is not configured"
- Check TURNSTILE_SITE_KEY is set in wrangler.jsonc [vars] section
- Check .dev.vars has TURNSTILE_SITE_KEY value
- Restart worker after changes

### Widget renders but says "Failed to verify"
- Check TURNSTILE_SECRET_KEY is set via `wrangler secret put`
- Verify secret key is correct in Cloudflare dashboard
- Check that /api/auth/turnstile endpoint is responding with siteKey

### Widget not loading at all
- Confirm Turnstile script is loaded: check browser console
- Verify window.turnstile object exists
- Check .dev.vars has TURNSTILE_BYPASS=true for local bypass

### Form submits but auth fails silently
- Open browser DevTools Network tab
- Check POST /api/auth/signup or /api/auth/login response
- Look for error message in response body
- Check audit events in database if available

---

## PRODUCTION DEPLOY STEPS

When ready to deploy to production:

1. Get production Turnstile site key from Cloudflare dashboard
2. Update wrangler.jsonc [vars] TURNSTILE_SITE_KEY
3. Run: `wrangler secret put TURNSTILE_SECRET_KEY --env production --config wrangler.jsonc`
4. Run: `wrangler deploy --env production`
5. Test on preview URL before promoting to production

---

## SECURITY NOTES

- **Site Key:** Public, stored in environment variables, visible in browser
- **Secret Key:** Private, stored in Wrangler secrets vault, NEVER in files
- **Bypass:** Only active in local dev with TURNSTILE_BYPASS=true
- **Production:** Bypass is disabled, all requests validated
- **.dev.vars:** In .gitignore, never commit with real keys
- **Rotation:** Can rotate keys in Cloudflare dashboard anytime

---

## REFERENCE LINKS

- Cloudflare Turnstile Dashboard: https://dash.cloudflare.com/?to=/:account/security/turnstile
- Turnstile Docs: https://developers.cloudflare.com/turnstile/
- Wrangler Secrets Guide: https://developers.cloudflare.com/workers/platform/environment-variables/#adding-secrets
- Worker Auth Code: `src/worker.js` lines 172-201 (verifyTurnstile)
- Frontend Code: `public/js/auth.js` lines 63-110 (widget rendering)
