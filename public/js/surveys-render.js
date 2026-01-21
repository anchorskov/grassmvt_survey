/* public/js/surveys-render.js */
(() => {
  const label = document.getElementById('survey-scope-label');
  const grid = document.getElementById('survey-grid');

  if (!label || !grid) {
    return;
  }

  const getScope = () => {
    try {
      const stored = sessionStorage.getItem('survey_scope');
      if (stored === 'wy' || stored === 'public') {
        return stored;
      }
    } catch (error) {
      return 'public';
    }
    return 'public';
  };

  const scope = getScope();
  const scopeLabelMap = {
    wy: 'Wyoming surveys',
    public: 'General surveys',
  };

  const renderError = () => {
    label.textContent = 'Surveys unavailable right now.';
    grid.innerHTML = '<p class="card">Please check back soon.</p>';
  };

  const renderSurveys = (surveys) => {
    label.textContent = scopeLabelMap[scope] || 'Surveys';
    if (!surveys.length) {
      grid.innerHTML = '<p class="card">No surveys are available yet.</p>';
      return;
    }

    grid.innerHTML = surveys
      .map((survey) => {
        const isActive = survey.status === 'active';
        const status = isActive ? 'Active' : 'Coming soon';
        const statusClass = isActive ? 'status-active' : 'status-coming-soon';
        return `
          <a class="card" href="${survey.href}">
            <h3>${survey.title}</h3>
            <p>${survey.description}</p>
            <span class="card__status ${statusClass}">${status}</span>
          </a>
        `;
      })
      .join('');
  };

  fetch('/data/surveys.json', { credentials: 'same-origin' })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to load survey data');
      }
      return response.json();
    })
    .then((surveys) => {
      renderSurveys(surveys.filter((s) => s.scope === scope));
    })
    .catch(() => {
      renderError();
    });
})();
