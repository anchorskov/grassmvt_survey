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

window.RaceHub = { enrichHubCards, loadRaceCandidates };
