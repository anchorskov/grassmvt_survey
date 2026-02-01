/* public/js/login-modal.js */
(() => {
  const modal = document.getElementById('login-modal');
  if (!modal) {
    return;
  }

  const authUI = window.AuthUI || {
    state: { email: '' },
    fetchAuthState: async () => false,
    logout: async () => {},
  };
  const ensureAuthModals = () => {
    if (window.AuthModals) {
      return window.AuthModals;
    }
    const registry = {};
    const api = {
      registry,
      register: (name, modalApi) => {
        if (!name || !modalApi) {
          return;
        }
        registry[name] = modalApi;
      },
      open: (name) => {
        const target = name || 'login';
        Object.values(registry).forEach((modalApi) => {
          if (modalApi && typeof modalApi.close === 'function') {
            modalApi.close();
          }
        });
        if (registry[target] && typeof registry[target].open === 'function') {
          registry[target].open();
        }
      },
      closeAll: () => {
        Object.values(registry).forEach((modalApi) => {
          if (modalApi && typeof modalApi.close === 'function') {
            modalApi.close();
          }
        });
      },
    };
    window.AuthModals = api;
    return api;
  };
  const authModals = ensureAuthModals();

  const form = document.getElementById('login-modal-form');
  const emailInput = document.getElementById('login-modal-email');
  const passwordInput = document.getElementById('login-modal-password');
  const tokenInput = document.getElementById('login-modal-token');
  const errorEl = document.getElementById('login-modal-error');
  const loggedInEl = document.getElementById('login-modal-logged-in');
  const logoutButton = document.getElementById('login-modal-logout');
  const turnstileContainer = document.getElementById('login-modal-turnstile');
  const passkeyButton = document.getElementById('login-passkey-button');
  const turnstileClient = window.TurnstileClient;
  const submitButton = document.getElementById('login-modal-submit');
  const turnstileStatusEl = document.getElementById('login-modal-turnstile-status');
  const turnstileLabelEl = document.getElementById('login-modal-turnstile-label');
  const passkeyNudgeEl = document.getElementById('login-modal-passkey-nudge');
  const passkeyNudgeAdd = document.getElementById('login-modal-passkey-add');
  const passkeyNudgeSkip = document.getElementById('login-modal-passkey-skip');

  let turnstileWidgetId = null;
  let lastTurnstileToken = '';
  let turnstileConfig = { siteKey: '', bypass: false };
  let turnstileState = 'idle';
  let turnstileExecuted = false;
  let turnstileSubmitted = false;
  let pendingOauthError = '';
  let pendingFormSubmit = null; // Store pending form submission to auto-continue after Turnstile

  const PASSKEY_NUDGE_KEY = 'passkey_nudge_dismissed_at';
  const PASSKEY_NUDGE_SUPPRESS_MS = 30 * 24 * 60 * 60 * 1000;
  const AUTH_RETURN_KEY = 'auth_return_to';

  const storeAuthReturnTo = () => {
    try {
      const { pathname, search, hash } = window.location;
      if (pathname.startsWith('/auth/')) {
        return;
      }
      const returnTo = `${pathname}${search || ''}${hash || ''}`;
      localStorage.setItem(AUTH_RETURN_KEY, returnTo);
    } catch (error) {
      // Ignore storage failures
    }
  };

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

  const waitForAuthState = async (options = {}) => {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 2500;
    const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 200;
    const deadline = Date.now() + timeoutMs;
    let authenticated = await authUI.fetchAuthState();
    while (!authenticated && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      authenticated = await authUI.fetchAuthState();
    }
    return authenticated;
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
      if (!turnstileClient || turnstileWidgetId === null) {
        showError('Turnstile failed to load.');
        return false;
      }
      setTurnstileState('running');
      token = await turnstileClient.getTokenOrExecute({ widgetId: turnstileWidgetId });
      if (!token) {
        setTurnstileState('failed');
        showError('Complete the human check to resend the verification email.');
        return false;
      }
      if (tokenInput) {
        tokenInput.value = token;
      }
      lastTurnstileToken = token;
      setTurnstileState('ready');
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
      const response = await fetch('/api/auth/turnstile', { credentials: 'include' });
      if (!response.ok) {
        return { siteKey: '', bypass: false };
      }
      const data = await response.json();
      return { siteKey: data.siteKey || '', bypass: !!data.bypass };
    } catch (error) {
      return { siteKey: '', bypass: false };
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

  const resetTurnstile = () => {
    if (turnstileClient && turnstileWidgetId !== null) {
      turnstileClient.resetWidget(turnstileWidgetId);
    }
    if (tokenInput) {
      tokenInput.value = '';
    }
    lastTurnstileToken = '';
    turnstileExecuted = false;
    turnstileSubmitted = false;
    pendingFormSubmit = null;
    setTurnstileState('idle');
  };

  const renderTurnstile = async (interactive = false) => {
    if (!turnstileContainer || !tokenInput) {
      return;
    }
    if (turnstileConfig.bypass) {
      setTurnstileState('ready');
      return;
    }
    if (!turnstileConfig.siteKey) {
      showError('Turnstile is not configured.');
      setTurnstileState('failed', 'Verification unavailable.');
      return;
    }
    if (!turnstileClient) {
      showError('Turnstile failed to load.');
      setTurnstileState('failed', 'Verification failed, try again.');
      return;
    }
    const loaded = await turnstileClient.loadTurnstileOnce({ siteKey: turnstileConfig.siteKey });
    if (!loaded) {
      showError('Turnstile failed to load.');
      setTurnstileState('failed', 'Verification failed, try again.');
      return;
    }
    if (turnstileLabelEl) {
      turnstileLabelEl.classList.toggle('is-hidden', !interactive);
    }
    turnstileContainer.classList.toggle('is-hidden', !interactive);

    if (turnstileWidgetId === null) {
      turnstileWidgetId = await turnstileClient.renderTurnstile({
        container: turnstileContainer,
        siteKey: turnstileConfig.siteKey,
        appearance: 'interaction-only',
        size: 'flexible',
        onSuccess: (token) => {
          tokenInput.value = token || '';
          lastTurnstileToken = token || '';
          setTurnstileState('ready');
          // Auto-continue pending form submission after Turnstile succeeds
          if (pendingFormSubmit && typeof pendingFormSubmit === 'function') {
            const submit = pendingFormSubmit;
            pendingFormSubmit = null;
            submit();
          }
        },
        onError: () => {
          tokenInput.value = '';
          lastTurnstileToken = '';
          turnstileExecuted = false;
          pendingFormSubmit = null;
          setTurnstileState('failed');
        },
        onExpire: () => {
          tokenInput.value = '';
          lastTurnstileToken = '';
          turnstileExecuted = false;
          pendingFormSubmit = null;
          setTurnstileState('needs-interaction');
        },
      });
    }

    if (interactive) {
      setTurnstileState('needs-interaction');
    }
  };

  const openModal = async () => {
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    if (pendingOauthError) {
      showError(mapOauthError(pendingOauthError));
      pendingOauthError = '';
    } else {
      showError('');
    }
    if (passkeyNudgeEl) {
      passkeyNudgeEl.classList.add('is-hidden');
    }
    turnstileExecuted = false;
    turnstileSubmitted = false;
    const authenticated = await authUI.fetchAuthState();
    setLoggedInState(authenticated, authUI.state.email);
    
    // If user is authenticated (e.g., just signed up), check for passkey nudge
    // Force show for new signups, respect dismissal for regular logins
    if (authenticated) {
      const forceShow = document.body.classList.contains('auth-just-signed-up');
      await maybeShowPasskeyNudge(forceShow);
      document.body.classList.remove('auth-just-signed-up');
      turnstileConfig = await fetchTurnstileConfig();
      setTurnstileState(turnstileConfig.bypass ? 'ready' : 'idle');
      return;
    }
    
    turnstileConfig = await fetchTurnstileConfig();
    setTurnstileState(turnstileConfig.bypass ? 'ready' : 'idle');
    await renderTurnstile(false);
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    showError('');
    pendingFormSubmit = null;
    resetTurnstile();
    if (turnstileLabelEl) {
      turnstileLabelEl.classList.add('is-hidden');
    }
    if (turnstileContainer) {
      turnstileContainer.classList.add('is-hidden');
    }
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

  const refreshAuthState = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        setLoggedInState(false, '');
        return false;
      }
      const data = await response.json();
      if (data.authenticated) {
        const email = data.user?.email || '';
        if (authUI && authUI.state) {
          authUI.state.email = email;
        }
        setLoggedInState(true, email);
        window.dispatchEvent(
          new CustomEvent('auth:changed', { detail: { authenticated: true } })
        );
        return true;
      }
      setLoggedInState(false, '');
      return false;
    } catch (error) {
      setLoggedInState(false, '');
      return false;
    }
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

  const maybeShowPasskeyNudge = async (forceShow = false) => {
    // One-time passkey nudge after password login if the account has no passkeys.
    // forceShow=true will ignore dismissal (used after signup).
    if (!passkeyNudgeEl) {
      return false;
    }
    if (!forceShow && !shouldShowPasskeyNudge()) {
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

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await authUI.logout();
      setLoggedInState(false, '');
    });
  }

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

  if (passkeyNudgeSkip) {
    passkeyNudgeSkip.addEventListener('click', () => {
      dismissPasskeyNudge();
      closeModal();
      window.location.href = '/surveys/list/';
    });
  }

  if (modal) {
    modal.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-email-verify-resend]');
      if (!target) {
        return;
      }
      event.preventDefault();
      const email = emailInput ? emailInput.value.trim() : '';
      await requestEmailVerification(email);
    });
  }

  // Core login function - separated to allow auto-continue after Turnstile
  const performLogin = async (email, password, tokenValue) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email,
        password,
        turnstileToken: tokenValue || '',
      }),
    });
    if (!response.ok) {
      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }
        if (data && data.code === 'PASSWORD_INCORRECT') {
          showError('Password incorrect');
        } else if (data && data.code === 'ACCOUNT_NOT_FOUND') {
          showError('Account not found');
        } else if (data && data.code === 'EMAIL_NOT_VERIFIED') {
          storeAuthReturnTo();
          showError(
            'Email not verified. Check your inbox or <button class="link-button" type="button" data-email-verify-resend>resend verification email</button>.',
            true
          );
        } else if (response.status === 404) {
          showError('Account not found');
        } else if (response.status === 401) {
          showError('Password incorrect');
      } else {
        showError('Unable to sign in.');
      }
      resetTurnstile();
      return;
    }
    resetTurnstile();
    const authenticated = await waitForAuthState();
    if (authenticated) {
      window.dispatchEvent(
        new CustomEvent('auth:changed', { detail: { authenticated: true } })
      );
      if (window.PasskeyPrompt && typeof window.PasskeyPrompt.queueAfterPasswordLogin === 'function') {
        window.PasskeyPrompt.queueAfterPasswordLogin();
      }
      const nudged = await maybeShowPasskeyNudge();
      if (nudged) {
        return;
      }
    }
    closeModal();
    window.location.href = '/surveys/list/';
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      showError('');
      pendingFormSubmit = null; // Clear any pending submit
      turnstileSubmitted = true;
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      if (!email || !password) {
        showError('Email and password are required.');
        return;
      }
      const exists = await checkAccountExists(email);
      if (exists === false && authModals && typeof authModals.open === 'function') {
        authModals.open('signup');
        showError('No account found. Create one to continue.');
        return;
      }
      if (!turnstileConfig.siteKey && !turnstileConfig.bypass) {
        turnstileConfig = await fetchTurnstileConfig();
      }
      const tokenValue = tokenInput && tokenInput.value ? tokenInput.value : lastTurnstileToken;
      if (!turnstileConfig.bypass && !tokenValue) {
        // Store pending submit to auto-continue after Turnstile completes
        pendingFormSubmit = () => {
          const newToken = tokenInput && tokenInput.value ? tokenInput.value : lastTurnstileToken;
          if (newToken) {
            performLogin(email, password, newToken);
          } else {
            showError('Verification failed. Please try again.');
            resetTurnstile();
          }
        };
        setTurnstileState('running', 'Verifying you are human...');
        await renderTurnstile(true);
        await executeTurnstileOnce();
        return;
      }
      await performLogin(email, password, tokenValue);
    });
  }

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
  
  // Core passkey authentication function
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
      // Set a reasonable timeout (default 60 seconds)
      const authTimeout = optionsData.options.timeout || 60000;
      logDebug('Calling startAuthentication with timeout:', authTimeout);
      
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
    
    showError('');
    const authenticated = await refreshAuthState();
    if (!authenticated) {
      logDebug('Auth state refresh failed');
      showError('Passkey sign-in failed.');
      resetButton();
      return;
    }
    
    logDebug('Login successful, redirecting');
    closeModal();
    window.location.href = '/surveys/list/';
  };
  
  if (passkeyButton) {
    if (!window.PublicKeyCredential) {
      passkeyButton.disabled = true;
      passkeyButton.textContent = 'Passkey not supported on this device';
    }
    passkeyButton.addEventListener('click', () => {
      // Direct click handler - maintains user activation
      doPasskeyLogin();
    });
  }

  authModals.register('login', {
    open: openModal,
    close: closeModal,
  });

  const urlParams = new URLSearchParams(window.location.search || '');
  const oauthError = urlParams.get('oauth_error');
  if (oauthError) {
    pendingOauthError = oauthError;
    authModals.open('login');
  }
})();
