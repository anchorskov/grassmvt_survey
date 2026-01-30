/* src/lib/debug-auth.js */
const isTruthy = (value) => {
  if (value === undefined || value === null) {
    return false;
  }
  const text = String(value).trim().toLowerCase();
  return text !== '' && text !== '0' && text !== 'false' && text !== 'off';
};

const isLocalHost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1';

const toHexPrefix = (buffer, length) => {
  const bytes = new Uint8Array(buffer);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, length);
};

const hashCredentialIdPrefix = async (value) => {
  if (!value || !globalThis.crypto || !globalThis.crypto.subtle) {
    return '';
  }
  let bytes;
  if (typeof value === 'string') {
    bytes = new TextEncoder().encode(value);
  } else if (value instanceof ArrayBuffer) {
    bytes = new Uint8Array(value);
  } else if (ArrayBuffer.isView(value)) {
    bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  } else {
    return '';
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return toHexPrefix(digest, 8);
};

export const shouldDebugPasskeys = (env, request) => {
  if (!isTruthy(env.PASSKEY_DEBUG)) {
    return false;
  }
  const envName = (env.ENVIRONMENT || '').toLowerCase();
  const workerEnv = (env.WORKER_ENV || '').toLowerCase();
  const hostname = new URL(request.url).hostname;
  return isLocalHost(hostname) || envName === 'local' || workerEnv === 'local';
};

export const logPasskeyVerifyFailure = async ({ code, rayId, hostname, step, details, exceptionName }) => {
  const safeRay = rayId || 'unknown';
  const output = {
    code,
    step,
    rayId: safeRay,
    host: hostname,
    details: details || {},
  };
  if (exceptionName) {
    output.exceptionName = exceptionName;
  }
  if (details && details.credentialIdValue) {
    const hash = await hashCredentialIdPrefix(details.credentialIdValue);
    if (hash) {
      output.details.credentialIdHash = hash;
    }
    delete output.details.credentialIdValue;
  }
  console.log(`[PasskeyDebug] ${JSON.stringify(output)}`);
};
