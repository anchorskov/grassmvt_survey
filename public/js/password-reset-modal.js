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
  const turnstileClient = window.TurnstileClient;

  let turnstileWidgetId = null;
  let lastTurnstileToken = '';
  let turnstileExecuted = false;
  let turnstileSubmitted = false;

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
    showSuccess('');
    turnstileExecuted = false;
    turnstileSubmitted = false;
    await renderTurnstile();
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    showError('');
    showSuccess('');
    resetTurnstile();
    if (turnstileContainer) {
      turnstileContainer.classList.add('is-hidden');
    }
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      showError('');
      showSuccess('');
      turnstileSubmitted = true;
      const email = emailInput ? emailInput.value.trim() : '';
      if (!email) {
        showError('Email is required.');
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
