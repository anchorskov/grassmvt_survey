/* public/js/auth-shared.js */
(() => {
  const registry = (window.AuthModals && window.AuthModals.registry) || {};

  const AuthModals = window.AuthModals || {
    registry,
    register: (name, api) => {
      if (!name || !api) {
        return;
      }
      registry[name] = api;
      if (window.__authPendingOpen === name && typeof api.open === 'function') {
        api.open();
        window.__authPendingOpen = '';
      }
    },
    open: (name) => {
      const target = name || 'login';
      Object.values(registry).forEach((modal) => {
        if (modal && typeof modal.close === 'function') {
          modal.close();
        }
      });
      const modal = registry[target];
      if (modal && typeof modal.open === 'function') {
        modal.open();
      } else {
        window.__authPendingOpen = target;
      }
    },
    closeAll: () => {
      Object.values(registry).forEach((modal) => {
        if (modal && typeof modal.close === 'function') {
          modal.close();
        }
      });
    },
  };

  window.AuthModals = AuthModals;

  const badgeEl = document.getElementById('auth-badge');
  const quickLogoutButton = document.getElementById('auth-quick-logout');
  const openButton = document.getElementById('auth-open');

  const state = {
    authenticated: false,
    email: '',
    addressVerified: false,
  };

  const PASSKEY_PROMPT_SUPPRESS_KEY = 'passkey_prompt_dismissed_at';
  const PASSKEY_PROMPT_PENDING_KEY = 'passkey_prompt_pending';
  const PASSKEY_PROMPT_SUPPRESS_MS = 30 * 24 * 60 * 60 * 1000;
  const AUTH_POST_VERIFY_KEY = 'auth_post_verify';

  const consumePostVerifyFlag = () => {
    try {
      if (localStorage.getItem(AUTH_POST_VERIFY_KEY) !== '1') {
        return false;
      }
      localStorage.removeItem(AUTH_POST_VERIFY_KEY);
      return true;
    } catch (error) {
      return false;
    }
  };

  const isPromptSuppressed = () => {
    try {
      const last = Number(localStorage.getItem(PASSKEY_PROMPT_SUPPRESS_KEY) || 0);
      return !!last && Date.now() - last < PASSKEY_PROMPT_SUPPRESS_MS;
    } catch (error) {
      return false;
    }
  };

  const markPromptDismissed = () => {
    try {
      localStorage.setItem(PASSKEY_PROMPT_SUPPRESS_KEY, String(Date.now()));
    } catch (error) {
      // Ignore storage failures
    }
  };

  const setPromptPending = () => {
    try {
      localStorage.setItem(PASSKEY_PROMPT_PENDING_KEY, '1');
    } catch (error) {
      // Ignore storage failures
    }
  };

  const clearPromptPending = () => {
    try {
      localStorage.removeItem(PASSKEY_PROMPT_PENDING_KEY);
    } catch (error) {
      // Ignore storage failures
    }
  };

  const isPromptPending = () => {
    try {
      return localStorage.getItem(PASSKEY_PROMPT_PENDING_KEY) === '1';
    } catch (error) {
      return false;
    }
  };

  const fetchPasskeys = async () => {
    try {
      const response = await fetch('/api/auth/passkey/list', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.credentials || [];
    } catch (error) {
      return null;
    }
  };

  const renderPasskeyPrompt = () => {
    if (document.getElementById('passkey-prompt')) {
      return;
    }
    const prompt = document.createElement('div');
    prompt.id = 'passkey-prompt';
    prompt.className = 'passkey-prompt';
    prompt.setAttribute('role', 'status');
    prompt.innerHTML = `
      <div class="passkey-prompt__content">
        <p>Add a passkey for faster sign in.</p>
        <div class="passkey-prompt__actions">
          <a class="button button--primary" href="/account/#passkeys">Add passkey</a>
          <button class="button button--secondary" type="button" data-passkey-prompt-dismiss>Not now</button>
        </div>
      </div>
    `;
    document.body.appendChild(prompt);
    const dismissButton = prompt.querySelector('[data-passkey-prompt-dismiss]');
    if (dismissButton) {
      dismissButton.addEventListener('click', () => {
        markPromptDismissed();
        clearPromptPending();
        prompt.remove();
      });
    }
  };

  const maybeShowPasskeyPrompt = async () => {
    if (!state.authenticated || !isPromptPending() || isPromptSuppressed()) {
      return;
    }
    const credentials = await fetchPasskeys();
    if (credentials === null) {
      return;
    }
    clearPromptPending();
    if (credentials.length > 0) {
      return;
    }
    renderPasskeyPrompt();
  };

  const setLoggedInState = (isLoggedIn, email) => {
    state.authenticated = !!isLoggedIn;
    state.email = email || '';
    if (badgeEl) {
      badgeEl.textContent = email ? `Signed in as ${email}` : 'Signed in';
      badgeEl.classList.toggle('is-hidden', !isLoggedIn);
    }
    if (quickLogoutButton) {
      quickLogoutButton.classList.toggle('is-hidden', !isLoggedIn);
    }
    if (openButton) {
      openButton.textContent = 'Account';
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
        setLoggedInState(true, data.user?.email || '');
        state.addressVerified = !!data.user?.address_verified;
        if (consumePostVerifyFlag()) {
          AuthModals.closeAll();
        }
        await maybeShowPasskeyPrompt();
        return true;
      }
      setLoggedInState(false, '');
      return false;
    } catch (error) {
      setLoggedInState(false, '');
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
    } catch (error) {
      // Ignore errors for logout requests
    }
    const authenticated = await fetchAuthState();
    window.dispatchEvent(
      new CustomEvent('auth:changed', { detail: { authenticated: !!authenticated } })
    );
    window.location.href = '/';
  };

  const gateSurveyList = async () => {
    const isSurveyList = window.location.pathname === '/surveys/list/';
    if (!isSurveyList) {
      await fetchAuthState();
      return;
    }
    const authenticated = await fetchAuthState();
    if (!authenticated) {
      AuthModals.open('login');
      return;
    }
    if (!state.addressVerified) {
      if (!window.location.pathname.startsWith('/account/location')) {
        window.location.href = '/account/location';
      }
    }
  };

  document.addEventListener('click', (event) => {
    const openTarget = event.target.closest('[data-auth-open]');
    if (openTarget) {
      event.preventDefault();
      const target = openTarget.getAttribute('data-auth-open');
      AuthModals.open(target || 'login');
      return;
    }
    if (event.target.closest('[data-auth-close]')) {
      event.preventDefault();
      AuthModals.closeAll();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      AuthModals.closeAll();
    }
  });

  if (quickLogoutButton) {
    quickLogoutButton.addEventListener('click', async () => {
      await logout();
    });
  }

  window.addEventListener('auth:changed', async (event) => {
    if (event.detail && event.detail.authenticated) {
      await maybeShowPasskeyPrompt();
    }
  });

  window.AuthUI = {
    state,
    fetchAuthState,
    logout,
    openLogin: () => AuthModals.open('login'),
    openSignup: () => AuthModals.open('signup'),
    openResetRequest: () => AuthModals.open('password-reset'),
  };

  window.PasskeyPrompt = {
    queueAfterPasswordLogin: setPromptPending,
    maybeShow: maybeShowPasskeyPrompt,
  };

  gateSurveyList();
  window.__authSharedLoaded = true;
})();
