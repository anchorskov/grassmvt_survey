/* public/js/passkey-account.js */
(() => {
  const authRequiredSection = document.getElementById('account-auth-required');
  const passkeySection = document.getElementById('account-passkeys');
  const addButton = document.getElementById('add-passkey-button');
  const nicknameInput = document.getElementById('passkey-nickname');
  const errorEl = document.getElementById('passkey-error');
  const successEl = document.getElementById('passkey-success');
  const listEl = document.getElementById('passkey-list');
  const countEl = document.getElementById('passkey-count');

  const PASSKEY_NUDGE_KEY = 'passkey_nudge_dismissed_at';

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

  const setPasskeyCount = (count) => {
    if (!countEl) {
      return;
    }
    const label = count === 1 ? 'passkey' : 'passkeys';
    countEl.textContent = `You have ${count} ${label} registered.`;
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
    setPasskeyCount(credentials.length);
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
    const response = await fetch('/api/auth/passkey/list', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 403) {
        showError('Please sign in again.');
        authRequiredSection.classList.remove('is-hidden');
        passkeySection.classList.add('is-hidden');
        if (window.AuthUI && typeof window.AuthUI.openLogin === 'function') {
          window.AuthUI.openLogin();
        }
        return;
      }
      showError('Unable to load passkeys.');
      renderList([]);
      return;
    }
    const data = await response.json();
    renderList(data.credentials || []);
  };

  const fetchAuthState = async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return !!data.authenticated;
  };

  const init = async () => {
    try {
      localStorage.removeItem(PASSKEY_NUDGE_KEY);
    } catch (error) {
      // Ignore storage failures
    }
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

  // Admin Panel Logic
  const adminPanel = document.getElementById('admin-panel');
  const adminIssueBtn = document.getElementById('admin-issue-link');
  const adminEmailInput = document.getElementById('admin-target-email');
  const adminNotesInput = document.getElementById('admin-notes');
  const adminExpiresInput = document.getElementById('admin-expires');
  const adminErrorEl = document.getElementById('admin-error');
  const adminSuccessEl = document.getElementById('admin-success');
  const adminLinkResult = document.getElementById('admin-link-result');
  const adminLinkOutput = document.getElementById('admin-link-output');
  const adminCopyBtn = document.getElementById('admin-copy-link');

  const showAdminError = (message) => {
    if (!adminErrorEl) return;
    if (!message) {
      adminErrorEl.textContent = '';
      adminErrorEl.classList.add('is-hidden');
      return;
    }
    adminErrorEl.textContent = message;
    adminErrorEl.classList.remove('is-hidden');
    if (adminSuccessEl) adminSuccessEl.classList.add('is-hidden');
    if (adminLinkResult) adminLinkResult.classList.add('is-hidden');
  };

  const showAdminSuccess = (message) => {
    if (!adminSuccessEl) return;
    if (!message) {
      adminSuccessEl.textContent = '';
      adminSuccessEl.classList.add('is-hidden');
      return;
    }
    adminSuccessEl.textContent = message;
    adminSuccessEl.classList.remove('is-hidden');
    if (adminErrorEl) adminErrorEl.classList.add('is-hidden');
  };

  const checkAdminRole = async () => {
    if (!adminPanel) return;
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (data.authenticated && data.user && data.user.is_admin) {
        adminPanel.classList.remove('is-hidden');
      }
    } catch (e) {
      // Ignore
    }
  };

  if (adminIssueBtn) {
    adminIssueBtn.addEventListener('click', async () => {
      showAdminError('');
      showAdminSuccess('');
      if (adminLinkResult) adminLinkResult.classList.add('is-hidden');

      const email = (adminEmailInput?.value || '').trim();
      const notes = (adminNotesInput?.value || '').trim();
      const expires = parseInt(adminExpiresInput?.value || '60', 10);

      if (!email) {
        showAdminError('Please enter a target email.');
        return;
      }

      adminIssueBtn.disabled = true;
      adminIssueBtn.textContent = 'Issuing...';

      try {
        const response = await fetch('/api/admin/verify-voter/issue', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            target_email: email,
            notes: notes || undefined,
            expires_minutes: expires,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
          showAdminError(data.error || data.message || 'Failed to issue link.');
          return;
        }
        if (data.status === 'EMAIL_SENT') {
          showAdminSuccess('Verification email sent to ' + email);
        } else if (data.link) {
          showAdminSuccess('Link generated (email not configured). Copy and send manually:');
          if (adminLinkOutput) adminLinkOutput.value = data.link;
          if (adminLinkResult) adminLinkResult.classList.remove('is-hidden');
        } else {
          showAdminSuccess('Link issued successfully.');
        }
        if (adminEmailInput) adminEmailInput.value = '';
        if (adminNotesInput) adminNotesInput.value = '';
      } catch (error) {
        showAdminError('Request failed. Please try again.');
      } finally {
        adminIssueBtn.disabled = false;
        adminIssueBtn.textContent = 'Issue verify-voter link';
      }
    });
  }

  if (adminCopyBtn && adminLinkOutput) {
    adminCopyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(adminLinkOutput.value);
        adminCopyBtn.textContent = 'Copied!';
        setTimeout(() => {
          adminCopyBtn.textContent = 'Copy link';
        }, 2000);
      } catch (e) {
        adminLinkOutput.select();
        document.execCommand('copy');
        adminCopyBtn.textContent = 'Copied!';
        setTimeout(() => {
          adminCopyBtn.textContent = 'Copy link';
        }, 2000);
      }
    });
  }

  // Check admin role after init
  checkAdminRole();

  init();
})();
