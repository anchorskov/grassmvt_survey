/* public/js/races.js */
/* Client-side race data loader. Fetches from /api/races and /api/races/:slug/candidates. */

const escH = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* ── Candidate card HTML ─────────────────────────────────────────────────── */

const candidateCardHtml = (c) => {
  const rows = [
    c.filing_status ? `<div><dt class="font-bold uppercase tracking-wide text-wy-rust text-sm">Status</dt><dd class="mt-1 text-wy-charcoal">${escH(c.filing_status)}</dd></div>` : '',
    c.campaign_website ? `<div><dt class="font-bold uppercase tracking-wide text-wy-rust text-sm">Campaign website</dt><dd class="mt-1 text-wy-charcoal"><a href="${escH(c.campaign_website)}" class="underline" rel="noopener noreferrer">${escH(c.campaign_website)}</a></dd></div>` : '<div><dt class="font-bold uppercase tracking-wide text-wy-rust text-sm">Campaign website</dt><dd class="mt-1 text-wy-charcoal">Not added yet</dd></div>',
    c.public_phone ? `<div><dt class="font-bold uppercase tracking-wide text-wy-rust text-sm">Phone</dt><dd class="mt-1 text-wy-charcoal">${escH(c.public_phone)}</dd></div>` : '',
    c.public_email ? `<div><dt class="font-bold uppercase tracking-wide text-wy-rust text-sm">Email</dt><dd class="mt-1 text-wy-charcoal">${escH(c.public_email)}</dd></div>` : '',
    c.source_note ? `<div><dt class="font-bold uppercase tracking-wide text-wy-rust text-sm">Source note</dt><dd class="mt-1 text-wy-charcoal/70 italic text-sm">${escH(c.source_note)}</dd></div>` : '',
  ].filter(Boolean).join('');
  return `<article class="rounded-lg border border-wy-dust bg-wy-bone/40 p-5">
  <h3 class="mb-4 font-serif text-2xl font-semibold text-wy-charcoal">${escH(c.candidate_name)}</h3>
  <dl class="space-y-3 text-sm">${rows}</dl>
</article>`;
};

/* ── Support poll fieldset HTML ──────────────────────────────────────────── */

const SUPPORT_CHOICES = [
  'Strongly support',
  'Lean support',
  'Neutral or undecided',
  'Lean oppose',
  'Strongly oppose',
  'I need more information',
  'I am unfamiliar with this candidate',
];

const supportFieldsetHtml = (c) => {
  const radios = SUPPORT_CHOICES.map(
    (choice) =>
      `<label class="flex items-start gap-3 rounded-md border border-wy-dust/70 bg-wy-bone/30 px-3 py-2 text-wy-charcoal">
        <input class="mt-1" type="radio" name="support-${escH(c.candidate_slug)}" value="${escH(choice)}" />
        <span>${escH(choice)}</span>
      </label>`
  ).join('');
  return `<fieldset class="rounded-lg border border-wy-dust bg-white p-5">
  <legend class="px-1 font-serif text-xl font-semibold text-wy-charcoal">${escH(c.candidate_name)}</legend>
  <p class="mb-4 mt-2 text-wy-charcoal">Based on what you know today, do you support this candidate for this office?</p>
  <div class="grid gap-2 sm:grid-cols-2">${radios}</div>
</fieldset>`;
};

/* ── Race hub card enrichment ────────────────────────────────────────────── */

async function enrichHubCards() {
  const grid = document.getElementById('race-cards-grid');
  if (!grid) return;

  let data;
  try {
    const res = await fetch('/api/races');
    if (!res.ok) return;
    data = await res.json();
  } catch (_e) {
    return;
  }

  const races = data.races || [];
  const bySlug = Object.fromEntries(races.map((r) => [r.race_slug, r]));

  grid.querySelectorAll('article[data-race-slug]').forEach((card) => {
    const slug = card.getAttribute('data-race-slug');
    const race = bySlug[slug];
    if (!race) return;

    const badge = card.querySelector('.race-candidate-count');
    if (badge) {
      badge.textContent =
        race.candidate_count === 1
          ? '1 candidate'
          : `${race.candidate_count} candidates`;
      badge.classList.remove('is-hidden');
    }
  });
}

