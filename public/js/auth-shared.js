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
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) {
        setLoggedInState(false, '');
        return false;
      }
      const data = await response.json();
      if (data.authenticated) {
        setLoggedInState(true, data.user?.email || '');
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

  window.AuthUI = {
    state,
    fetchAuthState,
    logout,
    openLogin: () => AuthModals.open('login'),
    openSignup: () => AuthModals.open('signup'),
    openResetRequest: () => AuthModals.open('password-reset'),
  };

  gateSurveyList();
  window.__authSharedLoaded = true;
})();
