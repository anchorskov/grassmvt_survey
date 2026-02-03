/* public/js/admin-verify-voter.js */
(() => {
  const form = document.getElementById('admin-verify-voter-form');
  const emailInput = document.getElementById('admin-verify-email');
  const notesInput = document.getElementById('admin-verify-notes');
  const expiresInput = document.getElementById('admin-verify-expires');
  const errorEl = document.getElementById('admin-verify-error');
  const successEl = document.getElementById('admin-verify-success');
  const linkEl = document.getElementById('admin-verify-link');

  if (!form) {
    return;
  }

  const showError = (message) => {
    if (!errorEl) return;
    if (!message) {
      errorEl.textContent = '';
      errorEl.classList.add('is-hidden');
      return;
    }
    errorEl.textContent = message;
    errorEl.classList.remove('is-hidden');
  };

  const showSuccess = (message) => {
    if (!successEl) return;
    if (!message) {
      successEl.textContent = '';
      successEl.classList.add('is-hidden');
      return;
    }
    successEl.textContent = message;
    successEl.classList.remove('is-hidden');
  };

  const showLink = (url) => {
    if (!linkEl) return;
    if (!url) {
      linkEl.textContent = '';
      linkEl.classList.add('is-hidden');
      return;
    }
    linkEl.textContent = url;
    linkEl.classList.remove('is-hidden');
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    showSuccess('');
    showLink('');

    const email = (emailInput?.value || '').trim().toLowerCase();
    const notes = (notesInput?.value || '').trim();
    const expiresRaw = (expiresInput?.value || '').trim();
    const expires = expiresRaw ? Number(expiresRaw) : undefined;

    if (!email) {
      showError('Email is required.');
      return;
    }

    const payload = { target_email: email };
    if (notes) {
      payload.notes = notes;
    }
    if (Number.isFinite(expires) && expires > 0) {
      payload.expires_minutes = expires;
    }

    try {
      const response = await fetch('/api/admin/verify-voter/issue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        showError(data.error || data.message || 'Unable to issue link.');
        return;
      }
      if (data.status === 'EMAIL_SENT') {
        showSuccess('Email sent.');
        return;
      }
      if (data.link) {
        showSuccess('Email not configured. Copy the link below.');
        showLink(data.link);
        return;
      }
      showSuccess('Link issued.');
    } catch (error) {
      showError(error.message || 'Unable to issue link.');
    }
  });
})();
