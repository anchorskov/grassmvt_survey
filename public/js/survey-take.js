/* public/js/survey-take.js */
(() => {
  const form = document.querySelector('[data-survey-form]');
  if (!form) {
    return;
  }

  const errorEl = document.getElementById('survey-error');
  const successEl = document.getElementById('survey-success');
  const biasCheckbox = document.getElementById('biased');
  const biasNote = document.querySelector('.bias-note');
  const submitButton = form.querySelector('button[type="submit"]');

  const setError = (message) => {
    if (!errorEl) {
      return;
    }
    errorEl.textContent = message;
    errorEl.classList.toggle('is-hidden', !message);
  };

  const setSuccess = (html) => {
    if (!successEl) {
      return;
    }
    successEl.innerHTML = html;
    successEl.classList.remove('is-hidden');
  };

  if (biasCheckbox && biasNote) {
    biasCheckbox.addEventListener('change', () => {
      biasNote.classList.toggle('is-hidden', !biasCheckbox.checked);
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');

    const selected = form.querySelector('input[name="selected_key"]:checked');
    if (!selected) {
      setError('Please select one option to continue.');
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
      });

      if (!response.ok) {
        throw new Error('Submit failed');
      }

      const data = await response.json();
      if (!data || !data.submission_id) {
        throw new Error('Missing receipt');
      }

      form.classList.add('is-hidden');
      setSuccess(
        `<p>Thank you for your response. Your receipt ID is <strong>${data.submission_id}</strong>.</p>
         <p><a href="${data.receipt_url}">View receipt</a></p>`
      );
    } catch (error) {
      setError('We could not submit your response yet. Please try again.');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
})();
