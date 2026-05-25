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
  const comingSoonGrid = document.getElementById('survey-coming-grid');
  const comingSoonIntro = document.getElementById('survey-coming-intro');
  const comingSoonSection = document.getElementById('survey-coming-section');
  const bridgeGrid = document.getElementById('survey-bridge-grid');
  const bridgeIntro = document.getElementById('survey-bridge-intro');
  const bridgeSection = document.getElementById('survey-bridge-section');
  const authNote = document.getElementById('survey-auth-note');
  const pathLinks = Array.from(document.querySelectorAll('[data-survey-path-link]'));

  let allMergedSurveys = [];
  let currentFilterPath = 'all';

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

  const ICON_MAP = {
    'cost-of-living': 'chart', 'local-economy': 'chart',
    'health-and-care-access': 'heart', 'cowboy-care': 'heart', 'reproductive-policy': 'heart',
    'housing': 'home',
    'work': 'briefcase',
    'infrastructure': 'wrench',
    'education-and-opportunity': 'book', 'education-funding': 'book',
    'community-safety': 'shield', 'military-force-ai': 'shield',
    'trust-and-representation': 'scale', 'trust': 'scale',
    'trust-shared-truth': 'scale', 'shared-direction': 'scale',
    'survey-process': 'scale', 'system-responsiveness': 'scale',
    'primary-elections': 'check',
    'public-land-sales': 'globe', 'roadless-areas': 'globe',
    'grizzly-bear-delisting': 'globe', 'immigration-border': 'globe',
    'energy-public-lands': 'bolt',
    'time-change': 'clock', 'digital-privacy-identity': 'lock',
    'marijuana-policy': 'leaf',
  };

  const ICON_PATHS = {
    chart: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
    heart: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z',
    home: 'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
    briefcase: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z',
    wrench: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z',
    book: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
    shield: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    scale: 'M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.59 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z',
    check: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    globe: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
    bolt: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
    clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
    leaf: 'M12.75 3.03v.568c0 .334.148.65.405.864l1.068.89c.442.369.535 1.01.216 1.49l-.51.766a2.25 2.25 0 01-1.161.886l-.143.048a1.107 1.107 0 00-.57 1.664c.369.555.169 1.307-.427 1.605L9 13.125l.423 1.059a.956.956 0 01-1.652.928l-.679-.906a1.125 1.125 0 00-1.906.172L4.5 15.75l-.612.153M12.75 3.031a9 9 0 00-8.862 12.872M12.75 3.031a9 9 0 016.69 14.036m0 0l-.177-.529A2.249 2.249 0 0017.5 15H16.5a1.5 1.5 0 01-1.5-1.5v-.796a2.249 2.249 0 01.421-1.317l.223-.297a2.249 2.249 0 001.063-1.927V8.25l-2.902-.91A2.25 2.25 0 0012 5.25h-.092a2.25 2.25 0 00-1.696.756L9.5 6.75',
    doc: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  };

  const getCategoryIcon = (categorySlug) => {
    const iconName = ICON_MAP[categorySlug] || 'doc';
    const d = ICON_PATHS[iconName];
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`;
  };

  const renderFeaturedHero = (surveys) => {
    const container = document.getElementById('survey-featured-container');
    if (!container) return;
    const featured = surveys
      .filter((s) => s.status === 'active' && s.featured)
      .sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999))[0];
    if (!featured) { container.innerHTML = ''; return; }
    const blurb = featured.landingBlurb || featured.description || '';
    const href = featured.href || `/surveys/${encodeURIComponent(featured.slug)}`;
    const minutesLabel = featured.estimatedMinutes ? `${featured.estimatedMinutes} min` : '';
    const pathLabel = browseApi.PATH_LABELS[featured.path] || '';
    const icon = getCategoryIcon(featured.categorySlug || '');
    container.innerHTML = `
      <div class="survey-featured-hero">
        <div class="survey-featured-hero__top">
          <div class="survey-featured-hero__icon" aria-hidden="true">${icon}</div>
          <p class="survey-featured-hero__eyebrow">Featured survey</p>
        </div>
        <h2 class="survey-featured-hero__title">${escapeHtml(featured.title || '')}</h2>
        ${blurb ? `<p class="survey-featured-hero__blurb">${escapeHtml(blurb)}</p>` : ''}
        <div class="survey-featured-hero__meta">
          ${minutesLabel ? `<span class="sbc2__pill sbc2__pill--time">${escapeHtml(minutesLabel)}</span>` : ''}
          ${pathLabel ? `<span class="sbc2__pill">${escapeHtml(pathLabel)}</span>` : ''}
        </div>
        <div class="survey-featured-hero__actions">
          <a class="button" href="${escapeHtml(href)}">Start this survey</a>
          <a class="button button--secondary button--small" href="/surveys/results/?slug=${encodeURIComponent(featured.slug || '')}">View results</a>
        </div>
      </div>
    `;
  };

  const attachFilterTabs = () => {
    const tabs = Array.from(document.querySelectorAll('[data-filter-tab]'));
    if (!tabs.length) return;
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        currentFilterPath = tab.dataset.filterTab || 'all';
        tabs.forEach((t) => {
          t.classList.toggle('is-active', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        renderBrowseSections(allMergedSurveys);
      });
    });
  };

  const renderSurveyCard = (survey) => {
    const blurb = survey.landingBlurb || survey.description || '';
    const minutesLabel = survey.estimatedMinutes ? `${survey.estimatedMinutes} min` : '';
    const pathLabel = browseApi.PATH_LABELS[survey.path] || '';
    const hasResponse = Boolean(survey.response);
    const primaryHref = survey.status === 'active'
      ? (survey.href || `/surveys/${encodeURIComponent(survey.slug)}`)
      : (survey.placeholderHref || '/how-surveys-work/');
    const primaryLabel = survey.status === 'active'
      ? (hasResponse ? 'Edit responses' : 'Start survey')
      : 'How surveys work';
    const resultsLink = survey.status === 'active' && survey.slug
      ? `<a class="button button--small button--secondary" href="/surveys/results/?slug=${encodeURIComponent(survey.slug)}">Results</a>`
      : '';
    const discussLink = survey.status === 'active' && survey.townhallEnabled
      ? `<a class="button button--small button--secondary" href="/townhall/topic/?slug=${encodeURIComponent(survey.townhallTopicSlug || survey.slug)}">Discuss</a>`
      : '';
    const icon = getCategoryIcon(survey.categorySlug || '');
    const featuredBadge = survey.featured
      ? '<span class="sbc2__featured-badge">Featured</span>'
      : '';
    const comingSoonBadge = survey.status === 'coming_soon'
      ? '<span class="sbc2__coming-badge">Coming soon</span>'
      : '';
    const completedNote = hasResponse && survey.response?.submittedAt
      ? `<p class="sbc2__completed">Completed ${escapeHtml(formatTimestamp(survey.response.submittedAt))}</p>`
      : '';

    const suggestionKey = survey.slug || survey.id || survey.title || '';
    const suggestionFormState = suggestionState.get(suggestionKey) || {};
    const suggestionExpanded = survey.status === 'coming_soon' && Boolean(suggestionFormState.expanded);
    const suggestionSubmitting = Boolean(suggestionFormState.submitting);
    const suggestionSuccess = suggestionFormState.successMessage
      ? `<p class="survey-suggestion__message survey-suggestion__message--success">${escapeHtml(suggestionFormState.successMessage)}</p>`
      : '';
    const suggestionError = suggestionFormState.errorMessage
      ? `<p class="survey-suggestion__message survey-suggestion__message--error">${escapeHtml(suggestionFormState.errorMessage)}</p>`
      : '';
    const suggestionBlock = survey.status === 'coming_soon'
      ? `
        <div class="survey-suggestion" data-suggestion-root data-suggestion-slug="${escapeHtml(suggestionKey)}">
          <p class="survey-suggestion__prompt">Have a suggestion for this survey?</p>
          <button class="button button--small button--secondary" type="button" data-suggestion-toggle aria-expanded="${suggestionExpanded ? 'true' : 'false'}">
            Suggest questions
          </button>
          <form class="survey-suggestion__form ${suggestionExpanded ? '' : 'is-hidden'}" data-suggestion-form>
            <input type="hidden" name="surveySlug" value="${escapeHtml(survey.slug || '')}" />
            <input type="hidden" name="surveyTitle" value="${escapeHtml(survey.title || '')}" />
            <label class="survey-suggestion__field"><span>Name (optional)</span><input type="text" name="name" maxlength="120" value="${escapeHtml(suggestionFormState.name || '')}" /></label>
            <label class="survey-suggestion__field"><span>Email (optional)</span><input type="email" name="email" maxlength="200" value="${escapeHtml(suggestionFormState.email || '')}" /></label>
            <label class="survey-suggestion__field"><span>Suggestion</span><textarea name="suggestion" rows="4" maxlength="4000" required>${escapeHtml(suggestionFormState.suggestion || '')}</textarea></label>
            ${suggestionSuccess}${suggestionError}
            <div class="card__actions survey-suggestion__actions">
              <button class="button button--small" type="submit" ${suggestionSubmitting ? 'disabled' : ''}>${suggestionSubmitting ? 'Sending...' : 'Send suggestion'}</button>
            </div>
          </form>
        </div>`
      : '';

    return `
      <article class="sbc2${survey.featured ? ' sbc2--featured' : ''}">
        <div class="sbc2__top">
          <div class="sbc2__icon">${icon}</div>
          <div class="sbc2__badges">${featuredBadge}${comingSoonBadge}</div>
        </div>
        <h3 class="sbc2__title">${escapeHtml(survey.title || 'Survey')}</h3>
        ${blurb ? `<p class="sbc2__blurb">${escapeHtml(blurb)}</p>` : ''}
        <div class="sbc2__meta">
          ${minutesLabel ? `<span class="sbc2__pill sbc2__pill--time">${escapeHtml(minutesLabel)}</span>` : ''}
          ${pathLabel && currentFilterPath === 'all' ? `<span class="sbc2__pill">${escapeHtml(pathLabel)}</span>` : ''}
        </div>
        ${completedNote}
        <div class="sbc2__footer">
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
    allMergedSurveys = surveys;
    const primaryPaths = ['normal-life', 'divisive'];
    const visiblePathForPage = pagePath === 'all' ? null : pagePath;
    const activeBaseOptions = {
      statuses: ['active'],
    };
    const comingSoonBaseOptions = {
      statuses: ['coming_soon'],
    };
    const effectivePath = currentFilterPath !== 'all' ? currentFilterPath : (visiblePathForPage || 'all');
    let activeSurveys = browseApi.filterSurveys(surveys, {
      ...activeBaseOptions,
      path: effectivePath,
    }).filter((survey) => effectivePath !== 'all' || primaryPaths.includes(survey.path));
    const comingSoonSurveys = browseApi.filterSurveys(surveys, {
      ...comingSoonBaseOptions,
      path: effectivePath,
    }).filter((survey) => effectivePath !== 'all' || primaryPaths.includes(survey.path));
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
      renderFeaturedHero(merged);
      attachFilterTabs();
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
