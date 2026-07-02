/* public/js/ballot-results.js
 * Ballot results/review page — fetches /api/ballot/card and renders
 * only the races where the user has chosen a candidate, plus their notes.
 */
(() => {
  const AUTH_RETURN_KEY = 'auth_return_to';

  const root = document.getElementById('results-root');
  const status = document.getElementById('results-status');

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
    status.style.color = isError ? '#8b1a26' : '';
    status.style.fontStyle = isError ? 'normal' : 'italic';
  }

  async function ensureAuth() {
    const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.authenticated && data?.user ? data.user : null;
  }

  function redirectLogin() {
    try {
      localStorage.setItem(AUTH_RETURN_KEY, window.location.pathname);
    } catch (_) {
      // localStorage unavailable; redirect still proceeds.
    }
    window.location.href = '/auth/login/';
  }

  async function fetchCard() {
    const res = await fetch('/api/ballot/card', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ballot (${res.status})`);
    return res.json();
  }

  function categoryLabel(key) {
    const map = {
      economy: 'Economy', land_use: 'Land & Energy', energy: 'Land & Energy',
      constitutional: 'Constitutional & Governance', health_care: 'Health Care',
      education: 'Education', local_control: 'Local Control', other: 'Other',
    };
    return map[key] ?? key;
  }

  function renderAlignmentSummary(alignment) {
    if (alignment.alignment_pct === null) {
      return '<p class="results-race__alignment results-race__alignment--none">Not enough quiz data yet to show a match percentage.</p>';
    }
    const reason = alignment.top_reason
      ? `Best match on: ${escH(categoryLabel(alignment.top_reason.issue_category))} — "${escH(alignment.top_reason.question_text)}"`
      : '';
    const gaps = alignment.no_answer_count > 0
      ? `<p class="results-race__gaps">${alignment.no_answer_count} question(s) this candidate hasn't answered yet.</p>`
      : '';
    return `
      <p class="results-race__alignment"><strong>${alignment.alignment_pct}% match</strong> with your quiz answers (${alignment.answered_count} question(s) compared)</p>
      ${reason ? `<p class="results-race__reason">${reason}</p>` : ''}
      ${gaps}`;
  }

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

  function renderResults(data) {
    if (!root) return;
    const { surveys, house_district, senate_district } = data;

    // Filter to only races where a candidate was chosen
    const chosen = (surveys ?? []).filter((s) => s.candidates.some((c) => c.chosen === 1));

    if (chosen.length === 0) {
      const total = surveys?.length ?? 0;
      root.innerHTML = `
        <div class="results-empty">
          <p>${total > 0 ? 'You haven\'t chosen any candidates yet.' : 'No races found for your address.'}</p>
          <p><a class="results-link" href="/ballot/">Go to your ballot to make choices</a></p>
        </div>`;
      return;
    }

    // District summary line
    const distParts = [];
    if (house_district) distParts.push(`House District ${house_district}`);
    if (senate_district) distParts.push(`Senate District ${senate_district}`);

    const distLine = distParts.length
      ? `<p class="results-district-note">${distParts.join(' &amp; ')} + Statewide &amp; Federal</p>`
      : '';

    const completedNote = `<p class="results-progress">${chosen.length} of ${surveys.length} races decided</p>`;

    const rows = chosen.map((survey) => {
      const pick = survey.candidates.find((c) => c.chosen === 1);
      const notes = pick?.notes ?? survey.candidates.find((c) => c.notes)?.notes ?? '';
      const alignment = pick?.alignment_summary;
      const alignmentHtml = alignment ? renderAlignmentSummary(alignment) : '';
      return `
        <article class="results-race">
          <div class="results-race__scope">${escH(scopeLabel(survey.scope_type))}</div>
          <h2 class="results-race__title">${escH(survey.title)}</h2>
          <p class="results-race__pick">
            <span class="results-pick-label">Your choice:</span>
            <span class="results-pick-name">${escH(pick?.candidate_name ?? '—')}</span>
          </p>
          ${alignmentHtml}
          ${notes ? `<p class="results-race__notes"><span class="results-notes-label">Notes:</span> ${escH(notes)}</p>` : ''}
        </article>`;
    }).join('');

    root.innerHTML = `
      ${distLine}
      ${completedNote}
      <div class="results-list">
        ${rows}
      </div>
      <div class="results-actions">
        <a class="button button--primary" href="/ballot/">Edit my ballot</a>
        <a class="button button--secondary" href="/ballot/quiz/">Adjust my quiz answers</a>
        <button type="button" class="button button--secondary" id="results-email-btn">Email me this list</button>
        <p class="results-email-msg" id="results-email-msg" aria-live="polite"></p>
      </div>`;

    wireEmailButton();
  }

  async function emailMyBallot() {
    const res = await fetch('/api/ballot/email-summary', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not send email.');
    return data;
  }

  function wireEmailButton() {
    const btn = document.getElementById('results-email-btn');
    const msg = document.getElementById('results-email-msg');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      msg.textContent = 'Sending…';
      try {
        await emailMyBallot();
        msg.textContent = 'Sent! Check your inbox.';
      } catch (err) {
        msg.textContent = err.message || 'Could not send email.';
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function init() {
    const user = await ensureAuth();
    if (!user) { redirectLogin(); return; }

    let data;
    try {
      data = await fetchCard();
    } catch (err) {
      setStatus(err.message, true);
      return;
    }

    setStatus('');
    renderResults(data);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
