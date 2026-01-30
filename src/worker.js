/* src/worker.js */
import { D1Adapter } from '@lucia-auth/adapter-sqlite';
import { scrypt } from '@noble/hashes/scrypt';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { Lucia, TimeSpan } from 'lucia';
import snarkdown from 'snarkdown';
import { sendEmail } from './server/email/resend.js';

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parsePathParts = (pathname) => pathname.split('/').filter(Boolean);

const jsonResponse = (payload, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers,
  });
};

const parseJsonBody = async (request) => {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
};

const stableStringify = (value) => {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'undefined') {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
};

const sha256Hex = async (text) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const base64UrlEncode = (input) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const encodeJsonBase64Url = (value) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));

const sha256Base64Url = async (value) => {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hashBuffer));
};

const parseFormBody = async (request) => {
  try {
    const form = await request.formData();
    const data = {};
    form.forEach((value, key) => {
      data[key] = value.toString();
    });
    return data;
  } catch (error) {
    return {};
  }
};

const PASSWORD_MIN_LENGTH = 12;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 64 };
const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
const DEFAULT_ABSOLUTE_TIMEOUT_DAYS = 7;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_SALT_BYTES = 16;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const PASSWORD_RESET_TTL_MINUTES = 30;
const PASSWORD_RESET_EMAIL_LIMIT = 3;
const PASSWORD_RESET_IP_LIMIT = 5;
const PASSWORD_RESET_EMAIL_WINDOW_MINUTES = 30;
const PASSWORD_RESET_IP_WINDOW_MINUTES = 15;
const WEBAUTHN_CHALLENGE_TTL_MINUTES = 10;

const normalizeEmail = (value = '') => value.toString().trim().toLowerCase();

const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const getIdleTimeoutMinutes = (env) =>
  parsePositiveInt(env.IDLE_TIMEOUT_MINUTES, DEFAULT_IDLE_TIMEOUT_MINUTES);

const getAbsoluteTimeoutDays = (env) =>
  parsePositiveInt(env.ABSOLUTE_TIMEOUT_DAYS, DEFAULT_ABSOLUTE_TIMEOUT_DAYS);

const parseIsoMs = (value) => {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

const timingSafeEqual = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
};

const derivePbkdf2Key = async (password, salt, iterations) => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    key,
    256
  );
  return new Uint8Array(bits);
};

const hashPassword = async (password) => {
  const salt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(salt);
  const derivedKey = await derivePbkdf2Key(password, salt, PBKDF2_ITERATIONS);
  return [
    'pbkdf2',
    PBKDF2_ITERATIONS,
    bytesToHex(salt),
    bytesToHex(derivedKey),
  ].join('$');
};

const verifyPassword = async (password, stored) => {
  if (!stored || typeof stored !== 'string') {
    return false;
  }
  const parts = stored.split('$');
  if (parts[0] === 'pbkdf2') {
    if (parts.length !== 4) {
      return false;
    }
    const [, iterationsRaw, saltHex, hashHex] = parts;
    const iterations = Number(iterationsRaw);
    if (!iterations) {
      return false;
    }
    const salt = hexToBytes(saltHex);
    const expected = hexToBytes(hashHex);
    const derivedKey = await derivePbkdf2Key(password, salt, iterations);
    return timingSafeEqual(expected, derivedKey);
  }
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, n, r, p, saltHex, hashHex] = parts;
  const params = {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    dkLen: SCRYPT_PARAMS.dkLen,
  };
  if (!params.N || !params.r || !params.p) {
    return false;
  }
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(hashHex);
  const derivedKey = scrypt(new TextEncoder().encode(password), salt, params);
  return timingSafeEqual(expected, derivedKey);
};

const hashSignal = async (value, salt) => {
  if (!value || !salt) {
    return '';
  }
  return sha256Hex(`${salt}:${value}`);
};

const getHashSalt = (env) => (env.HASH_SALT || '').toString().trim();

const nowIso = () => new Date().toISOString();

const addMinutesIso = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();

const generateResetToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
};

const hashResetToken = async (salt, token) => sha256Hex(`${salt}${token}`);

const sendPasswordResetEmail = async (env, { to, resetUrl, replyTo }) => {
  const subject = 'Reset your Grassroots Movement password';
  const text = `Use this link to reset your password: ${resetUrl}`;
  const html = `Use this link to reset your password:<br />${resetUrl}`;
  return sendEmail(env, { to, subject, text, html, replyTo });
};

const getWebAuthnRpId = (request) => {
  const { hostname } = new URL(request.url);
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return hostname;
  }
  return hostname;
};

const getWebAuthnExpectedOrigin = (request) => new URL(request.url).origin;

const getWebAuthnRpName = (env) => (env.WEBAUTHN_RP_NAME || 'Grassroots Movement').toString();

const getSessionUser = async (request, env) => {
  const lucia = initializeLucia(env);
  const cookieHeader = request.headers.get('Cookie') || '';
  const sessionId = lucia.readSessionCookie(cookieHeader);
  if (!sessionId) {
    return { user: null, session: null, lucia, status: 'missing', headers: null };
  }
  if (!env.DB) {
    return { user: null, session: null, lucia, status: 'invalid', headers: null };
  }
  const sessionRow = await env.DB.prepare(
    `SELECT id, user_id, created_at, last_seen_at
     FROM session
     WHERE id = ?`
  )
    .bind(sessionId)
    .first();
  const { session, user } = await lucia.validateSession(sessionId);
  if (!sessionRow || !session || !user) {
    await lucia.invalidateSession(sessionId);
    const blank = lucia.createBlankSessionCookie();
    const headers = new Headers();
    headers.append('Set-Cookie', blank.serialize());
    return { user: null, session: null, lucia, status: 'invalid', headers };
  }
  const nowMs = Date.now();
  const createdAtMs = parseIsoMs(sessionRow.created_at) ?? nowMs;
  const lastSeenMs = parseIsoMs(sessionRow.last_seen_at) ?? createdAtMs;
  const idleTimeoutMinutes = getIdleTimeoutMinutes(env);
  const absoluteTimeoutDays = getAbsoluteTimeoutDays(env);
  const idleMs = idleTimeoutMinutes * 60 * 1000;
  const absoluteMs = absoluteTimeoutDays * 24 * 60 * 60 * 1000;
  const idleExpired = nowMs - lastSeenMs > idleMs;
  const absoluteExpired = nowMs - createdAtMs > absoluteMs;
  if (idleExpired || absoluteExpired) {
    await lucia.invalidateSession(sessionId);
    const blank = lucia.createBlankSessionCookie();
    const headers = new Headers();
    headers.append('Set-Cookie', blank.serialize());
    return { user: null, session: null, lucia, status: 'expired', headers };
  }
  const nextExpiresAtMs = Math.min(createdAtMs + absoluteMs, nowMs + idleMs);
  await env.DB.prepare(
    `UPDATE session
     SET last_seen_at = ?,
         created_at = COALESCE(created_at, ?),
         expires_at = ?
     WHERE id = ?`
  )
    .bind(new Date(nowMs).toISOString(), new Date(createdAtMs).toISOString(), Math.floor(nextExpiresAtMs / 1000), sessionId)
    .run();
  return { user, session, lucia, status: 'valid', headers: null };
};

const logAuthTiming = (route, rayId, step, startedAt) => {
  const elapsed = Date.now() - startedAt;
  const safeRay = rayId || 'unknown';
  console.log(`[AuthTiming] route=${route} rayId=${safeRay} step=${step} elapsed_ms=${elapsed}`);
};

const requireSessionUser = async (request, env) => {
  const result = await getSessionUser(request, env);
  if (result.status === 'expired') {
    return {
      response: jsonResponse(
        { ok: false, code: 'SESSION_EXPIRED' },
        { status: 401, headers: result.headers || undefined }
      ),
    };
  }
  if (result.status !== 'valid') {
    return {
      response: jsonResponse(
        { error: 'Unauthorized.', code: 'UNAUTHORIZED' },
        { status: 401, headers: result.headers || undefined }
      ),
    };
  }
  return result;
};

const cleanupExpiredWebauthnChallenges = async (env) => {
  if (!env.DB) {
    return;
  }
  await env.DB.prepare(
    `DELETE FROM webauthn_challenges
     WHERE expires_at <= ?`
  )
    .bind(nowIso())
    .run();
};

const getRequestSignals = async (request, env) => {
  const salt = env.HASH_SALT || '';
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    '';
  const userAgent = request.headers.get('user-agent') || '';
  return {
    ipHash: await hashSignal(ip, salt),
    userAgentHash: await hashSignal(userAgent, salt),
  };
};

const writeAuditEvent = async (env, request, { userId = null, eventType, metadata = null }) => {
  if (!env.DB) {
    return;
  }
  const signals = await getRequestSignals(request, env);
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  await env.DB.prepare(
    `INSERT INTO audit_events (user_id, event_type, ip_hash, user_agent_hash, metadata_json)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(userId, eventType, signals.ipHash || null, signals.userAgentHash || null, metadataJson)
    .run();
};

const isLocalEnv = (env) => (env.ENVIRONMENT || '').toLowerCase() === 'local';

let turnstileConfigLogged = false;

const enforceTurnstileBypassPolicy = (env) => {
  const envName = (env.ENVIRONMENT || '').toLowerCase();
  const bypassEnabled = (env.TURNSTILE_BYPASS || '').toLowerCase() === 'true';
  if (!turnstileConfigLogged) {
    console.log(`[Turnstile] env=${envName || 'unknown'} bypass=${bypassEnabled}`);
    turnstileConfigLogged = true;
  }
  if (envName === 'production' && bypassEnabled) {
    console.error('[Turnstile] Refusing to run with TURNSTILE_BYPASS in production');
    return jsonResponse(
      { ok: false, code: 'TURNSTILE_BYPASS_FORBIDDEN', message: 'Refusing to run with TURNSTILE_BYPASS in production' },
      { status: 500 }
    );
  }
  return null;
};

const requireSameOrigin = (request, env) => {
  const origin = request.headers.get('Origin');
  const requestOrigin = new URL(request.url).origin;
  if (!origin) {
    return isLocalEnv(env) ? null : 'Missing Origin header.';
  }
  if (origin !== requestOrigin) {
    return 'Invalid Origin header.';
  }
  return null;
};

const shouldBypassTurnstile = (env) => {
  const isLocal = isLocalEnv(env);
  const bypassEnabled = (env.TURNSTILE_BYPASS || '').toLowerCase() === 'true';
  const isProduction = (env.ENVIRONMENT || '').toLowerCase() === 'production';
  // Never bypass in production, even if flag is set
  if (isProduction) {
    return false;
  }
  return isLocal && bypassEnabled;
};

const verifyTurnstile = async (token, request, env) => {
  if (shouldBypassTurnstile(env)) {
    return { ok: true, bypassed: true };
  }
  if (!token) {
    return { ok: false, code: 'TURNSTILE_TOKEN_MISSING', error: 'Missing Turnstile token.' };
  }
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error('[Turnstile] TURNSTILE_SECRET_KEY is not configured');
    return { ok: false, code: 'TURNSTILE_MISCONFIGURED', error: 'Turnstile secret not configured.' };
  }
  const body = new FormData();
  body.set('secret', env.TURNSTILE_SECRET_KEY);
  body.set('response', token);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) {
    body.set('remoteip', ip);
  }
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const result = await response.json();
    if (!result.success) {
      // Log error codes without exposing to client
      const errorCodes = result['error-codes'] || [];
      console.error('[Turnstile] Verification failed:', errorCodes.join(', '));
      return { ok: false, code: 'TURNSTILE_VALIDATION_FAILED', error: 'Turnstile verification failed.' };
    }
    return { ok: true, bypassed: false };
  } catch (err) {
    console.error('[Turnstile] Verification error:', err.message);
    return { ok: false, code: 'TURNSTILE_API_ERROR', error: 'Turnstile service error. Please try again.' };
  }
};

const oauthJwksCache = new Map();

const getOAuthRedirectBase = (request, env) => {
  const override = (env.OAUTH_REDIRECT_BASE || '').trim();
  if (override) {
    return override.replace(/\/+$/, '');
  }
  const requestOrigin = new URL(request.url).origin;
  return requestOrigin;
};

const normalizePem = (value) => {
  if (!value) {
    return '';
  }
  const trimmed = value.toString().trim();
  return trimmed.includes('-----BEGIN') ? trimmed : trimmed.replace(/\\n/g, '\n');
};

const pemToArrayBuffer = (pem) => {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const derToJoseSignature = (derSig, size = 32) => {
  if (!derSig || derSig[0] !== 0x30) {
    return derSig;
  }
  let offset = 2;
  if (derSig[1] > 0x80) {
    offset += derSig[1] - 0x80;
  }
  if (derSig[offset] !== 0x02) {
    return derSig;
  }
  const rLen = derSig[offset + 1];
  const rStart = offset + 2;
  const r = derSig.slice(rStart, rStart + rLen);
  offset = rStart + rLen;
  if (derSig[offset] !== 0x02) {
    return derSig;
  }
  const sLen = derSig[offset + 1];
  const sStart = offset + 2;
  const s = derSig.slice(sStart, sStart + sLen);
  const rPad = r.length > size ? r.slice(r.length - size) : r;
  const sPad = s.length > size ? s.slice(s.length - size) : s;
  const out = new Uint8Array(size * 2);
  out.set(rPad, size - rPad.length);
  out.set(sPad, size * 2 - sPad.length);
  return out;
};

const createAppleClientSecret = async (env) => {
  const privateKey = normalizePem(env.APPLE_PRIVATE_KEY || '');
  if (!privateKey || !env.APPLE_TEAM_ID || !env.APPLE_CLIENT_ID || !env.APPLE_KEY_ID) {
    throw new Error('APPLE_CONFIG_MISSING');
  }
  const keyData = pemToArrayBuffer(privateKey);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: env.APPLE_KEY_ID, typ: 'JWT' };
  const payload = {
    iss: env.APPLE_TEAM_ID,
    iat: now,
    exp: now + 300,
    aud: 'https://appleid.apple.com',
    sub: env.APPLE_CLIENT_ID,
  };
  const tokenBase = `${encodeJsonBase64Url(header)}.${encodeJsonBase64Url(payload)}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(tokenBase)
  ));
  const joseSig = signature.length === 64 ? signature : derToJoseSignature(signature);
  return `${tokenBase}.${base64UrlEncode(joseSig)}`;
};

