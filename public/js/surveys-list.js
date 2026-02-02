/* public/js/surveys-list.js */
(() => {
  const grid = document.getElementById('survey-grid');
  const sessionKey = 'scope_session_id';

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

  // User state from /api/auth/me
  let userState = null;

  if (!grid) {
    return;
  }

  const escapeHtml = (value = '') =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const renderError = () => {
    grid.innerHTML = '<p class="card">Surveys are unavailable right now.</p>';
  };

  const getStoredSession = () => {
    try {
      return sessionStorage.getItem(sessionKey);
    } catch (error) {
      return '';
    }
  };

  const storeSession = (sessionId) => {
    if (!sessionId) {
      return;
    }
    try {
      sessionStorage.setItem(sessionKey, sessionId);
    } catch (error) {
      return;
    }
  };

  const ensureScopeSession = async () => {
    if (getStoredSession()) {
      return;
    }

    try {
      const response = await fetch('/api/scope/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      storeSession(data.session_id);
    } catch (error) {
      return;
    }
  };

  const renderSurveys = (surveys) => {
    if (!surveys.length) {
      grid.innerHTML = '<p class="card">No surveys are available yet.</p>';
      return;
    }

    // Build verification status badge
    let verificationBadge = '';
    if (userState) {
      const voterStatus = userState.verification?.voter_match_status;
      const addressVerified = userState.address_verified;
      const addr = userState.address_verification || {};
      const stateFips = addr.state_fips || '';
      const stateName = FIPS_TO_STATE[stateFips] || userState.profile?.state || '';
      const house = addr.state_house_dist ? String(parseInt(addr.state_house_dist, 10)) : '';
      const senate = addr.state_senate_dist ? String(parseInt(addr.state_senate_dist, 10)) : '';
      
      if (voterStatus === 'verified') {
        verificationBadge = `<span class="card__badge badge--verified">✓ Verified Registered Voter</span>`;
      } else if (addressVerified) {
        verificationBadge = `<span class="card__badge badge--address">✓ Address Verified</span>`;
      }
      
      // Add district info if available
      if (addressVerified && (stateName || house || senate)) {
        const parts = [];
        if (stateName) parts.push(stateName);
        if (house) parts.push(`HD-${house}`);
        if (senate) parts.push(`SD-${senate}`);
        verificationBadge += `<span class="card__districts">${parts.join(' • ')}</span>`;
      }
    }

    grid.innerHTML = surveys
      .map((survey) => {
        const description = escapeHtml(survey.description || '');
        const title = escapeHtml(survey.title || 'Survey');
        const scopeLabel = survey.scope === 'wy' ? 'Wyoming' : 'General';
        const link = survey.href || `/surveys/${encodeURIComponent(survey.slug)}`;
        const resultsLink = `/surveys/results/?slug=${encodeURIComponent(survey.slug)}`;
        const hasResponse = !!survey.response;
        const submittedAt = survey.response?.submittedAt
          ? new Date(survey.response.submittedAt).toLocaleString()
          : '';
        const updatedAt = survey.response?.updatedAt
          ? new Date(survey.response.updatedAt).toLocaleString()
          : '';
        const editCount = survey.response?.editCount || 0;
        const statusLine = hasResponse
          ? `Completed: ${escapeHtml(submittedAt)}`
          : '';
        const editLine = hasResponse && editCount > 0 && updatedAt
          ? `Edited: ${escapeHtml(updatedAt)}`
          : '';
        const buttonLabel = hasResponse ? 'Edit responses' : 'Start survey';
        return `
          <article class="card">
            <h2>${title}</h2>
            <p class="card__meta">${description}</p>
            ${verificationBadge ? `<div class="card__verification">${verificationBadge}</div>` : ''}
            ${statusLine ? `<p class="card__meta">${statusLine}</p>` : ''}
            ${editLine ? `<p class="card__meta">${editLine}</p>` : ''}
            <span class="card__status status-active">${scopeLabel}</span>
            <div class="card__actions">
              <a class="button button--small" href="${link}">${buttonLabel}</a>
              <a class="button button--small button--secondary" href="${resultsLink}">View Results</a>
            </div>
          </article>
        `;
      })
      .join('');

    maybeAutoLaunch(surveys);
  };

  const loadStaticSurveys = async () => {
    try {
      const response = await fetch('/data/surveys.json', { credentials: 'same-origin' });
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        return [];
      }
      return data
        .filter((survey) => survey.status === 'active' && typeof survey.href === 'string')
        .map((survey) => {
          const match = survey.href.match(/^\/surveys\/([^/]+)\/?$/);
          return {
            slug: match ? decodeURIComponent(match[1]) : '',
            title: survey.title || 'Survey',
            scope: survey.scope || 'public',
            status: survey.status || 'active',
            description: survey.description || '',
            href: survey.href,
          };
        })
        .filter((survey) => survey.slug);
    } catch (error) {
      return [];
    }
  };

  const isAuthenticated = async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        return false;
      }
      const data = await response.json();
      if (data.authenticated && data.user) {
        userState = data.user;
      }
      return !!data.authenticated;
    } catch (error) {
      return false;
    }
  };

  const loadSurveys = async () => {
    try {
      const [apiResponse, staticSurveys] = await Promise.all([
        fetch('/api/surveys/list', { credentials: 'same-origin' }),
        loadStaticSurveys(),
      ]);
      if (!apiResponse.ok) {
        throw new Error('Failed to load survey data');
      }
      const surveys = await apiResponse.json();
      const activeSurveys = Array.isArray(surveys)
        ? surveys.filter((survey) => survey.status === 'active')
        : [];
      const merged = [...activeSurveys];
      staticSurveys.forEach((survey) => {
        if (!merged.some((item) => item.slug === survey.slug)) {
          merged.push(survey);
        }
      });
      renderSurveys(merged);
    } catch (error) {
      renderError();
    }
  };

  const getAutoLaunchSlug = () => {
    const params = new URLSearchParams(window.location.search || '');
    const slug = (params.get('survey') || '').toString().trim();
    const autoclick = (params.get('autoclick') || '').toString().trim();
    if (!slug || autoclick !== '1') {
      return '';
    }
    return slug;
  };

  const maybeAutoLaunch = (surveys) => {
    const slug = getAutoLaunchSlug();
    if (!slug || !Array.isArray(surveys)) {
      return;
    }
    const match = surveys.find((survey) => survey.slug === slug);
    if (!match) {
      return;
    }
    const link = match.href || `/surveys/${encodeURIComponent(match.slug)}`;
    if (!link) {
      return;
    }
    window.location.href = link;
  };

  const handleAuthChange = (authed) => {
    if (!authed) {
      grid.classList.add('is-hidden');
      return;
    }
    grid.classList.remove('is-hidden');
    loadSurveys();
  };

  window.addEventListener('auth:changed', (event) => {
    const authed = !!event.detail?.authenticated;
    handleAuthChange(authed);
  });

  ensureScopeSession()
    .then(isAuthenticated)
    .then((authed) => {
      handleAuthChange(authed);
    })
    .catch(() => {
      renderError();
    });
})();
