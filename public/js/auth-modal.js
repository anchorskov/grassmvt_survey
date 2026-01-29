/* public/js/auth-modal.js */
(() => {
  // Safe debug helper - only log on localhost
  const isLocalRequest = (url) => {
    try {
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    } catch (e) {
      return false;
    }
  };

  const logDebug = (message) => {
    if (isLocalRequest(window.location)) {
      console.log(message);
    }
  };

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
  let lastCheckedEmail = '';
  let autofillTimer = null;
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
    window.location.href = '/';
  };

  const loadTurnstileScript = () => {
    // Return existing promise if script is already loading or loaded
    if (window.__turnstilePromise) {
      logDebug('[Turnstile] Reusing existing promise');
      return window.__turnstilePromise;
    }
    
    // Return immediately if script is already loaded
    if (window.turnstile) {
      logDebug('[Turnstile] Script already loaded');
      return Promise.resolve();
    }

    logDebug('[Turnstile] Injecting script tag');
    // Create and cache the loading promise
    window.__turnstilePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        logDebug('[Turnstile] Script loaded successfully');
        resolve();
      };
      script.onerror = () => {
        // Clear the promise on error so it can be retried
        window.__turnstilePromise = null;
        logDebug('[Turnstile] Script failed to load');
        reject(new Error('Turnstile failed to load.'));
      };
      document.head.appendChild(script);
    });

    return window.__turnstilePromise;
  };

  const resetTurnstile = () => {
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
    if (tokenInput) {
      tokenInput.value = '';
    }
    lastTurnstileToken = '';
    window.__lastTurnstileToken = '';
  };

  const renderTurnstile = async () => {
    logDebug('[Turnstile] renderTurnstile called');
    if (!turnstileContainer || !tokenInput) {
      logDebug('[Turnstile] Missing container or token input');
      return;
    }
    const config = await fetchTurnstileConfig();
    if (config.bypass) {
      logDebug('[Turnstile] Bypass enabled, hiding widget');
      turnstileContainer.classList.add('is-hidden');
      return;
    }
    if (!config.siteKey) {
      logDebug('[Turnstile] No site key configured');
      showError('Turnstile is not configured.');
      return;
    }
    turnstileContainer.classList.remove('is-hidden');
    
    // Check if widget is already rendered in this container
    if (turnstileWidgetId !== null && turnstileContainer.querySelector('iframe')) {
      logDebug('[Turnstile] Widget already rendered, resetting');
      // Widget already rendered, just reset the token
      if (window.turnstile) {
        try {
          window.turnstile.reset(turnstileWidgetId);
        } catch (error) {
          // Widget may be in invalid state, remove and re-render
          logDebug('[Turnstile] Reset failed, will re-render:', error.message);
          turnstileWidgetId = null;
        }
      }
      if (turnstileWidgetId !== null) {
        return;
      }
    }
    
    if (!turnstileReady) {
      try {
        await loadTurnstileScript();
        turnstileReady = true;
      } catch (error) {
        logDebug('[Turnstile] Script load failed:', error.message);
        showError('Turnstile failed to load.');
        return;
      }
    }
    if (!window.turnstile) {
      logDebug('[Turnstile] window.turnstile not available after load');
      showError('Turnstile failed to load.');
      return;
    }
    if (turnstileWidgetId !== null) {
      try {
        window.turnstile.remove(turnstileWidgetId);
      } catch (error) {
        logDebug('[Turnstile] Remove failed:', error.message);
      }
    }
    try {
      logDebug('[Turnstile] Rendering widget');
      turnstileWidgetId = window.turnstile.render(turnstileContainer, {
        sitekey: config.siteKey,
        callback: (token) => {
          tokenInput.value = token || '';
          lastTurnstileToken = token || '';
          window.__lastTurnstileToken = token || '';
          logDebug('[Turnstile] Token received');
        },
        'error-callback': () => {
          tokenInput.value = '';
          lastTurnstileToken = '';
          window.__lastTurnstileToken = '';
          showError('Turnstile validation failed.');
          logDebug('[Turnstile] Error callback');
        },
        'expired-callback': () => {
          tokenInput.value = '';
          lastTurnstileToken = '';
          window.__lastTurnstileToken = '';
          logDebug('[Turnstile] Token expired');
        },
      });
      logDebug('[Turnstile] Widget rendered with ID:', turnstileWidgetId);
    } catch (error) {
      logDebug('[Turnstile] Render failed:', error.message);
      showError('Turnstile render failed.');
      turnstileWidgetId = null;
    }
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

  const handleEmailCheck = async () => {
    if (!emailInput) {
      return;
    }
    const email = emailInput.value.trim().toLowerCase();
    if (!email || email === lastCheckedEmail) {
      return;
    }
    lastCheckedEmail = email;
    const exists = await checkAccountExists(email);
    if (exists === null) {
      return;
    }
    if (exists && mode !== 'login') {
      await setMode('login');
      showError('Account found. Please sign in.');
    }
    if (!exists && mode !== 'signup') {
      await setMode('signup');
      showError('No account found. Create one to continue.');
    }
  };

  const openModal = async () => {
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    showError('');
    await fetchAuthState();
    await renderTurnstile();
    await handleEmailCheck();
    if (autofillTimer) {
      clearInterval(autofillTimer);
    }
    let attempts = 0;
    autofillTimer = setInterval(() => {
      attempts += 1;
      handleEmailCheck();
      if (attempts >= 6) {
        clearInterval(autofillTimer);
        autofillTimer = null;
      }
    }, 400);
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
      if (mode === 'signup') {
        const exists = await checkAccountExists(email);
        if (exists) {
          await setMode('login');
          showError('Account exists. Please sign in.');
          return;
        }
      }
      const config = await fetchTurnstileConfig();
      const tokenValue = tokenInput && tokenInput.value ? tokenInput.value : lastTurnstileToken;
      if (!config.bypass && !tokenValue) {
        showError('Please complete the Turnstile check.');
        return;
      }
      
      const turnstileToken = tokenValue || '';
      // Safe debug logging: show token presence and length, never the token value
      if (isLocalRequest(window.location)) {
        console.log(`[Auth] ${mode} submit - turnstile token present: ${!!turnstileToken}, length: ${turnstileToken.length}`);
      }
      
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          turnstileToken,
        }),
      });
      if (!response.ok) {
        if (mode === 'signup' && response.status === 409) {
          await setMode('login');
          showError('Account exists. Please sign in.');
        } else if (mode === 'login' && response.status === 401) {
          showError('Account not found. Create an account to continue.');
        } else {
          showError(mode === 'signup' ? 'Unable to create account.' : 'Unable to sign in.');
        }
        resetTurnstile();
        return;
      }
      resetTurnstile();
      if (mode === 'signup') {
        showError('Account created. Signing you in...');
      }
      // Give the browser a moment to process the Set-Cookie header
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      const authenticated = await fetchAuthState();
      if (isLocalRequest(window.location)) {
        console.log('[Auth] Auth state after login:', authenticated);
      }
      
      if (authenticated) {
        window.dispatchEvent(
          new CustomEvent('auth:changed', { detail: { authenticated: true } })
        );
        closeModal();
        // Redirect to survey list after successful authentication
        window.location.href = '/surveys/list/';
        return;
      }

      if (mode === 'signup') {
        await setMode('login');
        showError('Account created. Please sign in.');
        return;
      }
      showError('Unable to sign in. Please try again.');
    });
  }

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      handleEmailCheck();
    });
    emailInput.addEventListener('change', () => {
      handleEmailCheck();
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
