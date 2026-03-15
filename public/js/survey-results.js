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

  const getSlugFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const querySlug = (urlParams.get('slug') || '').trim();
    const pathMatch = window.location.pathname.match(/\/surveys\/results\/([^/]+)/);
    if (pathMatch) {
      return decodeURIComponent(pathMatch[1]);
    }
    return querySlug;
  };

  const updateUrlForSlug = (nextSlug) => {
    const url = new URL(window.location.href);
    if (nextSlug) {
      url.pathname = '/surveys/results/';
      url.searchParams.set('slug', nextSlug);
    } else {
      url.pathname = '/surveys/results/';
      url.searchParams.delete('slug');
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

  const renderControls = () => {
    const tierOptions = `
      <option value="1" ${currentTier === 1 ? 'selected' : ''}>Tier 1: All Responses</option>
      <option value="2" ${currentTier === 2 ? 'selected' : ''}>Tier 2: Verified Address</option>
    `;

    let geoOptionsHtml = '<option value="all|ALL">Statewide (All)</option>';
    if (currentTier === 2) {
      const stateOpts = geoOptions.filter((o) => o.geo_type === 'state');
      const usHouseOpts = geoOptions.filter((o) => o.geo_type === 'us_house');
      const stateHouseOpts = geoOptions.filter((o) => o.geo_type === 'state_house');
      const stateSenateOpts = geoOptions.filter((o) => o.geo_type === 'state_senate');

      if (stateOpts.length > 0) {
        geoOptionsHtml += '<optgroup label="State">';
        for (const opt of stateOpts) {
          const selected = opt.geo_type === currentGeoType && opt.geo_key === currentGeoKey ? 'selected' : '';
          const label = opt.geo_key === 'WY' ? 'Wyoming' : opt.geo_key;
          geoOptionsHtml += `<option value="${opt.geo_type}|${opt.geo_key}" ${selected}>${label} (n=${opt.response_count})</option>`;
        }
        geoOptionsHtml += '</optgroup>';
      }

      if (usHouseOpts.length > 0) {
        geoOptionsHtml += '<optgroup label="US House">';
        for (const opt of usHouseOpts) {
          const selected = opt.geo_type === currentGeoType && opt.geo_key === currentGeoKey ? 'selected' : '';
          geoOptionsHtml += `<option value="${opt.geo_type}|${opt.geo_key}" ${selected}>At-Large (n=${opt.response_count})</option>`;
        }
        geoOptionsHtml += '</optgroup>';
      }

      if (stateHouseOpts.length > 0) {
        geoOptionsHtml += '<optgroup label="State House">';
        for (const opt of stateHouseOpts) {
          const selected = opt.geo_type === currentGeoType && opt.geo_key === currentGeoKey ? 'selected' : '';
          const distNum = opt.geo_key.split('-HD-')[1] || opt.geo_key;
          geoOptionsHtml += `<option value="${opt.geo_type}|${opt.geo_key}" ${selected}>HD-${distNum} (n=${opt.response_count})</option>`;
        }
        geoOptionsHtml += '</optgroup>';
      }

      if (stateSenateOpts.length > 0) {
        geoOptionsHtml += '<optgroup label="State Senate">';
        for (const opt of stateSenateOpts) {
          const selected = opt.geo_type === currentGeoType && opt.geo_key === currentGeoKey ? 'selected' : '';
          const distNum = opt.geo_key.split('-SD-')[1] || opt.geo_key;
          geoOptionsHtml += `<option value="${opt.geo_type}|${opt.geo_key}" ${selected}>SD-${distNum} (n=${opt.response_count})</option>`;
        }
        geoOptionsHtml += '</optgroup>';
      }
    }

    return `
      <div class="results-controls">
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
      <h3>Not enough responses yet</h3>
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
        <h3>District Representative</h3>
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
      const houseKey = `WY-HD-${String(houseDist).padStart(2, '0')}`;
      links.push(`<a href="#" class="user-district-link" data-geo-type="state_house" data-geo-key="${houseKey}">House District ${houseDist}</a>`);
    }
    if (senateDist) {
      const senateKey = `WY-SD-${String(senateDist).padStart(2, '0')}`;
      links.push(`<a href="#" class="user-district-link" data-geo-type="state_senate" data-geo-key="${senateKey}">Senate District ${senateDist}</a>`);
    }
    linksHtml += `${links.join(' | ')}</p>`;

    return `
      <div class="user-district-panel">
        <h4>Your Verified Districts</h4>
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
        currentTier = parseInt(event.target.value, 10);
        if (currentTier === 1) {
          currentGeoType = 'all';
          currentGeoKey = 'ALL';
        } else {
          await loadGeoOptions();
          const stateOpt = geoOptions.find((o) => o.geo_type === 'state');
          if (stateOpt) {
            currentGeoType = stateOpt.geo_type;
            currentGeoKey = stateOpt.geo_key;
          }
        }
        render();
      });
    }

    if (geoSelect) {
      geoSelect.addEventListener('change', (event) => {
        const [geoType, geoKey] = event.target.value.split('|');
        currentGeoType = geoType;
        currentGeoKey = geoKey;
        render();
      });
    }

    const userDistrictLinks = container.querySelectorAll('.user-district-link');
    userDistrictLinks.forEach((link) => {
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        currentTier = 2;
        await loadGeoOptions();
        currentGeoType = link.dataset.geoType;
        currentGeoKey = link.dataset.geoKey;
        render();
      });
    });
  };

  const loadGeoOptions = async () => {
    const resp = await fetch(`/api/results/geo-options?slug=${encodeURIComponent(slug)}&tier=${currentTier}`);
    const data = await resp.json();
    geoOptions = data.ok ? data.options || [] : [];
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
    await render();
  };

  surveySelect.addEventListener('change', async (event) => {
    slug = (event.target.value || '').trim();
    updateUrlForSlug(slug);
    resetResultState();

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
        updateUrlForSlug('');
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
