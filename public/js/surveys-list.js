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
  const bridgeGrid = document.getElementById('survey-bridge-grid');
  const bridgeIntro = document.getElementById('survey-bridge-intro');
  const bridgeSection = document.getElementById('survey-bridge-section');
  const authNote = document.getElementById('survey-auth-note');
  const pathLinks = Array.from(document.querySelectorAll('[data-survey-path-link]'));

  if (!activeGrid || !activeSection || !comingSoonGrid || !comingSoonSection) {
    return;
  }

  const pagePath = browsePage.dataset.surveyPath || 'all';
  const pageTitle = browsePage.dataset.pageTitle || 'Browse surveys';

  const escapeHtml = browseApi.escapeHtml;
  const suggestionState = new Map();

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
    const suggestionKey = survey.slug || survey.id || survey.title || '';
    const suggestionFormState = suggestionState.get(suggestionKey) || {};
    const suggestionExpanded = survey.status === 'coming_soon' && Boolean(suggestionFormState.expanded);
    const suggestionSubmitting = Boolean(suggestionFormState.submitting);
    const suggestionSuccess = suggestionFormState.successMessage
      ? `<p class="survey-suggestion__message survey-suggestion__message--success">${escapeHtml(
          suggestionFormState.successMessage
        )}</p>`
      : '';
    const suggestionError = suggestionFormState.errorMessage
      ? `<p class="survey-suggestion__message survey-suggestion__message--error">${escapeHtml(
          suggestionFormState.errorMessage
        )}</p>`
      : '';
    const suggestionBlock = survey.status === 'coming_soon'
      ? `
        <div class="survey-suggestion" data-suggestion-root data-suggestion-slug="${escapeHtml(suggestionKey)}">
          <p class="survey-suggestion__prompt">Have a suggestion for this survey?</p>
          <button
            class="button button--small button--secondary"
            type="button"
            data-suggestion-toggle
            aria-expanded="${suggestionExpanded ? 'true' : 'false'}"
          >
            Suggest questions
          </button>
          <form class="survey-suggestion__form ${suggestionExpanded ? '' : 'is-hidden'}" data-suggestion-form>
            <input type="hidden" name="surveySlug" value="${escapeHtml(survey.slug || '')}" />
            <input type="hidden" name="surveyTitle" value="${escapeHtml(survey.title || '')}" />
            <label class="survey-suggestion__field">
              <span>Name (optional)</span>
              <input type="text" name="name" maxlength="120" value="${escapeHtml(suggestionFormState.name || '')}" />
            </label>
            <label class="survey-suggestion__field">
              <span>Email (optional)</span>
              <input type="email" name="email" maxlength="200" value="${escapeHtml(suggestionFormState.email || '')}" />
            </label>
            <label class="survey-suggestion__field">
              <span>Suggestion</span>
              <textarea name="suggestion" rows="4" maxlength="4000" required>${escapeHtml(
                suggestionFormState.suggestion || ''
              )}</textarea>
            </label>
            ${suggestionSuccess}
            ${suggestionError}
            <div class="card__actions survey-suggestion__actions">
              <button class="button button--small" type="submit" ${suggestionSubmitting ? 'disabled' : ''}>
                ${suggestionSubmitting ? 'Sending...' : 'Send suggestion'}
              </button>
            </div>
          </form>
        </div>
      `
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
        ${suggestionBlock}
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
    const primaryPaths = ['normal-life', 'divisive'];
    const visiblePathForPage = pagePath === 'all' ? null : pagePath;
    const activeBaseOptions = {
      statuses: ['active'],
    };
    const comingSoonBaseOptions = {
      statuses: ['coming_soon'],
    };
    const activeSurveys = browseApi.filterSurveys(surveys, {
      ...activeBaseOptions,
      path: visiblePathForPage || 'all',
    }).filter((survey) => pagePath !== 'all' || primaryPaths.includes(survey.path));
    const comingSoonSurveys = browseApi.filterSurveys(surveys, {
      ...comingSoonBaseOptions,
      path: visiblePathForPage || 'all',
    }).filter((survey) => pagePath !== 'all' || primaryPaths.includes(survey.path));
    const bridgeSurveys = pagePath === 'all'
      ? browseApi.filterSurveys(surveys, {
          path: 'bridge',
          statuses: ['active', 'coming_soon'],
        })
      : [];

    if (activeIntro) {
      activeIntro.textContent = pagePath === 'all'
        ? 'Active surveys across the main browse paths.'
        : `Current ${pageTitle.toLowerCase()} ready to take now.`;
    }

    if (comingSoonIntro) {
      comingSoonIntro.textContent = pagePath === 'all'
        ? 'Upcoming topics in the main browse paths that are scaffolded but not yet live.'
        : `Upcoming ${pageTitle.toLowerCase()} topics that are scaffolded but not yet live.`;
    }

    if (bridgeIntro && pagePath === 'all') {
      bridgeIntro.textContent =
        'Cross-cutting surveys that focus on understanding disagreement, tradeoffs, or shared ground without forcing them into a single path.';
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

    if (bridgeSection && bridgeGrid) {
      if (pagePath !== 'all' || !bridgeSurveys.length) {
        bridgeSection.classList.add('is-hidden');
        bridgeGrid.innerHTML = '';
      } else {
        renderSection({
          grid: bridgeGrid,
          section: bridgeSection,
          surveys: bridgeSurveys,
          emptyMessage: 'No bridge surveys are available right now.',
        });
      }
    }

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

  const updateSuggestionState = (key, nextState) => {
    if (!key) {
      return;
    }
    suggestionState.set(key, {
      ...(suggestionState.get(key) || {}),
      ...nextState,
    });
  };

  const collectRenderedSurveys = async () => {
    const [apiResponse, staticSurveys] = await Promise.all([
      fetch('/api/surveys/list', { credentials: 'same-origin', cache: 'no-store' }),
      browseApi.loadCatalog(),
    ]);
    const apiSurveys = apiResponse.ok ? await apiResponse.json() : [];
    return browseApi.mergeSurveyData(
      Array.isArray(apiSurveys) ? apiSurveys : [],
      staticSurveys
    );
  };

  const rerenderSurveys = async () => {
    try {
      const merged = await collectRenderedSurveys();
      renderBrowseSections(merged);
    } catch (error) {
      renderErrorState('Surveys are unavailable right now.');
    }
  };

  browsePage.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-suggestion-toggle]');
    if (!toggle) {
      return;
    }
    const root = toggle.closest('[data-suggestion-root]');
    const key = root?.dataset.suggestionSlug || '';
    if (!key) {
      return;
    }
    const existing = suggestionState.get(key) || {};
    updateSuggestionState(key, {
      expanded: !existing.expanded,
      successMessage: existing.expanded ? '' : existing.successMessage || '',
      errorMessage: existing.expanded ? '' : existing.errorMessage || '',
    });
    rerenderSurveys();
  });

  browsePage.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-suggestion-form]');
    if (!form) {
      return;
    }
    event.preventDefault();
    const formData = new FormData(form);
    const surveySlug = String(formData.get('surveySlug') || '').trim();
    const surveyTitle = String(formData.get('surveyTitle') || '').trim();
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const suggestion = String(formData.get('suggestion') || '').trim();
    const key = surveySlug || surveyTitle;

    if (!suggestion) {
      updateSuggestionState(key, {
        expanded: true,
        name,
        email,
        suggestion,
        successMessage: '',
        errorMessage: 'Suggestion text is required.',
      });
      rerenderSurveys();
      return;
    }

    updateSuggestionState(key, {
      expanded: true,
      name,
      email,
      suggestion,
      submitting: true,
      successMessage: '',
      errorMessage: '',
    });
    await rerenderSurveys();

    try {
      const response = await fetch('/api/survey-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          surveySlug,
          surveyTitle,
          name,
          email,
          suggestion,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || 'Unable to send suggestion right now.');
      }
      updateSuggestionState(key, {
        expanded: true,
        name: '',
        email: '',
        suggestion: '',
        submitting: false,
        successMessage: 'Thanks. Your suggestion was sent.',
        errorMessage: '',
      });
      await rerenderSurveys();
      return;
    } catch (error) {
      updateSuggestionState(key, {
        expanded: true,
        name,
        email,
        suggestion,
        submitting: false,
        successMessage: '',
        errorMessage: error?.message || 'Unable to send suggestion right now.',
      });
      await rerenderSurveys();
      return;
    }
  });

  const loadSurveys = async () => {
    try {
      const merged = await collectRenderedSurveys();
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
