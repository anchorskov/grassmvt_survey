// public/js/surveys-list.js
/* public/js/surveys-list.js */
(() => {
  const browsePage = document.querySelector('[data-survey-browser-page]');
  const browseApi = window.SurveyBrowse;
  const sessionKey = 'scope_session_id';

  if (!browsePage || !browseApi) {
    return;
  }

  const activeGrid = document.getElementById('survey-active-grid');
  const activeIntro = document.getElementById('survey-active-intro');
  const activeSection = document.getElementById('survey-active-section');
  const comingSoonGrid = document.getElementById('survey-coming-soon-grid');
  const comingSoonIntro = document.getElementById('survey-coming-soon-intro');
  const comingSoonSection = document.getElementById('survey-coming-soon-section');
  const authNote = document.getElementById('survey-auth-note');
  const pathLinks = Array.from(document.querySelectorAll('[data-survey-path-link]'));

  if (!activeGrid || !activeSection || !comingSoonGrid || !comingSoonSection) {
    return;
  }

  const pagePath = browsePage.dataset.surveyPath || 'all';
  const pageTitle = browsePage.dataset.pageTitle || 'Browse surveys';

  const escapeHtml = browseApi.escapeHtml;

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

  const loadAuthState = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        return false;
      }
      const data = await response.json();
      return Boolean(data.authenticated);
    } catch (error) {
      return false;
    }
  };

  const updateAuthNote = (authenticated) => {
    if (!authNote) {
      return;
    }
    if (authenticated) {
      authNote.innerHTML = 'Signed in. Completed surveys show your latest response status and edit links.';
      return;
    }
    authNote.innerHTML = 'Browse topics now. <button class="link-button" type="button" data-auth-open="login">Sign in</button> when you are ready to save progress or edit responses.';
  };

  const renderErrorState = (message) => {
    const html = `<p class="card">${escapeHtml(message)}</p>`;
    activeGrid.innerHTML = html;
    activeSection.classList.remove('is-hidden');
    comingSoonSection.classList.add('is-hidden');
  };

  const renderPathPickerState = () => {
    pathLinks.forEach((link) => {
      const linkPath = link.getAttribute('data-survey-path-link') || 'all';
      const isCurrent = linkPath === pagePath;
      link.classList.toggle('is-current', isCurrent);
      if (isCurrent) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  const formatTimestamp = (value = '') => {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderSurveyCard = (survey) => {
    const statusLabel = browseApi.STATUS_LABELS[survey.status] || 'Survey';
    const pathLabel = browseApi.PATH_LABELS[survey.path] || '';
    const blurb = survey.landingBlurb || survey.description || '';
    const minutesLabel = survey.estimatedMinutes ? `${survey.estimatedMinutes} min` : '';
    const statusClass = survey.status === 'active' ? 'status-active' : 'status-coming-soon';
    const submittedAt = formatTimestamp(survey.response?.submittedAt || '');
    const updatedAt = formatTimestamp(survey.response?.updatedAt || '');
    const hasResponse = Boolean(survey.response);
    const primaryHref = survey.status === 'active'
      ? (survey.href || `/surveys/${encodeURIComponent(survey.slug)}`)
      : (survey.placeholderHref || '/how-surveys-work/');
    const primaryLabel = survey.status === 'active'
      ? (hasResponse ? 'Edit responses' : 'Start survey')
      : 'How surveys work';
    const resultsLink = survey.status === 'active' && survey.slug
      ? `<a class="button button--small button--secondary" href="/surveys/results/?slug=${encodeURIComponent(survey.slug)}">View results</a>`
      : '';
    const discussLink = survey.status === 'active' && survey.townhallEnabled
      ? `<a class="button button--small button--secondary" href="/townhall/topic/?slug=${encodeURIComponent(survey.townhallTopicSlug || survey.slug)}">Discuss topic</a>`
      : '';
    const statusLine = hasResponse && submittedAt
      ? `<p class="card__meta">Completed: ${escapeHtml(submittedAt)}</p>`
      : '';
    const updatedLine = hasResponse && updatedAt && updatedAt !== submittedAt
      ? `<p class="card__meta">Updated: ${escapeHtml(updatedAt)}</p>`
      : '';
    const surveyPathBadge = pagePath === 'all' && pathLabel
      ? `<span class="survey-browse-card__pill">${escapeHtml(pathLabel)}</span>`
      : '';
    const featuredBadge = survey.featured
      ? '<span class="survey-browse-card__pill survey-browse-card__pill--featured">Featured</span>'
      : '';

    return `
      <article class="card survey-browse-card">
        <div class="survey-browse-card__header">
          <h2>${escapeHtml(survey.title || 'Survey')}</h2>
          <span class="card__status ${statusClass}">${escapeHtml(statusLabel)}</span>
        </div>
        <p class="card__meta">${escapeHtml(blurb)}</p>
        <div class="survey-browse-card__meta">
          ${minutesLabel ? `<span class="survey-browse-card__pill">${escapeHtml(minutesLabel)}</span>` : ''}
          ${surveyPathBadge}
          ${featuredBadge}
        </div>
        ${statusLine}
        ${updatedLine}
        <div class="card__actions survey-browse-card__actions">
          <a class="button button--small" href="${escapeHtml(primaryHref)}">${escapeHtml(primaryLabel)}</a>
          ${resultsLink}
          ${discussLink}
        </div>
      </article>
    `;
  };

  const renderSection = ({ grid, section, surveys, emptyMessage }) => {
    if (!surveys.length) {
      grid.innerHTML = `<p class="card">${escapeHtml(emptyMessage)}</p>`;
      section.classList.remove('is-hidden');
      return;
    }

    grid.innerHTML = surveys.map((survey) => renderSurveyCard(survey)).join('');
    section.classList.remove('is-hidden');
  };

  const renderBrowseSections = (surveys) => {
    const activeSurveys = browseApi.filterSurveys(surveys, {
      path: pagePath,
      statuses: ['active'],
    });
    const comingSoonSurveys = browseApi.filterSurveys(surveys, {
      path: pagePath,
      statuses: ['coming_soon'],
    });

    if (activeIntro) {
      activeIntro.textContent = pagePath === 'all'
        ? 'All active surveys across both paths.'
        : `Current ${pageTitle.toLowerCase()} ready to take now.`;
    }

    if (comingSoonIntro) {
      comingSoonIntro.textContent = pagePath === 'all'
        ? 'Upcoming topics that are scaffolded but not yet live.'
        : `Upcoming ${pageTitle.toLowerCase()} topics that are scaffolded but not yet live.`;
    }

    const activeEmptyMessage = pagePath === 'normal-life'
      ? 'No Normal Life surveys are active yet. Review the coming soon topics below.'
      : pagePath === 'divisive'
        ? 'No Divisive surveys are active right now.'
        : 'No surveys are available right now.';

    renderSection({
      grid: activeGrid,
      section: activeSection,
      surveys: activeSurveys,
      emptyMessage: activeEmptyMessage,
    });

    if (!comingSoonSurveys.length && pagePath !== 'all') {
      comingSoonSection.classList.add('is-hidden');
      comingSoonGrid.innerHTML = '';
      return;
    }

    renderSection({
      grid: comingSoonGrid,
      section: comingSoonSection,
      surveys: comingSoonSurveys,
      emptyMessage: 'No upcoming surveys are scaffolded yet.',
    });
  };

  const loadSurveys = async () => {
    try {
      const [apiResponse, staticSurveys] = await Promise.all([
        fetch('/api/surveys/list', { credentials: 'same-origin', cache: 'no-store' }),
        browseApi.loadCatalog(),
      ]);
      const apiSurveys = apiResponse.ok ? await apiResponse.json() : [];
      const merged = browseApi.mergeSurveyData(
        Array.isArray(apiSurveys) ? apiSurveys : [],
        staticSurveys
      );
      renderBrowseSections(merged);
    } catch (error) {
      renderErrorState('Surveys are unavailable right now.');
    }
  };

  renderPathPickerState();

  Promise.all([ensureScopeSession(), loadAuthState()])
    .then(([, authenticated]) => {
      updateAuthNote(authenticated);
      return loadSurveys();
    })
    .catch(() => {
      renderErrorState('Surveys are unavailable right now.');
    });
})();
