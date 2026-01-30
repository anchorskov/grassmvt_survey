# Passkey Login Debug Toolkit: Quick Start

## 📋 What You Have

Three new resources to debug and fix the 400-error issues on `POST /api/auth/passkey/login/verify`:

### 1. **PASSKEY_TEST_PLAN.md**
   - **Purpose:** Manual testing checklist for reproducing and diagnosing 400s
   - **Contains:**
     - 4 core test scenarios (Challenge ID matching, logout→login cycle, 3 error types)
     - Step-by-step debugging procedures
     - SQL queries to inspect database state
     - Common root causes lookup table
   - **Best for:** Manual QA, reproducing issues, verifying fixes

### 2. **public/js/passkey-debug.js**
   - **Purpose:** Client-side logging harness that captures the passkey flow
   - **Automatically logs:**
     - `assertionResponse.id` type and value (ArrayBuffer vs string)
     - `assertionResponse.rawId` type and value
     - `challengeId` from both OPTIONS and VERIFY endpoints
     - Request/response timing and status codes
   - **API:** `window.PasskeyDebug.getLogs()`, `.clearLogs()`, `.getLastError()`
   - **Best for:** Quick diagnosis without code changes, continuous monitoring

### 3. **PASSKEY_SERVER_NORMALIZATION.md**
   - **Purpose:** Server-side fix implementation guide
   - **Addresses:** ArrayBuffer/Uint8Array handling in credential ID lookup
   - **Includes:**
     - Copy-paste code for `src/worker.js`
     - Optional defensive logging
     - Test cases and deployment checklist
   - **Best for:** Fixing the root cause, preventing logout→login failures

---

## 🚀 Quick Start: Debug a 400 Error

### Option A: Using the Debug Helper (Fastest)

```javascript
// 1. In browser DevTools console:
window.PasskeyDebug.getLogs()

// 2. Look for VERIFY_FAILED or VERIFY_REQUEST entries
window.PasskeyDebug.getLastError()

// 3. Check types:
window.PasskeyDebug.getLogs()
  .filter(e => e.event.includes('VERIFY'))
  .forEach(e => console.table(e.details))
```

**Look for:**
- `assertionResponse.id.type` — should be `string`, not `[object ArrayBuffer]`
- `challengeId` match between OPTIONS and VERIFY responses
- `status: 400` with `code: UNKNOWN_CREDENTIAL|CHALLENGE_EXPIRED|VERIFY_FAILED`

### Option B: Step-by-Step Browser Test (Recommended)

Follow [PASSKEY_BROWSER_TEST.md](PASSKEY_BROWSER_TEST.md) for complete instructions:
1. Create account and register real passkey
2. Log out completely
3. Try passkey login after logout (reproduces 400)
4. Check DevTools Network tab for exact request/response
5. Use debug helper to analyze types and challengeId

### Option C: Manual Testing (Most Thorough)

Follow [PASSKEY_TEST_PLAN.md](PASSKEY_TEST_PLAN.md) → **Debugging Steps** section:
1. Capture raw request (Network tab)
2. Query database for challenge and credential records
3. Check audit logs for event sequences
4. Enable server debug logging

### Option C: Enable the Helper Automatically

Include `passkey-debug.js` in your login page HTML **before** `auth.js`:

```html
<script src="/js/passkey-debug.js"></script>
<script src="/js/auth.js"></script>
```

Then access logs anytime:
```javascript
// View all events
JSON.stringify(window.PasskeyDebug.getLogs(), null, 2)

// Export to file for analysis
const a = document.createElement('a');
a.href = URL.createObjectURL(new Blob([JSON.stringify(window.PasskeyDebug.getLogs(), null, 2)], {type: 'application/json'}));
a.download = 'passkey-debug.json';
a.click();
```

---

## 🔧 Quick Start: Fix the Root Cause

If you're seeing **400 VERIFY_FAILED** or **400 UNKNOWN_CREDENTIAL** consistently:

