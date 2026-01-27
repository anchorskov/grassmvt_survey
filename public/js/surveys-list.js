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
        const link = `/surveys/${encodeURIComponent(survey.slug)}`;
        return `
          <article class="card">
            <h2>${title}</h2>
            <p class="card__meta">${description}</p>
            <span class="card__status status-active">${scopeLabel}</span>
            <div class="card__actions">
              <a class="button button--small" href="${link}">Continue</a>
            </div>
          </article>
        `;
      })
      .join('');
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
      const response = await fetch('/api/surveys/list', { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error('Failed to load survey data');
      }
      const surveys = await response.json();
      const activeSurveys = Array.isArray(surveys)
        ? surveys.filter((survey) => survey.status === 'active')
        : [];
      renderSurveys(activeSurveys);
    } catch (error) {
      renderError();
    }
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
