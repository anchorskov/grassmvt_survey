/* public/js/survey-results.js */
(() => {
  const container = document.getElementById('results-container');
  const surveySelect = document.getElementById('results-survey-select');
  if (!container || !surveySelect) return;

  let slug = '';
  let surveyMeta = null;
  let currentTier = 1;
  let currentGeoType = 'all';
  let currentGeoKey = 'ALL';
  let geoOptions = [];
  let voterSnapshots = null;
  let districtContext = null;
  let userAuth = null;
  let availableSurveys = [];

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  const normalizeDistrictNumber = (value, width = 2) => {
    const parsed = parseInt(String(value || '').trim(), 10);
    if (Number.isNaN(parsed)) {
      return '';
    }
    return String(parsed).padStart(width, '0');
  };

  const buildGeoKey = (geoType, rawValue) => {
    if (geoType === 'state_house') {
      const district = normalizeDistrictNumber(rawValue, 2);
      return district ? `WY-HD-${district}` : '';
    }
    if (geoType === 'state_senate') {
      const district = normalizeDistrictNumber(rawValue, 2);
      return district ? `WY-SD-${district}` : '';
    }
    if (geoType === 'state') {
      return String(rawValue || '').trim() || 'WY';
    }
    return String(rawValue || '').trim();
  };

  const getSlugFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const querySlug = (urlParams.get('slug') || '').trim();
    const pathMatch = window.location.pathname.match(/\/surveys\/results\/([^/]+)/);
    if (pathMatch) {
      return decodeURIComponent(pathMatch[1]);
    }
    return querySlug;
  };

  const getFilterFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tierValue = parseInt(urlParams.get('tier') || '1', 10);
    const geoType = (urlParams.get('geo_type') || '').trim();
    const geoKey = (urlParams.get('geo_key') || '').trim();
    return {
      tier: tierValue === 2 ? 2 : 1,
      geoType: geoType || 'all',
      geoKey: geoKey || 'ALL',
    };
  };

  const updateUrlForState = () => {
    const url = new URL(window.location.href);
    if (slug) {
      url.pathname = '/surveys/results/';
      url.searchParams.set('slug', slug);
    } else {
      url.pathname = '/surveys/results/';
      url.searchParams.delete('slug');
    }
    if (!slug || currentTier === 1) {
      url.searchParams.delete('tier');
      url.searchParams.delete('geo_type');
      url.searchParams.delete('geo_key');
    } else {
      url.searchParams.set('tier', String(currentTier));
      if (currentGeoType === 'all' && currentGeoKey === 'ALL') {
        url.searchParams.delete('geo_type');
        url.searchParams.delete('geo_key');
      } else {
        url.searchParams.set('geo_type', currentGeoType);
        url.searchParams.set('geo_key', currentGeoKey);
      }
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

  const resetResultState = () => {
    surveyMeta = null;
    currentTier = 1;
    currentGeoType = 'all';
    currentGeoKey = 'ALL';
    geoOptions = [];
    districtContext = null;
  };

  const renderWaitingState = (message = 'Select a survey to review results.') => {
    document.title = 'Survey Results - Grassroots Movement';
    container.innerHTML = `<div class="results-loading">${escapeHtml(message)}</div>`;
  };

  const renderFriendlyError = (title, message) => {
    document.title = 'Survey Results - Grassroots Movement';
    container.innerHTML = `
      <div class="results-error">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  };

  const formatQuestionName = (name) =>
    name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const renderHelpTrigger = (section, label) => `
    <button
      class="section-help-trigger"
      type="button"
      data-help-page="survey-results"
      data-help-section="${escapeHtml(section)}"
      aria-label="Help: ${escapeHtml(label)}"
      aria-expanded="false"
    >?</button>
  `;

  const renderSectionHeading = (level, title, section, cssClass = '') => `
    <div class="results-section-heading${cssClass ? ` ${cssClass}` : ''}">
      <${level} class="results-section-heading__label">${escapeHtml(title)}</${level}>
      ${renderHelpTrigger(section, title)}
    </div>
  `;

  const renderControls = () => {
    const tierOptions = `
      <option value="1" ${currentTier === 1 ? 'selected' : ''}>Tier 1: All Responses</option>
      <option value="2" ${currentTier === 2 ? 'selected' : ''}>Tier 2: Verified Address</option>
    `;

    let geoOptionsHtml = '<option value="all|ALL">Statewide (All)</option>';
    if (currentTier === 2) {
      const groupedOptions = geoOptions.reduce((accumulator, option) => {
        const groupLabel = option.group_label || 'Other';
        if (!accumulator.has(groupLabel)) {
          accumulator.set(groupLabel, []);
        }
        accumulator.get(groupLabel).push(option);
        return accumulator;
      }, new Map());

      for (const [groupLabel, options] of groupedOptions) {
        geoOptionsHtml += `<optgroup label="${escapeHtml(groupLabel)}">`;
        for (const opt of options) {
          const selected = opt.geo_type === currentGeoType && opt.geo_key === currentGeoKey ? 'selected' : '';
          const optionLabel = opt.option_label || opt.geo_key;
          geoOptionsHtml += `<option value="${opt.geo_type}|${opt.geo_key}" ${selected}>${escapeHtml(optionLabel)} (n=${opt.response_count})</option>`;
        }
        geoOptionsHtml += '</optgroup>';
      }
    }

    return `
      <div class="results-controls">
        ${renderSectionHeading('p', 'Filters', 'filters')}
        <div class="control-group">
          <label for="tier-select">Response Tier</label>
          <select id="tier-select">${tierOptions}</select>
        </div>
        <div class="control-group">
          <label for="geo-select">Geography</label>
          <select id="geo-select" ${currentTier === 1 ? 'disabled' : ''}>${geoOptionsHtml}</select>
        </div>
      </div>
    `;
  };

  const renderBadges = (data) => {
    const tierLabel = data.tier === 1 ? 'Tier 1: All Responses' : 'Tier 2: Verified Address';
    const geoLabel = data.geo?.label || 'All';
    const nLabel = `n = ${data.n}`;
    const updatedLabel = data.updated_at ? `Updated: ${new Date(data.updated_at).toLocaleDateString()}` : '';

    return `
      <div class="results-meta">
        <span class="results-badge results-badge--tier">${escapeHtml(tierLabel)}</span>
        <span class="results-badge results-badge--geo">${escapeHtml(geoLabel)}</span>
        <span class="results-badge results-badge--n">${escapeHtml(nLabel)}</span>
        ${updatedLabel ? `<span class="results-badge">${escapeHtml(updatedLabel)}</span>` : ''}
      </div>
    `;
  };

  const renderSuppressed = (data) => `
    <div class="results-suppressed">
      ${renderSectionHeading('h3', 'Publishing threshold', 'threshold')}
      <p><strong>Not enough responses yet</strong></p>
      <p>Results are shown when at least ${data.min_publish_n} responses are collected for this filter combination.</p>
      <p>Current responses: ${data.n}</p>
    </div>
  `;

  const renderQuestion = (q, questionDefs) => {
    const def = questionDefs.find((d) => d.name === q.question_name);
    const title = def?.title || formatQuestionName(q.question_name);

    let barsHtml = '';
    for (const t of q.totals) {
      const pct = t.pct || 0;
      barsHtml += `
        <div class="results-bar">
          <div class="results-bar-label">${escapeHtml(t.choice_value)}</div>
          <div class="results-bar-track">
            <div class="results-bar-fill" style="width: ${pct}%"></div>
          </div>
          <div class="results-bar-value">${t.count} (${pct}%)</div>
        </div>
      `;
    }

    return `
      <div class="results-question">
        <h3>${escapeHtml(title)}</h3>
        ${barsHtml}
      </div>
    `;
  };

  const renderVoterPanel = () => {
    if (!voterSnapshots || !voterSnapshots.snapshots) return '';

    let snapshotsHtml = '';
    for (const snap of voterSnapshots.snapshots) {
      const date = new Date(snap.as_of).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      snapshotsHtml += `<li>Registered voters: ${snap.registered_voters.toLocaleString()} as of ${date}</li>`;
    }

    return `
      <div class="voter-panel">
        <h4>Wyoming Voter Registration (${voterSnapshots.state})</h4>
        <ul>${snapshotsHtml}</ul>
        ${voterSnapshots.note ? `<p class="note">${escapeHtml(voterSnapshots.note)}</p>` : ''}
      </div>
    `;
  };

  const renderDistrictContext = () => {
    if (!districtContext || !districtContext.representatives || districtContext.representatives.length === 0) {
      return '';
    }

    const isDistrict = districtContext.geo_type === 'state_house' || districtContext.geo_type === 'state_senate';
    if (!isDistrict) return '';

    let repsHtml = '';
    for (const rep of districtContext.representatives) {
      const voterCountHtml = districtContext.voter_count > 0
        ? `<p class="district-voter-count">Registered voters in ${rep.chamber} District ${rep.district}: ${districtContext.voter_count.toLocaleString()}</p>`
        : '';

      let contactHtml = '';
      if (rep.phone || rep.email) {
        contactHtml = '<div class="rep-contact">';
        if (rep.phone) {
          contactHtml += `<a href="tel:${rep.phone}" class="contact-link phone">${escapeHtml(rep.phone)}</a>`;
        }
        if (rep.email) {
          contactHtml += `<a href="mailto:${rep.email}" class="contact-link email">${escapeHtml(rep.email)}</a>`;
        }
        contactHtml += '</div>';
      }

      let websiteHtml = '';
      if (rep.campaign_website) {
        websiteHtml = `<p><a href="${escapeHtml(rep.campaign_website)}" target="_blank" rel="noopener noreferrer" class="campaign-link">Campaign Website →</a></p>`;
      } else if (rep.official_profile_url) {
        websiteHtml = `<p><a href="${escapeHtml(rep.official_profile_url)}" target="_blank" rel="noopener noreferrer" class="campaign-link">Official Profile →</a></p>`;
      }

      const party = rep.party ? `<span class="rep-party party-${rep.party.toLowerCase()}">${escapeHtml(rep.party)}</span>` : '';

      repsHtml += `
        <div class="district-rep">
          <div class="rep-header">
            <h4>${escapeHtml(rep.name)}</h4>
            ${party}
          </div>
          ${voterCountHtml}
          ${rep.city ? `<p class="rep-location">${escapeHtml(rep.city)}, ${escapeHtml(rep.county || '')}</p>` : ''}
          ${contactHtml}
          ${websiteHtml}
        </div>
      `;
    }

    return `
      <div class="district-context">
        ${renderSectionHeading('h3', 'District legislators', 'legislators')}
        ${repsHtml}
      </div>
    `;
  };

  const renderUserDistrictPanel = () => {
    if (!userAuth || !userAuth.authenticated || !userAuth.user) return '';
    const av = userAuth.user.address_verification;
    if (!av || !av.verified_at) return '';

    const houseDist = av.state_house_dist;
    const senateDist = av.state_senate_dist;
    if (!houseDist && !senateDist) return '';

    let linksHtml = '<p class="user-district-links">View results for your district: ';
    const links = [];
    if (houseDist) {
      const houseLabel = normalizeDistrictNumber(houseDist, 2);
      const houseKey = buildGeoKey('state_house', houseDist);
      if (houseKey) {
        links.push(`<a href="#" class="user-district-link" data-geo-type="state_house" data-geo-key="${houseKey}">HD-${houseLabel}</a>`);
      }
    }
    if (senateDist) {
      const senateLabel = normalizeDistrictNumber(senateDist, 2);
      const senateKey = buildGeoKey('state_senate', senateDist);
      if (senateKey) {
        links.push(`<a href="#" class="user-district-link" data-geo-type="state_senate" data-geo-key="${senateKey}">SD-${senateLabel}</a>`);
      }
    }
    linksHtml += `${links.join(' | ')}</p>`;

    return `
      <div class="user-district-panel">
        ${renderSectionHeading('h4', 'Your Verified Districts', 'verified-districts')}
        ${linksHtml}
      </div>
    `;
  };

  const render = async () => {
    if (!slug || !surveyMeta) {
      renderWaitingState();
      return;
    }

    if (currentGeoType === 'state_house' || currentGeoType === 'state_senate') {
      try {
        const ctxResp = await fetch(`/api/results/district-context?geo_type=${encodeURIComponent(currentGeoType)}&geo_key=${encodeURIComponent(currentGeoKey)}`);
        districtContext = ctxResp.ok ? await ctxResp.json() : null;
      } catch (e) {
        districtContext = null;
      }
    } else {
      districtContext = null;
    }

    const summaryUrl = `/api/results/summary?slug=${encodeURIComponent(slug)}&tier=${currentTier}&geo_type=${currentGeoType}&geo_key=${encodeURIComponent(currentGeoKey)}`;
    const summaryResp = await fetch(summaryUrl);
    const summaryData = await summaryResp.json();

    if (!summaryData.ok) {
      renderFriendlyError('Error', summaryData.error || 'Unknown error');
      return;
    }

    document.title = `Results: ${surveyMeta.title} - Grassroots Movement`;

    let html = `
      <div class="results-header">
        <h1>${escapeHtml(surveyMeta.title)} Results</h1>
        ${renderBadges(summaryData)}
      </div>
      ${renderControls()}
    `;

    const userDistrictHtml = renderUserDistrictPanel();
    if (userDistrictHtml) {
      html += userDistrictHtml;
    }

    const districtHtml = renderDistrictContext();
    if (districtHtml) {
      html += districtHtml;
    }

    if (summaryData.suppressed) {
      html += renderSuppressed(summaryData);
    } else {
      for (const q of summaryData.questions) {
        html += renderQuestion(q, surveyMeta.questions || []);
      }
    }

    if (surveyMeta.scope === 'wy' || currentGeoKey.startsWith('WY')) {
      html += renderVoterPanel();
    }

    container.innerHTML = html;

    const tierSelect = document.getElementById('tier-select');
    const geoSelect = document.getElementById('geo-select');

    if (tierSelect) {
      tierSelect.addEventListener('change', async (event) => {
        const nextTier = parseInt(event.target.value, 10);
        await applyFilter({ tier: nextTier });
      });
    }

    if (geoSelect) {
      geoSelect.addEventListener('change', async (event) => {
        const [geoType, geoKey] = event.target.value.split('|');
        await applyFilter({ tier: 2, geoType, geoKey });
      });
    }

    const userDistrictLinks = container.querySelectorAll('.user-district-link');
    userDistrictLinks.forEach((link) => {
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        await applyFilter({
          tier: 2,
          geoType: link.dataset.geoType,
          geoKey: link.dataset.geoKey,
        });
      });
    });
  };

  const loadGeoOptions = async () => {
    const resp = await fetch(`/api/results/geo-options?slug=${encodeURIComponent(slug)}&tier=${currentTier}`);
    const data = await resp.json();
    geoOptions = data.ok ? data.options || [] : [];
  };

  const getDefaultTierTwoSelection = () => {
    const stateOpt = geoOptions.find((option) => option.geo_type === 'state');
    if (stateOpt) {
      return { geoType: stateOpt.geo_type, geoKey: stateOpt.geo_key };
    }
    const firstOpt = geoOptions[0];
    if (firstOpt) {
      return { geoType: firstOpt.geo_type, geoKey: firstOpt.geo_key };
    }
    return { geoType: 'all', geoKey: 'ALL' };
  };

  const resolveFilterState = async ({ tier, geoType, geoKey }) => {
    const resolvedTier = tier === 2 ? 2 : 1;
    if (resolvedTier === 1) {
      return { tier: 1, geoType: 'all', geoKey: 'ALL' };
    }

    currentTier = 2;
    await loadGeoOptions();

    if (geoType && geoKey) {
      const matchingOption = geoOptions.find((option) => option.geo_type === geoType && option.geo_key === geoKey);
      if (matchingOption) {
        return { tier: 2, geoType: matchingOption.geo_type, geoKey: matchingOption.geo_key };
      }
    }

    const fallback = getDefaultTierTwoSelection();
    return { tier: 2, geoType: fallback.geoType, geoKey: fallback.geoKey };
  };

  const applyFilter = async ({
    tier = currentTier,
    geoType = currentGeoType,
    geoKey = currentGeoKey,
    updateUrl = true,
  } = {}) => {
    const resolved = await resolveFilterState({ tier, geoType, geoKey });
    currentTier = resolved.tier;
    currentGeoType = resolved.geoType;
    currentGeoKey = resolved.geoKey;
    if (updateUrl) {
      updateUrlForState();
    }
    await render();
  };

  const loadVoterSnapshots = async () => {
    try {
      const resp = await fetch('/data/wy_voter_registration_snapshots.json');
      if (resp.ok) {
        voterSnapshots = await resp.json();
      }
    } catch (e) {
      return;
    }
  };

  const loadUserAuth = async () => {
    try {
      const resp = await fetch('/api/auth/me', { credentials: 'include' });
      if (resp.ok) {
        userAuth = await resp.json();
      }
    } catch (e) {
      return;
    }
  };

  const loadStaticSurveys = async () => {
    try {
      const response = await fetch('/data/surveys.json', { credentials: 'same-origin' });
      if (!response.ok) {
        return [];
      }
      const rawText = await response.text();
      const data = JSON.parse(stripJsonc(rawText));
      if (!Array.isArray(data)) {
        return [];
      }
      return data
        .filter((survey) => survey.status === 'active' && typeof survey.href === 'string')
        .map((survey) => {
          const match = survey.href.match(/^\/surveys\/([^/]+)\/?$/);
          return {
            slug: match ? decodeURIComponent(match[1]) : '',
            title: survey.title || 'Survey',
          };
        })
        .filter((survey) => survey.slug);
    } catch (error) {
      return [];
    }
  };

  const loadAvailableSurveys = async () => {
    let apiSurveys = [];
    try {
      const response = await fetch('/api/surveys/list', { credentials: 'same-origin' });
      if (response.ok) {
        const data = await response.json();
        apiSurveys = Array.isArray(data)
          ? data
            .filter((survey) => survey.status === 'active' && survey.slug)
            .map((survey) => ({
              slug: survey.slug,
              title: survey.title || 'Survey',
            }))
          : [];
      }
    } catch (error) {
      apiSurveys = [];
    }

    const staticSurveys = await loadStaticSurveys();
    const merged = [...apiSurveys];
    staticSurveys.forEach((survey) => {
      if (!merged.some((item) => item.slug === survey.slug)) {
        merged.push(survey);
      }
    });

    availableSurveys = merged.sort((a, b) => a.title.localeCompare(b.title));
  };

  const populateSelector = () => {
    const options = ['<option value="">Choose a survey</option>'];
    availableSurveys.forEach((survey) => {
      const selected = survey.slug === slug ? ' selected' : '';
      options.push(`<option value="${escapeHtml(survey.slug)}"${selected}>${escapeHtml(survey.title)}</option>`);
    });
    surveySelect.innerHTML = options.join('');
  };

  const loadSelectedSurvey = async () => {
    if (!slug) {
      resetResultState();
      renderWaitingState();
      return;
    }

    const metaResp = await fetch(`/api/results/meta?slug=${encodeURIComponent(slug)}`);
    const metaData = await metaResp.json();

    if (!metaData.ok) {
      resetResultState();
      renderFriendlyError('Survey not found', metaData.error || 'Please choose another survey.');
      return;
    }

    surveyMeta = metaData;
    const urlFilter = getFilterFromUrl();
    await applyFilter({
      tier: urlFilter.tier,
      geoType: urlFilter.geoType,
      geoKey: urlFilter.geoKey,
      updateUrl: true,
    });
  };

  surveySelect.addEventListener('change', async (event) => {
    slug = (event.target.value || '').trim();
    resetResultState();
    updateUrlForState();

    if (!slug) {
      renderWaitingState();
      return;
    }

    container.innerHTML = '<div class="results-loading">Loading results...</div>';
    try {
      await loadSelectedSurvey();
    } catch (error) {
      renderFriendlyError('Error loading results', error.message);
    }
  });

  const init = async () => {
    container.innerHTML = '<div class="results-loading">Loading available surveys...</div>';

    try {
      await Promise.all([
        loadAvailableSurveys(),
        loadVoterSnapshots(),
        loadUserAuth(),
      ]);

      const requestedSlug = getSlugFromUrl();
      const validSlug = availableSurveys.some((survey) => survey.slug === requestedSlug) ? requestedSlug : '';
      slug = validSlug;
      populateSelector();

      if (requestedSlug && !validSlug) {
        updateUrlForState();
        renderFriendlyError('Survey not found', 'That survey is not available. Please choose a survey from the list.');
        return;
      }

      if (!slug) {
        renderWaitingState();
        return;
      }

      container.innerHTML = '<div class="results-loading">Loading results...</div>';
      await loadSelectedSurvey();
    } catch (error) {
      renderFriendlyError('Error loading results', error.message);
    }
  };

  init();
})();
