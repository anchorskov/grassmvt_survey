/* src/worker.js */
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
  const headers = {
    'content-type': 'application/json',
    ...(init.headers || {}),
  };
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
  const assetUrl = new URL(pathname, originUrl.origin);
  const response = await env.ASSETS.fetch(new Request(assetUrl));
  if (!response.ok) {
    return '';
  }
  return response.text();
};

const renderPage = async (env, originUrl, { title, bodyHtml }) => {
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
}) => {
  const optionInputs = options
    .map(
      (option, index) => `
        <label>
          <input type="radio" name="selected_key" value="policy_${index + 1}" required />
          ${escapeHtml(option)}
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

  return `
    <form method="post" action="/api/surveys/${encodeURIComponent(slug)}/submit">
      <input type="hidden" name="survey_id" value="${surveyId}" />
      <input type="hidden" name="question_id" value="${questionId}" />
      ${renderUserField('fn', 'First name', fn)}
      ${renderUserField('ln', 'Last name', ln)}
      ${renderUserField('email', 'Email', email)}
      <fieldset>
        <legend>Select one option</legend>
        ${optionInputs}
      </fieldset>
      <label>
        <input type="checkbox" name="biased" value="1" />
        I feel this is biased
      </label>
      <label>
        Bias note (optional)
        <textarea name="bias_note" rows="4"></textarea>
      </label>
      <button type="submit">Submit response</button>
    </form>
  `;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathParts = parsePathParts(url.pathname);

    if (request.method === 'GET' && url.pathname === '/api/surveys/list') {
      try {
        if (!env.DB) {
          throw new Error('Database binding not available');
        }

        const result = await env.DB.prepare(
          `SELECT s.slug, s.title, s.scope, s.status, q.question_json
           FROM surveys s
           JOIN survey_questions q ON q.survey_id = s.id
           WHERE s.status = 'active' AND q.question_key = 'main_question_01'
           ORDER BY s.created_at DESC`
        ).all();

        const payload = (result.results || []).map((row) => {
          let prompt = '';
          try {
            const parsed = JSON.parse(row.question_json || '{}');
            prompt = parsed.prompt || '';
          } catch (error) {
            prompt = '';
          }
          return {
            slug: row.slug,
            title: row.title,
            scope: row.scope,
            status: row.status,
            main_prompt: prompt,
          };
        });

        return new Response(JSON.stringify(payload), {
          headers: { 'content-type': 'application/json' },
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

    if (request.method === 'GET' && pathParts[0] === 'surveys' && pathParts[1] === 'take' && pathParts[2]) {
      const slug = decodeURIComponent(pathParts[2]);
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
      });

      const bodyHtml = `
        <h1>${escapeHtml(survey.title)}</h1>
        ${surveyHtml}
        ${formHtml}
      `;

      const page = await renderPage(env, url, {
        title: survey.title,
        bodyHtml,
      });
      return new Response(page, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
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

      const receiptUrl = `/receipt/${submissionId}`;
      const bodyHtml = `
        <h1>Survey submitted</h1>
        <p>Thank you for your response. Your receipt ID is ${escapeHtml(submissionId)}.</p>
        <p><a href="${receiptUrl}">View receipt</a></p>
      `;
      const page = await renderPage(env, url, {
        title: 'Survey submitted',
        bodyHtml,
      });
      return new Response(page, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
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

    // Serve static assets from /public
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    
    // Fallback: serve index.html for any other routes
    return new Response('Not Found', { status: 404 });
  },
};
