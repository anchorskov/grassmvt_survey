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

  const loadScriptOnce = (src, flagName) => {
    if (window[flagName]) {
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    document.body.appendChild(script);
    window[flagName] = true;
  };

  Promise.allSettled(includePromises).then(() => {
    loadScriptOnce('/js/turnstile-loader.js', '__turnstileLoaderLoaded');
    loadScriptOnce('/js/auth-shared.js', '__authSharedLoaded');
    loadScriptOnce('/js/login-modal.js', '__loginModalLoaded');
    loadScriptOnce('/js/signup-modal.js', '__signupModalLoaded');
    loadScriptOnce('/js/password-reset-modal.js', '__passwordResetModalLoaded');
  });
})();
