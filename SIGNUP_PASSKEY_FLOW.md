# Signup → Passkey Nudge Flow

## User Signup Sequence

### 1. User Submits Signup Form
**File**: `public/js/signup-modal.js` (line 200+)

User enters:
- Email
- Password (confirmed)
- Completes Turnstile CAPTCHA

### 2. POST /api/auth/signup
**File**: `src/worker.js` (handleAuthSignup)

Backend:
- Validates email/password
- Verifies Turnstile token
- Creates user in DB
- Hashes password with scrypt
- Creates Lucia session
- Sets session cookie (httpOnly, secure)
- Returns 200 OK

### 3. Signup Modal Success Handler
**File**: `public/js/signup-modal.js` (line 260+)

```javascript
resetTurnstile();
showError('Account created. Signing you in.');

// STEP 1: Wait for session cookie with retry logic
let authenticated = false;
for (let attempt = 0; attempt < 5; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  authenticated = await authUI.fetchAuthState();
  if (authenticated) {
    break;
  }
}
```

**Purpose**: Ensure the session cookie is fully established before proceeding (up to 1 second total wait)

### 4. Set Flag for Passkey Nudge
**File**: `public/js/signup-modal.js` (line 281)

```javascript
if (authenticated) {
  window.dispatchEvent(
    new CustomEvent('auth:changed', { detail: { authenticated: true } })
  );
  
  // Close signup modal and open login modal with passkey nudge flag
  closeModal();
  document.body.classList.add('auth-just-signed-up');  // ← FLAG SET HERE
  authModals.open('login');
  return;
}
```

**Key Actions**:
- Dispatch `auth:changed` event (updates header to show logged-in state)
- Close signup modal
- Set `auth-just-signed-up` class on body (signals passkey nudge should be forced)
- Open login modal

### 5. Login Modal Opens with Passkey Nudge Forced
**File**: `public/js/login-modal.js` (line 313-327)

```javascript
// In openModal() function
const authenticated = await authUI.fetchAuthState();
setLoggedInState(authenticated, authUI.state.email);

// If user is authenticated (e.g., just signed up), check for passkey nudge
// Force show for new signups, respect dismissal for regular logins
if (authenticated) {
  const forceShow = document.body.classList.contains('auth-just-signed-up');
  await maybeShowPasskeyNudge(forceShow);  // ← FORCESHOW=TRUE
  document.body.classList.remove('auth-just-signed-up');
  return;
}
```

### 6. Fetch and Display Passkey Nudge
**File**: `public/js/login-modal.js` (line 451-471)

```javascript
const maybeShowPasskeyNudge = async (forceShow = false) => {
  // forceShow=true will ignore dismissal (used after signup)
  if (!passkeyNudgeEl) {
    return false;
  }
  if (!forceShow && !shouldShowPasskeyNudge()) {
    // ^ This check is SKIPPED when forceShow=true (so nudge always shows after signup)
    return false;
  }
  
  // Fetch existing passkeys for this user
  const credentials = await fetchPasskeys();
  // GET /api/auth/passkey/list
  
  if (!credentials || credentials.length > 0) {
    // User already has passkeys, don't show nudge
    return false;
  }
  
  // USER HAS NO PASSKEYS → Show the nudge!
  passkeyNudgeEl.classList.remove('is-hidden');
  if (form) {
    form.classList.add('is-hidden');  // Hide login form
  }
  if (loggedInEl) {
    loggedInEl.classList.add('is-hidden');
  }
  return true;
};
```

### 7. User Can Register Passkey or Skip
**File**: `public/js/login-modal.js` (line 483-500)

**Option A: Register Passkey**
```javascript
if (passkeyNudgeAdd) {
  passkeyNudgeAdd.addEventListener('click', async () => {
    showError('');
    const ok = await startPasskeyEnrollment();
    if (!ok) {
      return;
    }
    closeModal();
    window.location.href = '/surveys/list/';
  });
}
```

**Option B: Skip for Now**
```javascript
if (passkeyNudgeSkip) {
  passkeyNudgeSkip.addEventListener('click', () => {
    dismissPasskeyNudge();  // localStorage flag so nudge won't show again this session
    closeModal();
    window.location.href = '/surveys/list/';
  });
}
```

---

## Key Design Decisions

### 1. **Why Session Retry Logic?**
- Session cookie might not be set immediately after signup
- 100ms proved too short in earlier testing
- 200ms × 5 attempts = up to 1 second total wait
- Ensures `fetchAuthState()` returns true before opening login modal

### 2. **Why Open Login Modal Instead of Redirecting?**
- The passkey nudge is part of the login modal's UI
- User is already authenticated, so login modal shows:
  - Passkey nudge (if no passkeys exist)
  - OR logged-in state (if passkeys exist)
- User can choose to register passkey or skip

### 3. **Why Force Show Passkey Nudge After Signup?**
- Users just created account → good time to set up passkey
- Nudge should always show, ignoring previous dismissal
- After signup completion, dismissal flag is respected for future logins

### 4. **Passkey Dismissal Behavior**
- **After Signup**: Always show nudge (forceShow=true)
- **Regular Login**: Show nudge only if:
  - Dismissal flag is NOT set, AND
  - User has no passkeys
- **If Dismissed**: localStorage flag prevents showing again in same browser

---

## Flow Diagram

```
User Signup Form
       ↓
POST /api/auth/signup
       ↓
Account Created + Session Cookie Set
       ↓
Retry 5× to confirm session (200ms each)
       ↓
Set auth-just-signed-up flag
       ↓
Close Signup Modal
       ↓
Open Login Modal
       ↓
Check: authenticated + auth-just-signed-up flag?
       ↓ YES
Fetch User's Passkeys
       ↓
Has passkeys?
  ├─ YES → Show logged-in state, close modal, redirect to /surveys/list/
  └─ NO  → Show passkey nudge
       ↓
User Chooses:
  ├─ "Register Passkey" → startPasskeyEnrollment() → /surveys/list/
  └─ "Skip" → dismissPasskeyNudge() → /surveys/list/
```

---

## Testing Flow

**Test Account**: testflow@example6.com

1. ✅ Create account with password
2. ✅ Modal auto-logs-in (waits for session)
3. ✅ Signup modal closes
4. ✅ Login modal opens
5. ✅ Passkey nudge displays (no passkeys exist)
6. ✅ User can click "Register Passkey" or "Skip"
7. ✅ Either action redirects to /surveys/list/

**Status**: FULLY FUNCTIONAL (deployed to production)
