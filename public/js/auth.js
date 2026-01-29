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
  let turnstileWidgetId = null;
  let lastTurnstileToken = '';

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
      });
      if (!response.ok) {
        setLoggedInState(false);
        return;
      }
      const data = await response.json();
      if (data.authenticated) {
        setLoggedInState(true, data.user?.email);
      } else {
        setLoggedInState(false);
      }
    } catch (error) {
      setLoggedInState(false);
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

  const renderTurnstile = async () => {
    if (!form || !tokenInput) {
      return;
    }
    const config = await fetchTurnstileConfig();
    if (config.bypass) {
      logDebug('Turnstile bypass enabled (local dev mode)');
      return;
    }
    if (!config.siteKey) {
      showError('Turnstile is not configured.');
      logDebug('Turnstile site key missing');
      return;
    }
    const loaded = await ensureTurnstileLoaded();
    if (!loaded) {
      showError('Turnstile failed to load.');
      logDebug('Turnstile script failed to load');
      return;
    }
    const containerId = authMode === 'signup' ? 'turnstile-signup' : 'turnstile-login';
    const container = document.getElementById(containerId);
    if (!container) {
      logDebug('Turnstile container not found: ' + containerId);
      return;
    }
    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: config.siteKey,
      callback: (token) => {
        tokenInput.value = token || '';
        lastTurnstileToken = token || '';
        window.__lastTurnstileToken = token || '';
        logDebug('Turnstile token received, length: ' + (token ? token.length : 0));
      },
      'error-callback': () => {
        tokenInput.value = '';
        lastTurnstileToken = '';
        window.__lastTurnstileToken = '';
        logDebug('Turnstile widget error');
        showError('Turnstile validation failed.');
      },
      'expired-callback': () => {
        tokenInput.value = '';
        lastTurnstileToken = '';
        window.__lastTurnstileToken = '';
        logDebug('Turnstile token expired');
      },
    });
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
      const config = await fetchTurnstileConfig();
      const tokenValue = tokenInput && tokenInput.value ? tokenInput.value : lastTurnstileToken;
      const hasToken = !!tokenValue;
      logDebug('Submitting ' + authMode + ', token present: ' + (hasToken ? 'yes (' + tokenValue.length + ' chars)' : 'no'));
      if (!config.bypass && !hasToken) {
        showError('Please complete the Turnstile check.');
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
        } else if (authMode === 'login' && response.status === 401 && errorBody.code === 'INVALID_CREDENTIALS') {
          showError('Email or password is incorrect.');
        } else {
          showError(authMode === 'signup' ? 'Unable to create account.' : 'Unable to sign in.');
        }
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
        tokenInput.value = '';
        return;
      }
      if (window.turnstile && turnstileWidgetId !== null) {
        window.turnstile.reset(turnstileWidgetId);
      }
      tokenInput.value = '';
      logDebug(authMode + ' successful');
      const authenticated = await fetchAuthState();
      if (window.AuthUI && typeof window.AuthUI.fetchAuthState === 'function') {
        await window.AuthUI.fetchAuthState();
      }
      window.dispatchEvent(
        new CustomEvent('auth:changed', { detail: { authenticated: !!authenticated } })
      );
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
        showError('Passkey sign-in failed.');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      const authenticated = await fetchAuthState();
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

  fetchAuthState();
  renderTurnstile();
})();
