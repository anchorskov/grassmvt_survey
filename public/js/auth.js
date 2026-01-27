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

  const renderTurnstile = async () => {
    if (!form || !tokenInput) {
      return;
    }
    const config = await fetchTurnstileConfig();
    if (config.bypass) {
      return;
    }
    if (!config.siteKey) {
      showError('Turnstile is not configured.');
      return;
    }
    if (!window.turnstile) {
      showError('Turnstile failed to load.');
      return;
    }
    const containerId = authMode === 'signup' ? 'turnstile-signup' : 'turnstile-login';
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }
    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: config.siteKey,
      callback: (token) => {
        tokenInput.value = token || '';
      },
      'error-callback': () => {
        tokenInput.value = '';
        showError('Turnstile validation failed.');
      },
      'expired-callback': () => {
        tokenInput.value = '';
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
      const config = await fetchTurnstileConfig();
      if (!config.bypass && (!tokenInput || !tokenInput.value)) {
        showError('Please complete the Turnstile check.');
        return;
      }
      const response = await submitAuth({
        email,
        password,
        turnstileToken: tokenInput ? tokenInput.value : '',
      });
      if (!response.ok) {
        showError(authMode === 'signup' ? 'Unable to create account.' : 'Unable to sign in.');
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
      await fetchAuthState();
    });
  }

  fetchAuthState();
  renderTurnstile();
})();