/* ── Individual race page candidate loader ───────────────────────────────── */

async function loadRaceCandidates(raceSlug, opts) {
  const candidateGrid = document.getElementById(opts.candidateGridId || 'candidates-grid');
  const pollContainer = document.getElementById(opts.pollContainerId || 'poll-fieldsets');
  if (!candidateGrid && !pollContainer) return;

  let data;
  try {
    const res = await fetch(`/api/races/${encodeURIComponent(raceSlug)}/candidates`);
    if (!res.ok) return;
    data = await res.json();
  } catch (_e) {
    return;
  }

  const candidates = data.candidates || [];
  if (candidates.length === 0) return;

  if (candidateGrid) {
    candidateGrid.innerHTML = candidates.map(candidateCardHtml).join('');
  }

  if (pollContainer) {
    const fieldsets = candidates.map(supportFieldsetHtml).join('');
    pollContainer.innerHTML = fieldsets;
  }

  // Update poll/results links if survey_slug is available
  const surveySlug = data.race && data.race.survey_slug;
  if (surveySlug) {
    document.querySelectorAll('[data-survey-link="poll"]').forEach((el) => {
      el.setAttribute('href', `/surveys/${encodeURIComponent(surveySlug)}`);
      el.textContent = 'Take the Poll';
    });
    document.querySelectorAll('[data-survey-link="results"]').forEach((el) => {
      el.setAttribute('href', `/surveys/results/?slug=${encodeURIComponent(surveySlug)}`);
      el.textContent = 'View Results';
    });
    // Render bar-chart results if a results container is present
    const resultsContainerId = opts.resultsContainerId || 'race-results-root';
    if (document.getElementById(resultsContainerId)) {
      loadRaceResults(resultsContainerId, surveySlug, candidates);
    }
  }
}

/* ── Race results — summary score bar + individual detail cards ──────────── */
// Top section: one score bar per candidate sorted by weighted net score.
// Bar extends right (green) for net positive, left (rust) for net negative
// from a shared neutral centre line. Candidate names link to detail cards.
// Bottom section: per-choice breakdown (collapsed, revealed on click).
//
// Score = Σ(count × weight) / totalCount × 100
// Weights: +3 Strongly support, +1 Lean support, 0 neutral tiers,
//          −1 Lean oppose, −3 Strongly oppose. Range ≈ −30 … +30.

const CHOICE_WEIGHTS = {
  'Strongly support':                    3,
  'Lean support':                        1,
  'Neutral or undecided':                0,
  'I need more information':             0,
  'I am unfamiliar with this candidate': 0,
  'Lean oppose':                        -1,
  'Strongly oppose':                    -3,
};

// Semantic display order for detail breakdown bars
const CHOICE_DISPLAY_ORDER = [
  'Strongly support',
  'Lean support',
  'Neutral or undecided',
  'I need more information',
  'I am unfamiliar with this candidate',
  'Lean oppose',
  'Strongly oppose',
];

// Colours for detail breakdown bars
const SEG_COLOR = {
  'Strongly support':                    '#2a6b3a',
  'Lean support':                        '#74b587',
  'Neutral or undecided':                '#d4cfc8',
  'I need more information':             '#bfb9b0',
  'I am unfamiliar with this candidate': '#a8a39d',
  'Lean oppose':                         '#e8998d',
  'Strongly oppose':                     '#b84c2a',
};

// Max theoretical score magnitude (weight=3, all responses in one direction)
const SCORE_MAX = 30;

