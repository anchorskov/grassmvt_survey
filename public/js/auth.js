/* public/js/auth.js */
(() => {
  const form = document.getElementById('auth-form');
  const authMode = form ? form.dataset.authMode : '';
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const errorEl = document.getElementById('auth-error');
  const loggedInEl = document.getElementById('auth-logged-in');
  const logoutButton = document.getElementById('logout-button');
  const tokenInput = document.getElementById('turnstile-token');
  let turnstileWidgetId = null;
  let lastTurnstileToken = '';

  const showError = (message) => {
    if (!errorEl) {
      return;
    }
    if (!message) {
      errorEl.textContent = '';
      errorEl.classList.add('is-hidden');
      return;
    }
    errorEl.textContent = message;
    errorEl.classList.remove('is-hidden');
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
    if (!window.turnstile) {
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
      if (!email || !password) {
        showError('Email and password are required.');
        return;
      }
      if (authMode === 'signup' && password.length < 12) {
        showError('Password must be at least 12 characters.');
        return;
      }
      if (authMode === 'signup') {
        const exists = await checkAccountExists(email);
        if (exists) {
          showError('Account exists. Please sign in.');
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
        logDebug('Server error: ' + (errorBody.code || 'unknown') + ' - ' + errorBody.error);
        if (authMode === 'signup' && response.status === 409) {
          showError('Account exists. Please sign in.');
        } else if (authMode === 'login' && response.status === 401) {
          showError('Account not found. Create an account to continue.');
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
      if (authMode === 'signup' && !authenticated) {
        showError('Account created. Please sign in.');
      }
    });
  }

  fetchAuthState();
  renderTurnstile();
})();
