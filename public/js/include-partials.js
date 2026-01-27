/* public/js/include-partials.js */
(() => {
  const includeTargets = document.querySelectorAll('[data-include]');
  if (!includeTargets.length) {
    return;
  }

  const loadInclude = async (target) => {
    const includePath = target.getAttribute('data-include');
    if (!includePath || !includePath.startsWith('/')) {
      return;
    }

    try {
      const response = await fetch(includePath, { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error(`Include failed: ${response.status}`);
      }
      target.innerHTML = await response.text();
    } catch (error) {
      target.removeAttribute('data-include');
    }
  };

  const includePromises = Array.from(includeTargets, (target) => loadInclude(target));

  Promise.allSettled(includePromises).then(() => {
    if (!window.__authModalLoaded) {
      const script = document.createElement('script');
      script.src = '/js/auth-modal.js';
      script.defer = true;
      document.body.appendChild(script);
      window.__authModalLoaded = true;
    }
  });
})();
