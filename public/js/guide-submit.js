/* public/js/guide-submit.js
 * Candidate questionnaire submission form. Token-gated via ?token= in the URL,
 * no account required. Fetches /api/guide/questions and posts to
 * /api/guide/submit-answer. Submission can be partial.
 */
(() => {
  const root = document.getElementById('guide-submit-root');
  const intro = document.getElementById('guide-submit-intro');
  const errorEl = document.getElementById('guide-submit-error');

  const POSITIONS = [
    { value: 'strongly_support', label: 'Strongly support' },
    { value: 'support', label: 'Support' },
    { value: 'neutral', label: 'Neutral / mixed' },
    { value: 'oppose', label: 'Oppose' },
    { value: 'strongly_oppose', label: 'Strongly oppose' },
  ];

  const FIRMNESS = [
    { value: '', label: '(none selected)' },
    { value: 'core', label: 'Core position — will not change' },
    { value: 'leaning', label: 'Leaning — direction is clear, specifics may evolve' },
    { value: 'open', label: 'Open to discussion — willing to hear evidence and refine' },
  ];

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

  async function fetchQuestions(token) {
    const res = await fetch(`/api/guide/questions?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Could not load your questionnaire.');
    }
    return data;
  }

  async function submitAnswers(token, responses) {
    const res = await fetch('/api/guide/submit-answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, responses }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Save failed.');
    }
    return data;
  }

  function renderQuestion(q) {
    const positionButtons = POSITIONS.map((p) => `
      <label class="quiz-position-option">
        <input type="radio" name="position-${q.id}" value="${p.value}" data-question-id="${q.id}"
          ${q.position === p.value ? 'checked' : ''} />
        <span>${escH(p.label)}</span>
      </label>`).join('');

    const firmnessOptions = FIRMNESS.map((f) => `
      <option value="${f.value}" ${q.firmness === f.value ? 'selected' : ''}>${escH(f.label)}</option>`).join('');

    const reviewedBadge = q.reviewed
      ? '<span class="quiz-question__badge">Live on your profile</span>'
      : (q.position ? '<span class="quiz-question__badge quiz-question__badge--pending">Submitted, awaiting review</span>' : '');

    return `
      <div class="quiz-question" data-question-id="${q.id}">
        <p class="quiz-question__text">${escH(q.question_text)} ${reviewedBadge}</p>
        <div class="quiz-question__positions">${positionButtons}</div>
        <div class="form-row">
          <label for="explanation-${q.id}">Explanation (optional, in your own words, 500 characters max)</label>
          <textarea id="explanation-${q.id}" class="guide-submit-explanation" data-question-id="${q.id}"
            maxlength="500" rows="3">${escH(q.explanation)}</textarea>
        </div>
        <div class="form-row">
          <label for="source-${q.id}">Source link (optional)</label>
          <input type="url" id="source-${q.id}" class="guide-submit-source" data-question-id="${q.id}"
            value="${escH(q.source_url)}" placeholder="https://" />
        </div>
        <div class="form-row">
          <label for="firmness-${q.id}">How firm is this position? (optional)</label>
          <select id="firmness-${q.id}" class="guide-submit-firmness" data-question-id="${q.id}">
            ${firmnessOptions}
          </select>
        </div>
        <label class="quiz-question__top-priority">
          <input type="checkbox" class="guide-submit-top-priority" data-question-id="${q.id}"
            ${q.is_top_priority ? 'checked' : ''} />
          This is one of my top campaign priorities
        </label>
      </div>`;
  }

  function render(data) {
    intro.textContent = `${data.candidate_name} — ${data.race_title}. Every candidate in this race receives the same questions. You can submit a partial answer and come back to finish later.`;

    const questionsHtml = data.questions.map(renderQuestion).join('');
    root.innerHTML = `
      <div class="quiz-categories">${questionsHtml}</div>
      <div class="quiz-actions">
        <button type="button" class="button button--primary" id="guide-submit-btn">Submit my answers</button>
        <p class="quiz-save-msg" id="guide-submit-msg" aria-live="polite"></p>
      </div>`;

    document.getElementById('guide-submit-btn').addEventListener('click', async () => {
      const msgEl = document.getElementById('guide-submit-msg');
      const responses = data.questions.map((q) => {
        const checked = root.querySelector(`input[name="position-${CSS.escape(String(q.id))}"]:checked`);
        return {
          question_id: q.id,
          position: checked ? checked.value : null,
          explanation: root.querySelector(`.guide-submit-explanation[data-question-id="${q.id}"]`)?.value || '',
          source_url: root.querySelector(`.guide-submit-source[data-question-id="${q.id}"]`)?.value || '',
          firmness: root.querySelector(`.guide-submit-firmness[data-question-id="${q.id}"]`)?.value || '',
          is_top_priority: !!root.querySelector(`.guide-submit-top-priority[data-question-id="${q.id}"]`)?.checked,
        };
      }).filter((r) => r.position);

      if (responses.length === 0) {
        msgEl.textContent = 'Answer at least one question before submitting.';
        return;
      }

      msgEl.textContent = 'Submitting…';
      try {
        const token = getToken();
        const result = await submitAnswers(token, responses);
        msgEl.textContent = `Saved ${result.saved} answer(s). An admin will review before they go live. You can return to this link anytime to update your answers.`;
      } catch (err) {
        msgEl.textContent = err.message || 'Could not save. Please try again.';
      }
    });
  }

  async function init() {
    const token = getToken();
    if (!token) {
      intro.textContent = '';
      showError('No questionnaire link token found. Use the link from your notification email.');
      return;
    }
    try {
      const data = await fetchQuestions(token);
      render(data);
    } catch (err) {
      intro.textContent = '';
      showError(err.message);
    }
  }

  init();
})();
