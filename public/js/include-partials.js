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
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.addEventListener('load', () => {
        window[flagName] = true;
        resolve(true);
      });
      script.addEventListener('error', () => {
        resolve(false);
      });
      document.body.appendChild(script);
    });
  };

  Promise.allSettled(includePromises).then(async () => {
    await loadScriptOnce('/js/turnstile-loader.js', '__turnstileLoaderLoaded');
    await loadScriptOnce('/js/auth/turnstile-client.js', '__turnstileClientLoaded');
    await loadScriptOnce('/js/auth-shared.js', '__authSharedLoaded');
    await loadScriptOnce('/js/login-modal.js', '__loginModalLoaded');
    await loadScriptOnce('/js/signup-modal.js', '__signupModalLoaded');
    await loadScriptOnce('/js/password-reset-modal.js', '__passwordResetModalLoaded');
  });
})();
