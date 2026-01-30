/* public/js/auth/turnstile-client.js */
(() => {
  if (window.TurnstileClient) {
    return;
  }

  let loadPromise = null;
  const widgetByContainer = new WeakMap();
  const executionByWidget = new Map();

  const normalizeSize = (size) => {
    const allowed = new Set(['normal', 'compact', 'flexible']);
    if (allowed.has(size)) {
      return size;
    }
    return 'flexible';
  };

  const resolveExecution = (widgetId, token, isError) => {
    const entry = executionByWidget.get(widgetId);
    if (!entry) {
      return;
    }
    executionByWidget.delete(widgetId);
    if (isError) {
      entry.resolve('');
      return;
    }
    entry.resolve(token || '');
  };

  const loadTurnstileOnce = async ({ siteKey } = {}) => {
    if (!siteKey) {
      return false;
    }
    if (window.turnstile) {
      return true;
    }
    if (loadPromise) {
      return loadPromise;
    }
    if (window.TurnstileLoader && typeof window.TurnstileLoader.load === 'function') {
      loadPromise = window.TurnstileLoader.load()
        .then(() => !!window.turnstile)
        .catch(() => false);
      return loadPromise;
    }
    loadPromise = new Promise((resolve) => {
      const existing = document.querySelector('script[data-turnstile-api]');
      if (existing) {
        existing.addEventListener('load', () => resolve(!!window.turnstile), { once: true });
        existing.addEventListener('error', () => resolve(false), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.setAttribute('data-turnstile-api', 'true');
      script.addEventListener('load', () => resolve(!!window.turnstile), { once: true });
      script.addEventListener('error', () => resolve(false), { once: true });
      document.head.appendChild(script);
    });
    return loadPromise;
  };

  const renderTurnstile = async ({
    container,
    siteKey,
    appearance,
    size,
    onSuccess,
    onError,
    onExpire,
  }) => {
    if (!container || !siteKey) {
      return null;
    }
    const loaded = await loadTurnstileOnce({ siteKey });
    if (!loaded || !window.turnstile) {
      return null;
    }
    const existingWidget = widgetByContainer.get(container);
    if (existingWidget !== undefined) {
      return existingWidget;
    }
    let widgetId = null;
    const widgetAppearance = appearance || 'interaction-only';
    const widgetSize = normalizeSize(size);
    widgetId = window.turnstile.render(container, {
      sitekey: siteKey,
      appearance: widgetAppearance,
      size: widgetSize,
      callback: (token) => {
        if (typeof onSuccess === 'function') {
          onSuccess(token);
        }
        if (widgetId !== null) {
          resolveExecution(widgetId, token, false);
        }
      },
      'error-callback': () => {
        if (typeof onError === 'function') {
          onError();
        }
        if (widgetId !== null) {
          resolveExecution(widgetId, '', true);
        }
      },
      'expired-callback': () => {
        if (typeof onExpire === 'function') {
          onExpire();
        }
        if (widgetId !== null) {
          resolveExecution(widgetId, '', true);
        }
      },
    });
    widgetByContainer.set(container, widgetId);
    return widgetId;
  };

  const getTokenOrExecute = ({ widgetId }) => {
    if (widgetId === null || widgetId === undefined) {
      return Promise.resolve('');
    }
    if (!window.turnstile || typeof window.turnstile.execute !== 'function') {
      return Promise.resolve('');
    }
    const existing = executionByWidget.get(widgetId);
    if (existing) {
      return existing.promise;
    }
    try {
      window.turnstile.reset(widgetId);
    } catch (error) {
      // Reset can fail if the widget is not ready yet.
    }
    let resolvePromise;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    executionByWidget.set(widgetId, { promise, resolve: resolvePromise });
    try {
      window.turnstile.execute(widgetId);
    } catch (error) {
      executionByWidget.delete(widgetId);
      return Promise.resolve('');
    }
    return promise;
  };

  const resetWidget = (widgetId) => {
    if (widgetId === null || widgetId === undefined) {
      return;
    }
    if (window.turnstile && typeof window.turnstile.reset === 'function') {
      try {
        window.turnstile.reset(widgetId);
      } catch (error) {
        // Ignore reset errors.
      }
    }
    executionByWidget.delete(widgetId);
  };

  window.TurnstileClient = {
    loadTurnstileOnce,
    renderTurnstile,
    getTokenOrExecute,
    resetWidget,
  };
})();
