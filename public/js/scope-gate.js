/* public/js/scope-gate.js */
(() => {
  const form = document.getElementById('scope-form');
  const errorEl = document.getElementById('form-error');
  const url = new URL(window.location.href);
  const initialSlug = url.searchParams.get('survey');
  const sessionKey = 'scope_session_id';
  const nameKey = 'gm_fn';
  const lastNameKey = 'gm_ln';
  const emailKey = 'gm_email';

  if (!form) {
    return;
  }

  const setError = (message) => {
    if (errorEl) {
      errorEl.textContent = message;
    }
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

  const storeUserInfo = (fn, ln, email) => {
    try {
      sessionStorage.setItem(nameKey, fn);
      sessionStorage.setItem(lastNameKey, ln);
      sessionStorage.setItem(emailKey, email);
    } catch (error) {
      return;
    }
  };

  const getStoredSession = () => {
    try {
      return sessionStorage.getItem(sessionKey);
    } catch (error) {
      return '';
    }
  };

  const storeSession = (sessionId) => {
    if (!sessionId) {
      return;
    }
    try {
      sessionStorage.setItem(sessionKey, sessionId);
    } catch (error) {
      return;
    }
  };

  const startSession = async () => {
    const response = await fetch('/api/scope/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        survey: initialSlug || '',
      }),
    });

    if (!response.ok) {
      throw new Error('Scope start failed');
    }

    const data = await response.json();
    storeSession(data.session_id);
    return data.session_id;
  };

  const resolveSurveySlug = async () => {
    if (initialSlug) {
      return initialSlug;
    }

    try {
      const response = await fetch('/api/surveys/list', { credentials: 'same-origin' });
      if (!response.ok) {
        return null;
      }
      const surveys = await response.json();
      const firstActive = Array.isArray(surveys)
        ? surveys.find((survey) => survey.status === 'active')
        : null;
      return firstActive ? firstActive.slug : null;
    } catch (error) {
      return null;
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');

    const payload = {
      session_id: getStoredSession(),
      geo: {
        zip: form.elements.zip.value.trim(),
        city: '',
        county: '',
        state: '',
      },
      districts: {
        sldl: '',
        sldu: '',
        cd: '',
        senate_state: '',
      },
      match_source: 'zip_hint',
      match_quality: 'partial',
    };

    try {
      const fn = form.elements.firstName.value.trim();
      const ln = form.elements.lastName.value.trim();
      const emailInput = form.elements.email;
      const email = emailInput.value.trim();
      emailInput.value = email;
      if (!email || !isValidEmail(emailInput)) {
        setError('Please provide a valid email address.');
        return;
      }
      storeUserInfo(fn, ln, email);

      if (!payload.session_id) {
        payload.session_id = await startSession();
      }

      const response = await fetch('/api/scope/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Scope lookup failed');
      }

      const data = await response.json();
      const scopes = data && Array.isArray(data.scopes) ? data.scopes : ['public'];
      const scope = scopes.includes('state:WY') || scopes.includes('senate:WY') ? 'wy' : 'public';
      sessionStorage.setItem('survey_scope', scope);
      const surveySlug = await resolveSurveySlug();
      if (!surveySlug) {
        window.location.href = '/surveys/list/';
        return;
      }
      window.location.href = `/surveys/take/${encodeURIComponent(surveySlug)}`;
    } catch (error) {
      setError('We could not verify your scope yet. Please try again.');
    }
  });
})();
