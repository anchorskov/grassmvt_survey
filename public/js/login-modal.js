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
  const oauthGoogleButton = document.getElementById('login-modal-oauth-google');
  const oauthAppleButton = document.getElementById('login-modal-oauth-apple');
  const submitButton = document.getElementById('login-modal-submit');
  const turnstileStatusEl = document.getElementById('login-modal-turnstile-status');
  const turnstileLabelEl = document.getElementById('login-modal-turnstile-label');
  const passkeyNudgeEl = document.getElementById('login-modal-passkey-nudge');
  const passkeyNudgeAdd = document.getElementById('login-modal-passkey-add');
  const passkeyNudgeSkip = document.getElementById('login-modal-passkey-skip');

  let turnstileWidgetId = null;
  let lastTurnstileToken = '';
  let turnstileConfig = { siteKey: '', bypass: false };
  let turnstileState = 'idle';
  let pendingOauthError = '';

  const PASSKEY_NUDGE_KEY = 'passkey_nudge_dismissed_at';
  const PASSKEY_NUDGE_SUPPRESS_MS = 30 * 24 * 60 * 60 * 1000;

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

  const mapOauthError = (value) => {
    const errors = {
      access_denied: 'Sign-in cancelled. Please try again.',
      oauth_unavailable: 'OAuth is not configured. Please sign in with email and password.',
      state_invalid: 'Sign-in expired. Please try again.',
      token_exchange_failed: 'Sign-in failed. Please try again.',
      id_token_invalid: 'Sign-in failed. Please try again.',
      email_missing: 'We could not read your email. Please sign in with password and try again.',
      account_link_failed: 'Unable to link this account. Please sign in with password.',
      provider_error: 'Sign-in failed. Please try again.',
    };
    return errors[value] || 'Sign-in failed. Please try again.';
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

  const waitForAuthState = async (options = {}) => {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 2500;
    const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 200;
    const deadline = Date.now() + timeoutMs;
    let authenticated = await authUI.fetchAuthState();
    while (!authenticated && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      authenticated = await authUI.fetchAuthState();
    }
    return authenticated;
  };

  const setTurnstileState = (state, message) => {
    // Turnstile UI state machine: idle -> running -> ready, with needs-interaction/failed overrides.
    turnstileState = state;
    const hasToken = !!(tokenInput && tokenInput.value) || !!lastTurnstileToken;
    const canBypass = !!turnstileConfig.bypass;
    const canSubmit = canBypass || hasToken;
    if (submitButton) {
      submitButton.disabled = !canSubmit || state === 'running';
    }
    if (turnstileStatusEl) {
      const messages = {
        idle: 'Human check runs automatically.',
        running: 'Verifying you are human...',
        'needs-interaction': 'Please complete the human check.',
        failed: 'Verification failed, try again.',
        ready: '',
      };
      const next = message || messages[state] || '';
      turnstileStatusEl.textContent = next;
      turnstileStatusEl.classList.toggle('is-hidden', !next || canBypass);
    }
    if (turnstileLabelEl && turnstileContainer) {
      const showChallenge = state === 'needs-interaction' || state === 'failed';
      turnstileLabelEl.classList.toggle('is-hidden', !showChallenge);
      turnstileContainer.classList.toggle('is-hidden', !showChallenge);
    }
  };

  const shouldShowPasskeyNudge = () => {
    if (!passkeyNudgeEl) {
      return false;
    }
    try {
      const last = Number(localStorage.getItem(PASSKEY_NUDGE_KEY) || 0);
      return !last || Date.now() - last > PASSKEY_NUDGE_SUPPRESS_MS;
    } catch (error) {
      return true;
    }
  };

  const dismissPasskeyNudge = () => {
    try {
      localStorage.setItem(PASSKEY_NUDGE_KEY, String(Date.now()));
    } catch (error) {
      // Ignore storage failures
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
    if (window.__webauthnBrowserPromise) {
      return window.__webauthnBrowserPromise;
    }
    const moduleUrl = '/vendor/simplewebauthn-browser-9.0.1.bundle.js';
    window.__webauthnBrowserPromise = import(moduleUrl)
      .then((mod) => {
        window.__webauthnBrowser = mod;
        return mod;
      })
      .catch((error) => {
        console.error('[Passkey] Failed to load ' + moduleUrl + ': ' + error.message);
        throw error;
      });
    return window.__webauthnBrowserPromise;
  };

  const resetTurnstile = () => {
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
    if (tokenInput) {
      tokenInput.value = '';
    }
    lastTurnstileToken = '';
    setTurnstileState('idle');
  };

  const renderTurnstile = async (interactive = false) => {
    if (!turnstileContainer || !tokenInput) {
      return;
    }
    if (turnstileConfig.bypass) {
      setTurnstileState('ready');
      return;
    }
    if (!turnstileConfig.siteKey) {
      showError('Turnstile is not configured.');
      setTurnstileState('failed', 'Verification unavailable.');
      return;
    }
    if (turnstileLabelEl) {
      turnstileLabelEl.classList.toggle('is-hidden', !interactive);
    }
    turnstileContainer.classList.toggle('is-hidden', !interactive);

    try {
      if (!window.TurnstileLoader) {
        showError('Turnstile failed to load.');
        setTurnstileState('failed', 'Verification failed, try again.');
        return;
      }
      await window.TurnstileLoader.load();
    } catch (error) {
      showError('Turnstile failed to load.');
      setTurnstileState('failed', 'Verification failed, try again.');
      return;
    }

    if (!window.turnstile) {
      showError('Turnstile failed to load.');
      setTurnstileState('failed', 'Verification failed, try again.');
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
      sitekey: turnstileConfig.siteKey,
      size: interactive ? 'normal' : 'invisible',
      callback: (token) => {
        tokenInput.value = token || '';
        lastTurnstileToken = token || '';
        setTurnstileState('ready');
      },
      'error-callback': () => {
        tokenInput.value = '';
        lastTurnstileToken = '';
        setTurnstileState('failed');
      },
      'expired-callback': () => {
        tokenInput.value = '';
        lastTurnstileToken = '';
        setTurnstileState('needs-interaction');
      },
    });

    if (!interactive && window.turnstile && typeof window.turnstile.execute === 'function') {
      setTurnstileState('running');
      try {
        window.turnstile.execute(turnstileWidgetId);
      } catch (error) {
        setTurnstileState('needs-interaction');
      }
    } else if (interactive) {
      setTurnstileState('needs-interaction');
    }
  };

  const openModal = async () => {
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    if (pendingOauthError) {
      showError(mapOauthError(pendingOauthError));
      pendingOauthError = '';
    } else {
      showError('');
    }
    if (passkeyNudgeEl) {
      passkeyNudgeEl.classList.add('is-hidden');
    }
    const authenticated = await authUI.fetchAuthState();
    setLoggedInState(authenticated, authUI.state.email);
    turnstileConfig = await fetchTurnstileConfig();
    setTurnstileState(turnstileConfig.bypass ? 'ready' : 'idle');
    await renderTurnstile(false);
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    showError('');
  };

  const fetchPasskeys = async () => {
    const response = await fetch('/api/auth/passkey/list', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.credentials || [];
  };

  const startPasskeyEnrollment = async () => {
    if (!window.PublicKeyCredential) {
      showError('Passkeys are not supported on this device.');
      return false;
    }
    let browser;
    try {
      browser = await loadWebAuthnBrowser();
    } catch (error) {
      showError('Passkey support is unavailable.');
      return false;
    }
    const optionsResponse = await fetch('/api/auth/passkey/register/options', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ nickname: '' }),
    });
    if (!optionsResponse.ok) {
      showError('Unable to start passkey registration.');
      return false;
    }
    const optionsData = await optionsResponse.json();
    if (!optionsData.options) {
      showError('Unable to start passkey registration.');
      return false;
    }
    let attestationResponse;
    try {
      attestationResponse = await browser.startRegistration(optionsData.options);
    } catch (error) {
      showError('Passkey registration was cancelled.');
      return false;
    }
    const verifyResponse = await fetch('/api/auth/passkey/register/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ attestationResponse, nickname: '' }),
    });
    if (!verifyResponse.ok) {
      showError('Passkey registration failed.');
      return false;
    }
    return true;
  };

  const maybeShowPasskeyNudge = async () => {
    // One-time passkey nudge after password login if the account has no passkeys.
    if (!passkeyNudgeEl || !shouldShowPasskeyNudge()) {
      return false;
    }
    const credentials = await fetchPasskeys();
    if (!credentials || credentials.length > 0) {
      return false;
    }
    passkeyNudgeEl.classList.remove('is-hidden');
    if (form) {
      form.classList.add('is-hidden');
    }
    if (loggedInEl) {
      loggedInEl.classList.add('is-hidden');
    }
    return true;
  };

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await authUI.logout();
      setLoggedInState(false, '');
    });
  }

  const startOauth = (provider) => {
    if (!provider) {
      return;
    }
    window.location.href = `/api/auth/oauth/${provider}/start`;
  };

  if (oauthGoogleButton) {
    oauthGoogleButton.addEventListener('click', () => startOauth('google'));
  }

  if (oauthAppleButton) {
    oauthAppleButton.addEventListener('click', () => startOauth('apple'));
  }

  if (passkeyNudgeAdd) {
    passkeyNudgeAdd.addEventListener('click', async () => {
      showError('');
      const ok = await startPasskeyEnrollment();
      if (!ok) {
        return;
      }
      closeModal();
      window.location.href = '/surveys/list/';
    });
  }

  if (passkeyNudgeSkip) {
    passkeyNudgeSkip.addEventListener('click', () => {
      dismissPasskeyNudge();
      closeModal();
      window.location.href = '/surveys/list/';
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
      if (!turnstileConfig.siteKey && !turnstileConfig.bypass) {
        turnstileConfig = await fetchTurnstileConfig();
      }
      const tokenValue = tokenInput && tokenInput.value ? tokenInput.value : lastTurnstileToken;
      if (!turnstileConfig.bypass && !tokenValue) {
        setTurnstileState('needs-interaction');
        await renderTurnstile(true);
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
        if (data && data.code === 'PASSWORD_INCORRECT') {
          showError('Password incorrect');
        } else if (data && data.code === 'ACCOUNT_NOT_FOUND') {
          showError('Account not found');
        } else if (response.status === 404) {
          showError('Account not found');
        } else if (response.status === 401) {
          showError('Password incorrect');
        } else {
          showError('Unable to sign in.');
        }
        resetTurnstile();
        return;
      }
      resetTurnstile();
      const authenticated = await waitForAuthState();
      if (authenticated) {
        window.dispatchEvent(
          new CustomEvent('auth:changed', { detail: { authenticated: true } })
        );
        const nudged = await maybeShowPasskeyNudge();
        if (nudged) {
          return;
        }
      }
      closeModal();
      window.location.href = '/surveys/list/';
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
        const data = await verifyResponse.json().catch(() => ({}));
        if (data && data.code === 'UNKNOWN_CREDENTIAL') {
          showError('No matching passkey found on this device. Sign in with password, then add a passkey.');
        } else {
          showError('Passkey sign-in failed.');
        }
        return;
      }
      const authenticated = await waitForAuthState();
      if (authenticated) {
        window.dispatchEvent(
          new CustomEvent('auth:changed', { detail: { authenticated: true } })
        );
        closeModal();
        window.location.href = '/surveys/list/';
        return;
      }
      closeModal();
      window.location.href = '/surveys/list/';
    });
  }

  authModals.register('login', {
    open: openModal,
    close: closeModal,
  });

  const urlParams = new URLSearchParams(window.location.search || '');
  const oauthError = urlParams.get('oauth_error');
  if (oauthError) {
    pendingOauthError = oauthError;
    authModals.open('login');
  }
})();
