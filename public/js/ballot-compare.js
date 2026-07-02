/* public/js/ballot-compare.js
 * Alignment comparison page for one race. Fetches /api/ballot/alignment/<race_slug>,
 * renders a bar + question-by-question breakdown per candidate, and lets the voter
 * add their pick to /api/ballot/response (My Ballot).
 */
(() => {
  const AUTH_RETURN_KEY = 'auth_return_to';

  const root = document.getElementById('compare-root');
  const status = document.getElementById('compare-status');
  const titleEl = document.getElementById('compare-title');

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

  async function ensureAuth() {
    const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.authenticated && data?.user ? data.user : null;
  }

  function redirectLogin() {
    try {
      localStorage.setItem(AUTH_RETURN_KEY, window.location.pathname + window.location.search);
    } catch (_) {
      // localStorage unavailable; redirect still proceeds.
    }
    window.location.href = '/auth/magic-link/';
  }

  async function fetchAlignment(raceSlug) {
    const res = await fetch(`/api/ballot/alignment/${encodeURIComponent(raceSlug)}`, { credentials: 'include', cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Failed to load comparison (${res.status})`);
    return data;
  }

  async function fetchExistingChoice(raceSlug) {
    const res = await fetch('/api/ballot/responses', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const match = (data.responses || []).find((r) => r.race_slug === raceSlug && r.chosen === 1);
    return match ? match.candidate_slug : null;
  }

  async function chooseCandidate(raceSlug, candidateSlug, wyCandidateId) {
    const res = await fetch('/api/ballot/response', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ race_slug: raceSlug, candidate_slug: candidateSlug, wy_candidate_id: wyCandidateId, chosen: 1 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Save failed');
  }

  function categoryLabel(key) {
    const map = {
      economy: 'Economy', land_use: 'Land & Energy', energy: 'Land & Energy',
      constitutional: 'Constitutional & Governance', health_care: 'Health Care',
      education: 'Education', local_control: 'Local Control', other: 'Other',
    };
    return map[key] ?? key;
  }

  function positionLabel(pos) {
    const map = {
      strongly_support: 'Strongly support', support: 'Support', neutral: 'Neutral / mixed',
      oppose: 'Oppose', strongly_oppose: 'Strongly oppose', no_answer: 'No response',
    };
    return map[pos] ?? pos;
  }

  function renderBreakdownRow(row) {
    const noAnswer = row.candidate_position === 'no_answer';
    const topBadge = row.is_top_priority ? '<span class="quiz-question__badge">&#9733; Top priority</span>' : '';
    const noAnswerTag = noAnswer ? '<span class="quiz-question__badge quiz-question__badge--pending">No response</span>' : '';
    const matchPct = row.match_score !== null ? `${Math.round(row.match_score * 100)}% match` : '';
    return `
      <div class="compare-breakdown-row">
        <p class="compare-breakdown-row__question">
          <span class="compare-breakdown-row__category">${escH(categoryLabel(row.issue_category))}</span>
          ${escH(row.question_text)} ${topBadge}${noAnswerTag}
        </p>
        <p class="compare-breakdown-row__positions">
          <span><strong>You:</strong> ${escH(positionLabel(row.voter_position))} (${escH(row.voter_weight)} priority)</span>
          <span><strong>Candidate:</strong> ${escH(positionLabel(row.candidate_position))}${matchPct ? ' — ' + matchPct : ''}</span>
        </p>
        ${row.explanation ? `<p class="compare-breakdown-row__explanation">"${escH(row.explanation)}"</p>` : ''}
        ${row.source_url ? `<p class="compare-breakdown-row__source"><a href="${escH(row.source_url)}" target="_blank" rel="noopener">Candidate's source &rarr;</a></p>` : ''}
      </div>`;
  }

  function renderCandidate(c, raceSlug, chosenSlug) {
    const pct = c.alignment_pct;
    const barWidth = pct === null ? 0 : Math.max(0, Math.min(100, pct));
    const pctLabel = pct === null ? 'Not enough data yet' : `${pct}% match`;
    const isChosen = c.candidate_slug === chosenSlug;

    const breakdownHtml = c.breakdown.map(renderBreakdownRow).join('');

    return `
      <div class="compare-candidate" data-candidate-slug="${escH(c.candidate_slug)}">
        <div class="compare-candidate__header">
          <h2 class="compare-candidate__name">${escH(c.candidate_name)}</h2>
          <button type="button" class="button ${isChosen ? 'button--primary' : 'button--secondary'} compare-choose-btn"
            data-race-slug="${escH(raceSlug)}" data-candidate-slug="${escH(c.candidate_slug)}"
            data-wy-candidate-id="${c.wy_candidate_id ?? ''}">
            ${isChosen ? '&#10003; Added to My Ballot' : 'Add to My Ballot'}
          </button>
        </div>
        <div class="compare-bar" role="img" aria-label="${pctLabel}">
          <div class="compare-bar__fill" style="width:${barWidth}%"></div>
        </div>
        <p class="compare-bar__label">${pctLabel} &bull; ${c.answered_count} question(s) answered${c.no_answer_count ? `, ${c.no_answer_count} not answered` : ''}</p>
        <details class="compare-breakdown">
          <summary>Show question-by-question breakdown</summary>
          <div class="compare-breakdown__body">${breakdownHtml || '<p class="text-sm text-wy-charcoal/60">No comparable questions.</p>'}</div>
        </details>
      </div>`;
  }

  function render(data, chosenSlug) {
    titleEl.textContent = `Compare candidates — ${data.race_title}`;
    const sorted = [...data.candidates].sort((a, b) => (b.alignment_pct ?? -1) - (a.alignment_pct ?? -1));
    const simulatorLink = data.candidates.length >= 3
      ? `<a class="button button--secondary" href="/ballot/simulator/?race=${encodeURIComponent(data.race_slug)}">Explore vote-splitting simulator</a>`
      : '';
    root.innerHTML = `
      <div class="compare-candidates">
        ${sorted.map((c) => renderCandidate(c, data.race_slug, chosenSlug)).join('')}
      </div>
      <div class="quiz-actions">
        <a class="button button--secondary" href="/ballot/">Back to my ballot</a>
        <a class="button button--secondary" href="/ballot/solidarity/?race=${encodeURIComponent(data.race_slug)}">See guide participant results</a>
        ${simulatorLink}
      </div>`;

    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('.compare-choose-btn');
      if (!btn) return;
      const raceSlug = btn.dataset.raceSlug;
      const candidateSlug = btn.dataset.candidateSlug;
      const wyCandidateId = btn.dataset.wyCandidateId ? parseInt(btn.dataset.wyCandidateId, 10) : null;
      btn.disabled = true;
      try {
        await chooseCandidate(raceSlug, candidateSlug, wyCandidateId);
        root.querySelectorAll('.compare-choose-btn').forEach((b) => {
          const isThis = b.dataset.candidateSlug === candidateSlug;
          b.classList.toggle('button--primary', isThis);
          b.classList.toggle('button--secondary', !isThis);
          b.innerHTML = isThis ? '&#10003; Added to My Ballot' : 'Add to My Ballot';
        });
      } catch (err) {
        setStatus(err.message || 'Could not save your choice.', true);
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function init() {
    const raceSlug = getRaceSlug();
    if (!raceSlug) {
      setStatus('No race specified. Go to your ballot and choose a race to compare.', true);
      return;
    }

    const user = await ensureAuth();
    if (!user) {
      redirectLogin();
      return;
    }

    try {
      const [data, chosenSlug] = await Promise.all([
        fetchAlignment(raceSlug),
        fetchExistingChoice(raceSlug),
      ]);
      if (!data.candidates || data.candidates.length === 0) {
        setStatus('No candidates found for this race.', true);
        return;
      }
      setStatus('');
      render(data, chosenSlug);
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
