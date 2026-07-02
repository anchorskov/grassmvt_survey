/* public/js/ballot-solidarity.js
 * Public solidarity results page. No auth required. Reads ?race=<race_slug>
 * and fetches /api/ballot/solidarity/<race_slug>.
 */
(() => {
  const root = document.getElementById('solidarity-root');
  const status = document.getElementById('solidarity-status');
  const titleEl = document.getElementById('solidarity-title');

  const escH = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function setStatus(msg, isError = false) {
    if (!status) return;
    status.textContent = msg;
    status.style.display = msg ? '' : 'none';
    status.classList.toggle('ballot-status--error', isError);
  }

  function getRaceSlug() {
    const params = new URLSearchParams(window.location.search);
    return params.get('race') || '';
  }

  async function fetchSolidarity(raceSlug) {
    const res = await fetch(`/api/ballot/solidarity/${encodeURIComponent(raceSlug)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Failed to load results (${res.status})`);
    return data;
  }

  function renderSegment(label, segment) {
    if (!segment.show) {
      return `
        <div class="solidarity-segment">
          <h3 class="solidarity-segment__label">${escH(label)}</h3>
          <p class="solidarity-segment__suppressed">Not enough responses yet to show results (need 10+; ${segment.total_responses} so far).</p>
        </div>`;
    }
    const rows = segment.candidates.map((c) => `
      <div class="solidarity-row">
        <div class="solidarity-row__bar-track">
          <div class="solidarity-row__bar-fill" style="width:${c.pct}%"></div>
        </div>
        <p class="solidarity-row__label">${escH(c.candidate_name)} — ${c.pct}% (${c.chosen_count})</p>
      </div>`).join('');
    return `
      <div class="solidarity-segment">
        <h3 class="solidarity-segment__label">${escH(label)} <span class="solidarity-segment__total">(${segment.total_responses} responses)</span></h3>
        ${rows}
      </div>`;
  }

  function render(data) {
    titleEl.textContent = `Guide participant results — ${data.race_title}`;
    root.innerHTML = `
      <div class="solidarity-segments">
        ${renderSegment('Verified registered voters', data.verified_voters)}
        ${renderSegment('Guide participants', data.all_participants)}
      </div>
      <p class="solidarity-disclaimer">${escH(data.disclaimer)}</p>
      <div class="quiz-actions">
        <a class="button button--secondary" href="/ballot/compare/?race=${encodeURIComponent(data.race_slug)}">Compare candidates in this race</a>
      </div>`;
  }

  async function init() {
    const raceSlug = getRaceSlug();
    if (!raceSlug) {
      setStatus('No race specified.', true);
      return;
    }
    try {
      const data = await fetchSolidarity(raceSlug);
      setStatus('');
      render(data);
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  init();
})();
