/* public/js/passkey-debug.js */
/* Lightweight debug harness for passkey login flow */

(() => {
  const LOG_KEY = 'passkey_debug_logs';
  const MAX_LOGS = 100;
  
  // Utility: get current timestamp
  const now = () => new Date().toISOString();
  
  // Utility: serialize values for logging (handle ArrayBuffer, Uint8Array, etc.)
  const serializeValue = (value, depth = 0) => {
    if (depth > 5) return '[circular]';
    
    if (value === null) return null;
    if (value === undefined) return undefined;
    
    if (value instanceof ArrayBuffer) {
      const view = new Uint8Array(value);
      return {
        __type: 'ArrayBuffer',
        byteLength: value.byteLength,
        preview: Array.from(view.slice(0, 8))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
      };
    }
    
    if (value instanceof Uint8Array) {
      return {
        __type: 'Uint8Array',
        length: value.length,
        preview: Array.from(value.slice(0, 8))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
      };
    }
    
    if (typeof value === 'object' && value.constructor) {
      if (value.constructor.name === 'ArrayBuffer') {
        return serializeValue(new Uint8Array(value), depth + 1);
      }
    }
    
    if (typeof value === 'object') {
      const result = {};
      for (const key of Object.keys(value).slice(0, 20)) {
        try {
          result[key] = serializeValue(value[key], depth + 1);
        } catch (e) {
          result[key] = `[error: ${e.message}]`;
        }
      }
      return result;
    }
    
    if (typeof value === 'string' && value.length > 200) {
      return value.substring(0, 200) + '...';
    }
    
    return value;
  };
  
  // Utility: get type info
  const getTypeInfo = (value) => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (value instanceof ArrayBuffer) return 'ArrayBuffer';
    if (value instanceof Uint8Array) return 'Uint8Array';
    if (typeof value === 'string') return `string(${value.length})`;
    return typeof value;
  };
  
  // Core logging function
  const log = (event, details = {}) => {
    const entry = {
      timestamp: now(),
      event,
      details: serializeValue(details),
    };
    
    const logs = getLogs();
    logs.push(entry);
    
    if (logs.length > MAX_LOGS) {
      logs.shift();
    }
    
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    } catch (e) {
      console.warn('[PasskeyDebug] Failed to save logs:', e.message);
    }
    
    // Also log to console in debug mode
    if (window.location.search.includes('debug=passkey')) {
      console.log(`[PasskeyDebug] ${event}`, details);
    }
  };
  
  // Retrieve logs
  const getLogs = () => {
    try {
      const stored = localStorage.getItem(LOG_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn('[PasskeyDebug] Failed to retrieve logs:', e.message);
      return [];
    }
  };
  
  // Clear logs
  const clearLogs = () => {
    try {
      localStorage.removeItem(LOG_KEY);
    } catch (e) {
      console.warn('[PasskeyDebug] Failed to clear logs:', e.message);
    }
  };
  
  // Get last error
  const getLastError = () => {
    const logs = getLogs();
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].event.includes('error') || logs[i].event.includes('failed')) {
        return logs[i];
      }
    }
    return null;
  };
  
  // Intercept fetch to log passkey requests/responses
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource.url;
    
    // Only intercept passkey endpoints
    if (!url.includes('/passkey/')) {
      return originalFetch.apply(this, args);
    }
    
    const method = (config?.method || 'GET').toUpperCase();
    
    // Log request
    if (method === 'POST') {
      let bodyForLog = {};
      if (config?.body) {
        try {
          bodyForLog = JSON.parse(config.body);
        } catch (e) {
          bodyForLog = { raw: config.body };
        }
      }
      
      if (url.includes('/login/options')) {
        log('OPTIONS_REQUEST', { url, method });
      } else if (url.includes('/login/verify')) {
        log('VERIFY_REQUEST', {
          url,
          method,
          challengeId: bodyForLog.challengeId,
          assertionResponseId: {
            value: bodyForLog.assertionResponse?.id,
            type: getTypeInfo(bodyForLog.assertionResponse?.id),
          },
          assertionResponseRawId: {
            value: bodyForLog.assertionResponse?.rawId,
            type: getTypeInfo(bodyForLog.assertionResponse?.rawId),
          },
          assertionResponseType: bodyForLog.assertionResponse?.type,
          clientDataJSONLength: bodyForLog.assertionResponse?.response?.clientDataJSON?.length,
        });
      }
    }
    
    // Execute fetch
    let response;
    try {
      response = await originalFetch.apply(this, args);
    } catch (error) {
      log('FETCH_ERROR', { url, method, error: error.message });
      throw error;
    }
    
    // Log response
    if (method === 'POST' && url.includes('/passkey/')) {
      const responseClone = response.clone();
      const status = response.status;
      
      let responseData = {};
      try {
        responseData = await responseClone.json();
      } catch (e) {
        responseData = { parseError: e.message };
      }
      
      if (url.includes('/login/options')) {
        log('OPTIONS_RESPONSE', {
          status,
          ok: response.ok,
          challengeId: responseData.challengeId,
          optionsChallenge: {
            value: responseData.options?.challenge,
            type: getTypeInfo(responseData.options?.challenge),
          },
          optionsAllowCredentials: responseData.options?.allowCredentials?.length || 0,
        });
      } else if (url.includes('/login/verify')) {
        if (response.ok) {
          log('VERIFY_SUCCESS', { status, responseData });
        } else {
          log('VERIFY_FAILED', {
            status,
            code: responseData.code,
            message: responseData.message || responseData.error,
            fullResponse: responseData,
          });
        }
      }
    }
    
    return response;
  };
  
  // Expose API
  window.PasskeyDebug = {
    log,
    getLogs,
    clearLogs,
    getLastError,
    getTypeInfo,
    getSerializedValue: serializeValue,
  };
  
  // Auto-log page load
  log('PAGE_LOADED', {
    url: window.location.href,
    userAgent: navigator.userAgent,
    hasPublicKeyCredential: !!window.PublicKeyCredential,
  });
  
  // Log when passkey button is clicked
  document.addEventListener('DOMContentLoaded', () => {
    const passkeyButton = document.getElementById('passkey-login-button');
    if (passkeyButton) {
      passkeyButton.addEventListener('click', () => {
        log('PASSKEY_LOGIN_CLICKED', { timestamp: now() });
      });
    }
  });
  
  console.log('[PasskeyDebug] Initialized. Use window.PasskeyDebug API to inspect logs.');
  console.log('[PasskeyDebug] Query param: ?debug=passkey to enable verbose console logging.');
  console.log('[PasskeyDebug] View logs: window.PasskeyDebug.getLogs()');
})();
