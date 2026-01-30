# Passkey Login Testing: Complete Toolkit ✅

## What's Been Created

You now have a complete debug toolkit for testing and fixing passkey login 400 errors. Here's what to do **right now**:

---

## 🎯 IMMEDIATE NEXT STEPS

### 1. **Open Browser Test (5-10 minutes)**
Follow this guide: [PASSKEY_BROWSER_TEST.md](PASSKEY_BROWSER_TEST.md)

Steps:
1. Sign up at http://localhost:8787/auth/signup
2. Add a passkey (go to Account page)
3. Complete device authentication (Face ID, Touch ID, Windows Hello, etc.)
4. Logout
5. Try passkey login
6. Check DevTools Console: `window.PasskeyDebug.getLogs()`

### 2. **If You See a 400 Error**
- Open DevTools Console (F12)
- Run: `window.PasskeyDebug.getLogs()`
- Look for entries with `status: 400` or `code: UNKNOWN_CREDENTIAL`
- **Share the output** with the team

### 3. **If Login Works**
- You have a clean baseline ✅
- The debug helper is running and logging everything
- Monitor with: `window.PasskeyDebug.getLogs()` anytime

---

## 📦 Deliverables Summary

| File | Purpose | Use When |
|------|---------|----------|
| [PASSKEY_BROWSER_TEST.md](PASSKEY_BROWSER_TEST.md) | Step-by-step browser test | You want to manually reproduce 400 errors |
| [PASSKEY_DEBUG_QUICKSTART.md](PASSKEY_DEBUG_QUICKSTART.md) | Quick reference guide | You need to debug quickly |
| [PASSKEY_TEST_PLAN.md](PASSKEY_TEST_PLAN.md) | Comprehensive test plan | You want to test all scenarios |
| [PASSKEY_SERVER_NORMALIZATION.md](PASSKEY_SERVER_NORMALIZATION.md) | Server-side fix guide | You need to fix ArrayBuffer issues |
| [public/js/passkey-debug.js](public/js/passkey-debug.js) | Debug helper | Automatically logs passkey flow ✅ **ALREADY ENABLED** |
| [test-passkey-flow.sh](test-passkey-flow.sh) | Bash test script | You want API-level tests |

---

## ✅ What's Already Done

### Debug Helper: NOW ACTIVE
- ✅ `public/js/passkey-debug.js` created and working
- ✅ Automatically loaded in `/auth/login` page
- ✅ Automatically loaded in `/auth/signup` page
- ✅ Zero configuration needed

**Access it anytime:**
```javascript
// In browser DevTools console:
window.PasskeyDebug.getLogs()           // All captured events
window.PasskeyDebug.getLastError()      // Last error
window.PasskeyDebug.clearLogs()         // Clear history
```

### Test Scripts: READY
- ✅ `test-passkey-flow.sh` — API-level tests
  - Signup ✓
  - Passkey register options ✓
  - Passkey login options ✓
  - Challenge ID validation ✓
  - Logout ✓

### Documentation: COMPLETE
- ✅ 5 markdown guides covering all scenarios
- ✅ Database queries for debugging
- ✅ Network tab inspection guide
- ✅ Console API reference

---

## 🔍 How the Debug Helper Works

### Automatic Logging
Every time you interact with passkey endpoints, it logs:

```javascript
// What gets logged:
{
  event: "VERIFY_REQUEST",
  timestamp: "2026-01-30T12:34:56Z",
  details: {
    challengeId: "246e0fa9-24cb-4179-98f5-28cfbaa158b4",
    assertionResponseId: {
      value: "AQIDBA...",
      type: "string(28)"  // ← KEY: should be "string", not "object"
    },
    assertionResponseRawId: {
      value: "AQIDBA...",
      type: "Uint8Array"
    }
  }
}
```

### Key Detection
The helper automatically detects and logs:
- ✅ If `assertionResponse.id` is a string (expected)
- ✅ If `assertionResponse.id` is an ArrayBuffer (problem!)
- ✅ Challenge ID changes between requests
- ✅ HTTP status and error codes
- ✅ All request/response timings

