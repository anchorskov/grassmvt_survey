/* public/js/turnstile-loader.js */
(() => {
  if (window.TurnstileLoader) {
    return;
  }

  const loadTurnstileScript = () => {
    if (window.__turnstilePromise) {
      return window.__turnstilePromise;
    }
    if (window.turnstile) {
      return Promise.resolve();
    }
    window.__turnstilePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        resolve();
      };
      script.onerror = () => {
        window.__turnstilePromise = null;
        reject(new Error('Turnstile failed to load.'));
      };
      document.head.appendChild(script);
    });
    return window.__turnstilePromise;
  };

  window.TurnstileLoader = {
    load: loadTurnstileScript,
  };
  window.__turnstileLoaderLoaded = true;
})();
