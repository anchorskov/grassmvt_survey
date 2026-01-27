/* src/worker.js */
import { D1Adapter } from '@lucia-auth/adapter-sqlite';
import { scrypt } from '@noble/hashes/scrypt';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { Lucia, TimeSpan } from 'lucia';
import snarkdown from 'snarkdown';

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

const PASSWORD_MIN_LENGTH = 12;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, dkLen: 64 };
const SESSION_TTL_DAYS = 30;

const normalizeEmail = (value = '') => value.toString().trim().toLowerCase();

const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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

const hashPassword = async (password) => {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derivedKey = scrypt(new TextEncoder().encode(password), salt, SCRYPT_PARAMS);
  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    bytesToHex(salt),
    bytesToHex(derivedKey),
  ].join('$');
};

const verifyPassword = async (password, stored) => {
  if (!stored || typeof stored !== 'string') {
    return false;
  }
  const parts = stored.split('$');
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

const shouldBypassTurnstile = (env) =>
  isLocalEnv(env) && (env.TURNSTILE_BYPASS || '').toLowerCase() === 'true';

const verifyTurnstile = async (token, request, env) => {
  if (shouldBypassTurnstile(env)) {
    return { ok: true, bypassed: true };
  }
  if (!token) {
    return { ok: false, error: 'Missing Turnstile token.' };
  }
  if (!env.TURNSTILE_SECRET_KEY) {
    return { ok: false, error: 'Turnstile secret not configured.' };
  }
  const body = new FormData();
  body.set('secret', env.TURNSTILE_SECRET_KEY);
  body.set('response', token);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) {
    body.set('remoteip', ip);
  }
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const result = await response.json();
  if (!result.success) {
    return { ok: false, error: 'Turnstile verification failed.' };
  }
  return { ok: true };
};

