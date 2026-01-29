/* public/js/signup-modal.js */
(() => {
  const modal = document.getElementById('signup-modal');
  if (!modal) {
    return;
  }

  const authUI = window.AuthUI || {
    state: { email: '' },
    fetchAuthState: async () => false,
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

  const form = document.getElementById('signup-modal-form');
  const emailInput = document.getElementById('signup-modal-email');
  const passwordInput = document.getElementById('signup-modal-password');
  const passwordConfirmInput = document.getElementById('signup-modal-password-confirm');
  const tokenInput = document.getElementById('signup-modal-token');
  const errorEl = document.getElementById('signup-modal-error');
  const turnstileContainer = document.getElementById('signup-modal-turnstile');

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
      '<button class="link-button" type="button" data-auth-open="login">Sign in</button>',
      ' or ',
      '<button class="link-button" type="button" data-auth-open="password-reset">reset your password</button>.',
    ].join('');
    showError(message, true);
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
      const response = await fetch(`/api/auth/exists?email=${encodeURIComponent(email)}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return !!data.exists;
    } catch (error) {
      return null;
    }
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
    await renderTurnstile();
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    showError('');
  };

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
      if (password !== passwordConfirm) {
        showError('Passwords do not match.');
        return;
      }
      if (password.length < 12) {
        showError('Password must be at least 12 characters.');
        return;
      }
      const exists = await checkAccountExists(email);
      if (exists) {
        showDuplicateEmailMessage();
        return;
      }
      const config = await fetchTurnstileConfig();
      const tokenValue = tokenInput && tokenInput.value ? tokenInput.value : lastTurnstileToken;
      if (!config.bypass && !tokenValue) {
        showError('Please complete the Turnstile check.');
        return;
      }
      const response = await fetch('/api/auth/signup', {
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
        if (response.status === 409 && data && data.code === 'EMAIL_EXISTS') {
          showDuplicateEmailMessage();
        } else {
          showError('Unable to create account.');
        }
        resetTurnstile();
        return;
      }
      resetTurnstile();
      showError('Account created. Signing you in. Add a passkey from your account page.');
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
      showError('Account created. Please sign in.');
      authModals.open('login');
    });
  }

  authModals.register('signup', {
    open: openModal,
    close: closeModal,
  });
})();