async function loadRaceResults(containerId, surveySlug, candidates) {
  const root = document.getElementById(containerId);
  if (!root) return;

  let data;
  try {
    const res = await fetch(
      `/api/results/summary?slug=${encodeURIComponent(surveySlug)}&tier=1&geo_type=all&geo_key=ALL`,
      { cache: 'no-store' }
    );
    if (!res.ok) return;
    data = await res.json();
  } catch (_e) {
    return;
  }

  if (data.suppressed) {
    root.innerHTML = `<p class="race-results-suppressed">
      Results will appear here once enough responses are collected
      (need ${data.min_publish_n}, have ${data.n} so far).
    </p>`;
    return;
  }

  if (!data.questions || data.questions.length === 0) {
    root.innerHTML = '<p class="race-results-pending">Results will appear here when responses are available.</p>';
    return;
  }

  // Build lookup: question_name → {choice_value: {count, pct}}
  const byQuestion = {};
  (data.questions || []).forEach((q) => {
    const map = {};
    q.totals.forEach((t) => { map[t.choice_value] = t; });
    byQuestion[q.question_name] = map;
  });

  // Build per-candidate result objects, compute weighted net score
  const results = (candidates || []).map((c) => {
    const qName = `support_${c.candidate_slug.replace(/-/g, '_')}`;
    const choiceMap = byQuestion[qName] || {};
    const ordered = CHOICE_DISPLAY_ORDER.map((label) => ({
      label,
      count: choiceMap[label]?.count || 0,
      pct:   choiceMap[label]?.pct   || 0,
    }));
    const totalCount = ordered.reduce((s, t) => s + t.count, 0);
    const weightedSum = ordered.reduce((s, t) => s + t.count * (CHOICE_WEIGHTS[t.label] || 0), 0);
    const score = totalCount > 0 ? Math.round((weightedSum / totalCount) * 100) / 10 : null;
    return { c, qName, ordered, totalCount, score };
  }).sort((a, b) => (b.score ?? -999) - (a.score ?? -999));

  const updatedLabel = data.updated_at
    ? `Updated ${new Date(data.updated_at).toLocaleDateString()}`
    : '';

  // ── Summary score-bar rows ───────────────────────────────────────────────
  const summaryRows = results.map(({ c, totalCount, score }) => {
    const anchor   = `rc-${c.candidate_slug}`;
    const scoreVal = score === null ? '—' : (score > 0 ? `+${score}` : `${score}`);
    const scoreCls = score === null ? '' : score > 0 ? 'rrs-score--pos' : score < 0 ? 'rrs-score--neg' : '';

    // Fill width = how far the bar extends from centre (0–50% of track)
    const fillPct  = score === null ? 0 : Math.min(Math.abs(score), SCORE_MAX) / SCORE_MAX * 50;
    const fillCls  = score !== null && score < 0 ? 'rrs-bar-fill--neg' : 'rrs-bar-fill--pos';
    const fillTitle = `Net score: ${scoreVal}. Scale −${SCORE_MAX} (all oppose) to +${SCORE_MAX} (all support).`;

    return `<div class="rrs-row">
      <a class="rrs-name" href="#${anchor}">${escH(c.candidate_name)}</a>
      <div class="rrs-bar-wrap">
        <div class="rrs-bar-track" title="${fillTitle}">
          <div class="rrs-bar-fill ${fillCls}" style="width:${fillPct}%"></div>
        </div>
      </div>
      <span class="rrs-score ${scoreCls}">${scoreVal}</span>
    </div>`;
  }).join('');

  const totalN = results.reduce((s, r) => s + r.totalCount, 0);
  const summaryMeta = `<p class="rrs-meta">${totalN.toLocaleString()} total responses${updatedLabel ? ' · ' + updatedLabel : ''} &nbsp;·&nbsp; Score: −${SCORE_MAX} = all oppose &nbsp;·&nbsp; +${SCORE_MAX} = all support</p>`;

  // ── Individual detail cards ──────────────────────────────────────────────
  const detailCards = results.map(({ c, ordered, totalCount }) => {
    const anchor = `rc-${c.candidate_slug}`;
    const bars = ordered.map((t) => {
      if (t.count === 0) return '';
      return `<div class="race-results-bar">
        <div class="race-results-bar__label">${escH(t.label)}</div>
        <div class="race-results-bar__track">
          <div class="race-results-bar__fill" style="width:${t.pct}%;background:${SEG_COLOR[t.label]}"></div>
        </div>
        <div class="race-results-bar__value">${t.count} (${t.pct}%)</div>
      </div>`;
    }).join('');

    return `<article class="race-results-card" id="${anchor}">
      <h3 class="race-results-card__name">${escH(c.candidate_name)}</h3>
      ${bars || '<p class="race-results-pending" style="font-size:.875rem">No responses yet.</p>'}
      <div class="race-results-meta">
        <span class="race-results-meta__item">Total responses: <strong>${totalCount}</strong></span>
      </div>
    </article>`;
  }).join('');

  root.innerHTML = `
    <div class="rrs-summary">
      <div class="rrs-rows">${summaryRows}</div>
      ${summaryMeta}
    </div>
    <details class="rrs-details">
      <summary class="rrs-details__toggle">Candidate breakdowns</summary>
      <div class="race-results-grid" style="margin-top:1.25rem">${detailCards}</div>
    </details>`;
}

