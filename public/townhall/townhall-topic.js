(() => {
  const DEBUG = window.location.hostname === 'localhost';

  const allowedReactions = ['agree', 'disagree', 'important', 'needs_evidence'];

  const topicTitleEl = document.getElementById('topic-title');
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
  const composeErrorEl = document.getElementById('compose-error');
  const composeSuccessEl = document.getElementById('compose-success');
  const composeSubmitEl = document.getElementById('compose-submit');

  const feedEl = document.getElementById('statements-feed');
  const feedEmptyEl = document.getElementById('feed-empty');
  const feedErrorEl = document.getElementById('feed-error');
  const loadMoreEl = document.getElementById('load-more');

  const receiptsListEl = document.getElementById('receipts-list');
  const receiptsEmptyEl = document.getElementById('receipts-empty');
  const receiptsErrorEl = document.getElementById('receipts-error');

  const state = {
    topicSlug: '',
    topic: null,
    nextCursor: '',
    isAuthenticated: false,
    isAdmin: false,
    authResolved: false,
    uiState: 'loading',
    pendingReactionRequests: new Set(),
  };
  let currentState = 'loading';

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
    setHidden(receiptsListEl, true);
    setHidden(receiptsEmptyEl, true);
    setHidden(receiptsErrorEl, true);
    if (topicDescriptionEl) {
      topicDescriptionEl.textContent = 'Loading...';
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
    setHidden(receiptsListEl, true);
    setHidden(receiptsEmptyEl, true);
    setHidden(receiptsErrorEl, true);
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
    setHidden(receiptsListEl, false);
    setHidden(feedErrorEl, true);
    setHidden(receiptsErrorEl, true);
    setHidden(feedEmptyEl, true);
    setHidden(receiptsEmptyEl, true);
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
    if (!normalized) return 'Town Hall';
    return normalized
      .split(/[-_]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const renderMissingTopic = () => {
    if (topicTitleEl) topicTitleEl.textContent = 'Town Hall not enabled yet';
    if (topicMissingTitleEl) topicMissingTitleEl.textContent = 'Town Hall not enabled yet';
    if (topicMissingBodyEl) {
      topicMissingBodyEl.textContent = 'This survey does not have a Town Hall topic yet.';
    }
  };

  const reactionLabel = (type) => {
    if (type === 'agree') return 'Agree';
    if (type === 'disagree') return 'Disagree';
    if (type === 'important') return 'Important';
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
          >
            ${reactionLabel(type)} (<span data-role="count">${count}</span>)
          </button>
        `;
      })
      .join('');
  };

  const renderStatementCard = (statement, prepend = false) => {
    if (!feedEl) return;
    const article = document.createElement('article');
    article.className = 'card townhall-statement';
    article.setAttribute('data-statement-id', statement.id);
    article.innerHTML = `
      <p>${escapeHtml(statement.body || '')}</p>
      ${buildTagsHtml(statement.tags)}
      <p class="card__meta">Posted ${escapeHtml(formatDate(statement.createdAt))}</p>
      <div class="card__actions townhall-reactions">${buildReactionButtons(statement)}</div>
      <div class="card__actions">
        <button
          class="button button--small button--secondary"
          type="button"
          data-action="report"
          data-statement-id="${escapeHtml(statement.id)}"
        >
          Report
        </button>
      </div>
    `;

    if (prepend && feedEl.firstChild) {
      feedEl.insertBefore(article, feedEl.firstChild);
    } else {
      feedEl.appendChild(article);
    }
  };

  const renderStatements = (statements, append = true) => {
    const list = Array.isArray(statements) ? statements : [];
    if (!append && feedEl) feedEl.innerHTML = '';
    if (!list.length) {
      if (!append) setHidden(feedEmptyEl, false);
      return;
    }
    setHidden(feedEmptyEl, true);
    list.forEach((statement) => renderStatementCard(statement));
  };

  const renderReceipts = (receipts) => {
    const list = Array.isArray(receipts) ? receipts : [];
    if (!receiptsListEl) return;
    if (!list.length) {
      receiptsListEl.innerHTML = '';
      setHidden(receiptsEmptyEl, false);
      return;
    }

    setHidden(receiptsEmptyEl, true);
    receiptsListEl.innerHTML = list
      .map((receipt) => {
        const title = escapeHtml(receipt.title || 'Receipt');
        const note = receipt.note ? `<p class="card__meta">${escapeHtml(receipt.note)}</p>` : '';
        const url = receipt.url
          ? `<p><a href="${escapeHtml(receipt.url)}" rel="noopener noreferrer" target="_blank">View source</a></p>`
          : '';
        return `
          <article class="townhall-receipt">
            <h3>${title}</h3>
            ${note}
            ${url}
          </article>
        `;
      })
      .join('');
  };

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
    if (topicTitleEl) {
      topicTitleEl.textContent = topic?.title || 'Town Hall';
    }
    if (topicDescriptionEl) {
      topicDescriptionEl.textContent = topic?.description || '';
    }
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

  const loadReceipts = async () => {
    if (currentState === 'missing') return;
    hideError(receiptsErrorEl);
    const { response, payload } = await getJson(
      `/api/townhall/topic/${encodeURIComponent(state.topicSlug)}/receipts`
    );
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message || 'Unable to load receipts.');
    }

    if (currentState === 'missing') return;
    renderReceipts(payload.data?.receipts || []);
    setHidden(receiptsListEl, false);
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
    enableTopicBtnEl.textContent = loading ? 'Enabling...' : 'Enable Town Hall for this survey';
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
        showError(enableTopicErrorEl, payload?.error?.message || 'Unable to enable Town Hall.');
        return;
      }
      window.location.reload();
    } catch (error) {
      showError(enableTopicErrorEl, 'Unable to enable Town Hall.');
    } finally {
      setEnableTopicLoading(false);
    }
  };

  const setComposeLoading = (loading) => {
    if (!composeSubmitEl) return;
    composeSubmitEl.disabled = loading;
    composeSubmitEl.textContent = loading ? 'Posting...' : 'Post statement';
  };

  const parseTags = (rawValue) =>
    String(rawValue || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8);

  const handleComposeSubmit = async (event) => {
    event.preventDefault();
    hideError(composeErrorEl);
    if (composeSuccessEl) {
      composeSuccessEl.textContent = '';
      setHidden(composeSuccessEl, true);
    }

    const body = (composeBodyEl?.value || '').trim();
    const tags = parseTags(composeTagsEl?.value || '');
    if (!body) {
      showError(composeErrorEl, 'Statement body is required.');
      return;
    }

    setComposeLoading(true);
    try {
      const response = await fetch(`/api/townhall/topic/${encodeURIComponent(state.topicSlug)}/statements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body, tags }),
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

      if (statement.status === 'pending') {
        if (composeSuccessEl) {
          composeSuccessEl.textContent = 'Submitted for review';
          setHidden(composeSuccessEl, false);
        }
        return;
      }

      setHidden(feedEmptyEl, true);
      renderStatementCard(
        {
          ...statement,
          reactions: statement.reactions || {},
          tags: Array.isArray(statement.tags) ? statement.tags : [],
        },
        true
      );
      if (composeSuccessEl) {
        composeSuccessEl.textContent = 'Statement posted.';
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

  const handleFeedClick = (event) => {
    const reactionButton = event.target.closest('[data-action="reaction"]');
    if (reactionButton) {
      handleReaction(reactionButton);
      return;
    }
    const reportButton = event.target.closest('[data-action="report"]');
    if (reportButton) {
      handleReport(reportButton);
    }
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
      await loadReceipts();
    } catch (error) {
      showError(receiptsErrorEl, error.message || 'Unable to load receipts.');
      setHidden(receiptsListEl, true);
    }

    try {
      await loadStatements(false);
    } catch (error) {
      showError(feedErrorEl, error.message || 'Unable to load statements.');
      setHidden(feedEl, true);
    }
  };

  if (composeFormEl) {
    composeFormEl.addEventListener('submit', handleComposeSubmit);
  }

  if (feedEl) {
    feedEl.addEventListener('click', handleFeedClick);
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
