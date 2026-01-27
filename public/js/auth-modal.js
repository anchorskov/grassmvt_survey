/* public/js/auth-modal.js */
(() => {
  const modal = document.getElementById('auth-modal');
  if (!modal) {
    return;
  }

  const form = document.getElementById('auth-modal-form');
  const emailInput = document.getElementById('auth-modal-email');
  const passwordInput = document.getElementById('auth-modal-password');
  const tokenInput = document.getElementById('auth-modal-token');
  const errorEl = document.getElementById('auth-modal-error');
  const titleEl = document.getElementById('auth-modal-title');
  const subtitleEl = document.getElementById('auth-modal-subtitle');
  const submitButton = document.getElementById('auth-modal-submit');
  const loggedInEl = document.getElementById('auth-modal-logged-in');
  const logoutButton = document.getElementById('auth-modal-logout');
  const turnstileContainer = document.getElementById('auth-modal-turnstile');
  const tabButtons = Array.from(document.querySelectorAll('.auth-tab'));
  const badgeEl = document.getElementById('auth-badge');
  const quickLogoutButton = document.getElementById('auth-quick-logout');
  const openButton = document.getElementById('auth-open');

  let mode = 'login';
  let turnstileWidgetId = null;
  let turnstileReady = false;

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
    if (badgeEl) {
      badgeEl.textContent = email ? `Signed in as ${email}` : 'Signed in';
      badgeEl.classList.toggle('is-hidden', !isLoggedIn);
    }
    if (quickLogoutButton) {
      quickLogoutButton.classList.toggle('is-hidden', !isLoggedIn);
    }
    if (openButton) {
      openButton.textContent = isLoggedIn ? 'Account' : 'Account';
    }
    const authRequiredBlocks = document.querySelectorAll('[data-auth-required]');
    authRequiredBlocks.forEach((block) => {
      block.classList.toggle('is-hidden', !isLoggedIn);
    });
    const authNote = document.getElementById('auth-required-note');
    if (authNote) {
      authNote.classList.toggle('is-hidden', isLoggedIn);
    }
  };

  const fetchAuthState = async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) {
        setLoggedInState(false);
        return false;
      }
      const data = await response.json();
      if (data.authenticated) {
        setLoggedInState(true, data.user?.email);
        return true;
      } else {
        setLoggedInState(false);
        return false;
      }
    } catch (error) {
      setLoggedInState(false);
      return false;
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

  const logout = async () => {
    showError('');
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
    } catch (error) {
      showError('Unable to sign out.');
    }
    const authenticated = await fetchAuthState();
    window.dispatchEvent(
      new CustomEvent('auth:changed', { detail: { authenticated: !!authenticated } })
    );
  };

  const loadTurnstileScript = () =>
    new Promise((resolve, reject) => {
      if (window.turnstile) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Turnstile failed to load.'));
      document.head.appendChild(script);
    });

  const resetTurnstile = () => {
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
    if (tokenInput) {
      tokenInput.value = '';
    }
  };

  const renderTurnstile = async () => {
    if (!turnstileContainer || !tokenInput) {
      return;
    }
    const config = await fetchTurnstileConfig();
    if (config.bypass) {
      turnstileContainer.classList.add('is-hidden');
      return;
    }
    if (!config.siteKey) {
      showError('Turnstile is not configured.');
      return;
    }
    turnstileContainer.classList.remove('is-hidden');
    if (!turnstileReady) {
      try {
        await loadTurnstileScript();
        turnstileReady = true;
      } catch (error) {
        showError('Turnstile failed to load.');
        return;
      }
    }
    if (!window.turnstile) {
      showError('Turnstile failed to load.');
      return;
    }
    if (turnstileWidgetId !== null) {
      window.turnstile.remove(turnstileWidgetId);
    }
    turnstileWidgetId = window.turnstile.render(turnstileContainer, {
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

  const setMode = async (nextMode) => {
    mode = nextMode;
    tabButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.authMode === mode);
    });
    if (titleEl) {
      titleEl.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    }
    if (subtitleEl) {
      subtitleEl.textContent =
        mode === 'signup'
          ? 'Use a strong password with at least 12 characters.'
          : 'Use your account to continue.';
    }
    if (submitButton) {
      submitButton.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    }
    if (passwordInput) {
      passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    }
    showError('');
    resetTurnstile();
    await renderTurnstile();
  };

  const openModal = async () => {
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    showError('');
    await fetchAuthState();
    await renderTurnstile();
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    showError('');
  };

  document.addEventListener('click', (event) => {
    const openTarget = event.target.closest('[data-auth-open]');
    if (openTarget) {
      event.preventDefault();
      openModal();
      return;
    }
    if (event.target.closest('[data-auth-close]')) {
      event.preventDefault();
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('is-hidden')) {
      closeModal();
    }
  });

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setMode(button.dataset.authMode || 'login');
    });
  });

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await logout();
    });
  }

  if (quickLogoutButton) {
    quickLogoutButton.addEventListener('click', async () => {
      await logout();
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
      if (mode === 'signup' && password.length < 12) {
        showError('Password must be at least 12 characters.');
        return;
      }
      const config = await fetchTurnstileConfig();
      if (!config.bypass && (!tokenInput || !tokenInput.value)) {
        showError('Please complete the Turnstile check.');
        return;
      }
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          turnstileToken: tokenInput ? tokenInput.value : '',
        }),
      });
      if (!response.ok) {
        showError(mode === 'signup' ? 'Unable to create account.' : 'Unable to sign in.');
        resetTurnstile();
        return;
      }
      resetTurnstile();
      const authenticated = await fetchAuthState();
      window.dispatchEvent(
        new CustomEvent('auth:changed', { detail: { authenticated: !!authenticated } })
      );
      closeModal();
    });
  }

  const gateSurveyList = async () => {
    const isSurveyList = window.location.pathname === '/surveys/list/';
    if (!isSurveyList) {
      await fetchAuthState();
      return;
    }
    const authenticated = await fetchAuthState();
    if (!authenticated) {
      await openModal();
    }
  };

  setMode('login');
  gateSurveyList();
})();