/* ── My Races loader ─────────────────────────────────────────────────────── */
// Fetches /api/races/my and renders into containerId.
// /api/races/my uses the existing session cookie — no extra auth needed.
// District data comes from existing getSessionUser + getAddressVerification
// server-side (same helpers used by /api/auth/me and geo-context routes).

const CATEGORY_ORDER = ['Federal', 'Statewide', 'State Legislature', 'Judicial Retention', 'County', 'Local Board'];

const raceCardHtml = (race) => {
  const pollBtn = race.survey_slug
    ? `<a class="button button--primary" href="/surveys/${encodeURIComponent(race.survey_slug)}">Take Poll</a>`
    : `<span class="inline-block rounded-md border border-wy-dust bg-wy-bone px-3 py-2 text-sm font-semibold text-wy-charcoal/60">Poll coming soon</span>`;
  const viewBtn = `<a class="button button--secondary" href="/races/${encodeURIComponent(race.race_slug)}#candidates">View Candidates</a>`;
  const resultBtn = race.survey_slug
    ? `<a class="button button--secondary" href="/surveys/results/?slug=${encodeURIComponent(race.survey_slug)}">View Results</a>`
    : '';
  const count = race.candidate_count === 1 ? '1 candidate' : `${race.candidate_count} candidates`;
  return `<article class="rounded-lg border border-wy-dust bg-white p-5">
  <p class="mb-2 text-xs font-bold uppercase tracking-widest text-wy-rust">${escH(race.race_category)}</p>
  <h3 class="mb-3 font-serif text-xl font-semibold leading-snug text-wy-charcoal">${escH(race.race_title)}</h3>
  <p class="mb-4 text-sm text-wy-charcoal/60">${escH(count)}</p>
  <div class="flex flex-wrap gap-2">${pollBtn} ${viewBtn} ${resultBtn}</div>
</article>`;
};

