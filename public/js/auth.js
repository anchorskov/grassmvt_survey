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
  const oauthGoogleButton = document.getElementById('auth-oauth-google');
  const oauthAppleButton = document.getElementById('auth-oauth-apple');
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

  const PASSKEY_NUDGE_KEY = 'passkey_nudge_dismissed_at';
  const PASSKEY_NUDGE_SUPPRESS_MS = 30 * 24 * 60 * 60 * 1000;

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
    const hasToken = !!(tokenInput && tokenInput.value) || !!lastTurnstileToken;
    const canBypass = !!turnstileConfig.bypass;
    const canSubmit = canBypass || hasToken;
    if (submitButton) {
      submitButton.disabled = !canSubmit || state === 'running';
    }
    if (turnstileStatusEl) {
      const messages = {
        idle: 'Human check runs automatically.',
        running: 'Verifying you are human...',
        'needs-interaction': 'Please complete the human check.',
        failed: 'Verification failed, try again.',
        ready: '',
      };
      const next = message || messages[state] || '';
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

  const ensureTurnstileLoaded = async () => {
    if (window.turnstile) {
      return true;
    }
    if (!window.TurnstileLoader) {
      logDebug('Turnstile loader not available');
      return false;
    }
    try {
      await window.TurnstileLoader.load();
      return !!window.turnstile;
    } catch (error) {
      logDebug('Turnstile loader failed: ' + error.message);
      return false;
    }
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
    const loaded = await ensureTurnstileLoaded();
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
    if (turnstileWidgetId !== null) {
      try {
        window.turnstile.remove(turnstileWidgetId);
      } catch (error) {
        logDebug('Turnstile remove failed: ' + error.message);
      }
      turnstileWidgetId = null;
    }
    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: turnstileConfig.siteKey,
      size: interactive ? 'normal' : 'invisible',
      callback: (token) => {
        tokenInput.value = token || '';
        lastTurnstileToken = token || '';
        window.__lastTurnstileToken = token || '';
        logDebug('Turnstile token received, length: ' + (token ? token.length : 0));
        setTurnstileState('ready');
      },
      'error-callback': () => {
        tokenInput.value = '';
        lastTurnstileToken = '';
        window.__lastTurnstileToken = '';
        logDebug('Turnstile widget error');
        showError('Turnstile validation failed.');
        setTurnstileState('failed');
      },
      'expired-callback': () => {
        tokenInput.value = '';
        lastTurnstileToken = '';
        window.__lastTurnstileToken = '';
        logDebug('Turnstile token expired');
        setTurnstileState('needs-interaction');
      },
    });
    if (!interactive && window.turnstile && typeof window.turnstile.execute === 'function') {
      setTurnstileState('running');
      try {
        window.turnstile.execute(turnstileWidgetId);
      } catch (error) {
        setTurnstileState('needs-interaction');
      }
    } else if (interactive) {
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

  if (oauthAppleButton) {
    oauthAppleButton.addEventListener('click', () => startOauth('apple'));
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
        } else if (authMode === 'login' && (errorBody.code === 'PASSWORD_INCORRECT' || response.status === 401)) {
          showError('Password incorrect');
        } else if (authMode === 'login' && (errorBody.code === 'ACCOUNT_NOT_FOUND' || response.status === 404)) {
          showError('Account not found');
        } else {
          showError(authMode === 'signup' ? 'Unable to create account.' : 'Unable to sign in.');
        }
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
        tokenInput.value = '';
        setTurnstileState('idle');
        return;
      }
      if (window.turnstile && turnstileWidgetId !== null) {
        window.turnstile.reset(turnstileWidgetId);
      }
      tokenInput.value = '';
      setTurnstileState('idle');
      logDebug(authMode + ' successful');
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
      }
      if (authMode === 'signup' && authenticated) {
        showError('Account created. Add a passkey from your account page.');
      }
      if (authMode === 'signup' && !authenticated) {
        showError('Account created. Please sign in.');
      }
    });
  }

  if (passkeyButton && authMode === 'login') {
    if (!window.PublicKeyCredential) {
      passkeyButton.disabled = true;
      passkeyButton.textContent = 'Passkey not supported on this device';
    }
    passkeyButton.addEventListener('click', async () => {
      showError('');
      let browser;
      try {
        browser = await loadWebAuthnBrowser();
      } catch (error) {
        showError('Passkey support is unavailable.');
        return;
      }
      const optionsResponse = await fetch('/api/auth/passkey/login/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!optionsResponse.ok) {
        showError('Unable to start passkey sign-in.');
        return;
      }
      const optionsData = await optionsResponse.json();
      if (!optionsData.options || !optionsData.challengeId) {
        showError('Unable to start passkey sign-in.');
        return;
      }
      let assertionResponse;
      try {
        assertionResponse = await browser.startAuthentication(optionsData.options);
      } catch (error) {
        showError('Passkey sign-in was cancelled.');
        return;
      }
      const verifyResponse = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          assertionResponse,
          challengeId: optionsData.challengeId,
        }),
      });
      if (!verifyResponse.ok) {
        const data = await verifyResponse.json().catch(() => ({}));
        if (data && data.code === 'UNKNOWN_CREDENTIAL') {
          showError('No matching passkey found on this device. Sign in with password, then add a passkey.');
        } else {
          showError('Passkey sign-in failed.');
        }
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
        showError('Passkey sign-in failed.');
      }
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

  fetchAuthState();
  initTurnstile();
})();
