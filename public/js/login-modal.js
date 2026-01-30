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
  const turnstileClient = window.TurnstileClient;
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
  let turnstileExecuted = false;
  let turnstileSubmitted = false;
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
    const canBypass = !!turnstileConfig.bypass;
    if (submitButton) {
      submitButton.disabled = state === 'running';
    }
    if (turnstileStatusEl) {
      const messages = {
        idle: '',
        running: 'Verifying you are human...',
        'needs-interaction': 'Complete the human check to continue.',
        failed: 'Verification failed, try again.',
        ready: 'Verified.',
      };
      let next = message || messages[state] || '';
      if (state === 'ready' && !turnstileSubmitted) {
        next = '';
      }
      turnstileStatusEl.textContent = next;
      turnstileStatusEl.classList.toggle('is-hidden', !next || canBypass);
    }
    if (turnstileLabelEl && turnstileContainer) {
      const showChallenge = state === 'needs-interaction' || state === 'failed';
      turnstileLabelEl.classList.toggle('is-hidden', !showChallenge);
      turnstileContainer.classList.toggle('is-hidden', !showChallenge);
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
    if (turnstileClient && turnstileWidgetId !== null) {
      turnstileClient.resetWidget(turnstileWidgetId);
    }
    if (tokenInput) {
      tokenInput.value = '';
    }
    lastTurnstileToken = '';
    turnstileExecuted = false;
    turnstileSubmitted = false;
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
    if (!turnstileClient) {
      showError('Turnstile failed to load.');
      setTurnstileState('failed', 'Verification failed, try again.');
      return;
    }
    const loaded = await turnstileClient.loadTurnstileOnce({ siteKey: turnstileConfig.siteKey });
    if (!loaded) {
      showError('Turnstile failed to load.');
      setTurnstileState('failed', 'Verification failed, try again.');
      return;
    }
    if (turnstileLabelEl) {
      turnstileLabelEl.classList.toggle('is-hidden', !interactive);
    }
    turnstileContainer.classList.toggle('is-hidden', !interactive);

    if (turnstileWidgetId === null) {
      turnstileWidgetId = await turnstileClient.renderTurnstile({
        container: turnstileContainer,
        siteKey: turnstileConfig.siteKey,
        appearance: 'interaction-only',
        size: 'flexible',
        onSuccess: (token) => {
          tokenInput.value = token || '';
          lastTurnstileToken = token || '';
          setTurnstileState('ready');
        },
        onError: () => {
          tokenInput.value = '';
          lastTurnstileToken = '';
          turnstileExecuted = false;
          setTurnstileState('failed');
        },
        onExpire: () => {
          tokenInput.value = '';
          lastTurnstileToken = '';
          turnstileExecuted = false;
          setTurnstileState('needs-interaction');
        },
      });
    }

    if (interactive) {
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
    turnstileExecuted = false;
    turnstileSubmitted = false;
    const authenticated = await authUI.fetchAuthState();
    setLoggedInState(authenticated, authUI.state.email);
    
    // If user is authenticated (e.g., just signed up), check for passkey nudge
    // Force show for new signups, respect dismissal for regular logins
    if (authenticated) {
      const forceShow = document.body.classList.contains('auth-just-signed-up');
      await maybeShowPasskeyNudge(forceShow);
      document.body.classList.remove('auth-just-signed-up');
      turnstileConfig = await fetchTurnstileConfig();
      setTurnstileState(turnstileConfig.bypass ? 'ready' : 'idle');
      return;
    }
    
    turnstileConfig = await fetchTurnstileConfig();
    setTurnstileState(turnstileConfig.bypass ? 'ready' : 'idle');
    await renderTurnstile(false);
  };

  const closeModal = () => {
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    showError('');
    resetTurnstile();
    if (turnstileLabelEl) {
      turnstileLabelEl.classList.add('is-hidden');
    }
    if (turnstileContainer) {
      turnstileContainer.classList.add('is-hidden');
    }
  };

  const executeTurnstileOnce = async () => {
    if (!turnstileClient || turnstileExecuted || turnstileWidgetId === null) {
      return;
    }
    turnstileExecuted = true;
    setTurnstileState('running');
    const token = await turnstileClient.getTokenOrExecute({ widgetId: turnstileWidgetId });
    if (!token) {
      turnstileExecuted = false;
      setTurnstileState('needs-interaction');
    }
  };

  const refreshAuthState = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        setLoggedInState(false, '');
        return false;
      }
      const data = await response.json();
      if (data.authenticated) {
        const email = data.user?.email || '';
        if (authUI && authUI.state) {
          authUI.state.email = email;
        }
        setLoggedInState(true, email);
        window.dispatchEvent(
          new CustomEvent('auth:changed', { detail: { authenticated: true } })
        );
        return true;
      }
      setLoggedInState(false, '');
      return false;
    } catch (error) {
      setLoggedInState(false, '');
      return false;
    }
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

  const maybeShowPasskeyNudge = async (forceShow = false) => {
    // One-time passkey nudge after password login if the account has no passkeys.
    // forceShow=true will ignore dismissal (used after signup).
    if (!passkeyNudgeEl) {
      return false;
    }
    if (!forceShow && !shouldShowPasskeyNudge()) {
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
      turnstileSubmitted = true;
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      if (!email || !password) {
        showError('Email and password are required.');
        return;
      }
      const exists = await checkAccountExists(email);
      if (exists === false && authModals && typeof authModals.open === 'function') {
        authModals.open('signup');
        showError('No account found. Create one to continue.');
        return;
      }
      if (!turnstileConfig.siteKey && !turnstileConfig.bypass) {
        turnstileConfig = await fetchTurnstileConfig();
      }
      const tokenValue = tokenInput && tokenInput.value ? tokenInput.value : lastTurnstileToken;
      if (!turnstileConfig.bypass && !tokenValue) {
        setTurnstileState('running', 'Verifying you are human...');
        await renderTurnstile(true);
        await executeTurnstileOnce();
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
        if (window.PasskeyPrompt && typeof window.PasskeyPrompt.queueAfterPasswordLogin === 'function') {
          window.PasskeyPrompt.queueAfterPasswordLogin();
        }
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
        console.error('[Passkey Login] Authentication cancelled:', error);
        showError('Passkey sign-in was cancelled.');
        return;
      }
      
      if (!assertionResponse) {
        console.error('[Passkey Login] No assertion response returned');
        showError('Passkey sign-in failed.');
        return;
      }
      
      console.log('[Passkey Login] Assertion response:', {
        id: assertionResponse.id,
        rawId: assertionResponse.rawId,
        type: assertionResponse.type,
        response: assertionResponse.response ? {
          clientDataJSON: typeof assertionResponse.response.clientDataJSON,
          authenticatorData: typeof assertionResponse.response.authenticatorData,
          signature: typeof assertionResponse.response.signature,
          userHandle: assertionResponse.response.userHandle,
        } : null,
      });
      
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
        console.error('[Passkey Login] Verify failed:', {
          status: verifyResponse.status,
          code: data.code,
          error: data.error,
        });
        if (data && data.code === 'UNKNOWN_CREDENTIAL') {
          showError('No matching passkey found on this device. Sign in with password, then add a passkey.');
        } else {
          showError('Passkey sign-in failed.');
        }
        return;
      }
      showError('');
      const authenticated = await refreshAuthState();
      if (!authenticated) {
        showError('Passkey sign-in failed.');
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