const fetchJwks = async (url) => {
  const cached = oauthJwksCache.get(url);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.keys;
  }
  const response = await fetch(url, { cf: { cacheTtl: 3600 } });
  if (!response.ok) {
    throw new Error('JWKS_FETCH_FAILED');
  }
  const data = await response.json();
  const keys = data.keys || [];
  oauthJwksCache.set(url, { keys, expiresAt: now + 60 * 60 * 1000 });
  return keys;
};

const verifyJwt = async (token, options) => {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return null;
  }
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  if (header.alg !== 'RS256') {
    return null;
  }
  const keys = await fetchJwks(options.jwksUrl);
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    return null;
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);
  const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, data);
  if (!ok) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== options.issuer) {
    return null;
  }
  if (Array.isArray(payload.aud)) {
    if (!payload.aud.includes(options.audience)) {
      return null;
    }
  } else if (payload.aud !== options.audience) {
    return null;
  }
  if (payload.exp && payload.exp < now - 30) {
    return null;
  }
  return payload;
};

const cleanupExpiredOAuthStates = async (env) => {
  if (!env.DB) {
    return;
  }
  const cutoff = Math.floor(Date.now() / 1000) - OAUTH_STATE_TTL_SECONDS;
  await env.DB.prepare('DELETE FROM oauth_states WHERE created_at <= ?')
    .bind(cutoff)
    .run();
};

const createOAuthState = async (env, provider, codeVerifier) => {
  const stateBytes = new Uint8Array(32);
  crypto.getRandomValues(stateBytes);
  const state = base64UrlEncode(stateBytes);
  await env.DB.prepare(
    'INSERT INTO oauth_states (state, provider, code_verifier, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(state, provider, codeVerifier, Math.floor(Date.now() / 1000))
    .run();
  return state;
};

const consumeOAuthState = async (env, state, provider) => {
  const record = await env.DB.prepare(
    'SELECT state, provider, code_verifier, created_at FROM oauth_states WHERE state = ?'
  )
    .bind(state)
    .first();
  if (!record || record.provider !== provider) {
    return null;
  }
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(record.created_at || 0);
  if (ageSeconds > OAUTH_STATE_TTL_SECONDS) {
    await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
    return null;
  }
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  return record;
};

const buildOAuthReturnTo = (request) => {
  const referer = request.headers.get('Referer') || '';
  if (!referer) {
    return '';
  }
  try {
    const refUrl = new URL(referer);
    const reqOrigin = new URL(request.url).origin;
    if (refUrl.origin !== reqOrigin) {
      return '';
    }
    return `${refUrl.pathname}${refUrl.search}`;
  } catch (error) {
    return '';
  }
};

const oauthCookieAttributes = (env) => {
  const isProduction = (env.ENVIRONMENT || '').toLowerCase() === 'production';
  const secure = isProduction ? '; Secure' : '';
  return `Path=/; Max-Age=600; SameSite=Lax${secure}`;
};

const setOauthReturnCookie = (headers, value, env) => {
  if (!value) {
    return;
  }
  headers.append('Set-Cookie', `oauth_return_to=${encodeURIComponent(value)}; ${oauthCookieAttributes(env)}`);
};

const clearOauthReturnCookie = (headers, env) => {
  headers.append('Set-Cookie', `oauth_return_to=; ${oauthCookieAttributes(env)}; Max-Age=0`);
};

const buildOauthErrorRedirect = (request, env, code) => {
  const base = getOAuthRedirectBase(request, env);
  const fallback = '/auth/login/';
  const rawReturn = decodeURIComponent(getCookieValue(request, 'oauth_return_to') || '') || fallback;
  const returnTo = rawReturn.startsWith('/') ? rawReturn : fallback;
  const url = new URL(returnTo, base);
  url.searchParams.set('oauth_error', code);
  return url.toString();
};

const buildOauthSuccessRedirect = (request, env) => {
  const base = getOAuthRedirectBase(request, env);
  const rawReturn = decodeURIComponent(getCookieValue(request, 'oauth_return_to') || '');
  const fallback = '/account/';
  const returnTo = rawReturn && rawReturn.startsWith('/') ? rawReturn : fallback;
  return new URL(returnTo, base).toString();
};

const cleanupExpiredSessions = async (env) => {
  if (!env.DB) {
    return;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM session WHERE expires_at <= ?').bind(nowSeconds).run();
};

const stampSessionTimestamps = async (env, sessionId) => {
  if (!env.DB || !sessionId) {
    return;
  }
  const nowMs = Date.now();
  const idleTimeoutMinutes = getIdleTimeoutMinutes(env);
  const absoluteTimeoutDays = getAbsoluteTimeoutDays(env);
  const idleMs = idleTimeoutMinutes * 60 * 1000;
  const absoluteMs = absoluteTimeoutDays * 24 * 60 * 60 * 1000;
  const expiresAtMs = Math.min(nowMs + idleMs, nowMs + absoluteMs);
  await env.DB.prepare(
    `UPDATE session
     SET created_at = COALESCE(created_at, ?),
         last_seen_at = ?,
         expires_at = ?
     WHERE id = ?`
  )
    .bind(new Date(nowMs).toISOString(), new Date(nowMs).toISOString(), Math.floor(expiresAtMs / 1000), sessionId)
    .run();
};

const checkPasswordResetRateLimit = async (env, { emailHash, ipHash }) => {
  if (!env.DB) {
    return { limited: false };
  }
  let emailCount = 0;
  let ipCount = 0;
  if (emailHash) {
    const result = await env.DB.prepare(
      `SELECT COUNT(*) as count
       FROM audit_events
       WHERE event_type = 'password_reset_requested'
         AND json_extract(metadata_json, '$.email_hash') = ?
         AND datetime(created_at) >= datetime('now', ?)`
    )
      .bind(emailHash, `-${PASSWORD_RESET_EMAIL_WINDOW_MINUTES} minutes`)
      .first();
    emailCount = Number(result?.count || 0);
  }
  if (ipHash) {
    const result = await env.DB.prepare(
      `SELECT COUNT(*) as count
       FROM audit_events
       WHERE event_type = 'password_reset_requested'
         AND ip_hash = ?
         AND datetime(created_at) >= datetime('now', ?)`
    )
      .bind(ipHash, `-${PASSWORD_RESET_IP_WINDOW_MINUTES} minutes`)
      .first();
    ipCount = Number(result?.count || 0);
  }
  const emailLimited = emailHash && emailCount >= PASSWORD_RESET_EMAIL_LIMIT;
  const ipLimited = ipHash && ipCount >= PASSWORD_RESET_IP_LIMIT;
  return {
    limited: emailLimited || ipLimited,
    emailCount,
    ipCount,
    emailLimited,
    ipLimited,
  };
};

const initializeLucia = (env) => {
  const adapter = new D1Adapter(env.DB, { user: 'user', session: 'session' });
  const isProduction = (env.ENVIRONMENT || '').toLowerCase() === 'production';
  return new Lucia(adapter, {
    sessionExpiresIn: new TimeSpan(getAbsoluteTimeoutDays(env), 'd'),
    getUserAttributes: (attributes) => ({
      email: attributes.email,
    }),
    sessionCookie: {
      name: 'session',
      attributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        path: '/',
      },
    },
  });
};

const tableExists = async (db, tableName) => {
  if (!db) {
    return false;
  }
  const result = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .bind(tableName)
    .first();
  return !!result;
};

const requirePasskeyTables = async (env) => {
  if (!env.DB) {
    return jsonResponse(
      { ok: false, code: 'MIGRATION_MISSING', message: 'Server not ready for passkeys' },
      { status: 503 }
    );
  }
  const hasChallenges = await tableExists(env.DB, 'webauthn_challenges');
  const hasCredentials = await tableExists(env.DB, 'passkey_credentials');
  if (!hasChallenges || !hasCredentials) {
    return jsonResponse(
      { ok: false, code: 'MIGRATION_MISSING', message: 'Server not ready for passkeys' },
      { status: 503 }
    );
  }
  return null;
};

const deriveWyDistricts = async (db, meta = {}) => {
  if (!db) {
    return null;
  }
  const votersTable = (await tableExists(db, 'voters')) ? 'voters' : null;
  const addrTable = (await tableExists(db, 'voters_addr_norm')) ? 'voters_addr_norm' : null;

  if (meta.voter_id && votersTable) {
    const row = await db
      .prepare(`SELECT house, senate FROM ${votersTable} WHERE voter_id = ?`)
      .bind(meta.voter_id)
      .first();
    if (row && (row.house || row.senate)) {
      return {
        stateHouse: row.house || null,
        stateSenate: row.senate || null,
        source: 'wy_voter_id',
      };
    }
  }

  if (addrTable) {
    const fn = meta.fn ? meta.fn.toString().trim() : '';
    const ln = meta.ln ? meta.ln.toString().trim() : '';
    const zip = meta.zip ? meta.zip.toString().trim() : '';
    if (fn && ln && zip) {
      const row = await db
        .prepare(
          `SELECT house, senate
           FROM ${addrTable}
           WHERE UPPER(fn) = UPPER(?) AND UPPER(ln) = UPPER(?) AND zip = ?
           LIMIT 1`
        )
        .bind(fn, ln, zip)
        .first();
      if (row && (row.house || row.senate)) {
        return {
          stateHouse: row.house || null,
          stateSenate: row.senate || null,
          source: 'wy_name_zip',
        };
      }
    }

    const addrRaw = meta.addr_raw ? meta.addr_raw.toString().trim() : '';
    if (addrRaw && zip) {
      const row = await db
        .prepare(
          `SELECT house, senate
           FROM ${addrTable}
           WHERE addr_raw = ? AND zip = ?
           LIMIT 1`
        )
        .bind(addrRaw, zip)
        .first();
      if (row && (row.house || row.senate)) {
        return {
          stateHouse: row.house || null,
          stateSenate: row.senate || null,
          source: 'wy_addr_zip',
        };
      }
    }
  }

  return null;
};

const deriveFederalDistrict = async (db, meta = {}) => {
  if (!db) {
    return null;
  }
  const state = meta.state ? meta.state.toString().trim().toUpperCase() : '';
  const zip = meta.zip ? meta.zip.toString().trim() : '';
  if (state === 'WY') {
    return {
      usHouse: '00',
      source: 'wy_at_large',
    };
  }
  if (!zip || !(await tableExists(db, 'hud_zip_crosswalk'))) {
    return null;
  }
  const result = await db
    .prepare(
      `SELECT DISTINCT cd
       FROM hud_zip_crosswalk
       WHERE zipcode = ?
       ORDER BY cd`
    )
    .bind(zip)
    .all();
  const districts = (result.results || [])
    .map((row) => row.cd)
    .filter((value) => value !== null && value !== undefined);
  if (districts.length === 1) {
    return {
      usHouse: districts[0],
      source: 'hud_zip_crosswalk',
    };
  }
  return null;
};

const getCookieValue = (request, name) => {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split('=');
    if (key === name) {
      return rest.join('=');
    }
  }
  return '';
};

const normalizeState = (value) => (value ? value.toString().trim().toUpperCase() : '');

const normalizeCd = (value) => {
  const raw = value ? value.toString().trim().toUpperCase() : '';
  if (!raw) {
    return '';
  }
  if (raw === 'AL' || raw === '0' || raw === '00' || raw === '000') {
    return '00';
  }
  const digits = raw.replace(/\D/g, '');
  if (digits) {
    return digits.padStart(2, '0').slice(-2);
  }
  return raw;
};

const normalizeMatchSource = (value) => {
  const allowed = new Set(['none', 'wy_voterfile', 'zip_hint', 'address_geocode', 'manual']);
  return allowed.has(value) ? value : 'none';
};

