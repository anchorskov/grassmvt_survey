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

  const usersBtn = document.getElementById('admin-users-refresh');
  const usersFilter = document.getElementById('admin-users-filter');
  const usersErrorEl = document.getElementById('admin-users-error');
  const usersMetaEl = document.getElementById('admin-users-meta');
  const usersResultsEl = document.getElementById('admin-users-results');

  const showUsersError = (message) => {
    if (!usersErrorEl) return;
    if (!message) {
      usersErrorEl.textContent = '';
      usersErrorEl.classList.add('is-hidden');
      return;
    }
    usersErrorEl.textContent = message;
    usersErrorEl.classList.remove('is-hidden');
  };

  const showUsersMeta = (message) => {
    if (!usersMetaEl) return;
    if (!message) {
      usersMetaEl.textContent = '';
      usersMetaEl.classList.add('is-hidden');
      return;
    }
    usersMetaEl.textContent = message;
    usersMetaEl.classList.remove('is-hidden');
  };

  const clearUsersResults = () => {
    if (usersResultsEl) {
      usersResultsEl.textContent = '';
    }
  };

  const renderUsersTable = (users) => {
    if (!usersResultsEl) return;
    clearUsersResults();
    if (!Array.isArray(users) || users.length === 0) {
      usersResultsEl.textContent = 'No users found.';
      return;
    }
    const table = document.createElement('table');
    table.className = 'survey-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const headers = [
      'Email',
      'Account Status',
      'Verified',
      'Verification Method',
      'Verified Scope',
      'Email Verified At',
      'Verified At',
      'Wy Voter ID',
      'Voter Match Status',
      'Residence Confidence',
      'House Dist',
      'Senate Dist',
      'State FIPS',
    ];
    headers.forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    users.forEach((user) => {
      const row = document.createElement('tr');
      const cells = [
        user.email || '',
        user.account_status || '',
        user.is_verified_voter ? 'Yes' : 'No',
        user.verification_method || '',
        user.verified_scope || '',
        user.email_verified_at || '',
        user.verified_at || '',
        user.wy_voter_id || '',
        user.voter_match_status || '',
        user.residence_confidence || '',
        user.state_house_dist || '',
        user.state_senate_dist || '',
        user.state_fips || '',
      ];
      cells.forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    usersResultsEl.appendChild(table);
  };

  if (usersBtn) {
    usersBtn.addEventListener('click', async () => {
      showUsersError('');
      showUsersMeta('');
      clearUsersResults();
      usersBtn.disabled = true;
      usersBtn.textContent = 'Loading...';
      const status = (usersFilter?.value || 'verified').trim();
      try {
        const response = await fetch(`/api/admin/users?status=${encodeURIComponent(status)}`, {
          credentials: 'include',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
          showUsersError(data.error || data.message || 'Unable to load users.');
          return;
        }
        showUsersMeta(`Showing ${data.count || 0} users (${data.status || status}).`);
        renderUsersTable(data.users || []);
      } catch (error) {
        showUsersError(error.message || 'Unable to load users.');
      } finally {
        usersBtn.disabled = false;
        usersBtn.textContent = 'Load users';
      }
    });
  }
})();
