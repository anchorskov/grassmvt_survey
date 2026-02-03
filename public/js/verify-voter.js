/* public/js/verify-voter.js */
(() => {
  const messageEl = document.getElementById('verify-voter-message');
  const expiryEl = document.getElementById('verify-voter-expiry');
  const errorEl = document.getElementById('verify-voter-error');
  const successEl = document.getElementById('verify-voter-success');
  const button = document.getElementById('verify-voter-passkey');
  const AUTH_RETURN_KEY = 'auth_return_to';

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

  const setMessage = (message) => {
    if (messageEl) {
      messageEl.textContent = message || '';
    }
  };

  const setExpiry = (message) => {
    if (expiryEl) {
      expiryEl.textContent = message || '';
    }
  };

  const disableButton = (reason) => {
    if (!button) {
      return;
    }
    button.disabled = true;
    if (reason) {
      button.textContent = reason;
    }
  };

  const mapPasskeyError = (error) => {
    const name = error && error.name ? error.name : '';
    const message = error && error.message ? error.message : '';
    if (name === 'NotAllowedError') {
      if (message.includes('timed out')) {
        return 'Passkey verification timed out. Please try again.';
      }
      return 'Passkey verification was cancelled or not allowed.';
    }
    if (name === 'InvalidStateError') {
      return 'No matching passkey found on this device.';
    }
    if (name === 'SecurityError') {
      return 'Passkey verification failed due to a security mismatch.';
    }
    if (name === 'AbortError') {
      return 'Passkey verification was cancelled.';
    }
    if (name === 'NotSupportedError') {
      return 'Passkeys are not supported on this device.';
    }
    return 'Passkey verification failed. Please try again.';
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
        window.__webauthnBrowserPromise = null;
        throw error;
      });
    return window.__webauthnBrowserPromise;
  };

  const getToken = () => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('token') || '').trim();
  };

  const ensureAuthenticated = async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    if (!data || !data.authenticated) {
      return false;
    }
    return true;
  };

  const redirectToLogin = () => {
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      localStorage.setItem(AUTH_RETURN_KEY, returnTo);
    } catch (error) {
      // Ignore storage failures
    }
    window.location.href = '/auth/login/';
  };

  const fetchStatus = async (token) => {
    const response = await fetch(`/api/verify-voter/status?token=${encodeURIComponent(token)}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to load verification status.');
    }
    return response.json();
  };

  const beginStepup = async () => {
    const response = await fetch('/api/passkey/stepup/begin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to start passkey verification.');
    }
    return data;
  };

  const finishStepup = async (assertionResponse, challengeId) => {
    const response = await fetch('/api/passkey/stepup/finish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ assertionResponse, challengeId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Unable to verify passkey.');
    }
    return data;
  };

  const completeVerification = async (token) => {
    const response = await fetch('/api/verify-voter/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || data.message || 'Unable to complete verification.');
    }
    return data;
  };

  const handleStepup = async (token) => {
    showError('');
    showSuccess('');
    if (!button) {
      return;
    }
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Working...';

    try {
      const browser = await loadWebAuthnBrowser();
      const begin = await beginStepup();
      const assertionResponse = await browser.startAuthentication(begin.options);
      if (!assertionResponse) {
        throw new Error('No passkey response returned.');
      }
      await finishStepup(assertionResponse, begin.challengeId);
      await completeVerification(token);
      showSuccess('Verified voter upgrade completed.');
      setMessage('Your account is now verified.');
      setExpiry('');
      disableButton('Verified');
    } catch (error) {
      const message = error && error.name ? mapPasskeyError(error) : (error.message || 'Passkey verification failed.');
      showError(message);
      button.disabled = false;
      button.textContent = originalLabel;
    }
  };

  const init = async () => {
    const token = getToken();
    if (!token) {
      setMessage('Verification link is missing a token.');
      disableButton('Missing token');
      return;
    }

    const authenticated = await ensureAuthenticated();
    if (!authenticated) {
      redirectToLogin();
      return;
    }

    try {
      const status = await fetchStatus(token);
      if (!status.valid) {
        setMessage('This verification link is not valid.');
      } else {
        setMessage('Ready to verify your account.');
      }
      if (status.expires_at) {
        const expiresAt = new Date(status.expires_at);
        if (!Number.isNaN(expiresAt.getTime())) {
          setExpiry(`Expires ${expiresAt.toLocaleString()}.`);
        }
      }
      if (!status.account_match) {
        showError('This link is not for the account you are signed into.');
        disableButton('Account mismatch');
        return;
      }
      if (!status.valid) {
        disableButton('Link not valid');
        return;
      }
    } catch (error) {
      showError(error.message || 'Unable to load status.');
      disableButton('Unable to verify');
      return;
    }

    if (!window.PublicKeyCredential) {
      disableButton('Passkey not supported');
      return;
    }

    if (button) {
      button.addEventListener('click', () => handleStepup(token));
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    init();
  });
})();
