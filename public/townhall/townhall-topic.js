/* public/townhall/townhall-topic.js */
(() => {
  const DEBUG = window.location.hostname === 'localhost';

  const allowedReactions = ['agree', 'disagree', 'needs_evidence'];

  const topicTitleEl = document.getElementById('topic-title');
  const topicSurveyLinkEl = document.getElementById('topic-survey-link');
  const topicDescriptionEl = document.getElementById('topic-description');
  const topicErrorEl = document.getElementById('topic-error');

  const topicMissingEl = document.getElementById('topic-missing');
  const topicMissingTitleEl = document.getElementById('topic-missing-title');
  const topicMissingBodyEl = document.getElementById('topic-missing-body');
  const enableTopicBtnEl = document.getElementById('enable-topic-btn');
  const enableTopicErrorEl = document.getElementById('enable-topic-error');

  const composeCardEl = document.getElementById('compose-card');
  const signInCardEl = document.getElementById('sign-in-card');
  const composeFormEl = document.getElementById('compose-form');
  const composeBodyEl = document.getElementById('statement-body');
  const composeTagsEl = document.getElementById('statement-tags');
  const composeSourceRowEls = Array.from(document.querySelectorAll('.statement-source-row'));
  const composeSourceInputEls = Array.from(document.querySelectorAll('.statement-source-input'));
  const composeSourceRemoveEls = Array.from(document.querySelectorAll('.statement-source-remove'));
  const addSourceLinkEl = document.getElementById('add-source-link');
  const statementCounterEl = document.getElementById('statement-counter');
  const composeErrorEl = document.getElementById('compose-error');
  const composeSuccessEl = document.getElementById('compose-success');
  const composeSubmitEl = document.getElementById('compose-submit');

  const feedEl = document.getElementById('statements-feed');
  const feedEmptyEl = document.getElementById('feed-empty');
  const feedErrorEl = document.getElementById('feed-error');
  const loadMoreEl = document.getElementById('load-more');
  const tagFilterListEl = document.getElementById('tag-filter-list');

  const state = {
    topicSlug: '',
    topic: null,
    nextCursor: '',
    isAuthenticated: false,
    isAdmin: false,
    authResolved: false,
    uiState: 'loading',
    pendingReactionRequests: new Set(),
    sourceInputCount: 1,
    loadedStatements: [],
    activeTag: 'all',
  };
  let currentState = 'loading';
  const statementMaxLength = Number(composeBodyEl?.getAttribute('maxlength') || '500') || 500;
  const replyMaxLength = 300;
  const feedEmptyDefaultText = 'No published statements yet.';
  const feedEmptyPendingText = 'Your statement was submitted for review. Published statements appear here after review.';
  const defaultStatementTag = 'opinion';
  const statementQualityMessage =
    'Please add a complete thought, not just a few words. Aim for at least one clear sentence.';

  const setHidden = (node, hidden) => {
    if (!node) return;
    node.classList.toggle('is-hidden', !!hidden);
  };

  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const normalizeTagValue = (value) =>
    String(value || '')
      .trim()
      .replace(/^#+/, '')
      .trim()
      .toLowerCase();

  const sortStatementsNewestFirst = (items) =>
    [...items].sort((left, right) => {
      const leftTime = Date.parse(left?.createdAt || '') || 0;
      const rightTime = Date.parse(right?.createdAt || '') || 0;
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return String(right?.id || '').localeCompare(String(left?.id || ''));
    });

  const showError = (node, message) => {
    if (!node) return;
    node.textContent = message || '';
    setHidden(node, !message);
  };

  const hideError = (node) => {
    if (!node) return;
    node.textContent = '';
    setHidden(node, true);
  };

  const logState = (where) => {
    if (!DEBUG) return;
    const miss = document.getElementById('topic-missing');
    console.log('[TownHallTopic]', where, {
      currentState,
      missingVisible: miss ? !miss.classList.contains('is-hidden') : null,
    });
  };

  const debugVisibility = () => {
    if (!DEBUG || !topicMissingEl || !composeCardEl || !signInCardEl) return;
    console.log('[TownHallTopic] state', state.uiState, {
      hasTopic: !!state.topic,
      authed: !!state.isAuthenticated,
    }, {
      missingVisible: !topicMissingEl.classList.contains('is-hidden'),
      composeVisible: !composeCardEl.classList.contains('is-hidden'),
      signInVisible: !signInCardEl.classList.contains('is-hidden'),
    });
  };

  const applyReadyAuthGating = () => {
    if (state.uiState !== 'ready') {
      setHidden(composeCardEl, true);
      setHidden(signInCardEl, true);
      return;
    }
    if (state.isAuthenticated) {
      setHidden(composeCardEl, false);
      setHidden(signInCardEl, true);
    } else {
      setHidden(composeCardEl, true);
      setHidden(signInCardEl, false);
    }
  };

  const setStateLoading = () => {
    state.uiState = 'loading';
    currentState = 'loading';
    setHidden(topicMissingEl, true);
    setHidden(composeCardEl, true);
    setHidden(signInCardEl, true);
    setHidden(feedEl, true);
    setHidden(feedEmptyEl, true);
    setHidden(feedErrorEl, true);
    setHidden(loadMoreEl, true);
    if (feedEmptyEl) {
      feedEmptyEl.textContent = feedEmptyDefaultText;
    }
    if (topicDescriptionEl) {
      topicDescriptionEl.textContent = 'Loading...';
    }
    if (topicSurveyLinkEl) {
      topicSurveyLinkEl.textContent = '';
      setHidden(topicSurveyLinkEl, true);
    }
    if (enableTopicBtnEl) {
      setHidden(enableTopicBtnEl, true);
    }
    hideError(enableTopicErrorEl);
    debugVisibility();
  };

  const setStateMissing = () => {
    state.uiState = 'missing';
    currentState = 'missing';
    setHidden(topicMissingEl, false);
    setHidden(composeCardEl, true);
    setHidden(signInCardEl, true);
    setHidden(feedEl, true);
    setHidden(feedEmptyEl, true);
    setHidden(feedErrorEl, true);
    setHidden(loadMoreEl, true);
    if (feedEmptyEl) {
      feedEmptyEl.textContent = feedEmptyDefaultText;
    }
    if (topicDescriptionEl) {
      topicDescriptionEl.textContent = '';
    }
    if (enableTopicBtnEl) {
      setHidden(enableTopicBtnEl, !state.isAdmin);
    }
    if (DEBUG && topicMissingEl) {
      const missingVisible = !topicMissingEl.classList.contains('is-hidden');
      console.log('[TownHallTopic] missingVisible', missingVisible);
      if (!missingVisible) {
        console.error('Missing panel still hidden');
      }
    }
    debugVisibility();
  };

  const setStateReady = () => {
    if (currentState === 'missing') return;
    state.uiState = 'ready';
    currentState = 'ready';
    setHidden(topicMissingEl, true);
    setHidden(feedEl, false);
    setHidden(feedErrorEl, true);
    setHidden(feedEmptyEl, true);
    if (feedEmptyEl) {
      feedEmptyEl.textContent = feedEmptyDefaultText;
    }
    updateLoadMore();
    if (topicDescriptionEl && topicDescriptionEl.textContent === 'Loading...') {
      topicDescriptionEl.textContent = '';
    }
    if (enableTopicBtnEl) {
      setHidden(enableTopicBtnEl, true);
    }
    applyReadyAuthGating();
    debugVisibility();
  };

  const getJson = async (path) => {
    const response = await fetch(path, {
      credentials: 'include',
      cache: 'no-store',
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }
    return { response, payload };
  };

  const readSlug = () => {
    const params = new URLSearchParams(window.location.search || '');
    return (params.get('slug') || '').trim();
  };

  const inferTitleFromSlug = (slug) => {
    const normalized = String(slug || '').trim();
    if (!normalized) return 'Survey discussion';
    return normalized
      .split(/[-_]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const getTopicSurveyMeta = (topic) => {
    const surveySlug =
      (topic?.survey?.slug || '').toString().trim() ||
      (topic?.survey_slug || '').toString().trim();
    const surveyTitle =
      (topic?.survey?.title || '').toString().trim() ||
      (topic?.title || '').toString().trim() ||
      inferTitleFromSlug(surveySlug);
    const surveyHref =
      (topic?.survey?.href || '').toString().trim() ||
      (surveySlug ? `/surveys/${encodeURIComponent(surveySlug)}` : '');
    return {
      slug: surveySlug,
      title: surveyTitle || 'Survey discussion',
      href: surveyHref,
    };
  };

  const renderTopicSurveyLink = (topic) => {
    if (!topicSurveyLinkEl) return;
    const survey = getTopicSurveyMeta(topic);
    topicSurveyLinkEl.textContent = '';
    if (!survey.slug && !survey.title) {
      setHidden(topicSurveyLinkEl, true);
      return;
    }

    const prefix = document.createTextNode('Linked survey: ');
    topicSurveyLinkEl.appendChild(prefix);

    if (survey.href) {
      const link = document.createElement('a');
      link.className = 'link-button';
      link.href = survey.href;
      link.textContent = survey.title;
      topicSurveyLinkEl.appendChild(link);
    } else {
      topicSurveyLinkEl.appendChild(document.createTextNode(survey.title));
    }

    setHidden(topicSurveyLinkEl, false);
  };

  const renderMissingTopic = () => {
    if (topicTitleEl) topicTitleEl.textContent = 'Discussion not enabled yet';
    if (topicMissingTitleEl) topicMissingTitleEl.textContent = 'Discussion not enabled yet';
    if (topicMissingBodyEl) {
      topicMissingBodyEl.textContent = 'This survey does not have a discussion topic yet.';
    }
    renderTopicSurveyLink({ survey_slug: state.topicSlug, title: inferTitleFromSlug(state.topicSlug) });
  };

  const reactionLabel = (type) => {
    if (type === 'agree') return '👍';
    if (type === 'disagree') return '👎';
    return 'Needs evidence';
  };

  const reactionAriaLabel = (type) => {
    if (type === 'agree') return 'Thumbs up';
    if (type === 'disagree') return 'Thumbs down';
    return 'Needs evidence';
  };

  const getReactionCount = (reactions, type) => {
    const value = reactions && Object.prototype.hasOwnProperty.call(reactions, type) ? reactions[type] : 0;
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  };

  const buildTagsHtml = (tags) => {
    const list = Array.isArray(tags) ? tags.filter(Boolean) : [];
    if (!list.length) return '';
    return `<p class="townhall-tags">${list.map((tag) => `<span class="townhall-tag">#${escapeHtml(tag)}</span>`).join(' ')}</p>`;
  };

  const buildSourcesHtml = (sources) => {
    const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
    if (!list.length) return '';
    return `
      <div class="townhall-sources">
        <p class="townhall-sources__label">Sources</p>
        <ul class="townhall-sources__list">
          ${list
            .map(
              (source) => `
                <li>
                  <a href="${escapeHtml(source)}" rel="noopener noreferrer" target="_blank">${escapeHtml(source)}</a>
                </li>
              `
            )
            .join('')}
        </ul>
      </div>
    `;
  };

  const buildReactionButtons = (statement) => {
    const reactions = statement.reactions || {};
    return allowedReactions
      .map((type) => {
        const count = getReactionCount(reactions, type);
        return `
          <button
            class="button button--small button--secondary townhall-reaction"
            type="button"
            data-action="reaction"
            data-statement-id="${escapeHtml(statement.id)}"
            data-reaction-type="${type}"
            data-active="0"
            aria-label="${escapeHtml(reactionAriaLabel(type))}"
          >
            ${reactionLabel(type)} (<span data-role="count">${count}</span>)
          </button>
        `;
      })
      .join('');
  };

  const buildReplyComposerHtml = (statementId) => `
    <form class="townhall-reply-form is-hidden" data-reply-form="${escapeHtml(statementId)}" novalidate>
      <label for="reply-body-${escapeHtml(statementId)}">Reply</label>
      <textarea
        id="reply-body-${escapeHtml(statementId)}"
        class="townhall-reply-input"
        maxlength="${replyMaxLength}"
        placeholder="Add a concise reply."
        required
      ></textarea>
      <p class="helper-text townhall-reply-helper">Text only, ${replyMaxLength} characters max.</p>
      <p class="form-error is-hidden" data-role="reply-error" role="alert"></p>
      <p class="helper-text is-hidden" data-role="reply-success"></p>
      <div class="card__actions">
        <button class="button button--small" type="submit">Post reply</button>
        <button class="button button--small button--secondary" type="button" data-action="reply-cancel">Cancel</button>
      </div>
    </form>
  `;

  const renderReplyCardHtml = (reply) => `
    <article class="card townhall-statement townhall-reply" data-statement-id="${escapeHtml(reply.id)}">
      <p>${escapeHtml(reply.body || '')}</p>
      ${buildTagsHtml(reply.tags)}
      ${buildSourcesHtml(reply.sources)}
      <p class="card__meta">Reply posted ${escapeHtml(formatDate(reply.createdAt))}</p>
      <div class="card__actions townhall-reactions">${buildReactionButtons(reply)}</div>
      <div class="card__actions">
        <button
          class="button button--small button--secondary"
          type="button"
          data-action="report"
          data-statement-id="${escapeHtml(reply.id)}"
        >
          Report
        </button>
      </div>
    </article>
  `;

  const renderStatementCard = (statement, prepend = false) => {
    if (!feedEl) return;
    const article = document.createElement('article');
    article.className = 'card townhall-statement';
    article.setAttribute('data-statement-id', statement.id);
    const replies = Array.isArray(statement.replies) ? statement.replies : [];
    article.innerHTML = `
      <p>${escapeHtml(statement.body || '')}</p>
      ${buildTagsHtml(statement.tags)}
      ${buildSourcesHtml(statement.sources)}
      <p class="card__meta">Posted ${escapeHtml(formatDate(statement.createdAt))}</p>
      <div class="card__actions townhall-reactions">${buildReactionButtons(statement)}</div>
      <div class="card__actions">
        <button
          class="button button--small button--secondary"
          type="button"
          data-action="reply-toggle"
          data-statement-id="${escapeHtml(statement.id)}"
        >
          Reply
        </button>
        <button
          class="button button--small button--secondary"
          type="button"
          data-action="report"
          data-statement-id="${escapeHtml(statement.id)}"
        >
          Report
        </button>
      </div>
      ${buildReplyComposerHtml(statement.id)}
      <div class="townhall-replies" data-replies-for="${escapeHtml(statement.id)}">
        ${replies.map((reply) => renderReplyCardHtml(reply)).join('')}
      </div>
    `;

    if (prepend && feedEl.firstChild) {
      feedEl.insertBefore(article, feedEl.firstChild);
    } else {
      feedEl.appendChild(article);
    }
  };

  const collectAvailableTags = (statements) => {
    const tagMap = new Map();
    statements.forEach((statement) => {
      const tags = Array.isArray(statement.tags) ? statement.tags : [];
      tags.forEach((tag) => {
        const normalized = normalizeTagValue(tag);
        if (!normalized) return;
        if (!tagMap.has(normalized)) {
          tagMap.set(normalized, String(tag).trim().replace(/^#+/, '').trim());
        }
      });
    });
    return Array.from(tagMap.entries())
      .map(([normalized, label]) => ({ normalized, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  };

  const syncActiveTagToAvailableTags = () => {
    if (state.activeTag === 'all') {
      return;
    }
    const availableTags = collectAvailableTags(state.loadedStatements).map((tag) => tag.normalized);
    if (!availableTags.includes(state.activeTag)) {
      state.activeTag = 'all';
    }
  };

  const renderTagFilters = () => {
    if (!tagFilterListEl) return;
    const tags = collectAvailableTags(state.loadedStatements);
    const chips = [
      `<button class="townhall-tag-chip${state.activeTag === 'all' ? ' is-active' : ''}" type="button" data-action="tag-filter" data-tag="all">All</button>`,
      ...tags.map(
        (tag) => `
          <button
            class="townhall-tag-chip${state.activeTag === tag.normalized ? ' is-active' : ''}"
            type="button"
            data-action="tag-filter"
            data-tag="${escapeHtml(tag.normalized)}"
          >
            #${escapeHtml(tag.label)}
          </button>
        `
      ),
    ];
    tagFilterListEl.innerHTML = chips.join('');
  };

  const getVisibleStatements = () => {
    const sorted = sortStatementsNewestFirst(state.loadedStatements);
    if (state.activeTag === 'all') {
      return sorted;
    }
    return sorted.filter((statement) =>
      (Array.isArray(statement.tags) ? statement.tags : [])
        .map((tag) => normalizeTagValue(tag))
        .includes(state.activeTag)
    );
  };

  const renderVisibleStatements = () => {
    if (!feedEl) return;
    feedEl.innerHTML = '';
    syncActiveTagToAvailableTags();
    renderTagFilters();
    const list = getVisibleStatements();
    if (!list.length) {
      feedEmptyEl.textContent =
        state.activeTag === 'all'
          ? feedEmptyDefaultText
          : `No published statements match #${state.activeTag}.`;
      setHidden(feedEmptyEl, false);
      return;
    }
    feedEmptyEl.textContent = feedEmptyDefaultText;
    setHidden(feedEmptyEl, true);
    list.forEach((statement) => renderStatementCard(statement));
  };

  const mergeLoadedStatements = (incoming, append) => {
    const nextMap = new Map();
    if (append) {
      state.loadedStatements.forEach((statement) => {
        nextMap.set(statement.id, statement);
      });
    }
    incoming.forEach((statement) => {
      nextMap.set(statement.id, statement);
    });
    state.loadedStatements = sortStatementsNewestFirst(Array.from(nextMap.values()));
  };

  const renderStatements = (statements, append = true) => {
    const list = Array.isArray(statements) ? statements : [];
    if (!list.length && !append) {
      state.loadedStatements = [];
      renderVisibleStatements();
      return;
    }
    mergeLoadedStatements(list, append);
    renderVisibleStatements();
  };

  const validateReplyBody = (text) => validateStatementQuality(text);

  const updateLoadMore = () => {
    if (!loadMoreEl) return;
    if (currentState === 'missing') {
      setHidden(loadMoreEl, true);
      return;
    }
    if (state.uiState !== 'ready') {
      setHidden(loadMoreEl, true);
      return;
    }
    setHidden(loadMoreEl, !state.nextCursor);
  };

  const isTopicMissing = (response, json) => {
    const topic = json?.data?.topic || null;
    if (response.status === 404) return true;
    if (json?.ok !== true) return true;
    if (!topic) return true;
    return false;
  };

  const loadTopic = async () => {
    const { response, payload: json } = await getJson(
      `/api/townhall/topic/${encodeURIComponent(state.topicSlug)}`
    );
    const topic = json?.data?.topic || null;
    const missing = isTopicMissing(response, json);

    if (DEBUG) {
      console.log('[TownHallTopic] topic decision', {
        status: response.status,
        ok: json?.ok,
        hasTopic: !!topic,
        isMissing: missing,
      });
    }

    if (missing) {
      if (DEBUG) {
        console.warn('[TownHallTopic] returning missing topic state', {
          status: response.status,
          jsonOk: json?.ok,
          topic,
          json,
        });
      }
      return { missing: true, topic: null };
    }

    return { missing: false, topic };
  };

  const showSignInRequired = (targetEl) => {
    showError(targetEl, 'Sign in required');
  };

  const setComposeVisibility = () => {
    if (currentState === 'missing') return;
    applyReadyAuthGating();
  };

  const applyAuthUiState = () => {
    if (currentState === 'missing') return;
    setComposeVisibility();
  };

  const renderTopicReady = (topic) => {
    if (currentState === 'missing') return;
    const survey = getTopicSurveyMeta(topic);
    if (topicTitleEl) {
      topicTitleEl.textContent = `Discussion: ${survey.title}`;
    }
    if (topicDescriptionEl) {
      topicDescriptionEl.textContent = topic?.description || '';
    }
    renderTopicSurveyLink(topic);
  };

  const loadStatements = async (append = false) => {
    if (currentState === 'missing') return;
    hideError(feedErrorEl);
    const params = new URLSearchParams();
    params.set('limit', '25');
    if (append && state.nextCursor) {
      params.set('cursor', state.nextCursor);
    }
    const { response, payload } = await getJson(
      `/api/townhall/topic/${encodeURIComponent(state.topicSlug)}/statements?${params.toString()}`
    );
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message || 'Unable to load statements.');
    }

    const statements = payload.data?.statements || [];
    if (currentState === 'missing') return;
    renderStatements(statements, append);
    state.nextCursor = payload.data?.nextCursor || '';
    updateLoadMore();
  };

  const refreshPublishedStatements = async () => {
    state.nextCursor = '';
    await loadStatements(false);
  };

  const loadAuthState = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        state.isAdmin = false;
        state.authResolved = false;
        state.isAuthenticated = false;
        if (currentState === 'missing') return;
        applyAuthUiState();
        return;
      }
      const payload = await response.json();
      state.isAdmin = !!payload?.user?.is_admin;
      state.authResolved = true;
      state.isAuthenticated = !!payload?.authenticated;
      if (currentState === 'missing') return;
      applyAuthUiState();
    } catch (error) {
      state.isAdmin = false;
      state.authResolved = false;
      state.isAuthenticated = false;
      if (currentState === 'missing') return;
      applyAuthUiState();
    }
  };

  const setEnableTopicLoading = (loading) => {
    if (!enableTopicBtnEl) return;
    enableTopicBtnEl.disabled = loading;
    enableTopicBtnEl.textContent = loading ? 'Enabling...' : 'Enable discussion for this survey';
  };

  const enableTopicForSurvey = async () => {
    if (!enableTopicBtnEl) return;
    hideError(enableTopicErrorEl);
    setEnableTopicLoading(true);
    try {
      const response = await fetch('/api/townhall/admin/seed-topic', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          surveySlug: state.topicSlug,
          title: inferTitleFromSlug(state.topicSlug) || 'Town Hall',
          description: '',
        }),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      if (!response.ok || !payload?.ok) {
        showError(enableTopicErrorEl, payload?.error?.message || 'Unable to enable discussion.');
        return;
      }
      window.location.reload();
    } catch (error) {
      showError(enableTopicErrorEl, 'Unable to enable discussion.');
    } finally {
      setEnableTopicLoading(false);
    }
  };

  const setComposeLoading = (loading) => {
    if (!composeSubmitEl) return;
    composeSubmitEl.disabled = loading;
    composeSubmitEl.textContent = loading ? 'Posting...' : 'Post statement';
  };

  const parseTags = (rawValue) => {
    const uniqueTags = new Set();
    String(rawValue || '')
      .split(',')
      .map((tag) => tag.trim().replace(/^#+/, '').trim())
      .filter(Boolean)
      .forEach((tag) => {
        if (uniqueTags.size < 8) {
          uniqueTags.add(tag.toLowerCase());
        }
      });
    if (!uniqueTags.size) {
      uniqueTags.add(defaultStatementTag);
    }
    return Array.from(uniqueTags);
  };

  const updateStatementCounter = () => {
    if (!statementCounterEl) return;
    const length = (composeBodyEl?.value || '').length;
    statementCounterEl.textContent = `${length} / ${statementMaxLength}`;
  };

  const revealNextSourceInput = () => {
    const nextRow = composeSourceRowEls.find((row) => row.classList.contains('is-hidden'));
    if (!nextRow) {
      if (addSourceLinkEl) {
        addSourceLinkEl.disabled = true;
        addSourceLinkEl.textContent = 'Maximum sources added';
      }
      return;
    }
    setHidden(nextRow, false);
    state.sourceInputCount = composeSourceRowEls.filter((row) => !row.classList.contains('is-hidden')).length;
    if (state.sourceInputCount >= composeSourceRowEls.length && addSourceLinkEl) {
      addSourceLinkEl.disabled = true;
      addSourceLinkEl.textContent = 'Maximum sources added';
    }
    nextRow.querySelector('.statement-source-input')?.focus();
  };

  const rebuildSourceRows = (values) => {
    composeSourceRowEls.forEach((row, index) => {
      const input = composeSourceInputEls[index];
      const nextValue = values[index] || '';
      if (input) {
        input.value = nextValue;
      }
      const shouldShow = index === 0 || index < values.length;
      setHidden(row, !shouldShow);
    });

    state.sourceInputCount = composeSourceRowEls.filter((row) => !row.classList.contains('is-hidden')).length;
    if (addSourceLinkEl) {
      const atLimit = state.sourceInputCount >= composeSourceRowEls.length;
      addSourceLinkEl.disabled = atLimit;
      addSourceLinkEl.textContent = atLimit ? 'Maximum sources added' : 'Add another source';
    }
  };

  const removeSourceAtIndex = (indexToRemove) => {
    const values = composeSourceRowEls
      .map((row, index) => ({ row, value: String(composeSourceInputEls[index]?.value || '') }))
      .filter(({ row }, index) => !row.classList.contains('is-hidden') || index === 0)
      .map(({ value }) => value);

    const nextValues = values.filter((_, index) => index !== indexToRemove).filter((value) => value.trim() !== '');
    rebuildSourceRows(nextValues);
  };

  const maybeNormalizeSourceUrl = (rawValue) => {
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) {
      return '';
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/:?#][^\s]*)?$/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  const parseSourceUrls = () => {
    const cleaned = [];
    const seen = new Set();

    for (const input of composeSourceInputEls) {
      const rawValue = String(input?.value || '').trim();
      if (!rawValue) {
        continue;
      }
      const candidateValue = maybeNormalizeSourceUrl(rawValue);
      let parsed;
      try {
        parsed = new URL(candidateValue);
      } catch (error) {
        throw new Error('Source links must be valid http:// or https:// URLs.');
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Source links must start with http:// or https://.');
      }
      const normalized = parsed.toString();
      if (input && normalized !== rawValue) {
        input.value = normalized;
      }
      if (seen.has(normalized)) {
        throw new Error('Duplicate source links are not allowed in the same statement.');
      }
      seen.add(normalized);
      cleaned.push(normalized);
    }

    return cleaned;
  };

  const validateStatementQuality = (text) => {
    const input = String(text || '').trim();
    const words = input.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
    const uniqueWords = new Set(words);
    const letters = (input.match(/[a-z]/gi) || []).length;
    const spaces = (input.match(/\s/g) || []).length;
    const nonPunctuationChars = input.replace(/[\s!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]+/g, '');
    const fillerWords = new Set([
      'a',
      'asdf',
      'cool',
      'fine',
      'good',
      'great',
      'hello',
      'hi',
      'hmm',
      'k',
      'kk',
      'lol',
      'nah',
      'no',
      'nope',
      'ok',
      'okay',
      'sure',
      'test',
      'testing',
      'thanks',
      'whatever',
      'word',
      'yes',
      'yep',
    ]);

    if (!input) {
      return { ok: false, message: 'Statement body is required.' };
    }
    if (input.length < 40 || words.length < 6) {
      return { ok: false, message: statementQualityMessage };
    }
    if (letters < 12 || spaces < 1 || !/[a-z]/i.test(input) || !/\s/.test(input)) {
      return { ok: false, message: statementQualityMessage };
    }
    if (!nonPunctuationChars || /^\d+$/.test(nonPunctuationChars)) {
      return { ok: false, message: statementQualityMessage };
    }
    if (/^https?:\/\/\S+$/i.test(input)) {
      return { ok: false, message: statementQualityMessage };
    }
    if (/(.)\1{5,}/i.test(input)) {
      return { ok: false, message: statementQualityMessage };
    }
    const symbolChars = (input.match(/[^\w\s]/g) || []).length;
    if (symbolChars > letters && letters < 20) {
      return { ok: false, message: statementQualityMessage };
    }
    const allFiller = words.length > 0 && words.every((word) => fillerWords.has(word));
    if (allFiller || (uniqueWords.size <= 2 && words.length >= 4)) {
      return { ok: false, message: statementQualityMessage };
    }
    return { ok: true, message: '' };
  };

  const handleComposeSubmit = async (event) => {
    event.preventDefault();
    hideError(composeErrorEl);
    if (composeSuccessEl) {
      composeSuccessEl.textContent = '';
      setHidden(composeSuccessEl, true);
    }

    const body = (composeBodyEl?.value || '').trim();
    const tags = parseTags(composeTagsEl?.value || '');
    let sources = [];
    if (!body) {
      showError(composeErrorEl, 'Statement body is required.');
      return;
    }
    if (body.length > statementMaxLength) {
      showError(composeErrorEl, `Statement body must be ${statementMaxLength} characters or fewer.`);
      return;
    }
    const qualityCheck = validateStatementQuality(body);
    if (!qualityCheck.ok) {
      showError(composeErrorEl, qualityCheck.message || statementQualityMessage);
      return;
    }
    try {
      sources = parseSourceUrls();
    } catch (error) {
      showError(composeErrorEl, error.message || 'Unable to validate source links.');
      return;
    }

    setComposeLoading(true);
    try {
      const response = await fetch(`/api/townhall/topic/${encodeURIComponent(state.topicSlug)}/statements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body, tags, sources }),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (response.status === 401) {
        showSignInRequired(composeErrorEl);
        state.authResolved = true;
        state.isAuthenticated = false;
        applyAuthUiState();
        return;
      }

      if (!response.ok || !payload?.ok) {
        showError(composeErrorEl, payload?.error?.message || 'Unable to post statement.');
        return;
      }

      const statement = payload.data?.statement;
      if (!statement) {
        showError(composeErrorEl, 'Unable to post statement.');
        return;
      }

      if (composeBodyEl) composeBodyEl.value = '';
      if (composeTagsEl) composeTagsEl.value = '';
      rebuildSourceRows([]);
      updateStatementCounter();

      if (statement.status === 'pending') {
        if (composeSuccessEl) {
          composeSuccessEl.textContent = 'Your statement was submitted for review. Published statements appear here after review.';
          setHidden(composeSuccessEl, false);
        }
        if (feedEmptyEl && feedEl && !feedEl.children.length) {
          feedEmptyEl.textContent = feedEmptyPendingText;
          setHidden(feedEmptyEl, false);
        }
        return;
      }

      await refreshPublishedStatements();
      if (composeSuccessEl) {
        composeSuccessEl.textContent = 'Statement posted. Published statements and tags have been updated.';
        setHidden(composeSuccessEl, false);
      }
    } catch (error) {
      showError(composeErrorEl, 'Unable to post statement.');
    } finally {
      setComposeLoading(false);
    }
  };

  const updateReactionCount = (button, nextActive) => {
    const countEl = button.querySelector('[data-role="count"]');
    if (!countEl) return;
    const current = Number(countEl.textContent || '0');
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const wasActive = button.getAttribute('data-active') === '1';

    let nextCount = safeCurrent;
    if (!wasActive && nextActive) nextCount += 1;
    if (wasActive && !nextActive) nextCount = Math.max(0, nextCount - 1);

    countEl.textContent = String(nextCount);
    button.setAttribute('data-active', nextActive ? '1' : '0');
  };

  const appendReplyToParent = (parentStatementId, reply) => {
    const parent = state.loadedStatements.find((statement) => statement.id === parentStatementId);
    if (parent) {
      const replies = Array.isArray(parent.replies) ? parent.replies : [];
      replies.push({
        ...reply,
        reactions: reply.reactions || {},
        tags: Array.isArray(reply.tags) ? reply.tags : [],
        sources: Array.isArray(reply.sources) ? reply.sources : [],
      });
      parent.replies = replies;
    }
    const repliesContainer = feedEl?.querySelector(`[data-replies-for="${parentStatementId}"]`);
    if (!repliesContainer) return;
    repliesContainer.insertAdjacentHTML('beforeend', renderReplyCardHtml({
      ...reply,
      reactions: reply.reactions || {},
      tags: Array.isArray(reply.tags) ? reply.tags : [],
      sources: Array.isArray(reply.sources) ? reply.sources : [],
    }));
  };

  const handleReaction = async (button) => {
    if (!state.isAuthenticated) {
      showSignInRequired(feedErrorEl);
      return;
    }

    const statementId = button.getAttribute('data-statement-id') || '';
    const reactionType = button.getAttribute('data-reaction-type') || '';
    if (!statementId || !allowedReactions.includes(reactionType)) return;

    const requestKey = `${statementId}:${reactionType}`;
    if (state.pendingReactionRequests.has(requestKey)) return;
    state.pendingReactionRequests.add(requestKey);

    const currentlyActive = button.getAttribute('data-active') === '1';
    const nextActive = !currentlyActive;

    try {
      const response = await fetch(`/api/townhall/statements/${encodeURIComponent(statementId)}/react`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reactionType, set: nextActive }),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (response.status === 401) {
        showSignInRequired(feedErrorEl);
        state.authResolved = true;
        state.isAuthenticated = false;
        applyAuthUiState();
        return;
      }

      if (!response.ok || !payload?.ok) {
        showError(feedErrorEl, payload?.error?.message || 'Unable to update reaction.');
        return;
      }

      hideError(feedErrorEl);
      updateReactionCount(button, nextActive);
    } catch (error) {
      showError(feedErrorEl, 'Unable to update reaction.');
    } finally {
      state.pendingReactionRequests.delete(requestKey);
    }
  };

  const handleReplyToggle = (button) => {
    if (!state.isAuthenticated) {
      showSignInRequired(feedErrorEl);
      return;
    }
    const statementId = button.getAttribute('data-statement-id') || '';
    if (!statementId) return;
    const form = feedEl?.querySelector(`[data-reply-form="${statementId}"]`);
    if (!form) return;
    hideError(feedErrorEl);
    form.classList.toggle('is-hidden');
    if (!form.classList.contains('is-hidden')) {
      form.querySelector('textarea')?.focus();
    }
  };

  const handleReplyCancel = (button) => {
    const form = button.closest('[data-reply-form]');
    if (!form) return;
    form.classList.add('is-hidden');
    const input = form.querySelector('textarea');
    const errorEl = form.querySelector('[data-role="reply-error"]');
    const successEl = form.querySelector('[data-role="reply-success"]');
    if (input) input.value = '';
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('is-hidden');
    }
    if (successEl) {
      successEl.textContent = '';
      successEl.classList.add('is-hidden');
    }
  };

  const handleReplySubmit = async (form) => {
    if (!state.isAuthenticated) {
      showSignInRequired(feedErrorEl);
      return;
    }
    const parentStatementId = form.getAttribute('data-reply-form') || '';
    const input = form.querySelector('textarea');
    const errorEl = form.querySelector('[data-role="reply-error"]');
    const submitButton = form.querySelector('button[type="submit"]');
    const body = String(input?.value || '').trim();

    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('is-hidden');
    }
    if (!body) {
      showError(errorEl, 'Reply text is required.');
      return;
    }
    if (body.length > replyMaxLength) {
      showError(errorEl, `Reply must be ${replyMaxLength} characters or fewer.`);
      return;
    }
    const qualityCheck = validateReplyBody(body);
    if (!qualityCheck.ok) {
      showError(errorEl, qualityCheck.message || statementQualityMessage);
      return;
    }

    if (submitButton) submitButton.disabled = true;
    try {
      const response = await fetch(`/api/townhall/topic/${encodeURIComponent(state.topicSlug)}/statements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body, parentStatementId }),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (response.status === 401) {
        showSignInRequired(feedErrorEl);
        state.authResolved = true;
        state.isAuthenticated = false;
        applyAuthUiState();
        return;
      }

      if (!response.ok || !payload?.ok) {
        showError(errorEl, payload?.error?.message || 'Unable to post reply.');
        return;
      }

      const reply = payload.data?.statement;
      if (!reply) {
        showError(errorEl, 'Unable to post reply.');
        return;
      }

      appendReplyToParent(parentStatementId, reply);
      if (input) input.value = '';
      form.classList.add('is-hidden');
      hideError(feedErrorEl);
    } catch (error) {
      showError(errorEl, 'Unable to post reply.');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  };

  const handleReport = async (button) => {
    if (!state.isAuthenticated) {
      showSignInRequired(feedErrorEl);
      return;
    }

    const statementId = button.getAttribute('data-statement-id') || '';
    if (!statementId) return;

    const reason = window.prompt('Reason for report:');
    if (reason === null) return;
    const reasonText = reason.trim();
    if (!reasonText) {
      showError(feedErrorEl, 'Report reason is required.');
      return;
    }

    const detailsRaw = window.prompt('Additional details (optional):', '');
    const details = detailsRaw === null ? '' : detailsRaw.trim();

    try {
      const response = await fetch(`/api/townhall/statements/${encodeURIComponent(statementId)}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: reasonText, details }),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (response.status === 401) {
        showSignInRequired(feedErrorEl);
        state.authResolved = true;
        state.isAuthenticated = false;
        applyAuthUiState();
        return;
      }

      if (!response.ok || !payload?.ok) {
        showError(feedErrorEl, payload?.error?.message || 'Unable to report statement.');
        return;
      }

      hideError(feedErrorEl);
      button.disabled = true;
      button.textContent = 'Reported';
    } catch (error) {
      showError(feedErrorEl, 'Unable to report statement.');
    }
  };

  const handleTagFilterClick = (event) => {
    const tagButton = event.target.closest('[data-action="tag-filter"]');
    if (!tagButton) return;
    state.activeTag = (tagButton.getAttribute('data-tag') || 'all').trim() || 'all';
    renderVisibleStatements();
  };

  const handleFeedClick = (event) => {
    const reactionButton = event.target.closest('[data-action="reaction"]');
    if (reactionButton) {
      handleReaction(reactionButton);
      return;
    }
    const replyToggleButton = event.target.closest('[data-action="reply-toggle"]');
    if (replyToggleButton) {
      handleReplyToggle(replyToggleButton);
      return;
    }
    const replyCancelButton = event.target.closest('[data-action="reply-cancel"]');
    if (replyCancelButton) {
      handleReplyCancel(replyCancelButton);
      return;
    }
    const reportButton = event.target.closest('[data-action="report"]');
    if (reportButton) {
      handleReport(reportButton);
    }
  };

  const handleFeedSubmit = (event) => {
    const replyForm = event.target.closest('[data-reply-form]');
    if (!replyForm) {
      return;
    }
    event.preventDefault();
    handleReplySubmit(replyForm);
  };

  const initialize = async () => {
    const params = new URLSearchParams(window.location.search || '');
    state.topicSlug = (params.get('slug') || '').trim();
    if (!state.topicSlug) {
      showError(topicErrorEl, 'Missing topic slug.');
      return;
    }

    setStateLoading();
    await loadAuthState();

    if (enableTopicBtnEl) {
      setHidden(enableTopicBtnEl, true);
    }

    let topicState;
    try {
      topicState = await loadTopic();
    } catch (error) {
      showError(topicErrorEl, error.message || 'Unable to load topic.');
      return;
    }

    if (topicState.missing) {
      state.topic = null;
      logState('before setStateMissing');
      setStateMissing();
      logState('after setStateMissing');
      renderMissingTopic();
      if (DEBUG && topicMissingEl) {
        console.log('[TownHallTopic] missing state after topic fetch', {
          missingVisible: !topicMissingEl.classList.contains('is-hidden'),
        });
      }
      logState('missing final');
      return;
    }

    state.topic = topicState.topic;
    hideError(topicErrorEl);
    renderTopicReady(state.topic);
    logState('before setStateReady');
    setStateReady();
    logState('after setStateReady');

    if (DEBUG && topicMissingEl) {
      console.log('[TownHallTopic] state=', state.uiState, {
        hasTopic: !!state.topic,
        authed: !!state.isAuthenticated,
      }, {
        missingVisible: !topicMissingEl.classList.contains('is-hidden'),
        composeVisible: !composeCardEl.classList.contains('is-hidden'),
        signInVisible: !signInCardEl.classList.contains('is-hidden'),
      });
    }

    try {
      await refreshPublishedStatements();
    } catch (error) {
      showError(feedErrorEl, error.message || 'Unable to load statements.');
      setHidden(feedEl, true);
    }
  };

  if (composeFormEl) {
    composeFormEl.addEventListener('submit', handleComposeSubmit);
  }

  if (composeBodyEl) {
    composeBodyEl.addEventListener('input', updateStatementCounter);
    updateStatementCounter();
  }

  if (addSourceLinkEl) {
    addSourceLinkEl.addEventListener('click', revealNextSourceInput);
  }

  composeSourceRemoveEls.forEach((button) => {
    button.addEventListener('click', () => {
      const index = parseInt(button.getAttribute('data-source-index') || '0', 10);
      removeSourceAtIndex(Number.isNaN(index) ? 0 : index);
    });
  });

  if (feedEl) {
    feedEl.addEventListener('click', handleFeedClick);
    feedEl.addEventListener('submit', handleFeedSubmit);
  }

  if (tagFilterListEl) {
    tagFilterListEl.addEventListener('click', handleTagFilterClick);
  }

  if (loadMoreEl) {
    loadMoreEl.addEventListener('click', async () => {
      if (!state.nextCursor || state.uiState !== 'ready') return;
      loadMoreEl.disabled = true;
      loadMoreEl.textContent = 'Loading...';
      try {
        await loadStatements(true);
      } catch (error) {
        showError(feedErrorEl, error.message || 'Unable to load more statements.');
      } finally {
        loadMoreEl.disabled = false;
        loadMoreEl.textContent = 'Load more';
      }
    });
  }

  if (enableTopicBtnEl) {
    enableTopicBtnEl.addEventListener('click', enableTopicForSurvey);
  }

  window.addEventListener('auth:changed', (event) => {
    state.authResolved = true;
    state.isAuthenticated = !!event.detail?.authenticated;
    applyAuthUiState();
    debugVisibility();
  });

  initialize();
})();
