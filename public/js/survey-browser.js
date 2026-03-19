// public/js/survey-browser.js
/* public/js/survey-browser.js */
(() => {
  const PATH_LABELS = {
    'normal-life': 'Normal Life',
    divisive: 'Divisive',
    bridge: 'Bridge',
    all: 'All surveys',
  };

  const STATUS_LABELS = {
    active: 'Active',
    coming_soon: 'Coming soon',
    draft: 'Draft',
    archived: 'Archived',
  };

  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

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
        if (char === '\\') {
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

  const deriveSlug = (entry = {}) => {
    if (entry.slug) {
      return String(entry.slug).trim();
    }

    if (entry.href) {
      const surveyMatch = String(entry.href).match(/^\/surveys\/([^/]+)\/?$/);
      if (surveyMatch) {
        return decodeURIComponent(surveyMatch[1]);
      }
    }

    if (entry.id) {
      return String(entry.id).trim();
    }

    return '';
  };

  const normalizeDisplayOrder = (value, fallback = 999) => {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const normalizeMinutes = (value) => {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const normalizeCatalogEntry = (entry = {}) => {
    const slug = deriveSlug(entry);
    const href = typeof entry.href === 'string' ? entry.href : '';
    return {
      id: entry.id || slug,
      slug,
      title: entry.title || 'Survey',
      description: entry.description || '',
      landingBlurb: entry.landing_blurb || entry.description || '',
      path: entry.path || '',
      status: entry.status || 'draft',
      categorySlug: entry.category_slug || '',
      displayOrder: normalizeDisplayOrder(entry.display_order),
      estimatedMinutes: normalizeMinutes(entry.estimated_minutes),
      featured: Boolean(entry.featured),
      scope: entry.scope || 'public',
      href,
      placeholderHref: typeof entry.placeholder_href === 'string' ? entry.placeholder_href : '',
      resultsHref: slug ? `/surveys/results/?slug=${encodeURIComponent(slug)}` : '',
      townhallEnabled: false,
      townhallTopicSlug: '',
      response: null,
      isStaticOnly: true,
    };
  };

  const loadCatalog = async () => {
    const response = await fetch('/data/surveys.json', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to load survey catalog');
    }
    const rawText = await response.text();
    const parsed = JSON.parse(stripJsonc(rawText));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeCatalogEntry).filter((entry) => entry.slug);
  };

  const mergeSurveyData = (apiSurveys = [], catalogEntries = []) => {
    const mergedBySlug = new Map();

    catalogEntries.forEach((entry) => {
      mergedBySlug.set(entry.slug, { ...entry });
    });

    apiSurveys.forEach((survey) => {
      if (!survey || !survey.slug) {
        return;
      }

      const staticEntry = mergedBySlug.get(survey.slug) || normalizeCatalogEntry(survey);
      const merged = {
        ...staticEntry,
        slug: survey.slug,
        title: survey.title || staticEntry.title,
        description: survey.description || staticEntry.description,
        landingBlurb: staticEntry.landingBlurb || survey.description || staticEntry.description,
        scope: survey.scope || staticEntry.scope,
        status: survey.status || staticEntry.status || 'active',
        href: survey.href || staticEntry.href || `/surveys/${encodeURIComponent(survey.slug)}`,
        resultsHref: staticEntry.resultsHref || `/surveys/results/?slug=${encodeURIComponent(survey.slug)}`,
        townhallEnabled: Boolean(survey.townhallEnabled),
        townhallTopicSlug: survey.townhallTopicSlug || '',
        versionId: survey.versionId || null,
        versionHash: survey.versionHash || '',
        flow: survey.flow || null,
        response: survey.response || null,
        isStaticOnly: false,
      };

      mergedBySlug.set(survey.slug, merged);
    });

    return Array.from(mergedBySlug.values()).sort((left, right) => {
      if (left.displayOrder !== right.displayOrder) {
        return left.displayOrder - right.displayOrder;
      }
      return String(left.title || '').localeCompare(String(right.title || ''));
    });
  };

  const filterSurveys = (surveys = [], options = {}) => {
    const path = options.path || 'all';
    const statuses = Array.isArray(options.statuses) ? options.statuses : [];

    return surveys.filter((survey) => {
      if (path !== 'all' && survey.path !== path) {
        return false;
      }
      if (statuses.length && !statuses.includes(survey.status)) {
        return false;
      }
      return true;
    });
  };

  window.SurveyBrowse = {
    PATH_LABELS,
    STATUS_LABELS,
    escapeHtml,
    stripJsonc,
    loadCatalog,
    mergeSurveyData,
    filterSurveys,
  };
})();
