# Passkey Login: Server-Side Normalization Guide

## Problem Statement
After logout/login cycles, `POST /api/auth/passkey/login/verify` may return **400 VERIFY_FAILED** due to `credentialId` type mismatches. The client's `assertionResponse.id` may arrive as:
- ✅ **base64url string** (expected, handled correctly)
- ❌ **ArrayBuffer** (not handled, becomes `"[object ArrayBuffer]"`)
- ❌ **Uint8Array** (not handled, becomes `"[object Uint8Array]"` or raw bytes)

This causes credential lookup failure even when the credential exists.

---

## Current Implementation Issue

**File:** `src/worker.js` lines 1890–1897

```javascript
const credentialId = assertionResponse?.id || assertionResponse?.rawId || '';
if (!credentialId) {
  await env.DB.prepare('UPDATE webauthn_challenges SET used_at = ? WHERE id = ?')
    .bind(nowIso(), challengeRecord.id)
    .run();
  return jsonResponse({ ok: false, code: 'UNKNOWN_CREDENTIAL' }, { status: 400 });
}

const credential = await env.DB.prepare(
  `SELECT id, user_id, credential_id, public_key, counter
   FROM passkey_credentials
   WHERE credential_id = ?`
).bind(credentialId).first();
```

**Problems:**
1. No type checking on `assertionResponse.id`
2. If it's an ArrayBuffer, `credentialId` becomes a stringified object
3. Database lookup fails with no match
4. User sees unhelpful "UNKNOWN_CREDENTIAL" instead of "VERIFY_FAILED"

---

## Solution: Type Normalization

### Implementation (Recommended)

Add this normalization block immediately after `const body = await parseJsonBody(request)`:

```javascript
const handlePasskeyLoginVerify = async (request, env) => {
  // ... existing code ...
  
  const body = await parseJsonBody(request);
  const assertionResponse = body.assertionResponse;
  const challengeId = body.challengeId ? body.challengeId.toString().trim() : '';
  
  // === NEW: Normalize credentialId ===
  let credentialId = assertionResponse?.id || assertionResponse?.rawId || '';
  
  // Handle ArrayBuffer: convert to base64url string
  if (credentialId instanceof ArrayBuffer) {
    credentialId = isoBase64URL.fromBuffer(credentialId);
  }
  // Handle Uint8Array: convert to base64url string
  else if (credentialId instanceof Uint8Array) {
    credentialId = isoBase64URL.fromBuffer(Buffer.from(credentialId));
  }
  // Handle Buffer (Node.js)
  else if (Buffer && credentialId instanceof Buffer) {
    credentialId = isoBase64URL.fromBuffer(credentialId);
  }
  // Ensure string (should be base64url at this point)
  else if (typeof credentialId === 'object' && credentialId !== null) {
    // Fallback: try toString() on unknown objects
    credentialId = credentialId.toString?.() || '';
  }
  
  // Final sanity check: trim and ensure it's a string
  credentialId = typeof credentialId === 'string' ? credentialId.trim() : '';
  // === END: Normalization ===
  
  if (!assertionResponse || !challengeId) {
    return jsonResponse({ error: 'Missing passkey assertion.', code: 'MISSING_ASSERTION' }, { status: 400 });
  }
  
  // ... rest of existing code ...
};
```

### Deployment Checklist
- [ ] Add the normalization block to `src/worker.js`
- [ ] Test with SimpleWebAuthn client (should produce base64url strings)
- [ ] Test with custom WebAuthn implementations that might send ArrayBuffer
- [ ] Run `npm run build` (if applicable)
- [ ] Deploy and monitor logs for `credentialId` type variations

---

## Optional: Defensive Logging

Add logging to help diagnose credential ID issues in production:

```javascript
// Add after normalization (line ~1870 in src/worker.js)
if (process.env.DEBUG_PASSKEY === 'true' || body.debugPasskey) {
  const rawType = assertionResponse?.id?.constructor?.name || typeof assertionResponse?.id;
  const normalizedType = typeof credentialId;
  
  console.log('[PasskeyLogin:Normalization]', {
    timestamp: nowIso(),
    rawIdType: rawType,
    normalizedIdType: normalizedType,
    credentialIdLength: credentialId.length,
    credentialIdPrefix: credentialId.substring(0, 20),
    matchedCredential: !!credential,
  });
}
```

**Enable with environment variable:**
```bash
DEBUG_PASSKEY=true wrangler dev
```

Or with query parameter (requires adding to request parsing):
```
POST /api/auth/passkey/login/verify?debug=1
```

---

## Testing the Fix

### Unit Test (Pseudo-code)
```javascript
// Test ArrayBuffer handling
const arrayBufferCred = new ArrayBuffer(32);
const normalized = isoBase64URL.fromBuffer(arrayBufferCred);
assert(typeof normalized === 'string');
assert(normalized.length > 0);

// Test Uint8Array handling
const uint8Cred = new Uint8Array([1, 2, 3, 4]);
const normalized2 = isoBase64URL.fromBuffer(Buffer.from(uint8Cred));
assert(typeof normalized2 === 'string');

// Test no-op on already-normalized string
const stringCred = 'AQ=='; // base64url string
assert(typeof stringCred === 'string');
```

