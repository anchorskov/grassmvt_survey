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
  const turnstileClient = window.TurnstileClient;

  let turnstileWidgetId = null;
  let lastTurnstileToken = '';
  let turnstileExecuted = false;
  let turnstileSubmitted = false;

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
    if (turnstileClient && turnstileWidgetId !== null) {
      turnstileClient.resetWidget(turnstileWidgetId);
    }
    if (tokenInput) {
      tokenInput.value = '';
    }
    lastTurnstileToken = '';
    turnstileExecuted = false;
    turnstileSubmitted = false;
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
    if (!turnstileClient) {
      showError('Turnstile failed to load.');
      return;
    }
    const loaded = await turnstileClient.loadTurnstileOnce({ siteKey: config.siteKey });
    if (!loaded) {
      showError('Turnstile failed to load.');
      return;
    }
    if (turnstileWidgetId === null) {
      turnstileWidgetId = await turnstileClient.renderTurnstile({
        container: turnstileContainer,
        siteKey: config.siteKey,
        appearance: 'interaction-only',
        size: 'flexible',
        onSuccess: (token) => {
          tokenInput.value = token || '';
          lastTurnstileToken = token || '';
        },
        onError: () => {
          tokenInput.value = '';
          lastTurnstileToken = '';
          turnstileExecuted = false;
          showError('Turnstile validation failed.');
        },
        onExpire: () => {
          tokenInput.value = '';
          lastTurnstileToken = '';
          turnstileExecuted = false;
        },
      });
    }
  };

  const openModal = async () => {
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    showError('');
    turnstileExecuted = false;
    turnstileSubmitted = false;
    await renderTurnstile();
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    showError('');
    resetTurnstile();
    if (turnstileContainer) {
      turnstileContainer.classList.add('is-hidden');
    }
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      showError('');
      turnstileSubmitted = true;
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
        showError('Complete the human check to continue.');
        if (turnstileClient && !turnstileExecuted && turnstileWidgetId !== null) {
          turnstileExecuted = true;
          const token = await turnstileClient.getTokenOrExecute({ widgetId: turnstileWidgetId });
          if (!token) {
            turnstileExecuted = false;
          }
        }
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
      showError('Account created. Signing you in.');
      
      // Wait for session cookie to be fully set
      let authenticated = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        authenticated = await authUI.fetchAuthState();
        if (authenticated) {
          break;
        }
      }
      
      if (authenticated) {
        window.dispatchEvent(
          new CustomEvent('auth:changed', { detail: { authenticated: true } })
        );
        
        // Close signup modal and open login modal with passkey nudge flag
        closeModal();
        document.body.classList.add('auth-just-signed-up');
        authModals.open('login');
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