const normalizeMatchQuality = (value) => {
  const allowed = new Set(['none', 'partial', 'exact']);
  return allowed.has(value) ? value : 'none';
};

const handleAuthSignup = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ ok: false, code: 'SIGNUP_FAILED' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ ok: false, code: 'SIGNUP_FAILED' }, { status: 400 });
  }
  const body = await parseJsonBody(request);
  const email = normalizeEmail(body.email || '');
  const password = body.password || '';
  const turnstileToken = body.turnstileToken || '';

  if (!email || !isValidEmail(email)) {
    await writeAuditEvent(env, request, {
      eventType: 'signup_failed',
      metadata: { reason: 'generic' },
    });
    return jsonResponse({ ok: false, code: 'SIGNUP_FAILED' }, { status: 400 });
  }
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    await writeAuditEvent(env, request, {
      eventType: 'signup_failed',
      metadata: { reason: 'generic' },
    });
    return jsonResponse({ ok: false, code: 'SIGNUP_FAILED' }, { status: 400 });
  }

  const turnstile = await verifyTurnstile(turnstileToken, request, env);
  if (!turnstile.ok) {
    await writeAuditEvent(env, request, {
      eventType: 'signup_failed',
      metadata: { reason: 'generic' },
    });
    return jsonResponse({ ok: false, code: 'SIGNUP_FAILED' }, { status: 400 });
  }

  await cleanupExpiredSessions(env);

  const existing = await env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).first();
  if (existing) {
    await writeAuditEvent(env, request, {
      eventType: 'signup_failed',
      metadata: { reason: 'generic' },
    });
    return jsonResponse({ ok: false, code: 'EMAIL_EXISTS' }, { status: 409 });
  }

  let userId = '';
  try {
    userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    await env.DB.prepare(
      `INSERT INTO user (id, email, password_hash)
       VALUES (?, ?, ?)`
    )
      .bind(userId, email, passwordHash)
      .run();
    await env.DB.prepare(
      `INSERT INTO user_profile (user_id, email)
       VALUES (?, ?)`
    )
      .bind(userId, email)
      .run();
  } catch (error) {
    await writeAuditEvent(env, request, {
      eventType: 'signup_failed',
      metadata: { reason: 'generic' },
    });
    const message = error && typeof error.message === 'string' ? error.message : '';
    if (message.includes('UNIQUE constraint failed: user.email') || message.includes('idx_user_email_normalized')) {
      return jsonResponse({ ok: false, code: 'EMAIL_EXISTS' }, { status: 409 });
    }
    return jsonResponse({ ok: false, code: 'SIGNUP_FAILED' }, { status: 500 });
  }

  await writeAuditEvent(env, request, { userId, eventType: 'signup_success' });

  try {
    const lucia = initializeLucia(env);
    const session = await lucia.createSession(userId, {});
    await stampSessionTimestamps(env, session.id);
    const sessionCookie = lucia.createSessionCookie(session.id);
    const headers = new Headers();
    headers.append('Set-Cookie', sessionCookie.serialize());
    return jsonResponse({ ok: true }, { headers });
  } catch (error) {
    return jsonResponse({ ok: true }, { status: 200 });
  }
};

const handleAuthLogin = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ ok: false, code: 'INVALID_CREDENTIALS' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ ok: false, code: 'INVALID_CREDENTIALS' }, { status: 403 });
  }
  const route = 'POST /api/auth/login';
  const rayId = request.headers.get('cf-ray') || '';
  const startedAt = Date.now();
  const body = await parseJsonBody(request);
  const email = normalizeEmail(body.email || '');
  const password = body.password || '';
  const turnstileToken = body.turnstileToken || '';
  logAuthTiming(route, rayId, 'parsed_body', startedAt);

  if (!email || !password) {
    await writeAuditEvent(env, request, {
      eventType: 'login_failed',
      metadata: { reason: 'generic' },
    });
    logAuthTiming(route, rayId, 'response_sent', startedAt);
    return jsonResponse({ ok: false, code: 'MISSING_CREDENTIALS' }, { status: 400 });
  }

  const turnstile = await verifyTurnstile(turnstileToken, request, env);
  if (!turnstile.ok) {
    await writeAuditEvent(env, request, {
      eventType: 'login_failed',
      metadata: { reason: 'generic' },
    });
    logAuthTiming(route, rayId, 'response_sent', startedAt);
    return jsonResponse({ ok: false, code: 'FORBIDDEN' }, { status: 403 });
  }

  await cleanupExpiredSessions(env);

  const user = await env.DB.prepare('SELECT id, email, password_hash FROM user WHERE email = ?')
    .bind(email)
    .first();
  logAuthTiming(route, rayId, 'user_lookup_done', startedAt);
  if (!user) {
    await writeAuditEvent(env, request, {
      eventType: 'login_failed',
      metadata: { reason: 'generic' },
    });
    logAuthTiming(route, rayId, 'response_sent', startedAt);
    return jsonResponse({ ok: false, code: 'ACCOUNT_NOT_FOUND' }, { status: 404 });
  }
  logAuthTiming(route, rayId, 'password_verify_start', startedAt);
  const passwordOk = await verifyPassword(password, user.password_hash);
  logAuthTiming(route, rayId, 'password_verify_done', startedAt);
  if (!passwordOk) {
    await writeAuditEvent(env, request, {
      eventType: 'login_failed',
      metadata: { reason: 'generic' },
    });
    logAuthTiming(route, rayId, 'response_sent', startedAt);
    return jsonResponse({ ok: false, code: 'PASSWORD_INCORRECT' }, { status: 401 });
  }

  if (user.password_hash && user.password_hash.startsWith('scrypt$')) {
    const upgradedHash = await hashPassword(password);
    await env.DB.prepare('UPDATE user SET password_hash = ? WHERE id = ?')
      .bind(upgradedHash, user.id)
      .run();
  }

  const lucia = initializeLucia(env);
  await lucia.invalidateUserSessions(user.id);
  const session = await lucia.createSession(user.id, {});
  await stampSessionTimestamps(env, session.id);
  const sessionCookie = lucia.createSessionCookie(session.id);
  logAuthTiming(route, rayId, 'session_created', startedAt);

  await writeAuditEvent(env, request, { userId: user.id, eventType: 'login_success' });

  const headers = new Headers();
  headers.append('Set-Cookie', sessionCookie.serialize());
  logAuthTiming(route, rayId, 'response_sent', startedAt);
  return jsonResponse({ ok: true }, { headers });
};

const exchangeGoogleCode = async (code, codeVerifier, redirectUri, env) => {
  const body = new URLSearchParams();
  body.set('code', code);
  body.set('client_id', env.GOOGLE_CLIENT_ID || '');
  body.set('client_secret', env.GOOGLE_CLIENT_SECRET || '');
  body.set('redirect_uri', redirectUri);
  body.set('grant_type', 'authorization_code');
  body.set('code_verifier', codeVerifier);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
};

const exchangeAppleCode = async (code, codeVerifier, redirectUri, env) => {
  const clientSecret = await createAppleClientSecret(env);
  const body = new URLSearchParams();
  body.set('code', code);
  body.set('client_id', env.APPLE_CLIENT_ID || '');
  body.set('client_secret', clientSecret);
  body.set('redirect_uri', redirectUri);
  body.set('grant_type', 'authorization_code');
  body.set('code_verifier', codeVerifier);
  const response = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
};

