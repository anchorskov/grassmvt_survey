/* public/js/passkey-account.js */
(() => {
  const authRequiredSection = document.getElementById('account-auth-required');
  const passkeySection = document.getElementById('account-passkeys');
  const addButton = document.getElementById('add-passkey-button');
  const nicknameInput = document.getElementById('passkey-nickname');
  const errorEl = document.getElementById('passkey-error');
  const successEl = document.getElementById('passkey-success');
  const listEl = document.getElementById('passkey-list');

  if (!authRequiredSection || !passkeySection || !listEl) {
    return;
  }

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

  const renderList = (credentials) => {
    listEl.innerHTML = '';
    if (!credentials.length) {
      const empty = document.createElement('li');
      empty.textContent = 'No passkeys registered yet.';
      listEl.appendChild(empty);
      return;
    }
    credentials.forEach((cred) => {
      const item = document.createElement('li');
      item.className = 'passkey-list__item';
      const name = document.createElement('div');
      name.textContent = cred.nickname || 'Passkey';
      const meta = document.createElement('div');
      meta.className = 'passkey-list__meta';
      const created = cred.created_at ? `Created ${new Date(cred.created_at).toLocaleString()}` : 'Created';
      const used = cred.last_used_at ? `Last used ${new Date(cred.last_used_at).toLocaleString()}` : 'Never used';
      meta.textContent = `${created} · ${used}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'link-button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        const ok = window.confirm('Remove this passkey?');
        if (!ok) {
          return;
        }
        showError('');
        showSuccess('');
        const response = await fetch('/api/auth/passkey/remove', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: cred.id }),
        });
        if (!response.ok) {
          showError('Unable to remove passkey.');
          return;
        }
        await fetchPasskeys();
        showSuccess('Passkey removed.');
      });
      item.appendChild(name);
      item.appendChild(meta);
      item.appendChild(remove);
      listEl.appendChild(item);
    });
  };

  const fetchPasskeys = async () => {
    const response = await fetch('/api/auth/passkey/list', { credentials: 'include' });
    if (!response.ok) {
      renderList([]);
      return;
    }
    const data = await response.json();
    renderList(data.credentials || []);
  };

  const fetchAuthState = async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return !!data.authenticated;
  };

  const init = async () => {
    const authenticated = await fetchAuthState();
    if (!authenticated) {
      authRequiredSection.classList.remove('is-hidden');
      passkeySection.classList.add('is-hidden');
      return;
    }
    authRequiredSection.classList.add('is-hidden');
    passkeySection.classList.remove('is-hidden');
    await fetchPasskeys();
  };

  if (addButton) {
    if (!window.PublicKeyCredential) {
      addButton.disabled = true;
      showError('Passkeys are not supported on this device.');
    }
    addButton.addEventListener('click', async () => {
      showError('');
      showSuccess('');
      let browser;
      try {
        browser = await loadWebAuthnBrowser();
      } catch (error) {
        showError('Passkey support is unavailable.');
        return;
      }
      const nickname = nicknameInput ? nicknameInput.value.trim() : '';
      const optionsResponse = await fetch('/api/auth/passkey/register/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nickname }),
      });
      if (!optionsResponse.ok) {
        showError('Unable to start passkey registration.');
        return;
      }
      const optionsData = await optionsResponse.json();
      if (!optionsData.options) {
        showError('Unable to start passkey registration.');
        return;
      }
      let attestationResponse;
      try {
        attestationResponse = await browser.startRegistration(optionsData.options);
      } catch (error) {
        showError('Passkey registration was cancelled.');
        return;
      }
      const verifyResponse = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          attestationResponse,
          nickname,
        }),
      });
      if (!verifyResponse.ok) {
        showError('Passkey registration failed.');
        return;
      }
      showSuccess('Passkey added.');
      await fetchPasskeys();
      if (nicknameInput) {
        nicknameInput.value = '';
      }
    });
  }

  init();
})();
