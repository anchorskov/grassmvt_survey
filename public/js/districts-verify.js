/* public/js/districts-verify.js */
(() => {
  const statusEl = document.getElementById('district-status');
  const stateEl = document.getElementById('district-state');
  const federalEl = document.getElementById('district-federal');
  const houseEl = document.getElementById('district-house');
  const senateEl = document.getElementById('district-senate');
  const wySection = document.getElementById('wy-voter-section');
  const form = document.getElementById('wy-voter-form');
  const errorEl = document.getElementById('wy-voter-error');
  const resultEl = document.getElementById('wy-voter-result');
  const continueButton = document.getElementById('district-continue');

  const showMessage = (el, message) => {
    if (!el) {
      return;
    }
    if (!message) {
      el.textContent = '';
      el.classList.add('is-hidden');
      return;
    }
    el.textContent = message;
    el.classList.remove('is-hidden');
  };

  const fetchAuthState = async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      throw new Error('auth_failed');
    }
    return response.json();
  };

  const setDistricts = (data) => {
    const state = data?.user?.profile?.state || '--';
    const address = data?.user?.address_verification || {};
    stateEl.textContent = state || '--';
    federalEl.textContent = address.district || '--';
    houseEl.textContent = data?.user?.profile?.wy_house_district || '--';
    senateEl.textContent = data?.user?.profile?.state_senate_dist || '--';
    if (statusEl) {
      statusEl.textContent = data?.user?.address_verified ? 'Address verified.' : 'Address not verified yet.';
    }
    if (wySection) {
      wySection.classList.toggle('is-hidden', state !== 'WY');
    }
  };

  const verifyVoter = async (payload) => {
    const response = await fetch('/api/location/verify-voter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: data.reason || data.error || 'UNKNOWN' };
    }
    return data;
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      showMessage(errorEl, '');
      showMessage(resultEl, '');
      const payload = {
        first_name: document.getElementById('wy-first-name').value,
        last_name: document.getElementById('wy-last-name').value,
        street1: document.getElementById('wy-street').value,
        city: document.getElementById('wy-city').value,
        zip: document.getElementById('wy-zip').value,
        state: 'WY',
      };
      const result = await verifyVoter(payload);
      if (!result.ok) {
        showMessage(errorEl, 'Unable to verify voter registration.');
        return;
      }
      if (result.matched) {
        showMessage(resultEl, 'Voter verified. Redirecting to surveys...');
        setTimeout(() => {
          window.location.href = '/surveys/list/';
        }, 1200);
        return;
      }
      showMessage(resultEl, 'We could not confirm a registered Wyoming voter at this address. You can continue as unverified.');
    });
  }

  if (continueButton) {
    continueButton.addEventListener('click', () => {
      window.location.href = '/surveys/list/';
    });
  }

  fetchAuthState()
    .then((data) => setDistricts(data))
    .catch(() => {
      if (statusEl) {
        statusEl.textContent = 'Unable to load verification status.';
      }
    });
})();