### Step 1: Check if it's an ArrayBuffer issue
```javascript
// In browser console during passkey login:
const logs = window.PasskeyDebug.getLogs();
const verify = logs.find(e => e.event === 'VERIFY_REQUEST');
console.log(verify.details.assertionResponseId.type);
// If shows "object", it's likely ArrayBuffer/Uint8Array
```

### Step 2: Apply the server-side fix
See [PASSKEY_SERVER_NORMALIZATION.md](PASSKEY_SERVER_NORMALIZATION.md) → **Solution: Type Normalization**

Copy the normalization block into `src/worker.js` at line ~1870.

### Step 3: Deploy and verify
```bash
npm run build  # if needed
wrangler dev   # or your deployment process
```

Test with the debug helper (Option A above).

---

## 📊 Diagnosis Quick Reference

| Error Code | Likely Cause | Check First |
|-----------|-------------|------------|
| **UNKNOWN_CREDENTIAL** | credentialId mismatch (ArrayBuffer?) | `window.PasskeyDebug.getLogs()` → look for type |
| **CHALLENGE_INVALID** | challengeId doesn't exist in DB | SQL: `SELECT * FROM webauthn_challenges WHERE id = ?` |
| **CHALLENGE_EXPIRED** | Took >10 minutes between OPTIONS → VERIFY | Retry, verify TTL in `src/worker.js` |
| **VERIFY_FAILED** | Signature verification failed | Check origin, RP ID, credentialId encoding |

---

## 📁 File Locations

- **Browser test:** [PASSKEY_BROWSER_TEST.md](PASSKEY_BROWSER_TEST.md) ⭐ Start here!
- **Test plan:** [PASSKEY_TEST_PLAN.md](PASSKEY_TEST_PLAN.md)
- **Debug helper:** [public/js/passkey-debug.js](public/js/passkey-debug.js)
- **Server fix:** [PASSKEY_SERVER_NORMALIZATION.md](PASSKEY_SERVER_NORMALIZATION.md)
- **Client code:** [public/js/auth.js](public/js/auth.js) (lines 566–650)
- **Server code:** [src/worker.js](src/worker.js) (lines 1805–1977)

---

## 🧪 Testing Checklist

- [ ] **Manual test:** Follow PASSKEY_TEST_PLAN.md → Manual Test Checklist
- [ ] **Debug test:** Enable debug.js, attempt login, check `window.PasskeyDebug.getLogs()`
- [ ] **Integration test:** Apply server fix, test logout→login cycle (PASSKEY_TEST_PLAN.md → Scenario D)
- [ ] **Regression test:** Verify existing passkey logins still work
- [ ] **Monitoring:** Enable DEBUG_PASSKEY=true in logs for 1 week post-deployment

---

## 💡 Key Insights

1. **The 400 after logout→login is likely one of:**
   - `challengeId` not being fetched fresh (cached in browser state)
   - `assertionResponse.id` arriving as ArrayBuffer instead of string
   - Challenge record marked as used when it shouldn't be

2. **The debug helper catches all three** because it logs:
   - `challengeId` at each step (detects cache issues)
   - `assertionResponse.id` type (detects ArrayBuffer issue)
   - `status` and `code` (detects challenge state issues)

3. **The server fix is defensive** — it normalizes ANY input format to base64url string before database lookup, preventing type mismatches.

---

## ❓ Still Stuck?

1. **Run the debug helper** → export logs → post in issue tracker
2. **Check Scenario D** in PASSKEY_TEST_PLAN.md → specific logout→login debugging
3. **Enable server logging** → PASSKEY_SERVER_NORMALIZATION.md → Optional: Defensive Logging
4. **Query the database** → PASSKEY_TEST_PLAN.md → Debugging Steps → Step 2–4

---

## 📝 Next Steps

- [ ] Include `passkey-debug.js` in login page
- [ ] Run manual tests from PASSKEY_TEST_PLAN.md
- [ ] If 400s persist, apply server fix from PASSKEY_SERVER_NORMALIZATION.md
- [ ] Monitor with `DEBUG_PASSKEY=true` for 1 week
- [ ] Document any new findings or edge cases discovered
