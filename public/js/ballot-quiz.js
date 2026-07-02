/* public/js/ballot-quiz.js
 * Voter issue quiz — fetches /api/ballot/guide-questions and renders questions
 * grouped by issue category. Saves to localStorage on every change (scratch
 * pad) and syncs to /api/ballot/submit-quiz on explicit save.
 */
(() => {
  const AUTH_RETURN_KEY = 'auth_return_to';
  const LOCAL_KEY = 'ballot_quiz_scratch';

  const root = document.getElementById('quiz-root');
  const status = document.getElementById('quiz-status');

  const POSITIONS = [
    { value: 'strongly_support', label: 'Strongly support' },
    { value: 'support', label: 'Support' },
    { value: 'neutral', label: 'Neutral / mixed' },
    { value: 'oppose', label: 'Oppose' },
    { value: 'strongly_oppose', label: 'Strongly oppose' },
  ];

  const WEIGHTS = [
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
    { value: 'skip', label: "Doesn't matter to me" },
  ];

  const CATEGORY_LABELS = {
    economy: 'Economy',
    land_use: 'Land & Energy',
    energy: 'Land & Energy',
    constitutional: 'Constitutional & Governance',
    health_care: 'Health Care',
    education: 'Education',
    local_control: 'Local Control',
    other: 'Other',
  };

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
      // localStorage unavailable (private browsing); redirect still proceeds.
    }
    window.location.href = '/auth/magic-link/';
  }

  async function fetchQuestions() {
    const res = await fetch('/api/ballot/guide-questions', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load quiz (${res.status})`);
    }
    return res.json();
  }

  async function submitQuiz(responses) {
    const res = await fetch('/api/ballot/submit-quiz', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ responses }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Save failed');
    }
    return res.json();
  }

  function loadScratch() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveScratch(scratch) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(scratch));
    } catch (_) {
      // localStorage unavailable (private browsing); DB save on submit still works.
    }
  }

  function groupByCategory(questions) {
    const groups = new Map();
    for (const q of questions) {
      if (!groups.has(q.issue_category)) groups.set(q.issue_category, []);
      groups.get(q.issue_category).push(q);
    }
    return groups;
  }

  function renderQuestion(q, scratch) {
    const saved = scratch[q.id] || { position: q.voter_position, weight: q.voter_weight || 'medium' };
    const positionButtons = POSITIONS.map((p) => `
      <label class="quiz-position-option">
        <input type="radio" name="position-${q.id}" value="${p.value}" data-question-id="${q.id}"
          ${saved.position === p.value ? 'checked' : ''} />
        <span>${escH(p.label)}</span>
      </label>`).join('');

    const weightOptions = WEIGHTS.map((w) => `
      <option value="${w.value}" ${saved.weight === w.value ? 'selected' : ''}>${escH(w.label)}</option>`).join('');

    return `
      <div class="quiz-question" data-question-id="${q.id}">
        <p class="quiz-question__text">${escH(q.question_text)}</p>
        <div class="quiz-question__positions">${positionButtons}</div>
        <div class="quiz-question__weight">
          <label for="weight-${q.id}">How much does this matter to you?</label>
          <select id="weight-${q.id}" class="quiz-weight-select" data-question-id="${q.id}">
            ${weightOptions}
          </select>
        </div>
      </div>`;
  }

  function renderCategory(category, questions, scratch, isOpen) {
    const label = CATEGORY_LABELS[category] || category;
    const questionsHtml = questions.map((q) => renderQuestion(q, scratch)).join('');
    return `
      <details class="quiz-category" data-category="${escH(category)}" ${isOpen ? 'open' : ''}>
        <summary class="quiz-category__summary">${escH(label)}</summary>
        <div class="quiz-category__body">${questionsHtml}</div>
      </details>`;
  }

  function countAnswered(scratch) {
    return Object.values(scratch).filter((r) => r.weight === 'skip' || r.position).length;
  }

  function render(data, scratch) {
    const groups = groupByCategory(data.questions);
    let first = true;
    const sections = [];
    for (const [category, questions] of groups.entries()) {
      sections.push(renderCategory(category, questions, scratch, first));
      first = false;
    }

    root.innerHTML = `
      <div class="quiz-progress" id="quiz-progress"></div>
      <div class="quiz-categories">${sections.join('')}</div>
      <div class="quiz-actions">
        <button type="button" class="button button--primary" id="quiz-save-btn">Save my answers</button>
        <a class="button button--secondary" href="/ballot/" id="quiz-ballot-link">See my ballot &rarr;</a>
        <p class="quiz-save-msg" id="quiz-save-msg" aria-live="polite"></p>
      </div>`;

    updateProgress(data.questions.length, scratch);
    wireQuiz(data.questions, scratch);
  }

  function updateProgress(total, scratch) {
    const el = document.getElementById('quiz-progress');
    if (!el) return;
    const answered = countAnswered(scratch);
    el.textContent = `${answered} of ${total} questions answered`;
  }

  function wireQuiz(questions, scratch) {
    const totalQuestions = questions.length;

    root.addEventListener('change', (e) => {
      const radio = e.target.closest('input[type="radio"][data-question-id]');
      const select = e.target.closest('select[data-question-id]');

      if (radio) {
        const qId = radio.dataset.questionId;
        scratch[qId] = scratch[qId] || { position: null, weight: 'medium' };
        scratch[qId].position = radio.value;
        saveScratch(scratch);
        updateProgress(totalQuestions, scratch);
      }

      if (select) {
        const qId = select.dataset.questionId;
        scratch[qId] = scratch[qId] || { position: null, weight: 'medium' };
        scratch[qId].weight = select.value;
        if (select.value === 'skip') {
          root.querySelectorAll(`input[name="position-${CSS.escape(qId)}"]`).forEach((r) => { r.checked = false; });
          scratch[qId].position = null;
        }
        saveScratch(scratch);
        updateProgress(totalQuestions, scratch);
      }
    });

    document.getElementById('quiz-save-btn').addEventListener('click', async () => {
      const msgEl = document.getElementById('quiz-save-msg');
      const responses = questions.map((q) => {
        const saved = scratch[q.id] || {};
        return {
          question_id: q.id,
          position: saved.weight === 'skip' ? null : (saved.position ?? null),
          weight: saved.weight || 'medium',
        };
      });
      msgEl.textContent = 'Saving…';
      try {
        await submitQuiz(responses);
        msgEl.textContent = 'Saved! See my ballot below to compare candidates, or come back and adjust anytime.';
      } catch (err) {
        msgEl.textContent = 'Could not save. Please try again.';
      }
    });
  }

  async function init() {
    const user = await ensureAuth();
    if (!user) {
      redirectLogin();
      return;
    }

    let data;
    try {
      data = await fetchQuestions();
    } catch (err) {
      setStatus(err.message, true);
      return;
    }

    if (!data.questions || data.questions.length === 0) {
      setStatus('No quiz questions are available yet. Check back soon.');
      return;
    }

    // Merge server-saved answers into scratch pad, preferring local scratch
    // only when it has no server-recorded counterpart yet.
    const scratch = loadScratch();
    for (const q of data.questions) {
      if (!scratch[q.id] && (q.voter_position || q.voter_weight)) {
        scratch[q.id] = { position: q.voter_position, weight: q.voter_weight || 'medium' };
      }
    }
    saveScratch(scratch);

    setStatus('');
    render(data, scratch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
