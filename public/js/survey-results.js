/* public/js/survey-results.js */
(() => {
  const container = document.getElementById('results-container');
  if (!container) return;

  // Get slug from URL query param or path
  const urlParams = new URLSearchParams(window.location.search);
  let slug = urlParams.get('slug');
  
  // Also check path for /surveys/results/<slug> pattern
  const pathMatch = window.location.pathname.match(/\/surveys\/results\/([^/]+)/);
  if (pathMatch) {
    slug = decodeURIComponent(pathMatch[1]);
  }

  if (!slug) {
    container.innerHTML = '<div class="results-error"><h3>No survey specified</h3><p>Please select a survey to view results.</p></div>';
    return;
  }

  // State
  let surveyMeta = null;
  let currentTier = 1;
  let currentGeoType = 'all';
  let currentGeoKey = 'ALL';
  let geoOptions = [];
  let voterSnapshots = null;

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const formatQuestionName = (name) => {
    // Convert snake_case to Title Case
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  const renderControls = () => {
    const tierOptions = `
      <option value="1" ${currentTier === 1 ? 'selected' : ''}>Tier 1: All Responses</option>
      <option value="2" ${currentTier === 2 ? 'selected' : ''}>Tier 2: Verified Address</option>
    `;

    let geoOptionsHtml = '<option value="all|ALL">Statewide (All)</option>';
    if (currentTier === 2) {
      // Filter options by type for cleaner grouping
      const stateOpts = geoOptions.filter(o => o.geo_type === 'state');
      const usHouseOpts = geoOptions.filter(o => o.geo_type === 'us_house');
      const stateHouseOpts = geoOptions.filter(o => o.geo_type === 'state_house');
      const stateSenateOpts = geoOptions.filter(o => o.geo_type === 'state_senate');

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

  const renderSuppressed = (data) => {
    return `
      <div class="results-suppressed">
        <h3>Not enough responses yet</h3>
        <p>Results are shown when at least ${data.min_publish_n} responses are collected for this filter combination.</p>
        <p>Current responses: ${data.n}</p>
      </div>
    `;
  };

  const renderQuestion = (q, questionDefs) => {
    // Find question definition for better labels
    const def = questionDefs.find(d => d.name === q.question_name);
    const title = def?.title || formatQuestionName(q.question_name);

    let barsHtml = '';
    for (const t of q.totals) {
      const pct = t.pct || 0;
      const label = t.choice_value;
      barsHtml += `
        <div class="results-bar">
          <div class="results-bar-label">${escapeHtml(label)}</div>
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
      const date = new Date(snap.as_of).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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

  const render = async () => {
    if (!surveyMeta) {
      container.innerHTML = '<div class="results-error"><h3>Survey not found</h3><p>Could not load survey metadata.</p></div>';
      return;
    }

    // Fetch summary data
    const summaryUrl = `/api/results/summary?slug=${encodeURIComponent(slug)}&tier=${currentTier}&geo_type=${currentGeoType}&geo_key=${encodeURIComponent(currentGeoKey)}`;
    const summaryResp = await fetch(summaryUrl);
    const summaryData = await summaryResp.json();

    if (!summaryData.ok) {
      container.innerHTML = `<div class="results-error"><h3>Error</h3><p>${escapeHtml(summaryData.error || 'Unknown error')}</p></div>`;
      return;
    }

    // Update page title
    document.title = `Results: ${surveyMeta.title} - Grassroots Movement`;

    let html = `
      <div class="results-header">
        <h1>${escapeHtml(surveyMeta.title)} Results</h1>
        ${renderBadges(summaryData)}
      </div>
      ${renderControls()}
    `;

    if (summaryData.suppressed) {
      html += renderSuppressed(summaryData);
    } else {
      for (const q of summaryData.questions) {
        html += renderQuestion(q, surveyMeta.questions || []);
      }
    }

    // Show voter panel for Wyoming-focused surveys
    if (surveyMeta.scope === 'wy' || currentGeoKey.startsWith('WY')) {
      html += renderVoterPanel();
    }

    container.innerHTML = html;

    // Attach event listeners
    const tierSelect = document.getElementById('tier-select');
    const geoSelect = document.getElementById('geo-select');

    if (tierSelect) {
      tierSelect.addEventListener('change', async (e) => {
        currentTier = parseInt(e.target.value, 10);
        if (currentTier === 1) {
          currentGeoType = 'all';
          currentGeoKey = 'ALL';
        } else {
          // Load geo options for tier 2
          await loadGeoOptions();
          // Default to state if available
          const stateOpt = geoOptions.find(o => o.geo_type === 'state');
          if (stateOpt) {
            currentGeoType = stateOpt.geo_type;
            currentGeoKey = stateOpt.geo_key;
          }
        }
        render();
      });
    }

    if (geoSelect) {
      geoSelect.addEventListener('change', (e) => {
        const [geoType, geoKey] = e.target.value.split('|');
        currentGeoType = geoType;
        currentGeoKey = geoKey;
        render();
      });
    }
  };

  const loadGeoOptions = async () => {
    const resp = await fetch(`/api/results/geo-options?slug=${encodeURIComponent(slug)}&tier=${currentTier}`);
    const data = await resp.json();
    if (data.ok) {
      geoOptions = data.options || [];
    }
  };

  const loadVoterSnapshots = async () => {
    try {
      const resp = await fetch('/data/wy_voter_registration_snapshots.json');
      if (resp.ok) {
        voterSnapshots = await resp.json();
      }
    } catch (e) {
      // Ignore errors loading voter data
    }
  };

  const init = async () => {
    try {
      // Load survey metadata
      const metaResp = await fetch(`/api/results/meta?slug=${encodeURIComponent(slug)}`);
      const metaData = await metaResp.json();

      if (!metaData.ok) {
        container.innerHTML = `<div class="results-error"><h3>Survey not found</h3><p>${escapeHtml(metaData.error || 'Unknown error')}</p></div>`;
        return;
      }

      surveyMeta = metaData;

      // Load voter registration data
      await loadVoterSnapshots();

      // Initial render
      await render();
    } catch (error) {
      container.innerHTML = `<div class="results-error"><h3>Error loading results</h3><p>${escapeHtml(error.message)}</p></div>`;
    }
  };

  init();
})();