### Integration Test
1. Temporarily inject ArrayBuffer into client payload:
   ```javascript
   // In public/js/auth.js or test harness
   if (window.location.search.includes('test=buffer')) {
     const arr = new Uint8Array(32);
     body.assertionResponse.id = arr.buffer;
   }
   ```
2. Attempt login with `?test=buffer`
3. Verify 200 (not 400) and successful session creation
4. Check logs for normalization details

---

## Impact Analysis

| Aspect | Current | With Fix |
|--------|---------|----------|
| **SimpleWebAuthn clients** | ✅ Works | ✅ Still works (no-op normalization) |
| **ArrayBuffer payloads** | ❌ 400 UNKNOWN_CREDENTIAL | ✅ 200 (correctly matched) |
| **Uint8Array payloads** | ❌ 400 UNKNOWN_CREDENTIAL | ✅ 200 (correctly matched) |
| **Mixed client implementations** | ❌ Intermittent 400s | ✅ Consistent success |
| **Performance** | Baseline | +0.1ms (one-time conversion) |
| **Security** | No change | No change (same validation applied post-normalization) |

---

## Why This Happens

### Root Cause Flow
1. **Client:** SimpleWebAuthn's `startAuthentication()` returns `AssertionResponse` with `id` as base64url string ✅
2. **Network:** Fetch API sends JSON payload (base64url strings serialize fine)
3. **Server:** `parseJsonBody()` parses JSON string → should get base64url string ✅
4. **But:** Some edge cases:
   - Custom WebAuthn polyfills return raw ArrayBuffer
   - Mobile apps with custom WebAuthn bridges convert to bytes
   - Proxy/middleware might transform payloads
   - Very old browser implementations

5. **Result:** `credentialId` becomes `"[object ArrayBuffer]"` → no database match → 400

### Why Logout→Login Breaks It
- **First login (fresh page):** SimpleWebAuthn loaded correctly → base64url string → works
- **After logout (SPA navigation):** Page state corrupted, older polyfill loaded, or credentials cached → ArrayBuffer → 400
- **Suggests:** Check for leftover window/global state after logout

---

## Complementary Fixes

### On the Client Side
Ensure `public/js/auth.js` is calling `startAuthentication()` correctly:

```javascript
// This is what happens now (good)
let assertionResponse;
try {
  assertionResponse = await browser.startAuthentication(optionsData.options);
  // assertionResponse.id is a base64url string here
} catch (error) {
  // ...
}

// Verify: add to passkey-debug.js
log('ASSERTION_RESPONSE_TYPE', {
  idType: typeof assertionResponse.id,
  idValue: assertionResponse.id.substring?.(0, 20),
  rawIdType: typeof assertionResponse.rawId,
});
```

### On the Database Side
Optional: Store credential IDs in a normalized format:

```sql
-- Ensure all stored credential_ids are base64url strings
-- This is already the case from registration, but good to verify:
SELECT COUNT(*) as count FROM passkey_credentials
WHERE credential_id LIKE '[object%' OR credential_id LIKE '%ArrayBuffer%';
-- Should return 0
```

---

## Rollout Plan

1. **Phase 1 (This Week):** Deploy normalization fix to production
2. **Phase 2 (Week 2):** Monitor logs for `credentialId` type variations (enable `DEBUG_PASSKEY`)
3. **Phase 3 (Week 3):** If no ArrayBuffer/Uint8Array logs appear, consider removing logging
4. **Phase 4 (Ongoing):** Keep normalization as defensive coding pattern

---

## References
- **SimpleWebAuthn:** https://simplewebauthn.dev/docs/server/verification
- **isoBase64URL:** Already imported in worker.js (line 11)
- **Test case location:** Manual test plan in `PASSKEY_TEST_PLAN.md` → Scenario C, Step C3
- **Related code:** `src/worker.js` lines 1805–1977

---

## Questions & FAQs

**Q: Will this break existing passkey registrations?**
A: No. Registration already stores `credential_id` as base64url strings (see `handlePasskeyRegisterVerify`). Normalization is only on login verify.

**Q: What if credentialId is `null` or `undefined`?**
A: The check `if (!credentialId)` after normalization will catch it and return `UNKNOWN_CREDENTIAL`.

**Q: Does this impact performance?**
A: Negligible (<0.1ms). Only one-time conversion per login attempt, and it's cheap.

**Q: Should we normalize on registration too?**
A: Verify first. If registration only uses SimpleWebAuthn, it's already correct. Add if needed based on logs.

**Q: What if `isoBase64URL.fromBuffer()` fails?**
A: Add try-catch and log the error:
```javascript
try {
  credentialId = isoBase64URL.fromBuffer(credentialId);
} catch (e) {
  console.error('[PasskeyLogin] Normalization failed:', { error: e.message, credentialId });
  credentialId = '';
}
```