const handleOAuthStart = async (request, env, provider) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const base = getOAuthRedirectBase(request, env);
  const returnTo = buildOAuthReturnTo(request);
  const codeVerifierBytes = new Uint8Array(32);
  crypto.getRandomValues(codeVerifierBytes);
  const codeVerifier = base64UrlEncode(codeVerifierBytes);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  await cleanupExpiredOAuthStates(env);
  const state = await createOAuthState(env, provider, codeVerifier);

  let authUrl = '';
  if (provider === 'google') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      const headers = new Headers({ Location: buildOauthErrorRedirect(request, env, 'oauth_unavailable') });
      clearOauthReturnCookie(headers, env);
      return new Response(null, { status: 302, headers });
    }
    const redirectUri = env.GOOGLE_REDIRECT_URI || `${base}/api/auth/oauth/google/callback`;
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  } else if (provider === 'apple') {
    if (!env.APPLE_CLIENT_ID || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY) {
      const headers = new Headers({ Location: buildOauthErrorRedirect(request, env, 'oauth_unavailable') });
      clearOauthReturnCookie(headers, env);
      return new Response(null, { status: 302, headers });
    }
    const redirectUri = env.APPLE_REDIRECT_URI || `${base}/api/auth/oauth/apple/callback`;
    const params = new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'form_post',
      scope: 'openid email name',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    authUrl = `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  } else {
    return jsonResponse({ error: 'Unsupported provider.' }, { status: 400 });
  }

  const headers = new Headers({ Location: authUrl });
  setOauthReturnCookie(headers, returnTo, env);
  return new Response(null, { status: 302, headers });
};

const handleOAuthCallback = async (request, env, provider) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const params = request.method === 'POST' ? await parseFormBody(request) : Object.fromEntries(new URL(request.url).searchParams.entries());
  if (params.error) {
    const headers = new Headers({ Location: buildOauthErrorRedirect(request, env, params.error) });
    clearOauthReturnCookie(headers, env);
    return new Response(null, { status: 302, headers });
  }
  const code = params.code || '';
  const state = params.state || '';
  if (!code || !state) {
    const headers = new Headers({ Location: buildOauthErrorRedirect(request, env, 'provider_error') });
    clearOauthReturnCookie(headers, env);
    return new Response(null, { status: 302, headers });
  }
  await cleanupExpiredOAuthStates(env);
  const stateRecord = await consumeOAuthState(env, state, provider);
  if (!stateRecord) {
    const headers = new Headers({ Location: buildOauthErrorRedirect(request, env, 'state_invalid') });
    clearOauthReturnCookie(headers, env);
    return new Response(null, { status: 302, headers });
  }
  const base = getOAuthRedirectBase(request, env);
  let tokens = null;
  try {
    if (provider === 'google') {
      const redirectUri = env.GOOGLE_REDIRECT_URI || `${base}/api/auth/oauth/google/callback`;
      tokens = await exchangeGoogleCode(code, stateRecord.code_verifier, redirectUri, env);
    } else if (provider === 'apple') {
      const redirectUri = env.APPLE_REDIRECT_URI || `${base}/api/auth/oauth/apple/callback`;
      tokens = await exchangeAppleCode(code, stateRecord.code_verifier, redirectUri, env);
    }
  } catch (error) {
    tokens = null;
  }
  if (!tokens || !tokens.id_token) {
    const headers = new Headers({ Location: buildOauthErrorRedirect(request, env, 'token_exchange_failed') });
    clearOauthReturnCookie(headers, env);
    return new Response(null, { status: 302, headers });
  }
  let claims = null;
  try {
    if (provider === 'google') {
      claims = await verifyJwt(tokens.id_token, {
        jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
        issuer: 'https://accounts.google.com',
        audience: env.GOOGLE_CLIENT_ID,
      });
      if (!claims) {
        claims = await verifyJwt(tokens.id_token, {
          jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
          issuer: 'accounts.google.com',
          audience: env.GOOGLE_CLIENT_ID,
        });
      }
    } else if (provider === 'apple') {
      claims = await verifyJwt(tokens.id_token, {
        jwksUrl: 'https://appleid.apple.com/auth/keys',
        issuer: 'https://appleid.apple.com',
        audience: env.APPLE_CLIENT_ID,
      });
    }
  } catch (error) {
    claims = null;
  }
  if (!claims || !claims.sub) {
    const headers = new Headers({ Location: buildOauthErrorRedirect(request, env, 'id_token_invalid') });
    clearOauthReturnCookie(headers, env);
    return new Response(null, { status: 302, headers });
  }

  const providerSub = claims.sub;
  const email = normalizeEmail(claims.email || '');
  let userId = '';
  const existingOauth = await env.DB.prepare(
    'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_sub = ?'
  )
    .bind(provider, providerSub)
    .first();
  if (existingOauth && existingOauth.user_id) {
    userId = existingOauth.user_id;
  } else if (email) {
    const existingUser = await env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).first();
    if (existingUser && existingUser.id) {
      userId = existingUser.id;
      await env.DB.prepare(
        `INSERT INTO oauth_accounts (provider, provider_sub, user_id, email, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(provider, providerSub, userId, email, Math.floor(Date.now() / 1000))
        .run();
    } else {
      try {
        userId = crypto.randomUUID();
        const randomPassword = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
        const passwordHash = await hashPassword(randomPassword);
        await env.DB.prepare(
          `INSERT INTO user (id, email, password_hash)
           VALUES (?, ?, ?)`
        )
          .bind(userId, email, passwordHash)
          .run();
        await env.DB.prepare(
          `INSERT INTO user_profile (user_id, email)
           VALUES (?, ?)`
        )
          .bind(userId, email)
          .run();
        await env.DB.prepare(
          `INSERT INTO oauth_accounts (provider, provider_sub, user_id, email, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
          .bind(provider, providerSub, userId, email, Math.floor(Date.now() / 1000))
          .run();
      } catch (error) {
        userId = '';
      }
    }
  } else {
    const headers = new Headers({ Location: buildOauthErrorRedirect(request, env, 'email_missing') });
    clearOauthReturnCookie(headers, env);
    return new Response(null, { status: 302, headers });
  }

  if (!userId) {
    const headers = new Headers({ Location: buildOauthErrorRedirect(request, env, 'account_link_failed') });
    clearOauthReturnCookie(headers, env);
    return new Response(null, { status: 302, headers });
  }

  const lucia = initializeLucia(env);
  await lucia.invalidateUserSessions(userId);
  const session = await lucia.createSession(userId, {});
  await stampSessionTimestamps(env, session.id);
  const sessionCookie = lucia.createSessionCookie(session.id);
  const headers = new Headers({ Location: buildOauthSuccessRedirect(request, env) });
  headers.append('Set-Cookie', sessionCookie.serialize());
  clearOauthReturnCookie(headers, env);
  return new Response(null, { status: 302, headers });
};

const handlePasswordResetRequest = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }
  const body = await parseJsonBody(request);
  const email = normalizeEmail(body.email || '');
  const turnstileToken = body.turnstileToken || '';

  const turnstile = await verifyTurnstile(turnstileToken, request, env);
  if (!turnstile.ok) {
    await writeAuditEvent(env, request, {
      eventType: 'password_reset_requested',
      metadata: { reason: 'turnstile_failed', code: turnstile.code },
    });
    return jsonResponse({ ok: true });
  }

  if (!email || !isValidEmail(email)) {
    await writeAuditEvent(env, request, {
      eventType: 'password_reset_requested',
      metadata: { reason: 'invalid_email' },
    });
    return jsonResponse({ ok: true });
  }

  const salt = getHashSalt(env);
  const signals = await getRequestSignals(request, env);
  const emailHash = salt ? await hashSignal(email, salt) : '';
  const rateLimit = await checkPasswordResetRateLimit(env, {
    emailHash,
    ipHash: signals.ipHash,
  });
  if (rateLimit.limited) {
    await writeAuditEvent(env, request, {
      eventType: 'password_reset_requested',
      metadata: {
        reason: 'rate_limited',
        email_hash: emailHash || null,
        email_limited: rateLimit.emailLimited,
        ip_limited: rateLimit.ipLimited,
      },
    });
    return jsonResponse({ ok: true });
  }

  const user = await env.DB.prepare('SELECT id, email FROM user WHERE email = ?')
    .bind(email)
    .first();
  if (!user) {
    await writeAuditEvent(env, request, {
      eventType: 'password_reset_requested',
      metadata: { reason: 'no_user', email_hash: emailHash || null },
    });
    return jsonResponse({ ok: true });
  }

  if (!salt) {
    console.error('[Password Reset] HASH_SALT is not configured');
    await writeAuditEvent(env, request, {
      userId: user.id,
      eventType: 'password_reset_requested',
      metadata: { reason: 'missing_hash_salt', email_hash: emailHash || null },
    });
    return jsonResponse({ ok: true });
  }

  const token = generateResetToken();
  const tokenHash = await hashResetToken(salt, token);
  const tokenId = crypto.randomUUID();
  const expiresAt = addMinutesIso(PASSWORD_RESET_TTL_MINUTES);
  const createdAt = nowIso();
  await env.DB.prepare(
    `INSERT INTO password_reset_tokens
       (id, user_id, token_hash, expires_at, used_at, created_at, request_ip_hash)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`
  )
    .bind(tokenId, user.id, tokenHash, expiresAt, createdAt, signals.ipHash || null)
    .run();

  const origin = new URL(request.url).origin;
  const baseUrl = env.APP_BASE_URL || origin;
  const resetUrl = new URL('/auth/password-reset/', baseUrl);
  resetUrl.searchParams.set('uid', user.id);
  resetUrl.searchParams.set('token', token);

  const emailResult = await sendPasswordResetEmail(env, {
    to: user.email,
    resetUrl: resetUrl.toString(),
    replyTo: env.SUPPORT_EMAIL_TO || undefined,
  });

  await writeAuditEvent(env, request, {
    userId: user.id,
    eventType: 'password_reset_requested',
    metadata: { email_hash: emailHash || null, email_sent: !!emailResult.ok },
  });

  return jsonResponse({ ok: true });
};

const handlePasswordResetConfirm = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }
  const body = await parseJsonBody(request);
  const uid = (body.uid || '').toString().trim();
  const token = (body.token || '').toString().trim();
  const newPassword = body.newPassword || '';
  const turnstileToken = body.turnstileToken || '';

  if (!uid || !token) {
    return jsonResponse({ error: 'Invalid reset link.', code: 'INVALID_RESET_LINK' }, { status: 400 });
  }
  if (!newPassword || newPassword.length < PASSWORD_MIN_LENGTH) {
    return jsonResponse({ error: 'Password must be at least 12 characters.', code: 'WEAK_PASSWORD' }, { status: 400 });
  }

  const turnstile = await verifyTurnstile(turnstileToken, request, env);
  if (!turnstile.ok) {
    return jsonResponse({ error: 'Unable to verify request.', code: turnstile.code }, { status: 403 });
  }

  const salt = getHashSalt(env);
  if (!salt) {
    console.error('[Password Reset] HASH_SALT is not configured');
    return jsonResponse(
      { error: 'Server configuration error.', code: 'MISCONFIGURED_SERVER' },
      { status: 500 }
    );
  }

  const tokenHash = await hashResetToken(salt, token);
  const record = await env.DB.prepare(
    `SELECT id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE user_id = ? AND token_hash = ?`
  )
    .bind(uid, tokenHash)
    .first();
  if (!record) {
    return jsonResponse({ error: 'Invalid reset token.', code: 'INVALID_TOKEN' }, { status: 400 });
  }
  if (record.used_at) {
    return jsonResponse({ error: 'Reset token already used.', code: 'TOKEN_USED' }, { status: 400 });
  }
  if (new Date(record.expires_at).getTime() <= Date.now()) {
    return jsonResponse({ error: 'Reset token expired.', code: 'TOKEN_EXPIRED' }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await env.DB.prepare('UPDATE user SET password_hash = ? WHERE id = ?')
    .bind(passwordHash, uid)
    .run();
  await env.DB.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?')
    .bind(nowIso(), record.id)
    .run();

  const lucia = initializeLucia(env);
  await lucia.invalidateUserSessions(uid);

  await writeAuditEvent(env, request, {
    userId: uid,
    eventType: 'password_reset_completed',
  });

  const headers = new Headers();
  headers.append('Set-Cookie', lucia.createBlankSessionCookie().serialize());
  return jsonResponse({ ok: true }, { headers });
};

const handlePasskeyRegisterOptions = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }
  const passkeyGuard = await requirePasskeyTables(env);
  if (passkeyGuard) {
    return passkeyGuard;
  }
  const auth = await requireSessionUser(request, env);
  if (auth.response) {
    return auth.response;
  }
  const { user } = auth;
  const body = await parseJsonBody(request);
  const nickname = body.nickname ? body.nickname.toString().trim() : '';
  await cleanupExpiredWebauthnChallenges(env);
  const existingCredentials = await env.DB.prepare(
    `SELECT credential_id, transports_json
     FROM passkey_credentials
     WHERE user_id = ?`
  )
    .bind(user.id)
    .all();
  const excludeCredentials = (existingCredentials.results || []).map((row) => ({
    id: row.credential_id,
    type: 'public-key',
    transports: row.transports_json ? JSON.parse(row.transports_json) : undefined,
  }));

  const rpID = getWebAuthnRpId(request);
  const rpName = getWebAuthnRpName(env);
  const userID = new TextEncoder().encode(user.id);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID,
    userName: user.email || user.id,
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    attestationType: 'none',
  });

  const challengeId = crypto.randomUUID();
  const createdAt = nowIso();
  const expiresAt = addMinutesIso(WEBAUTHN_CHALLENGE_TTL_MINUTES);
  const signals = await getRequestSignals(request, env);
  await env.DB.prepare(
    `INSERT INTO webauthn_challenges
       (id, kind, user_id, challenge, created_at, expires_at, used_at, request_ip_hash, request_ua_hash)
     VALUES (?, 'registration', ?, ?, ?, ?, NULL, ?, ?)`
  )
    .bind(
      challengeId,
      user.id,
      options.challenge,
      createdAt,
      expiresAt,
      signals.ipHash || null,
      signals.userAgentHash || null
    )
    .run();

  await writeAuditEvent(env, request, {
    userId: user.id,
    eventType: 'passkey_register_options_issued',
  });

  return jsonResponse({
    ok: true,
    options,
    challengeId,
    nickname,
  });
};

const handlePasskeyRegisterVerify = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }
  const passkeyGuard = await requirePasskeyTables(env);
  if (passkeyGuard) {
    return passkeyGuard;
  }
  const auth = await requireSessionUser(request, env);
  if (auth.response) {
    return auth.response;
  }
  const { user } = auth;
  const body = await parseJsonBody(request);
  const attestationResponse = body.attestationResponse;
  const nickname = body.nickname ? body.nickname.toString().trim() : null;
  if (!attestationResponse) {
    return jsonResponse({ error: 'Missing attestation response.', code: 'MISSING_ATTESTATION' }, { status: 400 });
  }

  await cleanupExpiredWebauthnChallenges(env);
  const challengeRecord = await env.DB.prepare(
    `SELECT id, challenge, expires_at, used_at
     FROM webauthn_challenges
     WHERE user_id = ? AND kind = 'registration' AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(user.id)
    .first();
  if (!challengeRecord) {
    return jsonResponse({ error: 'Registration challenge missing.', code: 'CHALLENGE_MISSING' }, { status: 400 });
  }
  if (new Date(challengeRecord.expires_at).getTime() <= Date.now()) {
    return jsonResponse({ error: 'Registration challenge expired.', code: 'CHALLENGE_EXPIRED' }, { status: 400 });
  }

  const rpID = getWebAuthnRpId(request);
  const expectedOrigin = getWebAuthnExpectedOrigin(request);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (error) {
    return jsonResponse({ ok: false, code: 'VERIFY_FAILED' }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return jsonResponse({ ok: false, code: 'VERIFY_FAILED' }, { status: 400 });
  }

  // @simplewebauthn v13+ returns credential data nested under 'credential' key
  const regInfo = verification.registrationInfo;
  const credentialData = regInfo.credential || {};
  const credentialID = credentialData.id || regInfo.credentialID;
  const credentialPublicKey = credentialData.publicKey || regInfo.credentialPublicKey;
  const counter = regInfo.counter;
  
  // Handle credential ID - can be string or Uint8Array
  let credentialId = '';
  if (typeof credentialID === 'string') {
    credentialId = credentialID;
  } else if (credentialID instanceof Uint8Array || ArrayBuffer.isView(credentialID)) {
    credentialId = isoBase64URL.fromBuffer(credentialID);
  } else if (credentialID && credentialID.toString) {
    credentialId = credentialID.toString();
  }
  
  // Handle public key - can be string or Uint8Array or object
  let publicKey = '';
  if (typeof credentialPublicKey === 'string') {
    publicKey = credentialPublicKey;
  } else if (credentialPublicKey instanceof Uint8Array || ArrayBuffer.isView(credentialPublicKey)) {
    publicKey = isoBase64URL.fromBuffer(credentialPublicKey);
  } else if (credentialPublicKey && typeof credentialPublicKey === 'object') {
    // It's a CBOR-encoded object, serialize to CBOR bytes
    try {
      publicKey = isoBase64URL.fromBuffer(new Uint8Array(Object.values(credentialPublicKey)));
    } catch (e) {
      // Fallback: try to convert object to string
      publicKey = JSON.stringify(credentialPublicKey);
    }
  } else if (credentialPublicKey && credentialPublicKey.toString) {
    publicKey = credentialPublicKey.toString();
  }
  
  // Validate we have required values
  if (!credentialId || !publicKey) {
    console.error('[PasskeyReg] Missing credential data after extraction', { 
      credentialId: credentialId?.substring(0, 20), 
      publicKey: publicKey?.substring(0, 20),
      credentialIDType: typeof credentialID,
      publicKeyType: typeof credentialPublicKey
    });
    return jsonResponse({ ok: false, code: 'CREDENTIAL_DATA_MISSING' }, { status: 400 });
  }
  const transports = Array.isArray(attestationResponse?.response?.transports)
    ? attestationResponse.response.transports
    : null;

  const createdAt = nowIso();
  await env.DB.prepare(
    `INSERT INTO passkey_credentials
       (id, user_id, credential_id, public_key, counter, transports_json, created_at, last_used_at, nickname)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`
  )
    .bind(
      crypto.randomUUID(),
      user.id,
      credentialId,
      publicKey,
      counter || 0,
      transports ? JSON.stringify(transports) : null,
      createdAt,
      nickname
    )
    .run();

  await env.DB.prepare('UPDATE webauthn_challenges SET used_at = ? WHERE id = ?')
    .bind(nowIso(), challengeRecord.id)
    .run();

  await writeAuditEvent(env, request, {
    userId: user.id,
    eventType: 'passkey_register_completed',
  });

  return jsonResponse({ ok: true });
};

const handlePasskeyLoginOptions = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }
  const passkeyGuard = await requirePasskeyTables(env);
  if (passkeyGuard) {
    return passkeyGuard;
  }
  await cleanupExpiredWebauthnChallenges(env);
  const rpID = getWebAuthnRpId(request);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [],
    userVerification: 'preferred',
  });

  const challengeId = crypto.randomUUID();
  const createdAt = nowIso();
  const expiresAt = addMinutesIso(WEBAUTHN_CHALLENGE_TTL_MINUTES);
  const signals = await getRequestSignals(request, env);
  await env.DB.prepare(
    `INSERT INTO webauthn_challenges
       (id, kind, user_id, challenge, created_at, expires_at, used_at, request_ip_hash, request_ua_hash)
     VALUES (?, 'authentication', NULL, ?, ?, ?, NULL, ?, ?)`
  )
    .bind(
      challengeId,
      options.challenge,
      createdAt,
      expiresAt,
      signals.ipHash || null,
      signals.userAgentHash || null
    )
    .run();

  await writeAuditEvent(env, request, {
    eventType: 'passkey_auth_options_issued',
  });

  return jsonResponse({ ok: true, options, challengeId });
};