### Storage
- Stored in `localStorage` under key: `passkey_debug_logs`
- Persists across page reloads
- Up to 100 events kept
- Can be exported as JSON

---

## 🎬 Test Scenarios Covered

### Scenario 1: Happy Path (Success)
Sign up → Add passkey → Logout → Login with passkey

**Expected:** 200 OK, session created

### Scenario 2: 400 UNKNOWN_CREDENTIAL
Try to login with passkey not registered on device

**Expected:** 400, code: `UNKNOWN_CREDENTIAL`

**Root cause:** 
- Credential ID encoding mismatch (ArrayBuffer vs string)
- Credential not actually registered

### Scenario 3: 400 VERIFY_FAILED
Valid credential but signature verification fails

**Root cause:**
- Challenge mismatch
- Origin mismatch (HTTP vs HTTPS)
- RP ID mismatch
- Credential ID encoding issue

### Scenario 4: Logout → Login 400 (THE BUG)
Successfully login → logout → try login again → 400

**Root cause:** Likely ArrayBuffer handling in `assertionResponse.id`

---

## 🛠️ Server-Side Fix (If Needed)

If you're seeing ArrayBuffer issues, apply the fix in [PASSKEY_SERVER_NORMALIZATION.md](PASSKEY_SERVER_NORMALIZATION.md):

```javascript
// Add this normalization in src/worker.js (handlePasskeyLoginVerify):
let credentialId = assertionResponse?.id || assertionResponse?.rawId || '';

if (credentialId instanceof ArrayBuffer) {
  credentialId = isoBase64URL.fromBuffer(credentialId);
} else if (credentialId instanceof Uint8Array) {
  credentialId = isoBase64URL.fromBuffer(Buffer.from(credentialId));
}

credentialId = typeof credentialId === 'string' ? credentialId.trim() : '';
```

---

## 📊 Debug Workflow

```
1. Browser Test
   ↓
2. Open Console (F12 → Console tab)
   ↓
3. window.PasskeyDebug.getLogs()
   ↓
4. Check assertionResponseId.type
   ↓
   ├─ If "string" → ✅ No ArrayBuffer issue
   │
   └─ If "object"/"ArrayBuffer" → ❌ Apply server fix
   ↓
5. Check challengeId match (OPTIONS → VERIFY)
   ↓
   ├─ If match → ✅ No cache issue
   │
   └─ If mismatch → ❌ Browser state issue
   ↓
6. Apply fix (if needed) → redeploy → retest
```

---

## 🚀 Running Tests

### Option 1: Manual Browser Test (Recommended)
```bash
# Start dev server (if not already running)
cd /home/anchor/projects/grassmvt_survey
bash startDev.sh
```

Then follow [PASSKEY_BROWSER_TEST.md](PASSKEY_BROWSER_TEST.md)

### Option 2: Automated API Test
```bash
bash test-passkey-flow.sh
```

Output:
- ✅ Account creation
- ✅ Passkey registration options
- ✅ Passkey login options
- ✅ Challenge ID validation
- ✅ Logout
- ✅ Fresh challenge after logout

### Option 3: Database Inspection
```bash
# Check registered credentials
sqlite3 your_database.db "SELECT * FROM passkey_credentials;"

# Check challenge records
sqlite3 your_database.db "SELECT * FROM webauthn_challenges WHERE kind='authentication';"

# Check audit trail
sqlite3 your_database.db "SELECT event_type, metadata FROM audit_events WHERE event_type LIKE '%passkey%';"
```

---

## 📋 Debugging Checklist

When you encounter a 400 error:

