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
    const mod = await import('https://esm.sh/@simplewebauthn/browser@9.0.2');
    window.__webauthnBrowser = mod;
    return mod;
  };

  const resetTurnstile = () => {
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
    if (tokenInput) {
      tokenInput.value = '';
    }
    lastTurnstileToken = '';
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

    try {
      if (!window.TurnstileLoader) {
        showError('Turnstile failed to load.');
        return;
      }
      await window.TurnstileLoader.load();
    } catch (error) {
      showError('Turnstile failed to load.');
      return;
    }

    if (!window.turnstile) {
      showError('Turnstile failed to load.');
      return;
    }

    if (turnstileWidgetId !== null) {
      try {
        window.turnstile.remove(turnstileWidgetId);
      } catch (error) {
        // Ignore removal failures
      }
    }

    turnstileWidgetId = window.turnstile.render(turnstileContainer, {
      sitekey: config.siteKey,
      callback: (token) => {
        tokenInput.value = token || '';
        lastTurnstileToken = token || '';
      },
      'error-callback': () => {
        tokenInput.value = '';
        lastTurnstileToken = '';
        showError('Turnstile validation failed.');
      },
      'expired-callback': () => {
        tokenInput.value = '';
        lastTurnstileToken = '';
      },
    });
  };

  const openModal = async () => {
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    showError('');
    const authenticated = await authUI.fetchAuthState();
    setLoggedInState(authenticated, authUI.state.email);
    await renderTurnstile();
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    showError('');
  };

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await authUI.logout();
      setLoggedInState(false, '');
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
      const config = await fetchTurnstileConfig();
      const tokenValue = tokenInput && tokenInput.value ? tokenInput.value : lastTurnstileToken;
      if (!config.bypass && !tokenValue) {
        showError('Please complete the Turnstile check.');
        return;
      }
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
        if (response.status === 401 && data && data.code === 'INVALID_CREDENTIALS') {
          showError('Email or password is incorrect.');
        } else {
          showError('Unable to sign in.');
        }
        resetTurnstile();
        return;
      }
      resetTurnstile();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const authenticated = await authUI.fetchAuthState();
      if (authenticated) {
        window.dispatchEvent(
          new CustomEvent('auth:changed', { detail: { authenticated: true } })
        );
        closeModal();
        window.location.href = '/surveys/list/';
        return;
      }
      showError('Unable to sign in. Please try again.');
    });
  }

  if (passkeyButton) {
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
      const authenticated = await authUI.fetchAuthState();
      if (authenticated) {
        window.dispatchEvent(
          new CustomEvent('auth:changed', { detail: { authenticated: true } })
        );
        closeModal();
        window.location.href = '/surveys/list/';
        return;
      }
      showError('Passkey sign-in failed.');
    });
  }

  authModals.register('login', {
    open: openModal,
    close: closeModal,
  });
})();
