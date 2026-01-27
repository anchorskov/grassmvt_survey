<!-- FINAL COMMAND REFERENCE -->
# CLOUDFLARE TURNSTILE - FINAL SETUP COMMANDS

Copy and paste these commands when ready. No secret keys in this file.

---

## WHAT WAS ALREADY DONE

Status: **Files updated and ready**

- [x] `wrangler.jsonc` - Added [vars] section with TURNSTILE_SITE_KEY placeholder
- [x] `TURNSTILE_INTEGRATION_SCAFFOLD.md` - Full technical documentation
- [x] `TURNSTILE_SETUP_CHECKLIST.md` - Setup guide and reference
- [x] `setup-turnstile.sh` - Interactive helper script
- [x] `src/worker.js` - Already has server-side verification (no changes needed)
- [x] `public/js/auth.js` - Already renders widget (no changes needed)
- [x] `public/partials/footer.html` - Already has modal containers (no changes needed)

---

## THREE SIMPLE STEPS

### STEP 1: Get Keys from Cloudflare
1. Visit: https://dash.cloudflare.com/?to=/:account/security/turnstile
2. Create a new Turnstile site (or use existing)
3. Copy the **Site Key** (public)
4. Copy the **Secret Key** (private)

### STEP 2: Update Local Files
Edit `wrangler.jsonc` line 13:
```jsonc
"TURNSTILE_SITE_KEY": "your_public_site_key_here"
```

Edit `.dev.vars` to add your keys:
```plaintext
TURNSTILE_SITE_KEY=your_public_site_key_here
TURNSTILE_SECRET_KEY=your_private_secret_key_here
TURNSTILE_BYPASS=true
ENVIRONMENT=local
```

### STEP 3: Run These Commands

**For default/local environment:**
```bash
wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.jsonc
```
When prompted, paste your secret key (it won't echo on screen)

**For production environment (if applicable):**
```bash
wrangler secret put TURNSTILE_SECRET_KEY --env production --config wrangler.jsonc
```
When prompted, paste your secret key

**Verify secrets are set:**
```bash
wrangler secret list --config wrangler.jsonc
```

---

## THEN TEST

```bash
# Restart the worker
npx wrangler dev --local --config wrangler.jsonc

# Open in browser
open http://localhost:8787
# Or paste in browser: http://localhost:8787

# Test checklist:
# 1. Page loads
# 2. Click "Sign in" button
# 3. Confirm Turnstile widget appears in modal
# 4. Fill email (test@example.com) and password (TestPass1234)
# 5. Submit - should succeed with "Signed in" state
# 6. Refresh page - should stay signed in
# 7. Click logout - should return to sign in
```

---

## FILES CHANGED

Only 1 file was modified:

```
wrangler.jsonc - Added [vars] section (line 13-16)
```

Created 3 new reference documents:
```
TURNSTILE_INTEGRATION_SCAFFOLD.md - Full technical guide
TURNSTILE_SETUP_CHECKLIST.md - Setup checklist and troubleshooting  
TURNSTILE_FINAL_COMMANDS.md - This file
```

No server-side code changes needed. Auth handlers are already wired.

---

## KEY POINTS

- Site Key: Public, goes in wrangler.jsonc [vars] and .dev.vars
- Secret Key: Private, set via `wrangler secret put` (never in files)
- Bypass: Works in local dev only (TURNSTILE_BYPASS=true)
- Remote: Production disables bypass, enforces validation
- Modal: Already has widget container and token input field
- Handlers: Already call verifyTurnstile() before allowing signup/login

---

## THAT'S IT!

Once you run the wrangler commands with your secret key, Turnstile is live.
