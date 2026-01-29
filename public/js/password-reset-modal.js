/* public/js/password-reset-modal.js */
(() => {
  const modal = document.getElementById('password-reset-modal');
  if (!modal) {
    return;
  }

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

  const form = document.getElementById('password-reset-modal-form');
  const emailInput = document.getElementById('password-reset-modal-email');
  const tokenInput = document.getElementById('password-reset-modal-token');
  const errorEl = document.getElementById('password-reset-modal-error');
  const successEl = document.getElementById('password-reset-modal-success');
  const turnstileContainer = document.getElementById('password-reset-modal-turnstile');

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

  const showSuccess = (message) => {
    if (!successEl) {
      return;
    }
    if (!message) {
      successEl.textContent = '';
      successEl.classList.add('is-hidden');
      return;
    }
    successEl.textContent = message;
    successEl.classList.remove('is-hidden');
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
    showSuccess('');
    await renderTurnstile();
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    showError('');
    showSuccess('');
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      showError('');
      showSuccess('');
      const email = emailInput ? emailInput.value.trim() : '';
      if (!email) {
        showError('Email is required.');
        return;
      }
      const config = await fetchTurnstileConfig();
      const tokenValue = tokenInput && tokenInput.value ? tokenInput.value : lastTurnstileToken;
      if (!config.bypass && !tokenValue) {
        showError('Please complete the Turnstile check.');
        return;
      }
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          turnstileToken: tokenValue || '',
        }),
      });
      if (!response.ok) {
        showError('Unable to request password reset.');
        resetTurnstile();
        return;
      }
      resetTurnstile();
      showSuccess('If an account exists, a reset link has been sent.');
    });
  }

  authModals.register('password-reset', {
    open: openModal,
    close: closeModal,
  });
})();
