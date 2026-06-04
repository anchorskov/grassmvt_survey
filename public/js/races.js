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
  }
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

async function loadMyRaces(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;

  let data;
  try {
    const res = await fetch('/api/races/my', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error('API error');
    data = await res.json();
  } catch (_e) {
    root.innerHTML = '<p class="text-wy-charcoal/75">Unable to load races. Please try again.</p>';
    return;
  }

  if (!data.authenticated) {
    root.innerHTML = `<div class="rounded-lg border border-wy-dust bg-wy-bone p-6 max-w-lg">
      <p class="font-semibold text-wy-charcoal mb-3">Sign in to find your races</p>
      <p class="text-wy-charcoal/75 mb-4 text-sm">Create an account or sign in, then verify your Wyoming voter information to see races connected to your voting area.</p>
      <button class="button button--primary" type="button" data-auth-open>Sign in or create account</button>
    </div>`;
    return;
  }

  if (!data.verified) {
    const statewideHtml = (data.races || []).map(raceCardHtml).join('');
    root.innerHTML = `<div class="mb-8 rounded-lg border border-wy-amber-300 bg-amber-50 p-5 max-w-lg">
      <p class="font-semibold text-wy-charcoal mb-2">Verify to see your district races</p>
      <p class="text-wy-charcoal/75 mb-4 text-sm">Your voter information hasn't been verified yet. Statewide races are shown below. Verify to also see your State House and Senate district races.</p>
      <a class="button button--primary" href="/verify-voter">Verify voter information</a>
    </div>
    <p class="mb-2 text-sm font-semibold uppercase tracking-widest text-wy-rust">Statewide races</p>
    <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">${statewideHtml}</div>`;
    return;
  }

  // Verified — group races by category in display order
  const races = data.races || [];
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

window.RaceHub = { enrichHubCards, loadRaceCandidates, loadMyRaces };
