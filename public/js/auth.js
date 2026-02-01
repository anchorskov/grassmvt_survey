/* public/js/auth.js */
(() => {
  const form = document.getElementById('auth-form');
  const authMode = form ? form.dataset.authMode : '';
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const passwordConfirmInput = document.getElementById('auth-password-confirm');
  const errorEl = document.getElementById('auth-error');
  const loggedInEl = document.getElementById('auth-logged-in');
  const logoutButton = document.getElementById('logout-button');
  const tokenInput = document.getElementById('turnstile-token');
  const passkeyButton = document.getElementById('passkey-login-button');
  const turnstileContainer = document.getElementById('turnstile-login');
  const turnstileClient = window.TurnstileClient;
  const oauthGoogleButton = document.getElementById('auth-oauth-google');
  const submitButton = form ? form.querySelector('button[type=\"submit\"]') : null;
  const turnstileStatusEl = document.getElementById('turnstile-login-status');
  const turnstileLabelEl = document.getElementById('turnstile-login-label');
  const passkeyNudgeEl = document.getElementById('login-passkey-nudge');
  const passkeyNudgeAdd = document.getElementById('login-passkey-add');
  const passkeyNudgeSkip = document.getElementById('login-passkey-skip');
  let turnstileWidgetId = null;
  let lastTurnstileToken = '';
  let turnstileConfig = { siteKey: '', bypass: false };
  let turnstileState = 'idle';
  let turnstileExecuted = false;
  let turnstileSubmitted = false;

  const PASSKEY_NUDGE_KEY = 'passkey_nudge_dismissed_at';
  const PASSKEY_NUDGE_SUPPRESS_MS = 30 * 24 * 60 * 60 * 1000;

  // Debug mode: enable with ?debugAuth=1 query param
  const debugAuth = new URLSearchParams(window.location.search).get('debugAuth') === '1';
  const logDebug = (...args) => {
    if (debugAuth) {
      console.log('[Passkey Debug]', ...args);
    }
  };

  // Map WebAuthn errors to user-friendly messages
  const mapPasskeyError = (error) => {
    const name = error && error.name ? error.name : '';
    const message = error && error.message ? error.message : '';
    
    if (name === 'NotAllowedError') {
      if (message.includes('timed out')) {
        return 'Passkey sign-in timed out. Please try again.';
      }
      return 'Passkey sign-in was cancelled or not allowed. Try again or use password.';
    }
    if (name === 'InvalidStateError') {
      return 'No matching passkey found for this account on this device.';
    }
    if (name === 'SecurityError') {
      return 'Domain or security configuration mismatch. Please use password sign-in.';
    }
    if (name === 'AbortError') {
      return 'Passkey sign-in was cancelled.';
    }
    if (name === 'NotSupportedError') {
      return 'Passkey is not supported on this device or browser.';
    }
    return 'Passkey sign-in failed. Please try again or use password.';
  };

  // State tracking for passkey button
  let passkeyInProgress = false;

  const showError = (message, allowHtml = false) => {
    if (!errorEl) {
      return;
    }
    if (!message) {
      errorEl.textContent = '';
      errorEl.innerHTML = '';
      errorEl.classList.add('is-hidden');
      return;
    }
    if (allowHtml) {
      errorEl.innerHTML = message;
    } else {
      errorEl.textContent = message;
    }
    errorEl.classList.remove('is-hidden');
  };

  const mapOauthError = (value) => {
    const errors = {
      access_denied: 'Sign-in cancelled. Please try again.',
      oauth_unavailable: 'OAuth is not configured. Please sign in with email and password.',
      state_invalid: 'Sign-in expired. Please try again.',
      token_exchange_failed: 'Sign-in failed. Please try again.',
      id_token_invalid: 'Sign-in failed. Please try again.',
      email_missing: 'We could not read your email. Please sign in with password and try again.',
      account_link_failed: 'Unable to link this account. Please sign in with password.',
      provider_error: 'Sign-in failed. Please try again.',
    };
    return errors[value] || 'Sign-in failed. Please try again.';
  };

  const showDuplicateEmailMessage = () => {
    const message = [
      'That email already has an account. ',
      '<a href="/auth/login/">Sign in</a>',
      ' or ',
      '<a href="/auth/password-reset/">reset your password</a>.',
    ].join('');
    showError(message, true);
  };

  const setLoggedInState = (isLoggedIn, email) => {
    if (!form || !loggedInEl) {
      return;
    }
    if (isLoggedIn) {
      form.classList.add('is-hidden');
      loggedInEl.classList.remove('is-hidden');
      const statusLine = loggedInEl.querySelector('p');
      if (statusLine) {
        statusLine.textContent = email ? `Signed in as ${email}.` : 'You are signed in.';
      }
    } else {
      loggedInEl.classList.add('is-hidden');
      form.classList.remove('is-hidden');
    }
  };

  const fetchAuthState = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        setLoggedInState(false);
        return false;
      }
      const data = await response.json();
      if (data.authenticated) {
        setLoggedInState(true, data.user?.email);
        return true;
      }
      setLoggedInState(false);
      return false;
    } catch (error) {
      setLoggedInState(false);
      return false;
    }
  };

  const setTurnstileState = (state, message) => {
    // Turnstile UI state machine: idle -> running -> ready, with needs-interaction/failed overrides.
    turnstileState = state;
    const canBypass = !!turnstileConfig.bypass;
    if (submitButton) {
      submitButton.disabled = state === 'running';
    }
    if (turnstileStatusEl) {
      const messages = {
        idle: '',
        running: 'Verifying you are human...',
        'needs-interaction': 'Complete the human check to continue.',
        failed: 'Verification failed, try again.',
        ready: 'Verified.',
      };
      let next = message || messages[state] || '';
      if (state === 'ready' && !turnstileSubmitted) {
        next = '';
      }
      turnstileStatusEl.textContent = next;
      turnstileStatusEl.classList.toggle('is-hidden', !next || canBypass);
    }
    if (turnstileLabelEl && turnstileContainer) {
      const showChallenge = state === 'needs-interaction' || state === 'failed';
      turnstileLabelEl.classList.toggle('is-hidden', !showChallenge);
      turnstileContainer.classList.toggle('is-hidden', !showChallenge);
    }
  };

  const shouldShowPasskeyNudge = () => {
    if (!passkeyNudgeEl) {
      return false;
    }
    try {
      const last = Number(localStorage.getItem(PASSKEY_NUDGE_KEY) || 0);
      return !last || Date.now() - last > PASSKEY_NUDGE_SUPPRESS_MS;
    } catch (error) {
      return true;
    }
  };

  const dismissPasskeyNudge = () => {
    try {
      localStorage.setItem(PASSKEY_NUDGE_KEY, String(Date.now()));
    } catch (error) {
      // Ignore storage failures
    }
  };

  const fetchTurnstileConfig = async () => {
    try {
      const response = await fetch('/api/auth/turnstile', {
        credentials: 'include',
      });
      if (!response.ok) {
        return { siteKey: '', bypass: false };
      }
      const data = await response.json();
      return { siteKey: data.siteKey || '', bypass: !!data.bypass };
    } catch (error) {
      return { siteKey: '', bypass: false };
    }
  };

  const checkAccountExists = async (email) => {
    try {
      const response = await fetch(`/api/auth/exists?email=${encodeURIComponent(email)}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return !!data.exists;
    } catch (error) {
      return null;
    }
  };

  const logDebug = (message) => {
    // Only log in debug environments
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      console.log('[Auth Debug]', message);
    }
  };

  const loadWebAuthnBrowser = async () => {
    if (window.__webauthnBrowser) {
      return window.__webauthnBrowser;
    }
    if (window.__webauthnBrowserPromise) {
      return window.__webauthnBrowserPromise;
    }
    const moduleUrl = '/vendor/simplewebauthn-browser-9.0.1.bundle.js';
    window.__webauthnBrowserPromise = import(moduleUrl)
      .then((mod) => {
        window.__webauthnBrowser = mod;
        return mod;
      })
      .catch((error) => {
        console.error('[Passkey] Failed to load ' + moduleUrl + ': ' + error.message);
        throw error;
      });
    return window.__webauthnBrowserPromise;
  };

  const renderTurnstile = async (interactive = false) => {
    if (!form || !tokenInput) {
      return;
    }
    if (turnstileConfig.bypass) {
      logDebug('Turnstile bypass enabled (local dev mode)');
      setTurnstileState('ready');
      return;
    }
    if (!turnstileConfig.siteKey) {
      showError('Turnstile is not configured.');
      logDebug('Turnstile site key missing');
      setTurnstileState('failed', 'Verification unavailable.');
      return;
    }
    if (!turnstileClient) {
      showError('Turnstile failed to load.');
      logDebug('Turnstile client not available');
      setTurnstileState('failed', 'Verification failed, try again.');
      return;
    }
    const loaded = await turnstileClient.loadTurnstileOnce({ siteKey: turnstileConfig.siteKey });
    if (!loaded) {
      showError('Turnstile failed to load.');
      logDebug('Turnstile script failed to load');
      setTurnstileState('failed', 'Verification failed, try again.');
      return;
    }
    const containerId = authMode === 'signup' ? 'turnstile-signup' : 'turnstile-login';
    const container = document.getElementById(containerId);
    if (!container) {
      logDebug('Turnstile container not found: ' + containerId);
      return;
    }
    if (turnstileLabelEl && container) {
      turnstileLabelEl.classList.toggle('is-hidden', !interactive);
      container.classList.toggle('is-hidden', !interactive);
    }
    if (turnstileWidgetId === null) {
      turnstileWidgetId = await turnstileClient.renderTurnstile({
        container,
        siteKey: turnstileConfig.siteKey,
        appearance: 'interaction-only',
        size: 'flexible',
        onSuccess: (token) => {
          tokenInput.value = token || '';
          lastTurnstileToken = token || '';
          window.__lastTurnstileToken = token || '';
          logDebug('Turnstile token received, length: ' + (token ? token.length : 0));
          setTurnstileState('ready');
        },
        onError: () => {
          tokenInput.value = '';
          lastTurnstileToken = '';
          window.__lastTurnstileToken = '';
          turnstileExecuted = false;
          logDebug('Turnstile widget error');
          showError('Turnstile validation failed.');
          setTurnstileState('failed');
        },
        onExpire: () => {
          tokenInput.value = '';
          lastTurnstileToken = '';
          window.__lastTurnstileToken = '';
          turnstileExecuted = false;
          logDebug('Turnstile token expired');
          setTurnstileState('needs-interaction');
        },
      });
    }
    if (interactive) {
      setTurnstileState('needs-interaction');
    }
  };

  const waitForAuthState = async (options = {}) => {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 2500;
    const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 200;
    const deadline = Date.now() + timeoutMs;
    let authenticated = await fetchAuthState();
    while (!authenticated && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      authenticated = await fetchAuthState();
    }
    return authenticated;
  };

  const executeTurnstileOnce = async () => {
    if (!turnstileClient || turnstileExecuted || turnstileWidgetId === null) {
      return;
    }
    turnstileExecuted = true;
    setTurnstileState('running');
    
    // Add timeout to prevent infinite hang
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve(''), 30000); // 30 second timeout
    });
    
    const token = await Promise.race([
      turnstileClient.getTokenOrExecute({ widgetId: turnstileWidgetId }),
      timeoutPromise,
    ]);
    
    if (!token) {
      turnstileExecuted = false;
      setTurnstileState('needs-interaction');
      // Show the widget for manual interaction
      if (turnstileLabelEl) {
        turnstileLabelEl.classList.remove('is-hidden');
      }
      if (turnstileContainer) {
        turnstileContainer.classList.remove('is-hidden');
      }
    }
  };

  const requestEmailVerification = async (email) => {
    const trimmed = (email || '').trim();
    if (!trimmed) {
      showError('Enter your email to resend the verification link.');
      return false;
    }
    if (!turnstileConfig.siteKey && !turnstileConfig.bypass) {
      turnstileConfig = await fetchTurnstileConfig();
    }
    let token = '';
    if (!turnstileConfig.bypass) {
      await renderTurnstile(true);
      await executeTurnstileOnce();
      token = (tokenInput && tokenInput.value) || lastTurnstileToken || '';
      if (!token) {
        showError('Complete the human check to resend the verification email.');
        return false;
      }
    }
    await fetch('/api/auth/email/verify/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: trimmed, turnstileToken: token || '' }),
    });
    showError('Verification email sent. Check your inbox.');
    return true;
  };

  const fetchPasskeys = async () => {
    const response = await fetch('/api/auth/passkey/list', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.credentials || [];
  };

  const startPasskeyEnrollment = async () => {
    if (!window.PublicKeyCredential) {
      showError('Passkeys are not supported on this device.');
      return false;
    }
    let browser;
    try {
      browser = await loadWebAuthnBrowser();
    } catch (error) {
      showError('Passkey support is unavailable.');
      return false;
    }
    const optionsResponse = await fetch('/api/auth/passkey/register/options', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ nickname: '' }),
    });
    if (!optionsResponse.ok) {
      showError('Unable to start passkey registration.');
      return false;
    }
    const optionsData = await optionsResponse.json();
    if (!optionsData.options) {
      showError('Unable to start passkey registration.');
      return false;
    }
    let attestationResponse;
    try {
      attestationResponse = await browser.startRegistration(optionsData.options);
    } catch (error) {
      showError('Passkey registration was cancelled.');
      return false;
    }
    const verifyResponse = await fetch('/api/auth/passkey/register/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ attestationResponse, nickname: '' }),
    });
    if (!verifyResponse.ok) {
      showError('Passkey registration failed.');
      return false;
    }
    return true;
  };

  const maybeShowPasskeyNudge = async () => {
    // One-time passkey nudge after password login if the account has no passkeys.
    if (!passkeyNudgeEl || !shouldShowPasskeyNudge()) {
      return false;
    }
    const credentials = await fetchPasskeys();
    if (!credentials || credentials.length > 0) {
      return false;
    }
    passkeyNudgeEl.classList.remove('is-hidden');
    if (form) {
      form.classList.add('is-hidden');
    }
    if (loggedInEl) {
      loggedInEl.classList.add('is-hidden');
    }
    return true;
  };

  const submitAuth = async (payload) => {
    const response = await fetch(`/api/auth/${authMode}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return response;
  };

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      showError('');
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({}),
        });
      } catch (error) {
        showError('Unable to sign out.');
      }
      await fetchAuthState();
      window.location.href = '/';
    });
  }

  const startOauth = (provider) => {
    if (!provider) {
      return;
    }
    window.location.href = `/api/auth/oauth/${provider}/start`;
  };

  if (oauthGoogleButton) {
    oauthGoogleButton.addEventListener('click', () => startOauth('google'));
  }

  if (passkeyNudgeAdd) {
    passkeyNudgeAdd.addEventListener('click', async () => {
      showError('');
      const ok = await startPasskeyEnrollment();
      if (!ok) {
        return;
      }
      if (passkeyNudgeEl) {
        passkeyNudgeEl.classList.add('is-hidden');
      }
      if (form) {
        form.classList.add('is-hidden');
      }
      await fetchAuthState();
    });
  }

  if (passkeyNudgeSkip) {
    passkeyNudgeSkip.addEventListener('click', async () => {
      dismissPasskeyNudge();
      if (passkeyNudgeEl) {
        passkeyNudgeEl.classList.add('is-hidden');
      }
      if (form) {
        form.classList.add('is-hidden');
      }
      await fetchAuthState();
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      showError('');
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const passwordConfirm = passwordConfirmInput ? passwordConfirmInput.value : '';
      if (!email || !password) {
        showError('Email and password are required.');
        return;
      }
      if (authMode === 'signup' && password !== passwordConfirm) {
        showError('Passwords do not match.');
        return;
      }
      if (authMode === 'signup' && password.length < 12) {
        showError('Password must be at least 12 characters.');
        return;
      }
      turnstileSubmitted = true;
      if (authMode === 'signup') {
        const exists = await checkAccountExists(email);
        if (exists) {
          showDuplicateEmailMessage();
          return;
        }
      }
      if (!turnstileConfig.siteKey && !turnstileConfig.bypass) {
        turnstileConfig = await fetchTurnstileConfig();
      }
      const tokenValue = tokenInput && tokenInput.value ? tokenInput.value : lastTurnstileToken;
      const hasToken = !!tokenValue;
      logDebug('Submitting ' + authMode + ', token present: ' + (hasToken ? 'yes (' + tokenValue.length + ' chars)' : 'no'));
      if (!turnstileConfig.bypass && !hasToken) {
        setTurnstileState('needs-interaction');
        await renderTurnstile(true);
        await executeTurnstileOnce();
        logDebug('Submission blocked: no token and bypass disabled');
        return;
      }
      const response = await submitAuth({
        email,
        password,
        turnstileToken: tokenValue || '',
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        logDebug('Server error: ' + (errorBody.code || 'unknown'));
        if (authMode === 'signup' && response.status === 409 && errorBody.code === 'EMAIL_EXISTS') {
          showDuplicateEmailMessage();
        } else if (authMode === 'login' && errorBody.code === 'EMAIL_NOT_VERIFIED') {
          showError(
            'Email not verified. Check your inbox or <button class="link-button" type="button" data-email-verify-resend>resend verification email</button>.',
            true
          );
        } else if (authMode === 'login' && (errorBody.code === 'PASSWORD_INCORRECT' || response.status === 401)) {
          showError('Password incorrect');
        } else if (authMode === 'login' && (errorBody.code === 'ACCOUNT_NOT_FOUND' || response.status === 404)) {
          showError('Account not found');
        } else {
          showError(authMode === 'signup' ? 'Unable to create account.' : 'Unable to sign in.');
        }
        if (turnstileClient && turnstileWidgetId !== null) {
          turnstileClient.resetWidget(turnstileWidgetId);
        }
        tokenInput.value = '';
        turnstileExecuted = false;
        turnstileSubmitted = false;
        setTurnstileState('idle');
        return;
      }
      if (turnstileClient && turnstileWidgetId !== null) {
        turnstileClient.resetWidget(turnstileWidgetId);
      }
      tokenInput.value = '';
      turnstileExecuted = false;
      turnstileSubmitted = false;
      setTurnstileState('idle');
      logDebug(authMode + ' successful');
      const successData = await response.json().catch(() => ({}));
      if (authMode === 'signup' && successData && successData.status === 'VERIFICATION_REQUIRED') {
        showError(
          'Check your email to verify your account. <button class="link-button" type="button" data-email-verify-resend>Resend verification email</button>.',
          true
        );
        return;
      }
      const authenticated = await waitForAuthState();
      if (window.AuthUI && typeof window.AuthUI.fetchAuthState === 'function') {
        await window.AuthUI.fetchAuthState();
      }
      window.dispatchEvent(
        new CustomEvent('auth:changed', { detail: { authenticated: !!authenticated } })
      );
      if (authMode === 'login' && authenticated) {
        const nudged = await maybeShowPasskeyNudge();
        if (nudged) {
          return;
        }
        if (window.PasskeyPrompt && typeof window.PasskeyPrompt.queueAfterPasswordLogin === 'function') {
          window.PasskeyPrompt.queueAfterPasswordLogin();
        }
      }
      if (authMode === 'signup' && authenticated) {
        showError('Account created. Add a passkey from your account page.');
      }
      if (authMode === 'signup' && !authenticated) {
        showError('Account created. Please sign in.');
      }
    });
  }

  if (form) {
    form.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-email-verify-resend]');
      if (!target) {
        return;
      }
      event.preventDefault();
      const email = emailInput ? emailInput.value.trim() : '';
      await requestEmailVerification(email);
    });
  }

  // Core passkey authentication function for login page
  const doPasskeyLogin = async (attachmentHint) => {
    // User activation guard: prevent double-calls
    if (passkeyInProgress) {
      logDebug('Passkey login already in progress, ignoring');
      return;
    }
    passkeyInProgress = true;
    
    // Disable button and show loading state
    if (passkeyButton) {
      passkeyButton.disabled = true;
      passkeyButton.textContent = 'Signing in...';
    }
    
    const resetButton = () => {
      passkeyInProgress = false;
      if (passkeyButton) {
        passkeyButton.disabled = false;
        passkeyButton.textContent = 'Sign in with passkey';
      }
    };
    
    showError('');
    
    // Debug: Log environment info (safe, no secrets)
    logDebug('Starting passkey login', {
      origin: window.location.origin,
      hostname: window.location.hostname,
      attachmentHint: attachmentHint || 'none',
      userAgent: navigator.userAgent.substring(0, 100),
    });
    
    let browser;
    try {
      browser = await loadWebAuthnBrowser();
      logDebug('WebAuthn browser loaded successfully');
    } catch (error) {
      logDebug('WebAuthn browser load failed:', error.name, error.message);
      showError('Passkey support is unavailable.');
      resetButton();
      return;
    }
    
    // Fetch options from server
    const optionsBody = {};
    if (attachmentHint) {
      optionsBody.attachmentHint = attachmentHint;
    }
    
    let optionsResponse;
    try {
      optionsResponse = await fetch('/api/auth/passkey/login/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(optionsBody),
      });
    } catch (error) {
      logDebug('Options fetch failed:', error.name, error.message);
      showError('Unable to start passkey sign-in. Check your connection.');
      resetButton();
      return;
    }
    
    logDebug('Options response status:', optionsResponse.status);
    
    if (!optionsResponse.ok) {
      showError('Unable to start passkey sign-in.');
      resetButton();
      return;
    }
    
    const optionsData = await optionsResponse.json();
    if (!optionsData.options || !optionsData.challengeId) {
      logDebug('Invalid options data:', { hasOptions: !!optionsData.options, hasChallengeId: !!optionsData.challengeId });
      showError('Unable to start passkey sign-in.');
      resetButton();
      return;
    }
    
    // Debug: Log safe options info
    logDebug('Options received', {
      rpId: optionsData.options.rpId || '(not set)',
      allowCredentialsCount: optionsData.options.allowCredentials ? optionsData.options.allowCredentials.length : 0,
      userVerification: optionsData.options.userVerification || '(not set)',
      timeout: optionsData.options.timeout || '(not set)',
    });
    
    // Start WebAuthn authentication with timeout handling
    let assertionResponse;
    try {
      logDebug('Calling startAuthentication');
      assertionResponse = await browser.startAuthentication(optionsData.options);
      logDebug('Authentication succeeded');
    } catch (error) {
      logDebug('Authentication error:', {
        name: error.name,
        message: error.message,
      });
      const friendlyMessage = mapPasskeyError(error);
      showError(friendlyMessage);
      resetButton();
      return;
    }
    
    if (!assertionResponse) {
      logDebug('No assertion response returned');
      showError('Passkey sign-in failed.');
      resetButton();
      return;
    }
    
    logDebug('Assertion response received', {
      id: '(present)',
      type: assertionResponse.type,
      hasResponse: !!assertionResponse.response,
    });
    
    // Verify with server
    let verifyResponse;
    try {
      verifyResponse = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          assertionResponse,
          challengeId: optionsData.challengeId,
        }),
      });
    } catch (error) {
      logDebug('Verify fetch failed:', error.name, error.message);
      showError('Passkey verification failed. Check your connection.');
      resetButton();
      return;
    }
    
    logDebug('Verify response status:', verifyResponse.status);
    
    if (!verifyResponse.ok) {
      const data = await verifyResponse.json().catch(() => ({}));
      logDebug('Verify failed', {
        status: verifyResponse.status,
        code: data.code || '(none)',
      });
      if (data && data.code === 'UNKNOWN_CREDENTIAL') {
        showError('No matching passkey found on this device. Sign in with password, then add a passkey.');
      } else if (data && data.code === 'RP_ID_MISMATCH') {
        showError('Domain mismatch. Please use password sign-in.');
      } else {
        showError('Passkey sign-in failed.');
      }
      resetButton();
      return;
    }
    
    const authenticated = await waitForAuthState();
    if (window.AuthUI && typeof window.AuthUI.fetchAuthState === 'function') {
      await window.AuthUI.fetchAuthState();
    }
    window.dispatchEvent(
      new CustomEvent('auth:changed', { detail: { authenticated: !!authenticated } })
    );
    if (!authenticated) {
      logDebug('Auth state refresh failed');
      showError('Passkey sign-in failed.');
      resetButton();
      return;
    }
    
    logDebug('Login successful');
    // Reset button state even on success for clean UI
    resetButton();
  };

  if (passkeyButton && authMode === 'login') {
    if (!window.PublicKeyCredential) {
      passkeyButton.disabled = true;
      passkeyButton.textContent = 'Passkey not supported on this device';
    }
    passkeyButton.addEventListener('click', () => {
      // Direct click handler - maintains user activation
      doPasskeyLogin();
    });
  }

  const initTurnstile = async () => {
    turnstileConfig = await fetchTurnstileConfig();
    setTurnstileState(turnstileConfig.bypass ? 'ready' : 'idle');
    await renderTurnstile(false);
  };

  const oauthError = new URLSearchParams(window.location.search || '').get('oauth_error');
  if (oauthError) {
    showError(mapOauthError(oauthError));
  }

  // Diagnostics panel (enabled with ?debugAuth=1)
  const diagPanel = document.getElementById('passkey-diagnostics');
  const diagOutput = document.getElementById('passkey-diag-output');
  const diagButton = document.getElementById('passkey-diag-run');
  
  if (debugAuth && diagPanel) {
    diagPanel.classList.remove('is-hidden');
    
    const runDiagnostics = async () => {
      const lines = [];
      const log = (msg) => lines.push(msg);
      
      log('=== Passkey Diagnostics ===');
      log('');
      log(`Time: ${new Date().toISOString()}`);
      log(`Origin: ${window.location.origin}`);
      log(`Hostname: ${window.location.hostname}`);
      log(`Protocol: ${window.location.protocol}`);
      log(`User Agent: ${navigator.userAgent}`);
      log('');
      
      // Check WebAuthn support
      log('--- WebAuthn Support ---');
      if (window.PublicKeyCredential) {
        log('PublicKeyCredential: YES');
        
        // Check platform authenticator availability
        try {
          const platformAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          log(`Platform Authenticator Available: ${platformAvailable ? 'YES' : 'NO'}`);
        } catch (e) {
          log(`Platform Authenticator Check Error: ${e.message}`);
        }
        
        // Check conditional mediation (autofill) support
        try {
          if (PublicKeyCredential.isConditionalMediationAvailable) {
            const conditionalAvailable = await PublicKeyCredential.isConditionalMediationAvailable();
            log(`Conditional Mediation (Autofill): ${conditionalAvailable ? 'YES' : 'NO'}`);
          } else {
            log('Conditional Mediation: Not supported');
          }
        } catch (e) {
          log(`Conditional Mediation Check Error: ${e.message}`);
        }
      } else {
        log('PublicKeyCredential: NO - WebAuthn not supported');
      }
      log('');
      
      // Fetch server options to check RP ID
      log('--- Server Configuration ---');
      try {
        const optionsResponse = await fetch('/api/auth/passkey/login/options', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        if (optionsResponse.ok) {
          const data = await optionsResponse.json();
          log(`Options fetch: OK`);
          log(`RP ID: ${data.options?.rpId || '(not set)'}`);
          log(`Timeout: ${data.options?.timeout || '(not set)'}`);
          log(`User Verification: ${data.options?.userVerification || '(not set)'}`);
          log(`Allow Credentials: ${data.options?.allowCredentials?.length || 0}`);
          log(`Challenge ID: ${data.challengeId ? '(present)' : '(missing)'}`);
          
          // Check RP ID matches hostname
          if (data.options?.rpId && data.options.rpId !== window.location.hostname) {
            log('');
            log(`⚠️  WARNING: RP ID (${data.options.rpId}) does not match hostname (${window.location.hostname})`);
            log('    This may cause passkey lookups to fail!');
          }
        } else {
          log(`Options fetch: FAILED (${optionsResponse.status})`);
        }
      } catch (e) {
        log(`Options fetch error: ${e.message}`);
      }
      log('');
      
      log('--- Recommendations ---');
      log('1. Ensure you have registered a passkey on this device first');
      log('2. Check that Windows Hello is enabled in Windows Settings');
      log('3. Try: Settings > Accounts > Sign-in options > Windows Hello');
      log('');
      log('=== End Diagnostics ===');
      
      if (diagOutput) {
        diagOutput.textContent = lines.join('\n');
      }
    };
    
    if (diagButton) {
      diagButton.addEventListener('click', runDiagnostics);
    }
    
    // Auto-run on page load when debug is enabled
    runDiagnostics();
  }

  fetchAuthState();
  initTurnstile();
})();
