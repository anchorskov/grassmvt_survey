(() => {
  const topicsRoot = document.getElementById('townhall-topics');
  const errorEl = document.getElementById('townhall-list-error');

  if (!topicsRoot) {
    return;
  }

  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const showError = (message) => {
    if (!errorEl) {
      return;
    }
    errorEl.textContent = message || 'Unable to load Town Hall topics.';
    errorEl.classList.remove('is-hidden');
  };

  const hideError = () => {
    if (!errorEl) {
      return;
    }
    errorEl.textContent = '';
    errorEl.classList.add('is-hidden');
  };

  const renderEmpty = () => {
    topicsRoot.innerHTML = '<article class="card"><p>No Town Hall topics are available yet.</p></article>';
  };

  const renderTopics = (topics) => {
    if (!Array.isArray(topics) || topics.length === 0) {
      renderEmpty();
      return;
    }

    topicsRoot.innerHTML = topics
      .map((topic) => {
        const topicSlug = encodeURIComponent(topic.slug || topic.survey_slug || '');
        const title = escapeHtml(topic.title || topic.slug || 'Town Hall topic');
        const description = escapeHtml(topic.description || '');
        return `
          <article class="card">
            <h2>${title}</h2>
            ${description ? `<p class="card__meta">${description}</p>` : '<p class="card__meta">Join this discussion.</p>'}
            <div class="card__actions">
              <a class="button button--small" href="/townhall/topic/?slug=${topicSlug}">Open topic</a>
            </div>
          </article>
        `;
      })
      .join('');
  };

  const loadTopics = async () => {
    try {
      const response = await fetch('/api/townhall/topics', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed with ${response.status}`);
      }
      const payload = await response.json();
      if (!payload?.ok) {
        throw new Error(payload?.error?.message || 'Unable to load topics.');
      }
      hideError();
      renderTopics(payload.data?.topics || []);
    } catch (error) {
      renderEmpty();
      showError('Unable to load Town Hall topics right now.');
    }
  };

  loadTopics();
})();
