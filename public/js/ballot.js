/* public/js/ballot.js
 * Ballot card page — fetches /api/ballot/card and renders race survey sections.
 * Requires: doc-viewer.js for document links.
 */
(() => {
  const AUTH_RETURN_KEY = 'auth_return_to';
  const SAVE_DELAY_MS = 900;

  const root = document.getElementById('ballot-root');
  const status = document.getElementById('ballot-status');

  // ── Utilities ─────────────────────────────────────────────────────────────

  const escH = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function setStatus(msg, isError = false) {
    if (!status) return;
    status.textContent = msg;
    // status element is always visible; empty string hides it visually via CSS
    status.style.display = msg ? '' : 'none';
    status.classList.toggle('ballot-status--error', isError);
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────

  async function ensureAuth() {
    const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.authenticated || !data?.user) return null;
    return data.user;
  }

  function redirectLogin() {
    try {
      localStorage.setItem(AUTH_RETURN_KEY, window.location.pathname);
    } catch (_) {
      // localStorage unavailable; redirect still proceeds.
    }
    window.location.href = '/auth/login/';
  }

  // ── API calls ─────────────────────────────────────────────────────────────

  async function fetchCard() {
    const res = await fetch('/api/ballot/card', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load ballot (${res.status})`);
    }
    return res.json();
  }

  async function saveResponse(raceSlug, candidateSlug, wyCanId, chosen, notes) {
    const res = await fetch('/api/ballot/response', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        race_slug: raceSlug,
        candidate_slug: candidateSlug,
        wy_candidate_id: wyCanId,
        chosen: chosen ? 1 : 0,
        notes: notes ?? null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Save failed');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function scopeLabel(scopeType) {
    const map = {
      federal: 'Federal',
      statewide: 'Statewide',
      state_senate: 'Wyoming Senate',
      state_house: 'Wyoming House',
      county: 'County',
      local: 'Local',
    };
    return map[scopeType] ?? scopeType;
  }

  // Debounce helper — returns a function that delays invoking fn until after wait ms
  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function renderBallot(data) {
    if (!root) return;

    const { surveys, house_district, senate_district } = data;

    if (!surveys || surveys.length === 0) {
      root.innerHTML = `
        <div class="ballot-empty">
          <p>No races found for your registered address.</p>
          <p>Make sure your address is saved in <a href="/account/location">My Location</a>.</p>
        </div>`;
      return;
    }

    // District context banner
    const districtParts = [];
    if (house_district) districtParts.push(`House District ${house_district}`);
    if (senate_district) districtParts.push(`Senate District ${senate_district}`);
    const districtBanner = districtParts.length
      ? `<p class="ballot-district-note">Showing races for: ${districtParts.join(' &amp; ')} + Statewide &amp; Federal</p>`
      : '';

    // Build race sections
    const sectionsHtml = surveys.map((survey) => renderSurvey(survey)).join('');

    root.innerHTML = `
      ${districtBanner}
      <div class="ballot-surveys">
        ${sectionsHtml}
      </div>
      <div class="ballot-footer-actions">
        <a class="button button--primary" href="/ballot/results/">Review My Choices</a>
      </div>`;

    // Wire up interactivity after HTML is in the DOM
    wireSurveys(surveys);
  }

  function renderSurvey(survey) {
    const candidatesHtml = survey.candidates.map((c) => renderCandidateCard(survey, c)).join('');

    const notesId = `notes-${CSS.escape(survey.race_slug)}`;
    const savedNotes = survey.candidates.find((c) => c.notes)?.notes ?? '';

    return `
      <section class="ballot-race" data-race-slug="${escH(survey.race_slug)}">
        <header class="ballot-race__header">
          <span class="ballot-race__scope">${escH(scopeLabel(survey.scope_type))}</span>
          <h2 class="ballot-race__title">${escH(survey.title)}</h2>
          <a class="ballot-race__compare-link" href="/ballot/compare/?race=${encodeURIComponent(survey.race_slug)}">Compare in My Ballot Guide &rarr;</a>
        </header>
        <div class="ballot-candidates">
          ${candidatesHtml}
        </div>
        <div class="ballot-notes">
          <label class="ballot-notes__label" for="${notesId}">
            Wyoming's Choice — <span class="ballot-notes__hint">Your notes on this race (optional)</span>
          </label>
          <textarea
            id="${notesId}"
            class="ballot-notes__textarea"
            rows="3"
            placeholder="Why this candidate? What matters most to you for this race…"
            data-race-slug="${escH(survey.race_slug)}"
          >${escH(savedNotes)}</textarea>
          <p class="ballot-notes__save-msg" aria-live="polite"></p>
        </div>
      </section>`;
  }

  function renderEvidenceItems(evidence) {
    if (!evidence || evidence.length === 0) return '';
    const items = evidence.map((ev) => {
      const link = ev.official_url
        ? ` <a class="ballot-evidence__link" href="${escH(ev.official_url)}" target="_blank" rel="noopener noreferrer">source ↗</a>`
        : '';
      return `<li class="ballot-evidence__item">
        <span class="ballot-evidence__tag">${escH(categoryLabel(ev.category_key))}</span>
        ${escH(ev.claim)}${link}
      </li>`;
    }).join('');
    return `<ul class="ballot-evidence">${items}</ul>`;
  }

  function categoryLabel(key) {
    const map = {
      coalition: 'Coalition',
      issue_alignment: 'Issues',
      accountability: 'Accountability',
      local_impact: 'Local Impact',
      evidence_quality: 'Record',
      public_service: 'Public Service',
    };
    return map[key] ?? key;
  }

  function renderCandidateCard(survey, c) {
    const isChosen = c.chosen === 1;
    const chosenClass = isChosen ? 'ballot-candidate--chosen' : '';
    const evidenceHtml = renderEvidenceItems(c.evidence);
    return `
      <article
        class="ballot-candidate ${chosenClass}"
        data-race-slug="${escH(survey.race_slug)}"
        data-candidate-slug="${escH(c.candidate_slug)}"
        data-wy-candidate-id="${c.wy_candidate_id ?? ''}"
        aria-selected="${isChosen ? 'true' : 'false'}"
      >
        <div class="ballot-candidate__body">
          <h3 class="ballot-candidate__name">${escH(c.candidate_name)}</h3>
          ${evidenceHtml}
        </div>
        <div class="ballot-candidate__actions">
          <button
            type="button"
            class="ballot-choose-btn ${isChosen ? 'ballot-choose-btn--active' : ''}"
            aria-label="Choose ${escH(c.candidate_name)}"
            data-race-slug="${escH(survey.race_slug)}"
            data-candidate-slug="${escH(c.candidate_slug)}"
            data-wy-candidate-id="${c.wy_candidate_id ?? ''}"
          >${isChosen ? '&#10003; Your Choice' : 'Choose'}</button>
        </div>
      </article>`;
  }

  // ── Interactivity ──────────────────────────────────────────────────────────

  function wireSurveys(surveys) {
    // Build a quick-access map: race_slug → survey candidates
    const surveyMap = new Map(surveys.map((s) => [s.race_slug, s]));

    // Choose button clicks
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('.ballot-choose-btn');
      if (!btn) return;

      const raceSlug = btn.dataset.raceSlug;
      const candidateSlug = btn.dataset.candidateSlug;
      const wyCanId = btn.dataset.wyCanidateId ? parseInt(btn.dataset.wyCanidateId, 10) : null;
      const survey = surveyMap.get(raceSlug);
      if (!survey) return;

      // Optimistic UI — update all cards in this race
      const raceSection = root.querySelector(`.ballot-race[data-race-slug="${CSS.escape(raceSlug)}"]`);
      if (!raceSection) return;

      const allCards = raceSection.querySelectorAll('.ballot-candidate');
      const allBtns = raceSection.querySelectorAll('.ballot-choose-btn');
      const thisCard = btn.closest('.ballot-candidate');
      const alreadyChosen = btn.classList.contains('ballot-choose-btn--active');

      // Toggle: clicking chosen candidate de-selects them
      const newChosen = alreadyChosen ? 0 : 1;

      // Update all cards to un-chosen first
      allCards.forEach((card) => {
        card.classList.remove('ballot-candidate--chosen');
        card.setAttribute('aria-selected', 'false');
      });
      allBtns.forEach((b) => {
        b.classList.remove('ballot-choose-btn--active');
        b.textContent = 'Choose';
      });

      // Apply new state to clicked candidate
      if (newChosen) {
        thisCard?.classList.add('ballot-candidate--chosen');
        thisCard?.setAttribute('aria-selected', 'true');
        btn.classList.add('ballot-choose-btn--active');
        btn.innerHTML = '&#10003; Your Choice';
      }

      // Save all candidates in race (set chosen=1 for selected, 0 for rest)
      const notes = raceSection.querySelector('.ballot-notes__textarea')?.value ?? null;

      const saves = survey.candidates.map((c) => {
        const isThis = c.candidate_slug === candidateSlug;
        const chosen = isThis ? newChosen : 0;
        return saveResponse(raceSlug, c.candidate_slug, c.wy_candidate_id, chosen, isThis ? notes : c.notes);
      });

      try {
        await Promise.all(saves);
        // Update in-memory survey data
        survey.candidates.forEach((c) => {
          c.chosen = c.candidate_slug === candidateSlug ? newChosen : 0;
        });
      } catch (err) {
        console.error('Save error:', err.message);
        setStatus('Could not save your choice. Please try again.', true);
      }
    });

    // Notes textarea — debounced auto-save
    const debouncedNoteSave = debounce(async (raceSlug, notesValue) => {
      const survey = surveyMap.get(raceSlug);
      if (!survey) return;

      const msgEl = root.querySelector(
        `.ballot-race[data-race-slug="${CSS.escape(raceSlug)}"] .ballot-notes__save-msg`
      );

      // Find chosen candidate (if any) to attach notes to; otherwise save against all (notes field persists separately)
      const chosenCandidate = survey.candidates.find((c) => c.chosen === 1) ?? survey.candidates[0];
      if (!chosenCandidate) return;

      try {
        await saveResponse(
          raceSlug,
          chosenCandidate.candidate_slug,
          chosenCandidate.wy_candidate_id,
          chosenCandidate.chosen ?? 0,
          notesValue,
        );
        chosenCandidate.notes = notesValue;
        if (msgEl) {
          msgEl.textContent = 'Saved';
          setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 1800);
        }
      } catch (err) {
        if (msgEl) msgEl.textContent = 'Could not save.';
      }
    }, SAVE_DELAY_MS);

    root.addEventListener('input', (e) => {
      const ta = e.target.closest('.ballot-notes__textarea');
      if (!ta) return;
      const raceSlug = ta.dataset.raceSlug;
      const saveMsgEl = ta.closest('.ballot-notes')?.querySelector('.ballot-notes__save-msg');
      if (saveMsgEl) saveMsgEl.textContent = 'Saving…';
      debouncedNoteSave(raceSlug, ta.value);
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    // Status element already shows "Loading your ballot…" from server HTML
    const user = await ensureAuth();
    if (!user) {
      redirectLogin();
      return;
    }

    let data;
    try {
      data = await fetchCard();
    } catch (err) {
      setStatus(err.message, true);
      return;
    }

    setStatus('');
    renderBallot(data);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
