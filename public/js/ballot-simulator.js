/* public/js/ballot-simulator.js
 * Vote-splitting simulator. Civic education only -- no persuasion, no defaults
 * that imply an outcome. Starts every candidate at an equal share and lets the
 * voter drag sliders to explore how a plurality race could split.
 */
(() => {
  const root = document.getElementById('sim-root');
  const status = document.getElementById('sim-status');
  const titleEl = document.getElementById('sim-title');

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

  async function fetchCandidates(raceSlug) {
    const res = await fetch(`/api/ballot/candidates/${encodeURIComponent(raceSlug)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Failed to load candidates (${res.status})`);
    return data;
  }

  // Redistributes the remaining 100 - newValue proportionally across every
  // other candidate's current share, so the total always sums to 100.
  function redistribute(shares, changedIndex, newValue) {
    const clamped = Math.max(0, Math.min(100, newValue));
    const others = shares.map((s, i) => (i === changedIndex ? null : s)).filter((s) => s !== null);
    const oldOthersTotal = others.reduce((a, b) => a + b, 0);
    const remaining = 100 - clamped;

    const next = shares.slice();
    next[changedIndex] = clamped;

    if (oldOthersTotal === 0) {
      // Every other candidate was at 0 -- split the remainder evenly.
      const evenShare = shares.length > 1 ? remaining / (shares.length - 1) : 0;
      shares.forEach((_, i) => { if (i !== changedIndex) next[i] = evenShare; });
    } else {
      shares.forEach((s, i) => {
        if (i === changedIndex) return;
        next[i] = (s / oldOthersTotal) * remaining;
      });
    }

    // Rounding can leave the total slightly off 100 -- correct on the largest
    // untouched share so display never drifts.
    const total = next.reduce((a, b) => a + b, 0);
    const drift = 100 - total;
    if (Math.abs(drift) > 0.001) {
      let largestIdx = changedIndex === 0 ? 1 : 0;
      next.forEach((v, i) => { if (i !== changedIndex && v > next[largestIdx]) largestIdx = i; });
      if (largestIdx !== changedIndex) next[largestIdx] += drift;
    }
    return next;
  }

  function computeWinner(candidates, shares) {
    let winnerIdx = 0;
    let isTie = false;
    for (let i = 1; i < shares.length; i++) {
      if (shares[i] > shares[winnerIdx] + 0.001) {
        winnerIdx = i;
        isTie = false;
      } else if (Math.abs(shares[i] - shares[winnerIdx]) <= 0.001) {
        isTie = true;
      }
    }
    return { winnerIdx, isTie, winnerPct: shares[winnerIdx] };
  }

  function renderOutcome(candidates, shares) {
    const { winnerIdx, isTie, winnerPct } = computeWinner(candidates, shares);
    if (isTie) {
      return `<p class="sim-outcome">This scenario is a tie.</p>`;
    }
    const winner = candidates[winnerIdx];
    const majorityNote = winnerPct < 50
      ? `<p class="sim-outcome__note">No candidate has a majority in this scenario — ${escH(winner.candidate_name)} would still win under plurality rules with the most votes.</p>`
      : '';
    return `
      <p class="sim-outcome"><strong>${escH(winner.candidate_name)}</strong> would win with ${Math.round(winnerPct * 10) / 10}%</p>
      ${majorityNote}`;
  }

  function render(data) {
    titleEl.textContent = `Vote-splitting simulator — ${data.race_title}`;
    const candidates = data.candidates;
    const n = candidates.length;
    if (n < 2) {
      root.innerHTML = '<p class="text-sm text-wy-charcoal/60">Not enough candidates in this race to simulate a split.</p>';
      return;
    }

    // Equal starting shares -- no default that implies an outcome.
    const equalShare = 100 / n;
    const shares = new Array(n).fill(equalShare);

    root.innerHTML = `
      <div id="sim-outcome-box" class="sim-outcome-box"></div>
      <div class="sim-candidates" id="sim-candidates"></div>
      <div class="quiz-actions">
        <button type="button" class="button button--secondary" id="sim-reset-btn">Reset to equal shares</button>
      </div>`;

    const outcomeBox = document.getElementById('sim-outcome-box');
    const candidatesRoot = document.getElementById('sim-candidates');

    function renderBars() {
      candidatesRoot.innerHTML = candidates.map((c, i) => `
        <div class="sim-candidate">
          <p class="sim-candidate__name">${escH(c.candidate_name)} — <span class="sim-candidate__pct">${Math.round(shares[i] * 10) / 10}%</span></p>
          <div class="sim-bar-track">
            <div class="sim-bar-fill" style="width:${shares[i]}%"></div>
            <div class="sim-bar-threshold" title="Majority threshold (50%)"></div>
          </div>
          <input
            type="range" min="0" max="100" step="1" value="${shares[i]}"
            class="sim-slider" data-index="${i}"
            aria-label="${escH(c.candidate_name)} share of the vote"
          />
        </div>`).join('');
      outcomeBox.innerHTML = renderOutcome(candidates, shares);
    }

    candidatesRoot.addEventListener('input', (e) => {
      const slider = e.target.closest('.sim-slider');
      if (!slider) return;
      const idx = parseInt(slider.dataset.index, 10);
      const newShares = redistribute(shares, idx, parseFloat(slider.value));
      shares.splice(0, shares.length, ...newShares);
      renderBars();
      // Restore focus/value on the slider the user is actively dragging so it
      // doesn't jump under their cursor on re-render.
      const activeSlider = candidatesRoot.querySelector(`.sim-slider[data-index="${idx}"]`);
      if (activeSlider) activeSlider.focus();
    });

    document.getElementById('sim-reset-btn').addEventListener('click', () => {
      shares.splice(0, shares.length, ...new Array(n).fill(equalShare));
      renderBars();
    });

    renderBars();
  }

  async function init() {
    const raceSlug = getRaceSlug();
    if (!raceSlug) {
      setStatus('No race specified.', true);
      return;
    }
    try {
      const data = await fetchCandidates(raceSlug);
      if (!data.candidates || data.candidates.length < 2) {
        setStatus('This race does not have enough candidates to simulate a split.', true);
        return;
      }
      setStatus('');
      render(data);
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  init();
})();
