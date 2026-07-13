/* public/js/poll-results.js
 * Public results page for the informal 2026 primary poll. No auth required. Reads
 * ?race=<race_slug> and fetches /api/poll/results/<race_slug>.
 */
(() => {
  const root = document.getElementById('poll-results-root');
  const status = document.getElementById('poll-results-status');
  const titleEl = document.getElementById('poll-results-title');

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

  async function fetchResults(raceSlug) {
    const res = await fetch(`/api/poll/results/${encodeURIComponent(raceSlug)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Failed to load results (${res.status})`);
    return data;
  }

  function render(data) {
    if (!data.visible) {
      titleEl.textContent = 'Results not yet available';
      root.innerHTML = `<p class="solidarity-segment__suppressed">Results for this poll haven't been released yet. Check back later.</p>`;
      return;
    }

    titleEl.textContent = `Poll results — ${data.race_title}`;

    if (!data.show) {
      root.innerHTML = `
        <div class="solidarity-segment">
          <p class="solidarity-segment__suppressed">Not enough responses yet to show results (need 10+; ${data.total_responses} so far).</p>
        </div>`;
      return;
    }

    const rows = data.candidates.map((c) => `
      <div class="solidarity-row">
        <div class="solidarity-row__bar-track">
          <div class="solidarity-row__bar-fill" style="width:${c.pct}%"></div>
        </div>
        <p class="solidarity-row__label">${escH(c.candidate_name)} — ${c.pct}% (${c.chosen_count})</p>
      </div>`).join('');

    root.innerHTML = `
      <div class="solidarity-segment">
        <h3 class="solidarity-segment__label">Results <span class="solidarity-segment__total">(${data.total_responses} responses)</span></h3>
        ${rows}
      </div>`;
  }

  async function init() {
    const raceSlug = getRaceSlug();
    if (!raceSlug) {
      setStatus('No race specified.', true);
      return;
    }
    try {
      const data = await fetchResults(raceSlug);
      setStatus('');
      render(data);
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  init();
})();