const cleanupExpiredSessions = async (env) => {
  if (!env.DB) {
    return;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM session WHERE expires_at <= ?').bind(nowSeconds).run();
};

const initializeLucia = (env) => {
  const adapter = new D1Adapter(env.DB, { user: 'user', session: 'session' });
  const isProduction = (env.ENVIRONMENT || '').toLowerCase() === 'production';
  return new Lucia(adapter, {
    sessionExpiresIn: new TimeSpan(SESSION_TTL_DAYS, 'd'),
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
      `SELECT DISTINCT congressional_district
       FROM hud_zip_crosswalk
       WHERE zipcode = ?
       ORDER BY congressional_district`
    )
    .bind(zip)
    .all();
  const districts = (result.results || [])
    .map((row) => row.congressional_district)
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
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }
  const body = await parseJsonBody(request);
  const email = normalizeEmail(body.email || '');
  const password = body.password || '';
  const turnstileToken = body.turnstileToken || '';

  if (!email || !isValidEmail(email)) {
    await writeAuditEvent(env, request, {
      eventType: 'signup_failed',
      metadata: { reason: 'invalid_email' },
    });
    return jsonResponse({ error: 'Invalid email.' }, { status: 400 });
  }
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    await writeAuditEvent(env, request, {
      eventType: 'signup_failed',
      metadata: { reason: 'weak_password' },
    });
    return jsonResponse({ error: 'Password must be at least 12 characters.' }, { status: 400 });
  }

  const turnstile = await verifyTurnstile(turnstileToken, request, env);
  if (!turnstile.ok) {
    await writeAuditEvent(env, request, {
      eventType: 'signup_failed',
      metadata: { reason: 'turnstile_failed' },
    });
    return jsonResponse({ error: 'Unable to verify request.' }, { status: 403 });
  }

  await cleanupExpiredSessions(env);

  const existing = await env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(email).first();
  if (existing) {
    await writeAuditEvent(env, request, {
      eventType: 'signup_failed',
      metadata: { reason: 'email_exists' },
    });
    return jsonResponse({ error: 'Unable to create account.' }, { status: 409 });
  }

  const userId = crypto.randomUUID();
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

  const lucia = initializeLucia(env);
  const session = await lucia.createSession(userId, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  await writeAuditEvent(env, request, { userId, eventType: 'signup' });

  const headers = new Headers();
  headers.append('Set-Cookie', sessionCookie.serialize());
  return jsonResponse({ ok: true }, { headers });
};

const handleAuthLogin = async (request, env) => {
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding not available.' }, { status: 500 });
  }
  const originError = requireSameOrigin(request, env);
  if (originError) {
    return jsonResponse({ error: originError }, { status: 403 });
  }
  const body = await parseJsonBody(request);
  const email = normalizeEmail(body.email || '');
  const password = body.password || '';
  const turnstileToken = body.turnstileToken || '';

  if (!email || !password) {
    await writeAuditEvent(env, request, {
      eventType: 'login_failed',
      metadata: { reason: 'missing_credentials' },
    });
    return jsonResponse({ error: 'Invalid credentials.' }, { status: 400 });
  }

  const turnstile = await verifyTurnstile(turnstileToken, request, env);
  if (!turnstile.ok) {
    await writeAuditEvent(env, request, {
      eventType: 'login_failed',
      metadata: { reason: 'turnstile_failed' },
    });
    return jsonResponse({ error: 'Unable to verify request.' }, { status: 403 });
  }

  await cleanupExpiredSessions(env);

  const user = await env.DB.prepare('SELECT id, email, password_hash FROM user WHERE email = ?')
    .bind(email)
    .first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await writeAuditEvent(env, request, {
      eventType: 'login_failed',
      metadata: { reason: 'invalid_credentials' },
    });
    return jsonResponse({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const lucia = initializeLucia(env);
  await lucia.invalidateUserSessions(user.id);
  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);

  await writeAuditEvent(env, request, { userId: user.id, eventType: 'login' });

  const headers = new Headers();
  headers.append('Set-Cookie', sessionCookie.serialize());
  return jsonResponse({ ok: true }, { headers });
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
  const lucia = initializeLucia(env);
  const cookieHeader = request.headers.get('Cookie') || '';
  const sessionId = lucia.readSessionCookie(cookieHeader);
  if (!sessionId) {
    return jsonResponse({ authenticated: false });
  }
  const { session, user } = await lucia.validateSession(sessionId);
  if (!session || !user) {
    const blank = lucia.createBlankSessionCookie();
    const headers = new Headers();
    headers.append('Set-Cookie', blank.serialize());
    return jsonResponse({ authenticated: false }, { headers });
  }

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
  const body = overrides.body || (await parseJsonBody(request));
  const zip = body.zip ? body.zip.toString().trim() : '';
  const surveySlug = body.survey ? body.survey.toString().trim() : '';

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

  await env.DB.prepare(
    `INSERT INTO scope_events (session_id, event_type, details_json)
     VALUES (?, 'scope_created', ?)`
  )
    .bind(sessionId, JSON.stringify({ reason: 'initial' }))
    .run();

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
    const url = new URL(request.url);
    const pathParts = parsePathParts(url.pathname);

    if (pathParts[0] === 'api' && pathParts[1] === 'auth') {
      if (request.method === 'GET' && pathParts[2] === 'turnstile') {
        return jsonResponse({
          siteKey: env.TURNSTILE_SITE_KEY || '',
          bypass: shouldBypassTurnstile(env),
        });
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

      if (request.method === 'POST' && pathParts[2] === 'logout') {
        return handleAuthLogout(request, env);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/surveys/list') {
      try {
        if (!env.DB) {
          throw new Error('Database binding not available');
        }

        const result = await env.DB.prepare(
          `SELECT s.slug,
                  s.title,
                  s.scope,
                  s.status,
                  v.id AS version_id,
                  v.json_hash,
                  v.json_text
           FROM surveys s
           JOIN survey_versions v ON v.id = (
             SELECT v2.id
             FROM survey_versions v2
             WHERE v2.survey_id = s.id AND v2.published_at IS NOT NULL
             ORDER BY v2.published_at DESC, v2.version DESC, v2.id DESC
             LIMIT 1
           )
           ORDER BY s.created_at DESC`
        ).all();

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
          };
        });

        return jsonResponse(payload);
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
        const versionId = body.versionId;
        const versionHash = body.versionHash;
        const answers = body.answers;
        const meta = body.meta || {};

        if (!versionId || !versionHash || !answers || typeof answers !== 'object') {
          return jsonResponse({ error: 'Invalid payload.' }, { status: 400 });
        }

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

        if (version.json_hash !== versionHash) {
          return jsonResponse({ error: 'Survey version hash mismatch.' }, { status: 400 });
        }

        const responseId = crypto.randomUUID();
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

        await env.DB.prepare(
          `INSERT INTO responses
           (id, survey_id, survey_version_id, version_hash, verified_flag, district, ip_hash, user_hash)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
        )
          .bind(
            responseId,
            version.survey_id,
            version.version_id,
            versionHash,
            districtPayload,
            ipHash,
            userHash
          )
          .run();

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

        return jsonResponse({ ok: true, responseId });
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
          throw new Error('Database binding not available');
        }
        const { payload, cookie } = await handleScopeStart(request, env);
        return jsonResponse(payload, {
          headers: { 'Set-Cookie': cookie },
        });
      } catch (error) {
        return jsonResponse({ error: error.message }, { status: 500 });
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
