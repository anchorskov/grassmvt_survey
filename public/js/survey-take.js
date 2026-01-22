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
  const helloName = document.getElementById('survey-hello-name');
  const emailInput = form.querySelector('input[name="email"]');
  const tokenInput = form.querySelector('input[name="token"]');
  const firstNameKey = 'gm_fn';
  const lastNameKey = 'gm_ln';
  const emailKey = 'gm_email';
  const tokenKey = 'gm_token';

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

  const isValidEmail = (input) => {
    if (!input) {
      return false;
    }
    if (typeof input.checkValidity === 'function') {
      return input.checkValidity();
    }
    const value = input.value || '';
    return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
  };

  const readStored = (key) => {
    try {
      return sessionStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  };

  const storedFn = readStored(firstNameKey);
  const storedLn = readStored(lastNameKey);
  const storedEmail = readStored(emailKey);
  const url = new URL(window.location.href);
  const tokenFromUrl = url.searchParams.get('token') || '';
  const fullName = `${storedFn} ${storedLn}`.trim();

  if (helloName) {
    helloName.textContent = fullName ? ` ${fullName}.` : '.';
  }

  if (emailInput && storedEmail) {
    emailInput.value = storedEmail;
  }

  if (tokenFromUrl && tokenInput) {
    tokenInput.value = tokenFromUrl;
    try {
      sessionStorage.setItem(tokenKey, tokenFromUrl);
    } catch (error) {
      return;
    }
  } else if (tokenInput) {
    const storedToken = readStored(tokenKey);
    tokenInput.value = storedToken;
  }

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

    const emailValue = emailInput ? emailInput.value.trim() : '';
    if (emailInput) {
      emailInput.value = emailValue;
    }
    if (!emailValue || !isValidEmail(emailInput)) {
      setError('Please provide a valid email address for your receipt.');
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const formData = new FormData(form);
      formData.set('fn', storedFn);
      formData.set('ln', storedLn);
      formData.set('email', emailValue);
      if (tokenInput && tokenInput.value) {
        formData.set('token', tokenInput.value);
      }

      const response = await fetch(form.action, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Submit failed');
      }

      const data = await response.json();
      if (!data || !data.submission_id) {
        throw new Error('Missing receipt');
      }

      if (data.token) {
        try {
          sessionStorage.setItem(tokenKey, data.token);
        } catch (error) {
          return;
        }
      }

      if (data.complete && data.receipt_url) {
        window.location.href = data.receipt_url;
        return;
      }

      if (data.next_survey_slug && data.receipt_url) {
        window.location.href = data.receipt_url;
        return;
      }

      form.classList.add('is-hidden');
      setSuccess(
        `<p>Thank you for your response. Your receipt ID is <strong>${data.submission_id}</strong>.</p>`
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
