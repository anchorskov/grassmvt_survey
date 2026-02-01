/* public/js/districts-verify.js */
(() => {
  const statusEl = document.getElementById('district-status');
  const stateEl = document.getElementById('district-state');
  const federalEl = document.getElementById('district-federal');
  const houseEl = document.getElementById('district-house');
  const senateEl = document.getElementById('district-senate');
  const wySection = document.getElementById('wy-voter-section');
  const voterStatusEl = document.getElementById('voter-status');
  const form = document.getElementById('wy-voter-form');
  const errorEl = document.getElementById('wy-voter-error');
  const resultEl = document.getElementById('wy-voter-result');
  const districtErrorEl = document.getElementById('district-error');
  const districtResultEl = document.getElementById('district-result');
  const continueButton = document.getElementById('district-continue');
  const saveButton = document.getElementById('district-save');
  const backButton = document.getElementById('district-back');

  // FIPS to state name lookup
  const FIPS_TO_STATE = {
    '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas', '06': 'California',
    '08': 'Colorado', '09': 'Connecticut', '10': 'Delaware', '11': 'District of Columbia',
    '12': 'Florida', '13': 'Georgia', '15': 'Hawaii', '16': 'Idaho', '17': 'Illinois',
    '18': 'Indiana', '19': 'Iowa', '20': 'Kansas', '21': 'Kentucky', '22': 'Louisiana',
    '23': 'Maine', '24': 'Maryland', '25': 'Massachusetts', '26': 'Michigan', '27': 'Minnesota',
    '28': 'Mississippi', '29': 'Missouri', '30': 'Montana', '31': 'Nebraska', '32': 'Nevada',
    '33': 'New Hampshire', '34': 'New Jersey', '35': 'New Mexico', '36': 'New York',
    '37': 'North Carolina', '38': 'North Dakota', '39': 'Ohio', '40': 'Oklahoma', '41': 'Oregon',
    '42': 'Pennsylvania', '44': 'Rhode Island', '45': 'South Carolina', '46': 'South Dakota',
    '47': 'Tennessee', '48': 'Texas', '49': 'Utah', '50': 'Vermont', '51': 'Virginia',
    '53': 'Washington', '54': 'West Virginia', '55': 'Wisconsin', '56': 'Wyoming',
  };

  // Format district number (trim leading zeros)
  const formatDistrictNum = (val) => {
    if (!val) return null;
    const num = parseInt(val, 10);
    return isNaN(num) ? val : String(num);
  };

  // Track confirmations
  const confirmations = {
    state: null,
    federal: null,
    house: null,
    senate: null,
  };

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
    const verification = data?.user?.verification || {};
    const stateFips = address.state_fips || '';
    const stateName = FIPS_TO_STATE[stateFips] || state || '--';
    const houseNum = formatDistrictNum(address.state_house_dist);
    const senateNum = formatDistrictNum(address.state_senate_dist);
    
    // Display state name (from FIPS lookup)
    stateEl.textContent = stateName;
    
    // Congressional district: Wyoming is at-large (single district)
    if (stateFips === '56') {
      federalEl.textContent = 'Wyoming At-Large';
    } else if (stateFips) {
      federalEl.textContent = `${stateName} Congressional District`;
    } else {
      federalEl.textContent = '--';
    }
    
    // State House District - format as HD-X
    houseEl.textContent = houseNum ? `HD-${houseNum}` : '--';
    
    // State Senate District - format as SD-X
    senateEl.textContent = senateNum ? `SD-${senateNum}` : '--';
    
    // Address verification status
    if (statusEl) {
      if (data?.user?.address_verified) {
        statusEl.textContent = 'Address verified. Please confirm your districts below.';
      } else {
        statusEl.textContent = 'Address not yet verified. You can still review districts or go back to complete location setup.';
      }
    }
    
    // Voter registration status
    if (voterStatusEl) {
      const voterStatus = verification.voter_match_status || 'unknown';
      if (voterStatus === 'verified') {
        voterStatusEl.textContent = '✓ Verified Registered Voter';
        voterStatusEl.className = 'helper-text voter-verified';
      } else if (state === 'WY') {
        voterStatusEl.textContent = 'Not yet verified as registered voter. Complete voter verification below.';
        voterStatusEl.className = 'helper-text voter-unverified';
      } else {
        voterStatusEl.textContent = `We do not currently have registered voter data for ${stateName}. Your address has been verified.`;
        voterStatusEl.className = 'helper-text voter-no-data';
      }
    }
    
    // Show WY voter section only for Wyoming users who are NOT already verified
    if (wySection) {
      const isWY = state === 'WY' || stateFips === '56';
      const isVoterVerified = verification.voter_match_status === 'verified';
      wySection.classList.toggle('is-hidden', !isWY || isVoterVerified);
    }

    // Log for debugging
    console.log('[Districts] address_verified:', data?.user?.address_verified);
    console.log('[Districts] voter_status:', verification.voter_match_status);
    console.log('[Districts] address_verification:', address);
  };

  const updateConfirmationStatus = (district, confirmed) => {
    confirmations[district] = confirmed;
    const statusEl = document.getElementById(`status-${district}`);
    if (statusEl) {
      statusEl.textContent = confirmed ? '✓ Confirmed' : '✗ Rejected';
      statusEl.className = 'district-status ' + (confirmed ? 'confirmed' : 'rejected');
    }
    
    // Disable buttons after selection
    const row = document.getElementById(`row-${district}`);
    if (row) {
      row.querySelectorAll('button').forEach(btn => btn.disabled = true);
    }
    
    // Show save button when all districts have been confirmed/rejected
    checkAllConfirmed();
  };

  const checkAllConfirmed = () => {
    const allSet = Object.values(confirmations).every(v => v !== null);
    if (saveButton) {
      saveButton.classList.toggle('is-hidden', !allSet);
    }
    if (allSet) {
      const allConfirmed = Object.values(confirmations).every(v => v === true);
      showMessage(districtResultEl, allConfirmed 
        ? 'All districts confirmed! You can now continue to surveys.'
        : 'Some districts were rejected. You can still continue, but please verify your address if needed.');
    }
  };

  const saveDistrictConfirmations = async () => {
    try {
      const response = await fetch('/api/location/confirm-districts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmations }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        showMessage(districtErrorEl, 'Unable to save confirmations. Please try again.');
        return;
      }
      showMessage(districtResultEl, 'District confirmations saved! Redirecting to surveys...');
      setTimeout(() => {
        window.location.href = '/surveys/list/';
      }, 1200);
    } catch (error) {
      showMessage(districtErrorEl, 'Unable to save confirmations. Please try again.');
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

  // Handle yes/no button clicks
  document.querySelectorAll('[data-district][data-confirm]').forEach(button => {
    button.addEventListener('click', () => {
      const district = button.getAttribute('data-district');
      const confirmed = button.getAttribute('data-confirm') === 'yes';
      updateConfirmationStatus(district, confirmed);
    });
  });

  // Save button handler
  if (saveButton) {
    saveButton.addEventListener('click', saveDistrictConfirmations);
  }

  // WY voter form handler
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
        let msg = '✓ Verified as registered Wyoming voter';
        if (result.confidence === 'high') {
          msg += ' (high confidence match)';
        } else if (result.confidence === 'medium') {
          msg += ' (name match confirmed)';
        }
        if (result.house) {
          msg += `. House District: HD-${parseInt(result.house, 10)}`;
        }
        if (result.senate) {
          msg += `, Senate District: SD-${parseInt(result.senate, 10)}`;
        }
        showMessage(resultEl, msg);
        // Update voter status display
        if (voterStatusEl) {
          voterStatusEl.textContent = '✓ Verified Registered Voter';
          voterStatusEl.className = 'helper-text voter-verified';
        }
        // Hide the WY voter form since verification is complete
        if (wySection) {
          wySection.classList.add('is-hidden');
        }
        setTimeout(() => {
          window.location.href = '/surveys/list/';
        }, 2500);
        return;
      }
      showMessage(resultEl, 'We could not find a registered Wyoming voter matching this name and address. You can continue as address-verified.');
    });
  }

  // Continue button - goes to surveys
  if (continueButton) {
    continueButton.addEventListener('click', () => {
      window.location.href = '/surveys/list/';
    });
  }

  // Back button - goes to location setup
  if (backButton) {
    backButton.addEventListener('click', () => {
      window.location.href = '/account/location/';
    });
  }

  // Load initial state
  fetchAuthState()
    .then((data) => setDistricts(data))
    .catch(() => {
      if (statusEl) {
        statusEl.textContent = 'Unable to load verification status. Please log in.';
      }
    });
})();
