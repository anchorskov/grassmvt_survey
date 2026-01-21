/* public/js/scope-gate.js */
(() => {
  const form = document.getElementById('scope-form');
  const errorEl = document.getElementById('form-error');

  if (!form) {
    return;
  }

  const setError = (message) => {
    if (errorEl) {
      errorEl.textContent = message;
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');

    const payload = {
      first_name: form.elements.firstName.value.trim(),
      last_name: form.elements.lastName.value.trim(),
      zip: form.elements.zip.value.trim(),
      house_number: form.elements.houseNumber.value.trim(),
    };

    try {
      const response = await fetch('/api/scope', {
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
      const scope = data && (data.scope === 'wy' || data.scope === 'public') ? data.scope : 'public';
      sessionStorage.setItem('survey_scope', scope);
      window.location.href = '/surveys/list/';
    } catch (error) {
      setError('We could not verify your scope yet. Please try again.');
    }
  });
})();