- [ ] Open DevTools Console
- [ ] Run `window.PasskeyDebug.getLogs()`
- [ ] Check `assertionResponse.id.type`
- [ ] Verify `challengeId` matches between OPTIONS and VERIFY
- [ ] Check HTTP status (should be 200, but you're seeing 400)
- [ ] Note the error `code` (UNKNOWN_CREDENTIAL, VERIFY_FAILED, etc.)
- [ ] Export logs: `JSON.stringify(window.PasskeyDebug.getLogs(), null, 2)`
- [ ] Share logs + browser info + error code with team

---

## 🎓 Key Concepts

### AssertionResponse.id Encoding
Should be **base64url string**, never ArrayBuffer:

```javascript
// ✅ CORRECT:
{
  "id": "AQIDBA=="  // base64url encoded
}

// ❌ WRONG:
{
  "id": [1, 2, 3, 4]  // raw bytes (ArrayBuffer/Uint8Array)
}
```

### Challenge ID Matching
Must match between OPTIONS and VERIFY:

```javascript
// Step 1: OPTIONS request
→ Response: { challengeId: "abc-123", options: {...} }

// Step 2: VERIFY request
→ Body: { challengeId: "abc-123", assertionResponse: {...} }

// ✅ Must match!
```

### Logout → Login Issue
The original issue:
1. Login with passkey → 200 OK ✅
2. Logout → session cleared ✅
3. Login again → 400 error ❌

**Root cause:** AssertionResponse.id format changes (ArrayBuffer instead of string)

---

## 📚 Quick Reference

### Files to Edit (If Server Fix Needed)
- `src/worker.js` — Add normalization at line ~1870

### Files to Include (Already Done ✅)
- `public/auth/login/index.html` — has passkey-debug.js
- `public/auth/signup/index.html` — has passkey-debug.js

### Files to Read (For Understanding)
- `PASSKEY_BROWSER_TEST.md` — How to test in browser
- `PASSKEY_DEBUG_QUICKSTART.md` — Quick reference
- `PASSKEY_SERVER_NORMALIZATION.md` — How to fix server

---

## 💡 Pro Tips

1. **Use `?debug=passkey` query param** for verbose logging
   - http://localhost:8787/auth/login?debug=passkey

2. **Export debug logs** before closing the page
   ```javascript
   const logs = window.PasskeyDebug.getLogs();
   copy(JSON.stringify(logs, null, 2))
   ```

3. **Compare registration vs login** encoding
   - First passkey registration should show encoding format
   - Later login should match that format

4. **Check server logs** while testing
   ```bash
   tail -f .wrangler-dev.log | grep -i passkey
   ```

5. **Use Network tab filter** to focus on API calls
   - Filter: `passkey/`
   - See request/response bodies

---

## 🎯 Success Criteria

✅ **Test passes if:**
- Signup → passkey creation → logout → passkey login works
- All status codes are 200 OK
- Session created with Set-Cookie header
- `window.PasskeyDebug.getLogs()` shows no errors
- Redirected to authenticated area

❌ **Test fails if:**
- See 400 status on `/passkey/login/verify`
- Error code: UNKNOWN_CREDENTIAL or VERIFY_FAILED
- `assertionResponse.id.type` shows "object" instead of "string"
- `challengeId` differs between OPTIONS and VERIFY

---

## 🤝 Next Steps

1. **Now:** Run the browser test (follow [PASSKEY_BROWSER_TEST.md](PASSKEY_BROWSER_TEST.md))
2. **If it works:** You're done! ✅
3. **If 400 occurs:** 
   - Check debug logs
   - Share output with team
   - Apply server fix from [PASSKEY_SERVER_NORMALIZATION.md](PASSKEY_SERVER_NORMALIZATION.md)
4. **Verify fix:** Re-run browser test
5. **Monitor:** Use debug helper for ongoing validation

---

## 📞 Support Files

All documentation is in the repo root:
- [PASSKEY_BROWSER_TEST.md](PASSKEY_BROWSER_TEST.md)
- [PASSKEY_DEBUG_QUICKSTART.md](PASSKEY_DEBUG_QUICKSTART.md)
- [PASSKEY_TEST_PLAN.md](PASSKEY_TEST_PLAN.md)
- [PASSKEY_SERVER_NORMALIZATION.md](PASSKEY_SERVER_NORMALIZATION.md)

**Start with:** [PASSKEY_BROWSER_TEST.md](PASSKEY_BROWSER_TEST.md) ⭐
