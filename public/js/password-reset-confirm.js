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
    if (turnstileTokenInput) {
      turnstileTokenInput.value = '';
    }
    lastTurnstileToken = '';
    turnstileExecuted = false;
    turnstileSubmitted = false;
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
          turnstileTokenInput.value = token || '';
          lastTurnstileToken = token || '';
        },
        onError: () => {
          turnstileTokenInput.value = '';
          lastTurnstileToken = '';
          turnstileExecuted = false;
          showError('Turnstile validation failed.');
        },
        onExpire: () => {
          turnstileTokenInput.value = '';
          lastTurnstileToken = '';
          turnstileExecuted = false;
        },
      });
    }
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
    turnstileSubmitted = true;
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
