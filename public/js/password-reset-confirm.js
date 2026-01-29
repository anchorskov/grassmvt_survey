/* public/js/password-reset-confirm.js */
(() => {
  const form = document.getElementById('password-reset-confirm-form');
  if (!form) {
    return;
  }

  const uidInput = document.getElementById('password-reset-uid');
  const tokenInput = document.getElementById('password-reset-token');
  const passwordInput = document.getElementById('password-reset-new-password');
  const errorEl = document.getElementById('password-reset-confirm-error');
  const successEl = document.getElementById('password-reset-confirm-success');
  const missingEl = document.getElementById('password-reset-missing');
  const turnstileContainer = document.getElementById('password-reset-turnstile');
  const turnstileTokenInput = document.getElementById('password-reset-turnstile-token');

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
    if (turnstileTokenInput) {
      turnstileTokenInput.value = '';
    }
    lastTurnstileToken = '';
  };

  const renderTurnstile = async () => {
    if (!turnstileContainer || !turnstileTokenInput) {
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
        turnstileTokenInput.value = token || '';
        lastTurnstileToken = token || '';
      },
      'error-callback': () => {
        turnstileTokenInput.value = '';
        lastTurnstileToken = '';
        showError('Turnstile validation failed.');
      },
      'expired-callback': () => {
        turnstileTokenInput.value = '';
        lastTurnstileToken = '';
      },
    });
  };

  const params = new URLSearchParams(window.location.search);
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';
  if (!uid || !token) {
    form.classList.add('is-hidden');
    if (missingEl) {
      missingEl.classList.remove('is-hidden');
    }
    return;
  }

  if (uidInput) {
    uidInput.value = uid;
  }
  if (tokenInput) {
    tokenInput.value = token;
  }

  renderTurnstile();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    showSuccess('');
    const newPassword = passwordInput ? passwordInput.value : '';
    if (!newPassword) {
      showError('Password is required.');
      return;
    }
    if (newPassword.length < 12) {
      showError('Password must be at least 12 characters.');
      return;
    }
    const config = await fetchTurnstileConfig();
    const tokenValue = turnstileTokenInput && turnstileTokenInput.value
      ? turnstileTokenInput.value
      : lastTurnstileToken;
    if (!config.bypass && !tokenValue) {
      showError('Please complete the Turnstile check.');
      return;
    }
    const response = await fetch('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        uid,
        token,
        newPassword,
        turnstileToken: tokenValue || '',
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      showError(data.error || 'Unable to reset password.');
      resetTurnstile();
      return;
    }
    resetTurnstile();
    showSuccess('Password reset. You can now sign in.');
  });
})();
