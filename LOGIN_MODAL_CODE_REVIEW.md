# Code Review: Login Modal Flow (login-modal.js)

## 1. Flow Analysis: Email → Password → Turnstile → Login → Passkey Prompt

### Documented Flow Path
The login process follows this sequence in [login-modal.js](public/js/login-modal.js):

1. **Form Submit Handler** ([lines 439-527](public/js/login-modal.js#L439-L527))
   - User enters email and password
   - Calls `checkAccountExists(email)` to validate account exists
   - If account not found, switches to signup modal

2. **Turnstile Check** ([lines 475-485](public/js/login-modal.js#L475-L485))
   - Fetches Turnstile config if needed
   - If Turnstile is NOT bypassed AND token is missing:
     - Sets state to "running" with message "Verifying you are human..."
     - Calls `renderTurnstile(true)` to show interactive widget
     - Calls `executeTurnstileOnce()` to start verification
     - **Returns early** — form submission pauses here

3. **Resume After Turnstile** ([lines 486-527](public/js/login-modal.js#L486-L527))
   - After user completes Turnstile challenge, `onSuccess` callback triggers
   - Token stored in `tokenInput.value` and `lastTurnstileToken`
   - Turnstile state set to `'ready'`
   - User must click "Sign in" button again to continue

4. **API Call** ([lines 486-496](public/js/login-modal.js#L486-L496))
   - POST to `/api/auth/login` with email, password, turnstileToken
   - Error handling for PASSWORD_INCORRECT, ACCOUNT_NOT_FOUND, etc.
   - On success, resets Turnstile and waits for auth state

5. **Passkey Nudge** ([lines 497-510](public/js/login-modal.js#L497-L510))
   - After login succeeds, calls `maybeShowPasskeyNudge()`
   - Fetches user's existing passkeys
   - If no passkeys exist AND nudge not recently dismissed:
     - Hides form and shows passkey enrollment section
     - Offers "Add passkey" or "Not now" buttons
     - Returns early, preventing modal close

6. **Modal Close & Redirect** ([lines 515-516](public/js/login-modal.js#L515-L516))
   - If no passkey nudge shown, closes modal and redirects to `/surveys/list/`

---

## 2. Turnstile Execution Timing Analysis

### ✅ Correct Behavior: Verification Only After "Sign In" Click

**Key Implementation Details:**

1. **Initial State** ([line 319](public/js/login-modal.js#L319))
   - Turnstile widget NOT rendered until form submission
   - `renderTurnstile(false)` called in `openModal()` initializes state but doesn't show UI

2. **Render on Demand** ([lines 308-316](public/js/login-modal.js#L308-L316))
   - `renderTurnstile(interactive = false)` parameter controls visibility
   - When `interactive === false`: container hidden, label hidden
   - When `interactive === true`: container shown, label shown, state set to "needs-interaction"

3. **Execution Flow** ([lines 475-485](public/js/login-modal.js#L475-L485))
   ```javascript
   if (!turnstileConfig.bypass && !tokenValue) {
     setTurnstileState('running', 'Verifying you are human...');
     setTurnstileState('needs-interaction');
     await renderTurnstile(true);  // NOW shows widget
     await executeTurnstileOnce();
     return;  // Pauses form submission
   }
   ```
   - Sets state to "running" with user-facing message
   - Calls `renderTurnstile(true)` to show widget
   - Calls `executeTurnstileOnce()` to trigger challenge
   - **Returns early**, pausing form submission

4. **Message Timing** ([lines 205-226](public/js/login-modal.js#L205-L226))
   - "Verifying you are human..." shows during challenge (state === 'running')
   - "Complete the human check to continue." shows when needs interaction
   - "Verified." shows when ready (but hidden if not submitted)

### ⚠️ ISSUE #1: Duplicate State Setting (Minor)

**Location:** [lines 478-479](public/js/login-modal.js#L478-L479)

```javascript
setTurnstileState('running', 'Verifying you are human...');
setTurnstileState('needs-interaction');
```

**Problem:** Sets state to `'running'` then immediately to `'needs-interaction'`, which may cause UI flicker.

**Impact:** Low — message updates twice but UI quickly stabilizes.

**Recommendation:**
```javascript
setTurnstileState('running', 'Verifying you are human...');
// Remove second call, let renderTurnstile handle state
await renderTurnstile(true);
```

---

## 3. Passkey Success Path Verification

### ✅ Correct: Passkey Login Flow

**Passkey Login Handler** ([lines 532-589](public/js/login-modal.js#L532-L589))

1. **Success Path** ([lines 575-589](public/js/login-modal.js#L575-L589))
   ```javascript
   showError('');                      // ✅ Clears errors
   const authenticated = await refreshAuthState();  // ✅ Refreshes auth
   if (!authenticated) {
     showError('Passkey sign-in failed.');
     return;
   }
   closeModal();                       // ✅ Closes modal
   ```

2. **Auth State Refresh** ([lines 351-372](public/js/login-modal.js#L351-L372))
   - Calls `/api/auth/me` with fresh fetch (no cache)
   - Updates `authUI.state.email`
   - Dispatches `auth:changed` event
   - Updates UI via `setLoggedInState()`

3. **Modal Close** ([lines 331-340](public/js/login-modal.js#L331-L340))
   - Hides modal, removes `no-scroll` from body
   - Clears errors
   - Resets Turnstile
   - Hides Turnstile label and container

### ⚠️ ISSUE #2: Missing Redirect After Passkey Success

**Location:** [lines 575-577](public/js/login-modal.js#L575-L577)

```javascript
closeModal();
// ❌ Missing: window.location.href = '/surveys/list/';
```

**Problem:** Password login redirects to surveys list ([line 516](public/js/login-modal.js#L516)), but passkey login does not.

**Impact:** User stays on current page after passkey authentication. Expected behavior should match password login.

**Fix:**
```javascript
closeModal();
window.location.href = '/surveys/list/';
```

---

## 4. Identified Issues & Regressions

### Issue #1: Duplicate Turnstile State Setting
- **File:** [login-modal.js](public/js/login-modal.js#L478-L479)
- **Severity:** Low (cosmetic flicker)
- **Fix:** Remove second `setTurnstileState()` call

### Issue #2: Missing Redirect After Passkey Login
- **File:** [login-modal.js](public/js/login-modal.js#L575-L577)
- **Severity:** Medium (inconsistent UX)
- **Fix:** Add `window.location.href = '/surveys/list/';` after `closeModal()`

### Issue #3: Turnstile Container Not Reset When Modal Reopens (Potential)
- **Location:** [lines 322-324](public/js/login-modal.js#L322-L324)
- **Status:** ✅ OK — properly reset by `resetTurnstile()` on open

### Issue #4: Double Turnstile Execution Prevention
- **Location:** [turnstile-client.js](public/js/auth/turnstile-client.js#L129-L150)
- **Status:** ✅ Properly handled via `executionByWidget` Map tracking pending executions

### Issue #5: Account Not Found Modal Switch
- **Location:** [lines 467-471](public/js/login-modal.js#L467-L471)
- **Status:** ✅ Correctly switches to signup modal and shows error message

---

## 5. Edge Cases & Regressions Check

| Scenario | Status | Notes |
|----------|--------|-------|
| User types email/password, Turnstile not ready | ✅ OK | Form submit disabled until Turnstile completes |
| User closes modal mid-Turnstile | ✅ OK | `closeModal()` calls `resetTurnstile()` |
| User clicks "Sign in" twice while Turnstile pending | ✅ OK | `turnstileSubmitted` flag prevents double submit |
| Turnstile expires after first verification | ✅ OK | `onExpire` callback clears token, resets state |
| Passkey not supported on device | ✅ OK | Button disabled with message ([line 529](public/js/login-modal.js#L529)) |
| Passkey login with wrong device | ✅ OK | Shows "No matching passkey found" ([line 568](public/js/login-modal.js#L568)) |
| OAuth error on page load | ✅ OK | Mapped to error message, modal auto-opens ([lines 629-634](public/js/login-modal.js#L629-L634)) |
| Account exists but password wrong | ✅ OK | Shows specific error message ([line 499](public/js/login-modal.js#L499)) |
| User dismisses passkey nudge permanently | ✅ OK | LocalStorage key set, won't show for 30 days ([lines 210-218](public/js/login-modal.js#L210-L218)) |
| Modal reopened after login | ⚠️ Issue | Should reset Turnstile state (currently does via `resetTurnstile()` ✅) |

---

## 6. Manual Test Checklist

### Pre-Test Setup
- [ ] Clear browser cache and localStorage
- [ ] Open DevTools Network tab, filter for `api.js`
- [ ] Open DevTools Console, watch for errors

### Test 1: Email Validation
- [ ] Enter non-existent email, click Sign in
- [ ] Expected: Modal switches to signup with "No account found" message
- [ ] **Turnstile should NOT load** (account doesn't exist)

### Test 2: Password Flow with Turnstile (Production)
- [ ] Enter valid email and password
- [ ] Click "Sign in"
- [ ] Expected: Turnstile widget appears with "Verifying you are human..."
- [ ] **Network tab:** Verify exactly 1 `api.js` request total
- [ ] Complete Turnstile challenge
- [ ] Expected: Message changes to "Verified."
- [ ] Click "Sign in" button again (should be enabled)
- [ ] Expected: Login succeeds, shows passkey nudge OR closes modal

### Test 3: Passkey Login Success
- [ ] Click "Sign in with passkey"
- [ ] Complete passkey authentication
- [ ] Expected: Modal closes, redirects to `/surveys/list/`
- [ ] **Verify:** Should redirect, not stay on current page

### Test 4: Passkey Re-enrollment Nudge
- [ ] Log in with password (first time or after deleting passkeys)
- [ ] Expected: "Add a passkey for faster sign-in" section appears
- [ ] Click "Add passkey"
- [ ] Expected: Registration flow initiates
- [ ] Complete passkey registration
- [ ] Expected: Redirects to `/surveys/list/`

### Test 5: Passkey Nudge Dismissal
- [ ] Log in with password (fresh session)
- [ ] See passkey nudge, click "Not now"
- [ ] Expected: Modal closes, redirects to surveys
- [ ] Log out and log in again
- [ ] Expected: Passkey nudge should NOT appear (dismissed for 30 days)

### Test 6: Modal Reopen After Login
- [ ] Log in successfully
- [ ] Open login modal again (via button)
- [ ] Expected: Modal shows "Signed in as [email]" with logout button
- [ ] **Turnstile should NOT be rendered**

### Test 7: Wrong Password Error
- [ ] Enter correct email, wrong password
- [ ] Click "Sign in"
- [ ] Expected: "Password incorrect" error
- [ ] Turnstile should reset, ready for retry
- [ ] Fix password, click "Sign in" again
- [ ] Expected: Login succeeds

### Test 8: Turnstile Expiration
- [ ] Start login, complete Turnstile challenge
- [ ] Wait for token to expire (usually 5 minutes)
- [ ] Click "Sign in"
- [ ] Expected: Turnstile error/expire callback triggers
- [ ] Expected: State returns to "needs-interaction"
- [ ] Expected: Token cleared, must complete again

### Test 9: OAuth Error Handling
- [ ] Navigate to page with `?oauth_error=access_denied`
- [ ] Expected: Modal auto-opens with mapped error message
- [ ] Expected: Turnstile NOT rendered (OAuth errors don't need verification)

---

## 7. Recommended Fixes

### Fix #1: Remove Duplicate State Setting
**File:** [login-modal.js](public/js/login-modal.js#L478-L479)
```javascript
// BEFORE
setTurnstileState('running', 'Verifying you are human...');
setTurnstileState('needs-interaction');
await renderTurnstile(true);

// AFTER (let renderTurnstile set the state)
setTurnstileState('running', 'Verifying you are human...');
// renderTurnstile(true) will handle the 'needs-interaction' state
await renderTurnstile(true);
```

**Rationale:** `renderTurnstile(true)` already sets state to 'needs-interaction' at [line 305](public/js/login-modal.js#L305), making the duplicate redundant.

### Fix #2: Add Redirect After Passkey Login
**File:** [login-modal.js](public/js/login-modal.js#L575-L577)
```javascript
// BEFORE
closeModal();

// AFTER
closeModal();
window.location.href = '/surveys/list/';
```

**Rationale:** Passkey login should have same UX as password login (redirect to surveys list).

---

## Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Email → Password flow | ✅ Correct | Proper validation and switching to signup |
| Turnstile timing | ✅ Correct | Only executes after form submit, shows message |
| Passkey success path | ⚠️ Issue | Missing redirect after modal close |
| Error handling | ✅ Correct | All error cases properly handled |
| Edge cases | ✅ Mostly OK | Passkey nudge, expiration, reopen all handled |
| **Overall Quality** | **✅ Good** | Two minor issues, otherwise robust |

**Recommendation:** Apply both recommended fixes before next production deployment.