async function loadMyRaces(containerId, opts) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const categories =
    opts && Array.isArray(opts.categories) && opts.categories.length > 0
      ? new Set(opts.categories)
      : null;
  const filterRaces = (races) =>
    categories ? (races || []).filter((race) => categories.has(race.race_category)) : (races || []);

  // Build API URL — forward dev bypass params when present (local only)
  const apiUrl = new URL('/api/races/my', window.location.origin);
  if (opts && opts.devHouse) apiUrl.searchParams.set('_dev_house', opts.devHouse);
  if (opts && opts.devSenate) apiUrl.searchParams.set('_dev_senate', opts.devSenate);

  let data;
  try {
    const res = await fetch(apiUrl.toString(), { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error('API error');
    data = await res.json();
  } catch (_e) {
    root.innerHTML = '<p class="text-wy-charcoal/75">Unable to load races. Please try again.</p>';
    return;
  }

  if (!data.authenticated) {
    root.innerHTML = previewFormHtml();
    initPreviewForm(root);
    return;
  }

  if (!data.verified) {
    const visibleRaces = filterRaces(data.races);
    const statewideHtml = visibleRaces.map(raceCardHtml).join('');
    const statewideSection = visibleRaces.length
      ? `<p class="mb-2 text-sm font-semibold uppercase tracking-widest text-wy-rust">Available races</p>
    <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">${statewideHtml}</div>`
      : '';
    const verifyCopy = categories
      ? 'Your voter information has not been verified yet. Verify to see the district races tied to your voting area.'
      : 'Your voter information has not been verified yet. Statewide races are shown below. Verify to also see your State House and Senate district races.';
    root.innerHTML = `<div class="mb-8 rounded-lg border border-wy-amber-300 bg-amber-50 p-5 max-w-lg">
      <p class="font-semibold text-wy-charcoal mb-2">Verify to see your district races</p>
      <p class="text-wy-charcoal/75 mb-4 text-sm">${escH(verifyCopy)}</p>
      <a class="button button--primary" href="/verify-voter">Verify voter information</a>
    </div>
    ${statewideSection}`;
    return;
  }

  // Verified — group races by category in display order
  const races = filterRaces(data.races);
  const grouped = {};
  CATEGORY_ORDER.forEach((cat) => { grouped[cat] = []; });
  races.forEach((r) => {
    if (grouped[r.race_category]) grouped[r.race_category].push(r);
    else grouped[r.race_category] = [r];
  });

  let html = '';
  // Show district label at top
  const distLabel = [
    data.house_district ? `HD-${parseInt(data.house_district, 10)}` : null,
    data.senate_district ? `SD-${parseInt(data.senate_district, 10)}` : null,
  ].filter(Boolean).join(' • ');
  if (distLabel) {
    html += `<p class="mb-8 text-sm text-wy-charcoal/60">Showing races for your verified voting area: <strong class="text-wy-charcoal">${escH(distLabel)}</strong></p>`;
  }

  CATEGORY_ORDER.forEach((cat) => {
    const catRaces = grouped[cat] || [];
    if (catRaces.length === 0) return;
    html += `<div class="mb-10">
      <p class="mb-4 text-sm font-semibold uppercase tracking-widest text-wy-rust">${escH(cat)}</p>
      <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">${catRaces.map(raceCardHtml).join('')}</div>
    </div>`;
  });

  // Deferred notes
  if (data.notes && data.notes.length) {
    html += `<div class="mt-4 rounded-md border border-wy-dust bg-wy-bone px-4 py-3 text-sm text-wy-charcoal/75">
      ${data.notes.map((n) => `<p>${escH(n)}</p>`).join('')}
    </div>`;
  }

  root.innerHTML = html;
}

/* ── Candidate preview form (unauthenticated state) ─────────────────────── */

function previewFormHtml() {
  return `<div class="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
  <div class="flex-1 max-w-lg">
    <p class="mb-2 text-sm font-semibold uppercase tracking-widest text-wy-rust">Candidate preview</p>
    <h2 class="mb-3 font-serif text-2xl font-bold text-wy-charcoal">Find your candidates without an account</h2>
    <p class="mb-6 text-wy-charcoal/75 text-sm">
      Enter your name and ZIP code to preview candidates connected to your voting area.
      No account required for preview. Sign in to submit poll responses.
    </p>
    <form id="candidate-preview-form" novalidate>
      <div class="grid gap-4 sm:grid-cols-2 mb-4">
        <label class="block">
          <span class="block text-xs font-bold uppercase tracking-wide text-wy-charcoal mb-1">First name</span>
          <input id="cpf-first" type="text" autocomplete="given-name" required
            class="w-full rounded-md border border-wy-dust bg-white px-3 py-2 text-wy-charcoal" placeholder="Jane" />
        </label>
        <label class="block">
          <span class="block text-xs font-bold uppercase tracking-wide text-wy-charcoal mb-1">Last name</span>
          <input id="cpf-last" type="text" autocomplete="family-name" required
            class="w-full rounded-md border border-wy-dust bg-white px-3 py-2 text-wy-charcoal" placeholder="Smith" />
        </label>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 mb-4">
        <label class="block">
          <span class="block text-xs font-bold uppercase tracking-wide text-wy-charcoal mb-1">City</span>
          <input id="cpf-city" type="text" autocomplete="address-level2" required
            class="w-full rounded-md border border-wy-dust bg-white px-3 py-2 text-wy-charcoal" placeholder="Casper" />
        </label>
        <label class="block" id="cpf-street-row">
          <span class="block text-xs font-bold uppercase tracking-wide text-wy-charcoal mb-1">Street address <span class="font-normal normal-case text-wy-charcoal/50">(optional — helps narrow results)</span></span>
          <input id="cpf-street" type="text" autocomplete="street-address"
            class="w-full rounded-md border border-wy-dust bg-white px-3 py-2 text-wy-charcoal" placeholder="123 Main St" />
        </label>
      </div>
      <div class="mb-4">
        <label class="block">
          <span class="block text-xs font-bold uppercase tracking-wide text-wy-charcoal mb-1">ZIP code <span class="font-normal normal-case text-wy-charcoal/50">(optional — used only for address lookup fallback)</span></span>
          <input id="cpf-zip" type="text" inputmode="numeric" maxlength="5" autocomplete="postal-code"
            class="w-64 rounded-md border border-wy-dust bg-white px-3 py-2 text-wy-charcoal" placeholder="82601" />
        </label>
      </div>
      <div id="cpf-turnstile-row" class="mb-4 hidden"></div>
      <p id="cpf-error" class="mb-3 text-sm text-red-700 hidden"></p>
      <button id="cpf-submit" type="submit" class="button button--primary">Find My Candidates</button>
    </form>
    <div id="cpf-results" class="hidden mt-8"></div>
  </div>
  <div class="shrink-0 max-w-xs">
    <div class="rounded-lg border border-wy-dust bg-wy-bone p-6">
      <p class="font-semibold text-wy-charcoal mb-3">Sign in for full access</p>
      <p class="text-wy-charcoal/75 mb-4 text-sm">Create an account or sign in, then verify your Wyoming voter information to submit poll responses and save your candidate matches.</p>
      <button class="button button--primary" type="button" data-auth-open>Sign in or create account</button>
    </div>
  </div>
</div>`;
}

async function initPreviewForm(root) {
  const form    = root.querySelector('#candidate-preview-form');
  const first   = root.querySelector('#cpf-first');
  const last    = root.querySelector('#cpf-last');
  const city    = root.querySelector('#cpf-city');
  const zip     = root.querySelector('#cpf-zip');
  const street  = root.querySelector('#cpf-street');
  const tsRow   = root.querySelector('#cpf-turnstile-row');
  const errEl   = root.querySelector('#cpf-error');
  const results = root.querySelector('#cpf-results');
  const submit  = root.querySelector('#cpf-submit');
  if (!form) return;

  // Fetch Turnstile config from existing endpoint
  let tsConfig = { siteKey: '', bypass: true };
  let tsToken = '';
  try {
    const tsRes = await fetch('/api/auth/turnstile', { credentials: 'include' });
    if (tsRes.ok) tsConfig = await tsRes.json();
  } catch (_e) {
    tsConfig = { siteKey: '', bypass: true };
  }

  if (!tsConfig.bypass && tsConfig.siteKey) {
    tsRow.classList.remove('hidden');
    tsRow.innerHTML = `<div id="cpf-ts-widget"></div>`;
    const loadTurnstile = () => {
      if (window.turnstile) return Promise.resolve();
      if (window.__turnstilePromise) return window.__turnstilePromise;
      window.__turnstilePromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      return window.__turnstilePromise;
    };
    loadTurnstile().then(() => {
      if (window.turnstile) {
        window.turnstile.render('#cpf-ts-widget', {
          sitekey: tsConfig.siteKey,
          callback: (token) => { tsToken = token; },
          'expired-callback': () => { tsToken = ''; },
        });
      }
    });
  } else {
    tsToken = 'bypass';
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }
  function hideError() {
    if (!errEl) return;
    errEl.textContent = '';
    errEl.classList.add('hidden');
  }

  async function doPreview(streetVal) {
    hideError();
    if (submit) submit.disabled = true;
    if (results) results.classList.add('hidden');

    const body = {
      first_name: (first  && first.value)  || '',
      last_name:  (last   && last.value)   || '',
      city:       (city   && city.value)   || '',
      zip:        (zip    && zip.value)    || '',
      street:     streetVal || (street && street.value) || '',
    };
    if (!tsConfig.bypass) body.turnstile_token = tsToken;

    let data;
    try {
      const res = await fetch('/api/candidates/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
        cache: 'no-store',
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
    } catch (e) {
      showError(e.message || 'Preview failed. Please try again.');
      if (submit) submit.disabled = false;
      return;
    }

    if (submit) submit.disabled = false;

    if (data.match_status === 'ambiguous') {
      showError('Multiple records found. Please add your street address to narrow the results.');
      const streetRow = root.querySelector('#cpf-street-row');
      if (streetRow) streetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (data.match_status === 'not_found') {
      if (results) {
        results.innerHTML = `<div class="rounded-lg border border-wy-dust bg-wy-bone p-6">
          <p class="font-semibold text-wy-charcoal mb-2">No match found</p>
          <p class="text-wy-charcoal/75 text-sm mb-4">No voter record was found for the information you entered. You can still browse all Wyoming races.</p>
          <a class="button button--secondary" href="/races#browse-all">Browse All Wyoming Races</a>
        </div>`;
        results.classList.remove('hidden');
      }
      return;
    }

    // matched or geocoded — render race cards
    const races = data.races || [];
    const distLabel = [
      data.house_district  ? 'HD-' + parseInt(data.house_district,  10) : null,
      data.senate_district ? 'SD-' + parseInt(data.senate_district, 10) : null,
    ].filter(Boolean).join(' • ');

    const grouped = {};
    CATEGORY_ORDER.forEach((cat) => { grouped[cat] = []; });
    races.forEach((r) => {
      if (grouped[r.race_category]) grouped[r.race_category].push(r);
      else grouped[r.race_category] = [r];
    });

    let html = '';
    const matchNote = data.match_status === 'geocoded'
      ? 'Candidates matched by address lookup.'
      : 'Candidates matched by voter record.';
    if (distLabel) {
      html += `<p class="mb-2 text-sm text-wy-charcoal/60">${escH(matchNote)} Voting area: <strong class="text-wy-charcoal">${escH(distLabel)}</strong></p>`;
    }
    html += `<p class="mb-6 text-sm text-wy-charcoal/70 rounded-md border border-wy-dust bg-wy-bone px-4 py-3">
      <strong>Sign in to submit poll responses.</strong> Create an account or sign in to record your candidate support and view verified results.
    </p>`;

    CATEGORY_ORDER.forEach((cat) => {
      const catRaces = grouped[cat] || [];
      if (!catRaces.length) return;
      html += `<div class="mb-10">
        <p class="mb-4 text-sm font-semibold uppercase tracking-widest text-wy-rust">${escH(cat)}</p>
        <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">${catRaces.map(raceCardHtml).join('')}</div>
      </div>`;
    });

    const notes = data.notes || [];
    if (notes.length) {
      html += `<div class="mt-4 rounded-md border border-wy-dust bg-wy-bone px-4 py-3 text-sm text-wy-charcoal/75">
        ${notes.map((n) => `<p>${escH(n)}</p>`).join('')}
      </div>`;
    }

    if (results) {
      results.innerHTML = html;
      results.classList.remove('hidden');
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    hideError();
    if (!first || !first.value.trim()) { showError('First name is required.'); return; }
    if (!last  || !last.value.trim())  { showError('Last name is required.');  return; }
    if (!city  || !city.value.trim())  { showError('City is required.');       return; }
    if (!tsConfig.bypass && !tsToken)  { showError('Complete the human check to continue.'); return; }
    doPreview();
  });
}

window.RaceHub = { enrichHubCards, loadRaceCandidates, loadMyRaces };
