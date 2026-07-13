/* public/js/poll-vote.js
 * Informal 2026 primary candidate-choice poll -- token-gated, no account required.
 * Fetches /api/poll/races?token= and saves each race's pick immediately on selection
 * via /api/poll/vote. Single-seat races (seats_available === 1) render as radio
 * buttons; multi-seat races (county commissioner, some precinct committee races)
 * render as checkboxes capped at seats_available, submitting the full checked set
 * per change -- matches how a checkbox group naturally submits.
 */
(() => {
  const root = document.getElementById('poll-vote-root');
  const intro = document.getElementById('poll-vote-intro');
  const errorEl = document.getElementById('poll-vote-error');

  const escH = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('is-hidden');
  }

  function getToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  }

  async function fetchRaces(token) {
    const res = await fetch(`/api/poll/races?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Could not load your ballot.');
    }
    return data;
  }

  async function castVote(token, raceSlug, candidateSlugs) {
    const res = await fetch('/api/poll/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, race_slug: raceSlug, candidate_slugs: candidateSlugs }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      const err = new Error(data.error || 'Could not save your choice.');
      err.code = data.code;
      throw err;
    }
    return data;
  }

  function renderRace(race) {
    const multiSeat = (race.seats_available || 1) > 1;
    const selected = new Set(race.selected_candidate_slugs || []);
    const inputType = multiSeat ? 'checkbox' : 'radio';
    const options = race.candidates.map((c) => `
      <label class="quiz-position-option">
        <input type="${inputType}" name="race-${CSS.escape(race.race_slug)}" value="${escH(c.candidate_slug)}"
          data-race-slug="${escH(race.race_slug)}"
          ${selected.has(c.candidate_slug) ? 'checked' : ''} />
        <span>${escH(c.candidate_name)}</span>
      </label>`).join('');

    const helperText = multiSeat
      ? `<p class="helper-text" data-race-helper="${escH(race.race_slug)}">Pick up to ${race.seats_available}.</p>`
      : '';

    return `
      <div class="quiz-question" data-race-slug="${escH(race.race_slug)}" data-seats-available="${race.seats_available || 1}">
        <p class="quiz-question__text">${escH(race.race_title)}</p>
        ${helperText}
        <div class="quiz-question__positions">${options}</div>
        <p class="quiz-save-msg" data-race-status="${escH(race.race_slug)}" aria-live="polite"></p>
      </div>`;
  }

  // Disables remaining unchecked boxes in a multi-seat race once its seats_available
  // cap is reached, rather than letting the user check more and rejecting on submit.
  function applySeatCap(raceEl) {
    const seatsAvailable = Number(raceEl.getAttribute('data-seats-available') || 1);
    const boxes = Array.from(raceEl.querySelectorAll('input[type="checkbox"]'));
    if (!boxes.length) return;
    const checkedCount = boxes.filter((b) => b.checked).length;
    for (const box of boxes) {
      box.disabled = !box.checked && checkedCount >= seatsAvailable;
    }
  }

  function render(token, data) {
    intro.textContent = data.races.length
      ? 'Pick a candidate in each race below. Your choice saves automatically and you can change it any time before voting closes.'
      : 'No races are available for your district right now.';

    root.innerHTML = `<div class="quiz-categories">${data.races.map(renderRace).join('')}</div>`;

    root.querySelectorAll('[data-seats-available]').forEach((raceEl) => applySeatCap(raceEl));

    root.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', async (e) => {
        const raceSlug = e.target.getAttribute('data-race-slug');
        const raceEl = root.querySelector(`.quiz-question[data-race-slug="${CSS.escape(raceSlug)}"]`);
        if (raceEl) applySeatCap(raceEl);

        const candidateSlugs = raceEl
          ? Array.from(raceEl.querySelectorAll('input:checked')).map((el) => el.value)
          : [e.target.value];

        const statusEl = root.querySelector(`[data-race-status="${CSS.escape(raceSlug)}"]`);
        if (statusEl) statusEl.textContent = 'Saving…';
        try {
          await castVote(token, raceSlug, candidateSlugs);
          if (statusEl) statusEl.textContent = 'Saved.';
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = err.code === 'VOTING_CLOSED'
              ? 'Voting has closed for this poll.'
              : (err.message || 'Could not save your choice.');
          }
        }
      });
    });
  }

  async function init() {
    const token = getToken();
    if (!token) {
      intro.textContent = '';
      showError('No poll link token found. Use the link from your invite email.');
      return;
    }
    try {
      const data = await fetchRaces(token);
      render(token, data);
    } catch (err) {
      intro.textContent = '';
      showError(err.message);
    }
  }

  init();
})();