const handlePasskeyLoginVerify = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }
  const passkeyGuard = await requirePasskeyTables(env);
  if (passkeyGuard) {
    return passkeyGuard;
  }
  const body = await parseJsonBody(request);
  const assertionResponse = body.assertionResponse;
  const challengeId = body.challengeId ? body.challengeId.toString().trim() : '';
  if (!assertionResponse || !challengeId) {
    return jsonResponse({ error: 'Missing passkey assertion.', code: 'MISSING_ASSERTION' }, { status: 400 });
  }

  await cleanupExpiredWebauthnChallenges(env);
  const challengeRecord = await env.DB.prepare(
    `SELECT id, challenge, expires_at, used_at
     FROM webauthn_challenges
     WHERE id = ? AND kind = 'authentication'`
  )
    .bind(challengeId)
    .first();
  if (!challengeRecord || challengeRecord.used_at) {
    await writeAuditEvent(env, request, {
      eventType: 'passkey_login_failed',
      metadata: { reason: 'challenge_invalid' },
    });
    return jsonResponse({ ok: false, code: 'CHALLENGE_INVALID' }, { status: 400 });
  }
  if (new Date(challengeRecord.expires_at).getTime() <= Date.now()) {
    await writeAuditEvent(env, request, {
      eventType: 'passkey_login_failed',
      metadata: { reason: 'challenge_expired' },
    });
    return jsonResponse({ ok: false, code: 'CHALLENGE_EXPIRED' }, { status: 400 });
  }

  const credentialId = assertionResponse?.id || assertionResponse?.rawId || '';
  if (!credentialId) {
    await env.DB.prepare('UPDATE webauthn_challenges SET used_at = ? WHERE id = ?')
      .bind(nowIso(), challengeRecord.id)
      .run();
    return jsonResponse({ ok: false, code: 'UNKNOWN_CREDENTIAL' }, { status: 400 });
  }

  const credential = await env.DB.prepare(
    `SELECT id, user_id, credential_id, public_key, counter
     FROM passkey_credentials
     WHERE credential_id = ?`
  )
    .bind(credentialId)
    .first();
  if (!credential) {
    await env.DB.prepare('UPDATE webauthn_challenges SET used_at = ? WHERE id = ?')
      .bind(nowIso(), challengeRecord.id)
      .run();
    await writeAuditEvent(env, request, {
      eventType: 'passkey_login_failed',
      metadata: { reason: 'unknown_credential' },
    });
    return jsonResponse({ ok: false, code: 'UNKNOWN_CREDENTIAL' }, { status: 400 });
  }

  const rpID = getWebAuthnRpId(request);
  const expectedOrigin = getWebAuthnExpectedOrigin(request);
  const authenticator = {
    credentialID: isoBase64URL.toBuffer(credential.credential_id),
    credentialPublicKey: isoBase64URL.toBuffer(credential.public_key),
    counter: Number(credential.counter || 0),
  };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertionResponse,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      authenticator,
      requireUserVerification: false,
    });
  } catch (error) {
    await env.DB.prepare('UPDATE webauthn_challenges SET used_at = ? WHERE id = ?')
      .bind(nowIso(), challengeRecord.id)
      .run();
    await writeAuditEvent(env, request, {
      eventType: 'passkey_login_failed',
      metadata: { reason: 'verify_failed' },
    });
    return jsonResponse({ ok: false, code: 'VERIFY_FAILED' }, { status: 400 });
  }

  if (!verification.verified || !verification.authenticationInfo) {
    await env.DB.prepare('UPDATE webauthn_challenges SET used_at = ? WHERE id = ?')
      .bind(nowIso(), challengeRecord.id)
      .run();
    await writeAuditEvent(env, request, {
      eventType: 'passkey_login_failed',
      metadata: { reason: 'not_verified' },
    });
    return jsonResponse({ ok: false, code: 'VERIFY_FAILED' }, { status: 400 });
  }

  const { newCounter } = verification.authenticationInfo;
  await env.DB.prepare(
    `UPDATE passkey_credentials
     SET counter = ?, last_used_at = ?
     WHERE id = ?`
  )
    .bind(newCounter || 0, nowIso(), credential.id)
    .run();

  await env.DB.prepare('UPDATE webauthn_challenges SET used_at = ? WHERE id = ?')
    .bind(nowIso(), challengeRecord.id)
    .run();

  const lucia = initializeLucia(env);
  await lucia.invalidateUserSessions(credential.user_id);
  const session = await lucia.createSession(credential.user_id, {});
  await stampSessionTimestamps(env, session.id);
  const sessionCookie = lucia.createSessionCookie(session.id);

  await writeAuditEvent(env, request, {
    userId: credential.user_id,
    eventType: 'passkey_login_success',
  });

  const headers = new Headers();
  headers.append('Set-Cookie', sessionCookie.serialize());
  return jsonResponse({ ok: true }, { headers });
};

const handlePasskeyList = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }
  const passkeyGuard = await requirePasskeyTables(env);
  if (passkeyGuard) {
    return passkeyGuard;
  }
  const auth = await requireSessionUser(request, env);
  if (auth.response) {
    return auth.response;
  }
  const { user } = auth;

  const result = await env.DB.prepare(
    `SELECT id, nickname, created_at, last_used_at
     FROM passkey_credentials
     WHERE user_id = ?
     ORDER BY created_at DESC`
  )
    .bind(user.id)
    .all();

  return jsonResponse({ ok: true, credentials: result.results || [] });
};

const handlePasskeyRemove = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }
  const passkeyGuard = await requirePasskeyTables(env);
  if (passkeyGuard) {
    return passkeyGuard;
  }
  const auth = await requireSessionUser(request, env);
  if (auth.response) {
    return auth.response;
  }
  const { user } = auth;
  const body = await parseJsonBody(request);
  const id = body.id ? body.id.toString().trim() : '';
  if (!id) {
    return jsonResponse({ error: 'Missing passkey id.', code: 'MISSING_ID' }, { status: 400 });
  }
  const result = await env.DB.prepare(
    `DELETE FROM passkey_credentials
     WHERE id = ? AND user_id = ?`
  )
    .bind(id, user.id)
    .run();
  const changes = result?.meta?.changes || 0;
  if (!result.success || changes === 0) {
    return jsonResponse({ error: 'Unable to remove passkey.', code: 'REMOVE_FAILED' }, { status: 400 });
  }
  await writeAuditEvent(env, request, {
    userId: user.id,
    eventType: 'passkey_removed',
    metadata: { passkey_id: id },
  });
  return jsonResponse({ ok: true });
};

const handleAuthLogout = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }

  const lucia = initializeLucia(env);
  const cookieHeader = request.headers.get('Cookie') || '';
  const sessionId = lucia.readSessionCookie(cookieHeader);
  if (sessionId) {
    await lucia.invalidateSession(sessionId);
  }
  await writeAuditEvent(env, request, { eventType: 'logout' });

  const blank = lucia.createBlankSessionCookie();
  const headers = new Headers();
  headers.append('Set-Cookie', blank.serialize());
  return jsonResponse({ ok: true }, { headers });
};

const handleAuthMe = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const sessionResult = await getSessionUser(request, env);
  if (sessionResult.status === 'expired') {
    return jsonResponse(
      { ok: false, code: 'SESSION_EXPIRED' },
      { status: 401, headers: sessionResult.headers || undefined }
    );
  }
  if (sessionResult.status !== 'valid') {
    return jsonResponse(
      { authenticated: false },
      sessionResult.headers ? { headers: sessionResult.headers } : {}
    );
  }
  const { user } = sessionResult;

  const profile = await env.DB.prepare(
    `SELECT state, wy_house_district
     FROM user_profile
     WHERE user_id = ?`
  )
    .bind(user.id)
    .first();
  const verification = await env.DB.prepare(
    `SELECT voter_match_status, residence_confidence
     FROM user_verification
     WHERE user_id = ?`
  )
    .bind(user.id)
    .first();

  return jsonResponse({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email || null,
      profile: {
        state: profile?.state || null,
        wy_house_district: profile?.wy_house_district || null,
      },
      verification: {
        voter_match_status: verification?.voter_match_status || null,
        residence_confidence: verification?.residence_confidence || null,
      },
    },
  });
};

const computeScopeLevel = ({ cd, sldu, sldl, state, county, city }) => {
  if (cd) return 'cd';
  if (sldu) return 'sldu';
  if (sldl) return 'sldl';
  if (state) return 'state';
  if (county) return 'county';
  if (city) return 'city';
  return 'public';
};

const buildScopes = ({ state, cd, sldl, sldu }) => {
  const scopes = ['public'];
  if (state) {
    scopes.push(`state:${state}`);
    scopes.push(`senate:${state}`);
  }
  if (cd) {
    scopes.push(`cd:${cd}`);
  }
  if (sldl) {
    scopes.push(`sldl:${sldl}`);
  }
  if (sldu) {
    scopes.push(`sldu:${sldu}`);
  }
  return scopes;
};

const buildScopePayload = ({ sessionId, matchQuality, scopes, geo, districts }) => ({
  session_id: sessionId,
  match_quality: matchQuality,
  scopes,
  geo,
  districts,
});

const generateToken = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

const isLocalRequest = (url) =>
  url.hostname === 'localhost' || url.hostname === '127.0.0.1';

const getUsStates = () => [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const getWyHouseDistricts = () =>
  Array.from({ length: 60 }, (_, index) => {
    const district = index + 1;
    return {
      district,
      label: `House District ${district}`,
    };
  });

const ensureSurveyToken = async (env, token) => {
  if (token) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO survey_tokens (token, status)
       VALUES (?, 'active')`
    )
      .bind(token)
      .run();
    return token;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateToken();
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO survey_tokens (token, status)
       VALUES (?, 'active')`
    )
      .bind(candidate)
      .run();
    if (result.success) {
      return candidate;
    }
  }

  throw new Error('Unable to create survey token');
};

const getActiveSurveys = async (env) => {
  const result = await env.DB.prepare(
    `SELECT id, slug, title
     FROM surveys
     WHERE status = 'active'
     ORDER BY id ASC`
  ).all();
  return result.results || [];
};

const getNextSurveySlug = (surveys, currentId) => {
  const index = surveys.findIndex((survey) => survey.id === currentId);
  if (index === -1) {
    return '';
  }
  return surveys[index + 1] ? surveys[index + 1].slug : '';
};

const getResumeSurveySlug = async (env, token) => {
  const surveys = await getActiveSurveys(env);
  const answered = await env.DB.prepare(
    `SELECT DISTINCT survey_id
     FROM survey_token_submissions
     WHERE token = ?`
  )
    .bind(token)
    .all();
  const answeredIds = new Set(
    (answered.results || []).map((row) => row.survey_id)
  );
  const nextSurvey = surveys.find((survey) => !answeredIds.has(survey.id));
  return nextSurvey ? nextSurvey.slug : '';
};

const getSurveySummaryByToken = async (env, token) => {
  const result = await env.DB.prepare(
    `SELECT s.id AS survey_id,
            s.title AS survey_title,
            s.slug AS survey_slug,
            q.question_json,
            a.selected_key,
            sub.created_at
     FROM survey_token_submissions t
     JOIN survey_submissions sub ON sub.id = t.submission_id
     JOIN survey_answers a ON a.submission_id = sub.id
     JOIN survey_questions q ON q.id = a.question_id
     JOIN surveys s ON s.id = t.survey_id
     WHERE t.token = ?
     ORDER BY s.id ASC, sub.created_at DESC`
  )
    .bind(token)
    .all();

  const summaryBySurvey = new Map();
  for (const row of result.results || []) {
    if (summaryBySurvey.has(row.survey_id)) {
      continue;
    }
    let prompt = '';
    let answer = row.selected_key;
    try {
      const payload = JSON.parse(row.question_json || '{}');
      prompt = payload.prompt || '';
      answer = payload[row.selected_key] || row.selected_key;
    } catch (error) {
      prompt = '';
    }
    summaryBySurvey.set(row.survey_id, {
      title: row.survey_title,
      slug: row.survey_slug,
      prompt,
      answer,
    });
  }

  return Array.from(summaryBySurvey.values());
};

