/* public/js/location-setup.js */
(() => {
  const geoStatus = document.getElementById('geo-status');
  const geoCountry = document.getElementById('geo-country');
  const geoWarning = document.getElementById('geo-warning');
  const addressForm = document.getElementById('address-form');
  const addressFieldset = document.getElementById('address-fieldset');
  const addressNote = document.getElementById('address-note');
  const addressError = document.getElementById('address-error');
  const addressSuccess = document.getElementById('address-success');
  const deviceSection = document.getElementById('device-section');
  const deviceSubmit = document.getElementById('device-submit');
  const deviceError = document.getElementById('device-error');
  const deviceResult = document.getElementById('device-result');
  const deviceNote = document.getElementById('device-note');
  const phoneVerifyButton = document.getElementById('phone-verify-button');
  const phoneVerifyStatus = document.getElementById('phone-verify-status');
  const districtsContinueButton = document.getElementById('districts-continue-button');
  const stateSelect = document.getElementById('state');

  if (!addressForm || !stateSelect) {
    return;
  }

  const US_STATES = [
    { code: 'AL', name: 'Alabama' },
    { code: 'AK', name: 'Alaska' },
    { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' },
    { code: 'CA', name: 'California' },
    { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' },
    { code: 'DE', name: 'Delaware' },
    { code: 'DC', name: 'District of Columbia' },
    { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' },
    { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' },
    { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' },
    { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' },
    { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' },
    { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' },
    { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' },
    { code: 'WY', name: 'Wyoming' },
  ];

  let addressLat = null;
  let addressLng = null;
  let addressState = '';
  let addressStateFips = '';
  let addressDistrict = '';
  let addressSenateDist = '';
  let addressHouseDist = '';

  const populateStates = () => {
    const fragment = document.createDocumentFragment();
    US_STATES.forEach((state) => {
      const option = document.createElement('option');
      option.value = state.code;
      option.textContent = `${state.name} (${state.code})`;
      fragment.appendChild(option);
    });
    stateSelect.appendChild(fragment);
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

  const isLikelyMobile = () => {
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  };

  const setAddressEnabled = (enabled) => {
    if (!addressFieldset) {
      return;
    }
    Array.from(addressFieldset.elements).forEach((el) => {
      el.disabled = !enabled;
    });
  };

  const setDeviceSectionVisible = (visible) => {
    if (!deviceSection) {
      return;
    }
    deviceSection.classList.toggle('is-hidden', !visible);
  };

  const setPhoneVerifyVisible = (visible) => {
    if (!phoneVerifyButton || !phoneVerifyStatus) {
      return;
    }
    phoneVerifyButton.classList.toggle('is-hidden', !visible);
    if (!visible) {
      showMessage(phoneVerifyStatus, '');
    }
  };

  const setDistrictsContinueVisible = (visible) => {
    if (!districtsContinueButton) {
      return;
    }
    districtsContinueButton.classList.toggle('is-hidden', !visible);
  };

  const fetchGeo = async () => {
    try {
      const response = await fetch('/api/geo', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('geo failed');
      }
      const data = await response.json();
      return { country: data.country || 'XX', risk: data.risk || 'high' };
    } catch (error) {
      return { country: 'XX', risk: 'high' };
    }
  };

  const fetchAuthState = async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return response.json();
  };

  const handleGeo = async () => {
    const geo = await fetchGeo();
    geoCountry.textContent = geo.country;
    const isUs = geo.country === 'US';
    geoStatus.textContent = isUs
      ? 'USA detected. Address verification is available.'
      : 'Worldwide surveys not yet ready.';
    setAddressEnabled(isUs);
    if (!isUs) {
      showMessage(geoWarning, 'Worldwide surveys not yet ready. USA verification only.');
      showMessage(addressNote, 'Address verification is disabled outside the USA.');
    } else {
      showMessage(geoWarning, '');
      showMessage(addressNote, 'Enter your USA address to continue.');
    }
  };

  const validateAddress = async (payload) => {
    const response = await fetch('/api/location/validate-address', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: data.error || 'UNKNOWN', message: data.message || '' };
    }
    return data;
  };

  const verifyDevice = async (payload) => {
    const response = await fetch('/api/location/verify-device', {
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

  const sendPhoneVerifyLink = async () => {
    const response = await fetch('/api/location/verify-on-phone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      showMessage(phoneVerifyStatus, 'Unable to send verification email. Please try again.');
      return;
    }
    showMessage(phoneVerifyStatus, 'Verification email sent. Open it on your phone.');
  };

  addressForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(addressError, '');
    showMessage(addressSuccess, '');
    setDeviceSectionVisible(false);
    addressLat = null;
    addressLng = null;

    const payload = {
      first_name: document.getElementById('first-name').value,
      last_name: document.getElementById('last-name').value,
      street1: document.getElementById('street1').value,
      street2: document.getElementById('street2').value,
      city: document.getElementById('city').value,
      state: document.getElementById('state').value,
      zip: document.getElementById('zip').value,
    };

    const result = await validateAddress(payload);
    if (!result.ok) {
      showMessage(addressError, result.message || 'USA addresses only for now.');
      return;
    }

    const normalized = result.normalized || {};
    const summary = `${normalized.street1 || ''} ${normalized.street2 || ''}, ${normalized.city || ''}, ${normalized.state || ''} ${normalized.zip || ''}`.trim();
    showMessage(addressSuccess, `Address validated: ${summary}`);
    if (addressFieldset) {
      addressFieldset.setAttribute('disabled', 'disabled');
    }

    addressLat = result.addr_lat;
    addressLng = result.addr_lng;
    addressState = normalized.state || '';
    addressStateFips = result.state_fips || '';
    addressDistrict = result.district || '';
    addressSenateDist = result.state_senate_dist || '';
    addressHouseDist = result.state_house_dist || '';

    if (addressLat === null || addressLng === null) {
      showMessage(addressNote, 'Address validated, district mapping pending. Device check not available yet.');
      setDeviceSectionVisible(false);
      setPhoneVerifyVisible(false);
      setDistrictsContinueVisible(true);
      return;
    }

    setDeviceSectionVisible(true);
    setPhoneVerifyVisible(false);
    setDistrictsContinueVisible(false);
      showMessage(deviceNote, isLikelyMobile()
        ? 'Phone detected. GPS should be accurate.'
      : 'Desktops often use service-provider location and can be inaccurate. For best results, verify on a phone.'
      );
  });

  if (deviceSubmit) {
    deviceSubmit.addEventListener('click', async () => {
      showMessage(deviceError, '');
      showMessage(deviceResult, '');
      if (addressLat === null || addressLng === null) {
        showMessage(deviceError, 'Address coordinates missing.');
        return;
      }
      if (!navigator.geolocation) {
        showMessage(deviceError, 'Geolocation is not supported by this browser.');
        return;
      }
      deviceSubmit.disabled = true;
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const payload = {
            addr_lat: addressLat,
            addr_lng: addressLng,
            device_lat: position.coords.latitude,
            device_lng: position.coords.longitude,
            accuracy_m: position.coords.accuracy,
            timestamp_ms: position.timestamp,
            state: addressState,
            state_fips: addressStateFips,
            district: addressDistrict,
            state_senate_dist: addressSenateDist,
            state_house_dist: addressHouseDist,
          };
          const result = await verifyDevice(payload);
          deviceSubmit.disabled = false;
          if (!result.ok) {
            showMessage(deviceError, 'Unable to verify device location.');
            return;
          }
          if (result.verified) {
            showMessage(deviceResult, `Verified. Distance: ${result.distance_m}m. Accuracy: ${result.accuracy_m}m.`);
            setPhoneVerifyVisible(false);
            setDistrictsContinueVisible(false);
            setTimeout(() => {
              window.location.href = '/account/districts';
            }, 1200);
          } else {
            showMessage(deviceResult, `Not verified. Distance: ${result.distance_m ?? '--'}m. Reason: ${result.reason || 'UNKNOWN'}.`);
            setPhoneVerifyVisible(true);
            setDistrictsContinueVisible(true);
          }
        },
        () => {
          deviceSubmit.disabled = false;
          showMessage(deviceError, 'Unable to access device location.');
          setPhoneVerifyVisible(true);
          setDistrictsContinueVisible(true);
        },
        {
          enableHighAccuracy: true,
          timeout: 60000,
          maximumAge: 0,
        }
      );
    });
  }

  if (phoneVerifyButton) {
    phoneVerifyButton.addEventListener('click', async () => {
      await sendPhoneVerifyLink();
    });
  }

  if (districtsContinueButton) {
    districtsContinueButton.addEventListener('click', async () => {
      // Save the address data even without device verification
      try {
        const response = await fetch('/api/location/save-address', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            addr_lat: addressLat,
            addr_lng: addressLng,
            state: addressState,
            state_fips: addressStateFips,
            district: addressDistrict,
            state_senate_dist: addressSenateDist,
            state_house_dist: addressHouseDist,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!data.ok) {
          console.warn('[Location] Save address failed:', data);
        }
      } catch (e) {
        console.warn('[Location] Save address error:', e);
      }
      window.location.href = '/account/districts';
    });
  }

  populateStates();
  handleGeo();

  fetchAuthState()
    .then((data) => {
      if (data && data.authenticated && data.user && data.user.address_verified === true) {
        window.location.href = '/account/districts';
      }
    })
    .catch(() => {});

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('phoneVerify') === '1') {
    showMessage(deviceNote, 'Phone verification mode. Share device location to complete verification.');
  }
})();
