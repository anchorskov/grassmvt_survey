// public/js/surveys-render.js
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

  const stripJsonc = (input) => {
    let output = '';
    let inString = false;
    let stringChar = '';
    let escaping = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      const nextChar = input[i + 1];

      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false;
          output += char;
        }
        continue;
      }

      if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }

      if (inString) {
        output += char;
        if (escaping) {
          escaping = false;
          continue;
        }
        if (char === '\\\\') {
          escaping = true;
          continue;
        }
        if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
        output += char;
        continue;
      }

      if (char === '/' && nextChar === '/') {
        inLineComment = true;
        i += 1;
        continue;
      }

      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }

      output += char;
    }

    return output;
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
      return response.text();
    })
    .then((rawText) => {
      const surveys = JSON.parse(stripJsonc(rawText));
      renderSurveys(surveys.filter((s) => s.scope === scope));
    })
    .catch(() => {
      renderError();
    });
})();