const handleScopeStart = async (request, env, overrides = {}) => {
  if (!env.DB) {
    throw new Error('SCOPE_MISCONFIGURED: Database not available');
  }

  const body = overrides.body || (await parseJsonBody(request));
  const zip = body.zip ? body.zip.toString().trim() : '';
  const surveySlug = body.survey ? body.survey.toString().trim() : '';

  // Basic input validation
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
    throw new Error('SCOPE_INVALID_INPUT: Invalid ZIP format');
  }

  const sessionId = crypto.randomUUID();
  const scopes = ['public'];
  const geo = {
    state: '',
    county: '',
    city: '',
    zip,
  };
  const districts = {
    sldl: '',
    sldu: '',
    cd: '',
    senate_state: '',
  };
  const scopeLevel = 'public';

  try {
    await env.DB.prepare(
      `INSERT INTO scope_sessions
       (id, status, match_source, match_quality, scope_level, scopes_json, geo_json, districts_json, risk_json, survey_slug)
       VALUES (?, 'active', 'none', 'none', ?, ?, ?, ?, '{}', ?)`
    )
      .bind(
        sessionId,
        scopeLevel,
        JSON.stringify(scopes),
        JSON.stringify(geo),
        JSON.stringify(districts),
        surveySlug || null
      )
      .run();
  } catch (err) {
    console.error('[Scope] Failed to insert scope_sessions:', err.message);
    throw err;
  }

  try {
    await env.DB.prepare(
      `INSERT INTO scope_events (session_id, event_type, details_json)
       VALUES (?, 'scope_created', ?)`
    )
      .bind(sessionId, JSON.stringify({ reason: 'initial' }))
      .run();
  } catch (err) {
    console.error('[Scope] Failed to insert scope_events:', err.message);
    throw err;
  }

  const payload = buildScopePayload({
    sessionId,
    matchQuality: 'none',
    scopes,
    geo,
    districts,
  });

  return {
    payload,
    cookie: `scope_sid=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  };
};

const handleScopeUpdate = async (request, env) => {
  const body = await parseJsonBody(request);
  const sessionId = body.session_id || getCookieValue(request, 'scope_sid');

  if (!sessionId) {
    return jsonResponse({ error: 'Missing session_id.' }, { status: 400 });
  }

  const session = await env.DB.prepare(
    `SELECT id, status FROM scope_sessions WHERE id = ?`
  )
    .bind(sessionId)
    .first();

  if (!session) {
    return jsonResponse({ error: 'Scope session not found.' }, { status: 404 });
  }

  const geoInput = body.geo || {};
  const districtsInput = body.districts || {};
  const geo = {
    state: normalizeState(geoInput.state),
    county: geoInput.county ? geoInput.county.toString().trim() : '',
    city: geoInput.city ? geoInput.city.toString().trim() : '',
    zip: geoInput.zip ? geoInput.zip.toString().trim() : '',
  };
  const cd = normalizeCd(districtsInput.cd);
  const sldl = districtsInput.sldl ? districtsInput.sldl.toString().trim() : '';
  const sldu = districtsInput.sldu ? districtsInput.sldu.toString().trim() : '';
  const districts = {
    sldl,
    sldu,
    cd,
    senate_state: geo.state ? geo.state : '',
  };

  const scopes = buildScopes({
    state: geo.state,
    cd,
    sldl,
    sldu,
  });
  const scopeLevel = computeScopeLevel({
    cd,
    sldu,
    sldl,
    state: geo.state,
    county: geo.county,
    city: geo.city,
  });
  const matchSource = normalizeMatchSource(body.match_source);
  const matchQuality = normalizeMatchQuality(body.match_quality);

  await env.DB.prepare(
    `UPDATE scope_sessions
     SET updated_at = datetime('now'),
         match_source = ?,
         match_quality = ?,
         scope_level = ?,
         scopes_json = ?,
         geo_json = ?,
         districts_json = ?
     WHERE id = ?`
  )
    .bind(
      matchSource,
      matchQuality,
      scopeLevel,
      JSON.stringify(scopes),
      JSON.stringify(geo),
      JSON.stringify(districts),
      sessionId
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO scope_events (session_id, event_type, details_json)
     VALUES (?, 'scope_updated', ?)`
  )
    .bind(sessionId, JSON.stringify({ source: matchSource }))
    .run();

  const payload = buildScopePayload({
    sessionId,
    matchQuality,
    scopes,
    geo,
    districts,
  });

  return jsonResponse(payload);
};

const handleScopeMe = async (request, env) => {
  const sessionId = getCookieValue(request, 'scope_sid');

  if (!sessionId) {
    return jsonResponse(
      buildScopePayload({
        sessionId: null,
        matchQuality: 'none',
        scopes: ['public'],
        geo: { state: '', county: '', city: '', zip: '' },
        districts: { sldl: '', sldu: '', cd: '', senate_state: '' },
      })
    );
  }

  const session = await env.DB.prepare(
    `SELECT match_quality, scopes_json, geo_json, districts_json
     FROM scope_sessions
     WHERE id = ? AND status = 'active'`
  )
    .bind(sessionId)
    .first();

  if (!session) {
    return jsonResponse(
      buildScopePayload({
        sessionId: null,
        matchQuality: 'none',
        scopes: ['public'],
        geo: { state: '', county: '', city: '', zip: '' },
        districts: { sldl: '', sldu: '', cd: '', senate_state: '' },
      })
    );
  }

  let scopes = ['public'];
  let geo = { state: '', county: '', city: '', zip: '' };
  let districts = { sldl: '', sldu: '', cd: '', senate_state: '' };

  try {
    scopes = JSON.parse(session.scopes_json || '[]');
  } catch (error) {
    scopes = ['public'];
  }

  try {
    geo = JSON.parse(session.geo_json || '{}');
  } catch (error) {
    geo = { state: '', county: '', city: '', zip: '' };
  }

  try {
    districts = JSON.parse(session.districts_json || '{}');
  } catch (error) {
    districts = { sldl: '', sldu: '', cd: '', senate_state: '' };
  }

  return jsonResponse(
    buildScopePayload({
      sessionId,
      matchQuality: session.match_quality || 'none',
      scopes,
      geo,
      districts,
    })
  );
};

const fetchAssetText = async (env, originUrl, pathname) => {
  if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return '';
  }
  const assetUrl = new URL(pathname, originUrl.origin);
  const response = await env.ASSETS.fetch(new Request(assetUrl));
  if (!response.ok) {
    return '';
  }
  return response.text();
};

