// scripts/smoke_turnstile.mjs
const baseUrl = process.env.BASE_URL || 'http://localhost:8787';
const mode = (process.env.MODE || 'local').toLowerCase();
const email = process.env.EMAIL || 'turnstile-smoke@example.com';
const password = process.env.PASSWORD || 'testpassword123456';

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  let body = {};
  try {
    body = await response.json();
  } catch (error) {
    body = {};
  }
  return { response, body };
};

const logResult = (label, response, body) => {
  const code = typeof body.code === 'string' ? body.code : '';
  console.log(`${label}: status=${response.status} code=${code}`);
};

const assert = (condition, message) => {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
};

const run = async () => {
  const turnstile = await fetchJson(`${baseUrl}/api/auth/turnstile`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  logResult('turnstile', turnstile.response, turnstile.body);

  const signup = await fetchJson(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: baseUrl },
    body: JSON.stringify({
      email,
      password,
      turnstileToken: '',
    }),
  });
  logResult('signup_empty_token', signup.response, signup.body);

  if (mode === 'production') {
    assert(signup.response.status === 400, 'Expected production signup to return 400');
    assert(signup.body.code === 'SIGNUP_FAILED', 'Expected production signup code SIGNUP_FAILED');
  } else {
    assert(signup.response.status === 200, 'Expected local signup to return 200');
  }
};

run().catch((error) => {
  console.error('Smoke test failed:', error.message);
  process.exit(1);
});
