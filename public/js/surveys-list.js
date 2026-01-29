/* public/js/surveys-list.js */
(() => {
  const grid = document.getElementById('survey-grid');
  const sessionKey = 'scope_session_id';

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

    grid.innerHTML = surveys
      .map((survey) => {
        const description = escapeHtml(survey.description || '');
        const title = escapeHtml(survey.title || 'Survey');
        const scopeLabel = survey.scope === 'wy' ? 'Wyoming' : 'General';
        const link = survey.href || `/surveys/${encodeURIComponent(survey.slug)}`;
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
            ${statusLine ? `<p class="card__meta">${statusLine}</p>` : ''}
            ${editLine ? `<p class="card__meta">${editLine}</p>` : ''}
            <span class="card__status status-active">${scopeLabel}</span>
            <div class="card__actions">
              <a class="button button--small" href="${link}">${buttonLabel}</a>
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
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) {
        return false;
      }
      const data = await response.json();
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