const renderPage = async (env, originUrl, { title, bodyHtml, headHtml = '' }) => {
  const [header, footer] = await Promise.all([
    fetchAssetText(env, originUrl, '/partials/header.html'),
    fetchAssetText(env, originUrl, '/partials/footer.html'),
  ]);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/css/site.css" />
    ${headHtml}
  </head>
  <body>
    ${header}
    <main>
      ${bodyHtml}
    </main>
    ${footer}
  </body>
</html>`;
};

const renderSurveyForm = ({
  slug,
  surveyId,
  questionId,
  options,
  fn,
  ln,
  email,
  token,
}) => {
  const privacyLine =
    'We will only use your email to send survey updates and follow-ups.';
  const optionInputs = options
    .map(
      (option, index) => `
        <label class="option-card">
          <input
            type="radio"
            name="selected_key"
            value="policy_${index + 1}"
            required
          />
          <span>${escapeHtml(option)}</span>
        </label>
      `
    )
    .join('');

  const renderUserField = (name, label, value) => {
    if (value) {
      return `<input type="hidden" name="${name}" value="${escapeHtml(value)}" />`;
    }
    return `
      <label>
        ${label}
        <input type="text" name="${name}" autocomplete="${name}" />
      </label>
    `;
  };

  const renderEmailField = (value) => `
    <label>
      Email
      <input
        type="email"
        name="email"
        autocomplete="email"
        required
        value="${escapeHtml(value || '')}"
      />
    </label>
    <p class="helper-text">Please provide your email for your receipt.</p>
  `;

  return `
    <form
      class="survey-response"
      data-survey-form
      method="post"
      action="/api/surveys/${encodeURIComponent(slug)}/submit"
    >
      <input type="hidden" name="survey_id" value="${surveyId}" />
      <input type="hidden" name="question_id" value="${questionId}" />
      <input type="hidden" name="token" value="${escapeHtml(token || '')}" />
      <p class="survey-hello">Hello,<span id="survey-hello-name"></span></p>
      <fieldset class="option-list">
        <legend>Select one option</legend>
        <div class="option-cards">
          ${optionInputs}
        </div>
      </fieldset>
      <p class="form-error is-hidden" id="survey-error" role="alert"></p>
      <p class="privacy-note">${privacyLine}</p>
      <h3>Your info (email required for receipt)</h3>
      <div class="survey-info">
        ${renderEmailField(email)}
      </div>
      <div class="bias-section">
        <div class="bias-check">
          <input type="checkbox" id="biased" name="biased" value="1" />
          <label for="biased">I feel this is biased</label>
        </div>
        <label class="bias-note is-hidden" for="bias_note">
          How should these options improve? (optional)
          <textarea id="bias_note" name="bias_note" maxlength="500" rows="4"></textarea>
        </label>
        <a class="bias-link" href="/bias/">Suggest improvements</a>
      </div>
      <button class="button button--primary" type="submit">Submit response</button>
      <div class="survey-success is-hidden" id="survey-success" role="status"></div>
    </form>
  `;
};

export default {
  async fetch(request, env) {
    // Production environment safety check
    const isProduction = (env.ENVIRONMENT || '').toLowerCase() === 'production';
    if (isProduction && !env.TURNSTILE_SECRET_KEY) {
      console.error('[ERROR] Production environment requires TURNSTILE_SECRET_KEY to be set via wrangler secret put');
      return jsonResponse(
        { error: 'Server configuration error.', code: 'TURNSTILE_MISCONFIGURED' },
        { status: 500 }
      );
    }
    const turnstileGuard = enforceTurnstileBypassPolicy(env);
    if (turnstileGuard) {
      return turnstileGuard;
    }

    const url = new URL(request.url);
    const pathParts = parsePathParts(url.pathname);

    if (pathParts[0] === 'api' && pathParts[1] === 'auth') {
      if (request.method === 'GET' && pathParts[2] === 'turnstile') {
        return jsonResponse({
          siteKey: env.TURNSTILE_SITE_KEY || '',
          bypass: shouldBypassTurnstile(env),
        });
      }

      if (request.method === 'GET' && pathParts[2] === 'exists') {
        if (!env.DB) {
          return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
        }
        const email = normalizeEmail(url.searchParams.get('email') || '');
        if (!email || !isValidEmail(email)) {
          return jsonResponse({ error: 'Invalid email.', code: 'INVALID_EMAIL' }, { status: 400 });
        }
        const existing = await env.DB.prepare('SELECT id FROM user WHERE email = ?')
          .bind(email)
          .first();
        return jsonResponse({ exists: !!existing });
      }

      if (request.method === 'GET' && pathParts[2] === 'me') {
        return handleAuthMe(request, env);
      }

      if (request.method === 'POST' && pathParts[2] === 'signup') {
        return handleAuthSignup(request, env);
      }

      if (request.method === 'POST' && pathParts[2] === 'login') {
        return handleAuthLogin(request, env);
      }

      if (request.method === 'GET' && pathParts[2] === 'oauth' && pathParts[3] === 'google' && pathParts[4] === 'start') {
        return handleOAuthStart(request, env, 'google');
      }

      if (request.method === 'GET' && pathParts[2] === 'oauth' && pathParts[3] === 'google' && pathParts[4] === 'callback') {
        return handleOAuthCallback(request, env, 'google');
      }

      if (request.method === 'GET' && pathParts[2] === 'oauth' && pathParts[3] === 'apple' && pathParts[4] === 'start') {
        return handleOAuthStart(request, env, 'apple');
      }

      if ((request.method === 'GET' || request.method === 'POST')
        && pathParts[2] === 'oauth'
        && pathParts[3] === 'apple'
        && pathParts[4] === 'callback') {
        return handleOAuthCallback(request, env, 'apple');
      }

      if (request.method === 'POST' && pathParts[2] === 'password-reset' && pathParts[3] === 'request') {
        return handlePasswordResetRequest(request, env);
      }

      if (request.method === 'POST' && pathParts[2] === 'password-reset' && pathParts[3] === 'confirm') {
        return handlePasswordResetConfirm(request, env);
      }

      if (request.method === 'POST' && pathParts[2] === 'passkey' && pathParts[3] === 'register' && pathParts[4] === 'options') {
        return handlePasskeyRegisterOptions(request, env);
      }

      if (request.method === 'POST' && pathParts[2] === 'passkey' && pathParts[3] === 'register' && pathParts[4] === 'verify') {
        return handlePasskeyRegisterVerify(request, env);
      }

      if (request.method === 'POST' && pathParts[2] === 'passkey' && pathParts[3] === 'login' && pathParts[4] === 'options') {
        return handlePasskeyLoginOptions(request, env);
      }

      if (request.method === 'POST' && pathParts[2] === 'passkey' && pathParts[3] === 'login' && pathParts[4] === 'verify') {
        return handlePasskeyLoginVerify(request, env);
      }

      if (request.method === 'GET' && pathParts[2] === 'passkey' && pathParts[3] === 'list') {
        return handlePasskeyList(request, env);
      }

      if (request.method === 'DELETE' && pathParts[2] === 'passkey' && pathParts[3] === 'remove') {
        return handlePasskeyRemove(request, env);
      }

      if (request.method === 'POST' && pathParts[2] === 'logout') {
        return handleAuthLogout(request, env);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/surveys/list') {
      try {
        if (!env.DB) {
          throw new Error('Database binding not available');
        }
        const sessionResult = await getSessionUser(request, env);
        const user = sessionResult.status === 'valid' ? sessionResult.user : null;
        const userId = user ? user.id : '';
        const result = await env.DB.prepare(
          `SELECT s.slug,
                  s.title,
                  s.scope,
                  s.status,
                  v.id AS version_id,
                  v.json_hash,
                  v.json_text,
                  r.submitted_at AS submitted_at,
                  r.updated_at AS updated_at,
                  r.edit_count AS edit_count
           FROM surveys s
           JOIN survey_versions v ON v.id = (
             SELECT v2.id
             FROM survey_versions v2
             WHERE v2.survey_id = s.id AND v2.published_at IS NOT NULL
             ORDER BY v2.published_at DESC, v2.version DESC, v2.id DESC
             LIMIT 1
           )
           LEFT JOIN responses r
             ON r.survey_version_id = v.id
            AND r.user_id = ?
           ORDER BY s.created_at DESC`
        )
          .bind(userId)
          .all();

        const payload = (result.results || []).map((row) => {
          let description = '';
          try {
            const parsed = JSON.parse(row.json_text || '{}');
            description = parsed.description || '';
          } catch (error) {
            description = '';
          }
          return {
            slug: row.slug,
            title: row.title,
            scope: row.scope,
            status: row.status,
            description,
            versionId: row.version_id,
            versionHash: row.json_hash,
            response: row.submitted_at
              ? {
                  submittedAt: row.submitted_at,
                  updatedAt: row.updated_at || row.submitted_at,
                  editCount: row.edit_count || 0,
                }
              : null,
          };
        });

        return jsonResponse(payload, sessionResult.headers ? { headers: sessionResult.headers } : {});
      } catch (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/responses/mine') {
      try {
        if (!env.DB) {
          throw new Error('Database binding not available');
        }
        const auth = await requireSessionUser(request, env);
        if (auth.response) {
          return auth.response;
        }
        const { user } = auth;
        const surveyVersionId = url.searchParams.get('surveyVersionId') || '';
        if (!surveyVersionId) {
          return jsonResponse({ error: 'Missing surveyVersionId.', code: 'MISSING_SURVEY_VERSION_ID' }, { status: 400 });
        }

        const responseRow = await env.DB.prepare(
          `SELECT id, submitted_at, updated_at, edit_count
           FROM responses
           WHERE user_id = ? AND survey_version_id = ?
           LIMIT 1`
        )
          .bind(user.id, surveyVersionId)
          .first();

        if (!responseRow) {
          return jsonResponse({ exists: false });
        }

        const answersResult = await env.DB.prepare(
          `SELECT question_name, value_json
           FROM response_answers
           WHERE response_id = ?`
        )
          .bind(responseRow.id)
          .all();

        const answersJson = {};
        (answersResult.results || []).forEach((row) => {
          try {
            answersJson[row.question_name] = JSON.parse(row.value_json);
          } catch (error) {
            answersJson[row.question_name] = null;
          }
        });

        return jsonResponse({
          exists: true,
          submittedAt: responseRow.submitted_at,
          updatedAt: responseRow.updated_at || responseRow.submitted_at,
          editCount: responseRow.edit_count || 0,
          answersJson,
        });
      } catch (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/choices/states') {
      return jsonResponse(getUsStates());
    }

    if (request.method === 'GET' && url.pathname === '/api/choices/wy-house-districts') {
      return jsonResponse(getWyHouseDistricts());
    }

    if (request.method === 'GET' && url.pathname === '/api/geo/us-states') {
      return jsonResponse(getUsStates());
    }

    if (request.method === 'GET' && url.pathname === '/api/wy/house-districts') {
      return jsonResponse(getWyHouseDistricts());
    }

    if (
      request.method === 'GET' &&
      pathParts[0] === 'api' &&
      pathParts[1] === 'surveys' &&
      pathParts[2] &&
      pathParts.length === 3
    ) {
      try {
        if (!env.DB) {
          throw new Error('Database binding not available');
        }
        const slug = decodeURIComponent(pathParts[2]);
        const row = await env.DB.prepare(
          `SELECT s.title AS title,
                  v.id AS version_id,
                  v.json_text AS json_text,
                  v.json_hash AS json_hash
           FROM surveys s
           JOIN survey_versions v ON v.survey_id = s.id
           WHERE s.slug = ? AND v.published_at IS NOT NULL
           ORDER BY v.published_at DESC, v.version DESC, v.id DESC
           LIMIT 1`
        )
          .bind(slug)
          .first();

        if (!row) {
          return jsonResponse({ error: 'Survey not found.' }, { status: 404 });
        }

        let surveyJson = {};
        try {
          surveyJson = JSON.parse(row.json_text || '{}');
        } catch (error) {
          return jsonResponse({ error: 'Survey unavailable.' }, { status: 500 });
        }

        return jsonResponse({
          surveyJson,
          versionId: row.version_id,
          versionHash: row.json_hash,
          title: row.title,
        });
      } catch (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }
    }

    if (
      request.method === 'POST' &&
      pathParts[0] === 'api' &&
      pathParts[1] === 'surveys' &&
      pathParts[2] &&
      pathParts[3] === 'responses'
    ) {
      try {
        if (!env.DB) {
          throw new Error('Database binding not available');
        }
        const slug = decodeURIComponent(pathParts[2]);
        const body = await parseJsonBody(request);
        const versionId = body.surveyVersionId || body.versionId;
        const versionHash = body.versionHash;
        const answers = body.answersJson || body.answers;
        const meta = body.meta || {};

        if (!versionId || !answers || typeof answers !== 'object') {
          return jsonResponse({ error: 'Invalid payload.' }, { status: 400 });
        }

        const auth = await requireSessionUser(request, env);
        if (auth.response) {
          return auth.response;
        }
        const { user } = auth;

        const version = await env.DB.prepare(
          `SELECT s.id AS survey_id, v.id AS version_id, v.json_hash AS json_hash
           FROM surveys s
           JOIN survey_versions v ON v.survey_id = s.id
           WHERE s.slug = ? AND v.id = ?
           LIMIT 1`
        )
          .bind(slug, versionId)
          .first();

        if (!version) {
          return jsonResponse({ error: 'Survey version not found.' }, { status: 404 });
        }

        if (versionHash && versionHash !== version.json_hash) {
          return jsonResponse({ error: 'Survey version hash mismatch.', code: 'VERSION_HASH_MISMATCH' }, { status: 400 });
        }

        const districtMeta =
          meta.district && typeof meta.district === 'string'
            ? meta.district.trim()
            : null;
        const ip = request.headers.get('CF-Connecting-IP') || '';
        const ipHash = ip ? await sha256Hex(ip) : null;
        const userHash =
          meta.user_hash && typeof meta.user_hash === 'string'
            ? meta.user_hash.trim()
            : null;

        const wyDistricts = await deriveWyDistricts(env.WY_VOTERS_DB, meta);
        const federalDistrict = await deriveFederalDistrict(env.SIBIDRIFT_DB, meta);
        const combinedDistricts = {
          stateHouse: wyDistricts ? wyDistricts.stateHouse : null,
          stateSenate: wyDistricts ? wyDistricts.stateSenate : null,
          usHouse: federalDistrict ? federalDistrict.usHouse : null,
          sources: [
            wyDistricts ? wyDistricts.source : null,
            federalDistrict ? federalDistrict.source : null,
          ].filter(Boolean),
        };
        const districtPayload =
          combinedDistricts.stateHouse ||
          combinedDistricts.stateSenate ||
          combinedDistricts.usHouse
            ? JSON.stringify(combinedDistricts)
            : districtMeta;

        const existing = await env.DB.prepare(
          `SELECT id, submitted_at, updated_at, edit_count
           FROM responses
           WHERE user_id = ? AND survey_version_id = ?
           LIMIT 1`
        )
          .bind(user.id, version.version_id)
          .first();

        const now = nowIso();
        let responseId = existing ? existing.id : crypto.randomUUID();
        let submittedAt = existing?.submitted_at || now;
        let updatedAt = now;
        let editCount = existing?.edit_count || 0;

        if (!existing) {
          await env.DB.prepare(
            `INSERT INTO responses
             (id, user_id, survey_id, survey_version_id, version_hash, verified_flag, district, ip_hash, user_hash, submitted_at, updated_at, edit_count)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)`
          )
            .bind(
              responseId,
              user.id,
              version.survey_id,
              version.version_id,
              version.json_hash,
              districtPayload,
              ipHash,
              userHash,
              now,
              now
            )
            .run();
          await writeAuditEvent(env, request, {
            userId: user.id,
            eventType: 'response_created',
            metadata: { survey_version_id: version.version_id, response_id: responseId },
          });
          await writeAuditEvent(env, request, {
            userId: user.id,
            eventType: 'response_submitted',
            metadata: { survey_version_id: version.version_id, response_id: responseId },
          });
        } else {
          editCount += 1;
          await env.DB.prepare(
            `UPDATE responses
             SET updated_at = ?, edit_count = ?
             WHERE id = ?`
          )
            .bind(updatedAt, editCount, responseId)
            .run();
          await env.DB.prepare(
            `DELETE FROM response_answers WHERE response_id = ?`
          )
            .bind(responseId)
            .run();
          await writeAuditEvent(env, request, {
            userId: user.id,
            eventType: 'response_updated',
            metadata: { survey_version_id: version.version_id, response_id: responseId },
          });
        }

        const entries = Object.entries(answers);
        for (const [questionName, value] of entries) {
          if (!questionName) {
            continue;
          }
          const valueJson = JSON.stringify(value ?? null);
          await env.DB.prepare(
            `INSERT INTO response_answers (response_id, question_name, value_json)
             VALUES (?, ?, ?)`
          )
            .bind(responseId, questionName, valueJson)
            .run();
        }

        return jsonResponse({
          ok: true,
          responseId,
          existedBefore: !!existing,
          submittedAt,
          updatedAt,
          editCount,
        });
      } catch (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/dev/seed-surveyjs') {
      try {
        if (!env.DB) {
          throw new Error('Database binding not available');
        }
        if (!isLocalRequest(url)) {
          return jsonResponse({ error: 'Not found.' }, { status: 404 });
        }

        const surveyJson = {
          title: 'Abortion Policy Survey',
          pages: [
            {
              name: 'page1',
              elements: [
                {
                  type: 'radiogroup',
                  name: 'policy_approach',
                  title: 'Which policy approach do you support most?',
                  choices: [
                    'Protect abortion access early, limit later',
                    'Protect abortion access in all cases',
                    'Restrict abortion with defined exceptions',
                  ],
                },
                {
                  type: 'comment',
                  name: 'policy_reason',
                  title: 'What is the main reason for your view?',
                },
                {
                  type: 'text',
                  name: 'district',
                  title: 'Which district do you live in?',
                },
              ],
            },
          ],
        };

        await env.DB.prepare(
          `INSERT OR IGNORE INTO surveys (slug, scope, title, status, created_at)
           VALUES (?, 'public', ?, 'active', datetime('now'))`
        )
          .bind('abortion', 'Abortion Policy Survey')
          .run();

        const surveyRow = await env.DB.prepare(
          `SELECT id FROM surveys WHERE slug = ?`
        )
          .bind('abortion')
          .first();

        if (!surveyRow) {
          return jsonResponse({ error: 'Survey insert failed.' }, { status: 500 });
        }

        const existingVersion = await env.DB.prepare(
          `SELECT id FROM survey_versions WHERE survey_id = ? AND version = 1`
        )
          .bind(surveyRow.id)
          .first();

        if (existingVersion) {
          return jsonResponse({
            ok: true,
            surveyId: surveyRow.id,
            versionId: existingVersion.id,
            alreadySeeded: true,
          });
        }

        const jsonText = stableStringify(surveyJson);
        const jsonHash = await sha256Hex(jsonText);

        const insertResult = await env.DB.prepare(
          `INSERT INTO survey_versions
           (survey_id, version, json_text, json_hash, changelog, created_at, published_at)
           VALUES (?, 1, ?, ?, 'Initial seed', datetime('now'), datetime('now'))`
        )
          .bind(surveyRow.id, jsonText, jsonHash)
          .run();

        return jsonResponse({
          ok: true,
          surveyId: surveyRow.id,
          versionId: insertResult.meta.last_row_id,
        });
      } catch (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/scope/start') {
      try {
        if (!env.DB) {
          console.error('[Scope] Database binding not available');
          return jsonResponse(
            { ok: false, code: 'SCOPE_MISCONFIGURED', error: 'Service temporarily unavailable.' },
            { status: 500 }
          );
        }
        const { payload, cookie } = await handleScopeStart(request, env);
        return jsonResponse(payload, {
          headers: { 'Set-Cookie': cookie },
        });
      } catch (error) {
        const errorMsg = error?.message || String(error);
        console.error('[Scope] Error in handleScopeStart:', errorMsg);
        // Map common error patterns to specific codes
        let code = 'SCOPE_UNKNOWN_ERROR';
        let status = 500;
        let userMessage = 'Unable to create scope session.';
        
        if (errorMsg.includes('SQLITE_CONSTRAINT') || errorMsg.includes('unique constraint')) {
          code = 'SCOPE_DUPLICATE_SESSION';
          status = 409;
        } else if (errorMsg.includes('SQLITE_IOERR') || errorMsg.includes('database disk image is malformed')) {
          code = 'SCOPE_DB_ERROR';
          status = 503;
          userMessage = 'Database temporarily unavailable. Please try again.';
        } else if (errorMsg.includes('no such table')) {
          code = 'SCOPE_DB_ERROR';
          status = 503;
          userMessage = 'Database initialization pending. Please try again.';
        } else if (errorMsg.includes('JSON') || errorMsg.includes('Invalid')) {
          code = 'SCOPE_INVALID_INPUT';
          status = 400;
        } else if (errorMsg.includes('SCOPE_MISCONFIGURED') || errorMsg.includes('Database not available')) {
          code = 'SCOPE_MISCONFIGURED';
          status = 500;
        }
        
        return jsonResponse(
          { ok: false, code, error: userMessage },
          { status }
        );
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/scope/update') {
      try {
        if (!env.DB) {
          throw new Error('Database binding not available');
        }
        return await handleScopeUpdate(request, env);
      } catch (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/scope/me') {
      try {
        if (!env.DB) {
          throw new Error('Database binding not available');
        }
        return await handleScopeMe(request, env);
      } catch (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }
    }

    if (url.pathname === '/api/scope' && request.method === 'POST') {
      try {
        if (!env.DB) {
          throw new Error('Database binding not available');
        }
        const legacyBody = await parseJsonBody(request);
        const mappedBody = {
          fn: legacyBody.first_name || legacyBody.fn || '',
          ln: legacyBody.last_name || legacyBody.ln || '',
          zip: legacyBody.zip || '',
          house_number: legacyBody.house_number || legacyBody.houseNumber || '',
          survey: legacyBody.survey || '',
        };
        const { payload, cookie } = await handleScopeStart(request, env, { body: mappedBody });
        return jsonResponse(
          {
            scope: payload.scopes && payload.scopes[0] ? payload.scopes[0] : 'public',
            ...payload,
          },
          { headers: { 'Set-Cookie': cookie } }
        );
      } catch (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
      }
    }

    if (
      request.method === 'GET' &&
      pathParts[0] === 'surveys' &&
      pathParts.length === 2 &&
      !['take', 'resume', 'complete', 'list'].includes(pathParts[1])
    ) {
      const slug = decodeURIComponent(pathParts[1]);
      const bodyHtml = `
        <h1 id="surveyjs-title">Survey</h1>
        <p class="helper-text is-hidden" id="surveyjs-editing"></p>
        <p class="helper-text" id="surveyjs-status">Loading survey...</p>
        <div id="surveyjs-root" data-slug="${escapeHtml(slug)}"></div>
        <script src="/js/surveyjs-bundle.js"></script>
      `;

      const page = await renderPage(env, url, {
        title: 'Survey',
        headHtml: '<link rel="stylesheet" href="/css/surveyjs.css" />',
        bodyHtml,
      });
      return new Response(page, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    if (request.method === 'GET' && pathParts[0] === 'surveys' && pathParts[1] === 'take' && pathParts[2]) {
      const slug = decodeURIComponent(pathParts[2]);
      const token = url.searchParams.get('token')?.trim() || '';
      const survey = await env.DB.prepare(
        'SELECT id, title, status FROM surveys WHERE slug = ?'
      )
        .bind(slug)
        .first();

      if (!survey) {
        return new Response('Survey not found.', { status: 404 });
      }

      const question = await env.DB.prepare(
        "SELECT id, question_json FROM survey_questions WHERE survey_id = ? AND question_key = 'main_question_01'"
      )
        .bind(survey.id)
        .first();

      if (!question) {
        return new Response('Survey question not found.', { status: 404 });
      }

      let questionPayload = {};
      try {
        questionPayload = JSON.parse(question.question_json);
      } catch (error) {
        questionPayload = {};
      }

      const options = [1, 2, 3, 4, 5].map(
        (index) => questionPayload[`policy_${index}`] || ''
      );

      const templateText = await fetchAssetText(env, url, '/templates/survey_template.md');
      if (!templateText) {
        return new Response('Survey template unavailable.', { status: 500 });
      }

      const fn = url.searchParams.get('fn')?.trim() || '';
      const ln = url.searchParams.get('ln')?.trim() || '';
      const email = url.searchParams.get('email')?.trim() || '';

      const replacements = {
        '{{fn}}': escapeHtml(fn),
        '{{ln}}': escapeHtml(ln),
        '{{email}}': escapeHtml(email),
        '{{main_question_01}}': escapeHtml(questionPayload.prompt || ''),
        '{{main_question_01.policy_1}}': escapeHtml(options[0]),
        '{{main_question_01.policy_2}}': escapeHtml(options[1]),
        '{{main_question_01.policy_3}}': escapeHtml(options[2]),
        '{{main_question_01.policy_4}}': escapeHtml(options[3]),
        '{{main_question_01.policy_5}}': escapeHtml(options[4]),
      };

      let markdown = templateText;
      Object.entries(replacements).forEach(([key, value]) => {
        markdown = markdown.replaceAll(key, value);
      });

      const surveyHtml = snarkdown(markdown);
      const formHtml = renderSurveyForm({
        slug,
        surveyId: survey.id,
        questionId: question.id,
        options,
        fn,
        ln,
        email,
        token,
      });

      const bodyHtml = `
        <h1>${escapeHtml(survey.title)}</h1>
        ${surveyHtml}
        ${formHtml}
        <script src="/js/survey-take.js"></script>
      `;

      const page = await renderPage(env, url, {
        title: survey.title,
        bodyHtml,
      });
      return new Response(page, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    if (request.method !== 'GET' && pathParts[0] === 'surveys' && pathParts[1] === 'take' && pathParts[2]) {
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (request.method === 'GET' && pathParts[0] === 'surveys' && pathParts[1] === 'resume') {
      const token = pathParts[2]
        ? decodeURIComponent(pathParts[2])
        : url.searchParams.get('token')?.trim();
      if (!token) {
        return new Response('Survey token is required.', { status: 400 });
      }
      const nextSlug = await getResumeSurveySlug(env, token);
      if (!nextSlug) {
        return new Response(null, {
          status: 302,
          headers: { Location: `/surveys/complete/${encodeURIComponent(token)}` },
        });
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/surveys/take/${encodeURIComponent(nextSlug)}?token=${encodeURIComponent(
            token
          )}`,
        },
      });
    }

    if (request.method === 'POST' && pathParts[0] === 'api' && pathParts[1] === 'surveys' && pathParts[2] && pathParts[3] === 'submit') {
      const slug = decodeURIComponent(pathParts[2]);
      const formData = await request.formData();
      const selectedKey = formData.get('selected_key');
      const validKeys = new Set(['policy_1', 'policy_2', 'policy_3', 'policy_4', 'policy_5']);

      if (!selectedKey || !validKeys.has(selectedKey.toString())) {
        return new Response('Please select an option.', { status: 400 });
      }

      const survey = await env.DB.prepare(
        'SELECT id, title FROM surveys WHERE slug = ?'
      )
        .bind(slug)
        .first();

      if (!survey) {
        return new Response('Survey not found.', { status: 404 });
      }

      const question = await env.DB.prepare(
        "SELECT id FROM survey_questions WHERE survey_id = ? AND question_key = 'main_question_01'"
      )
        .bind(survey.id)
        .first();

      if (!question) {
        return new Response('Survey question not found.', { status: 404 });
      }

      const submissionId = crypto.randomUUID();
      const fn = formData.get('fn')?.toString().trim() || null;
      const ln = formData.get('ln')?.toString().trim() || null;
      const email = formData.get('email')?.toString().trim() || null;
      const token = formData.get('token')?.toString().trim() || '';
      const biased = formData.get('biased') ? 1 : 0;
      const biasNote = formData.get('bias_note')?.toString().trim() || null;

      await env.DB.prepare(
        `INSERT INTO survey_submissions (id, survey_id, status, fn, ln, email)
         VALUES (?, ?, 'unverified', ?, ?, ?)`
      )
        .bind(submissionId, survey.id, fn, ln, email)
        .run();

      await env.DB.prepare(
        `INSERT INTO survey_answers (submission_id, question_id, selected_key, biased, bias_note)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(submissionId, question.id, selectedKey.toString(), biased, biasNote)
        .run();

      if (biased || biasNote) {
        await env.DB.prepare(
          `INSERT INTO bias_reports (survey_id, submission_id, question_id, note)
           VALUES (?, ?, ?, ?)`
        )
          .bind(survey.id, submissionId, question.id, biasNote)
          .run();
      }

      const receiptToken = await ensureSurveyToken(env, token);
      await env.DB.prepare(
        `INSERT OR IGNORE INTO survey_token_submissions (token, submission_id, survey_id)
         VALUES (?, ?, ?)`
      )
        .bind(receiptToken, submissionId, survey.id)
        .run();

      const activeSurveys = await getActiveSurveys(env);
      const nextSurveySlug = getNextSurveySlug(activeSurveys, survey.id);
      const receiptUrl = nextSurveySlug
        ? `/surveys/take/${encodeURIComponent(nextSurveySlug)}?token=${encodeURIComponent(
            receiptToken
          )}`
        : `/surveys/complete/${encodeURIComponent(receiptToken)}`;
      return jsonResponse({
        submission_id: submissionId,
        receipt_url: receiptUrl,
        token: receiptToken,
        next_survey_slug: nextSurveySlug || null,
        complete: !nextSurveySlug,
      });
    }

    if (request.method === 'GET' && pathParts[0] === 'receipt' && pathParts[1]) {
      const receiptId = decodeURIComponent(pathParts[1]);
      const bodyHtml = `
        <h1>Submission receipt</h1>
        <p>Receipt ID: ${escapeHtml(receiptId)}</p>
        <p>Your submission is currently marked as unverified.</p>
      `;
      const page = await renderPage(env, url, {
        title: 'Submission receipt',
        bodyHtml,
      });
      return new Response(page, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    if (request.method === 'GET' && pathParts[0] === 'surveys' && pathParts[1] === 'complete' && pathParts[2]) {
      const token = decodeURIComponent(pathParts[2]);
      const summary = await getSurveySummaryByToken(env, token);
      const summaryHtml = summary.length
        ? summary
            .map(
              (item) => `
                <article class="card">
                  <h2>${escapeHtml(item.title)}</h2>
                  <p><strong>${escapeHtml(item.prompt)}</strong></p>
                  <p>${escapeHtml(item.answer)}</p>
                </article>
              `
            )
            .join('')
        : '<p>No responses found for this token yet.</p>';

      const bodyHtml = `
        <h1>Survey summary</h1>
        <p>Your survey token: <strong>${escapeHtml(token)}</strong></p>
        <p>Keep this token if you want to revisit or update your responses later.</p>
        <div class="grid">
          ${summaryHtml}
        </div>
        <div class="hero-actions">
          <a class="button button--primary" href="/surveys/list/">Looks OK</a>
        </div>
        <form class="survey-form" method="get" action="/surveys/resume">
          <div class="form-row">
            <label for="resume-token">Resume with token</label>
            <input id="resume-token" name="token" type="text" autocomplete="one-time-code" />
          </div>
          <button class="button button--small" type="submit">Resume surveys</button>
        </form>
      `;

      const page = await renderPage(env, url, {
        title: 'Survey summary',
        bodyHtml,
      });
      return new Response(page, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    // Serve static assets from /public
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    
    // Fallback: serve index.html for any other routes
    return new Response('Not Found', { status: 404 });
  },
};
