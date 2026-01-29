<!-- docs/auth_turnstile_verification.md -->
# Turnstile verification checklist

## Local verification
1) Ensure `.dev.vars` includes `ENVIRONMENT=local` and `TURNSTILE_BYPASS=true`.
2) Start the worker:
   - `npx wrangler dev --local --config wrangler.jsonc`
3) Confirm Turnstile bypass is active:
   - `GET /api/auth/turnstile` should return `{ siteKey: ..., bypass: true }`.
4) Signup and login with empty token:
   - `POST /api/auth/signup` with `turnstileToken: ""` should return 200.
   - `POST /api/auth/login` with `turnstileToken: ""` should return 200.

## Production verification
1) Confirm `TURNSTILE_BYPASS` is not set in production vars or secrets.
2) Confirm `/api/auth/turnstile` returns `bypass: false`.
3) Confirm signup and login require a valid Turnstile token:
   - `POST /api/auth/signup` with empty token should return 400.
   - `POST /api/auth/login` with empty token should return 403.
4) Confirm passkey endpoints are protected:
   - `POST /api/auth/passkey/register/options` requires auth and valid Turnstile where enforced.
   - `POST /api/auth/passkey/login/options` should require a valid Turnstile token.

## Misconfiguration guard
If `TURNSTILE_BYPASS=true` in production, the worker should refuse requests and return:
- `500` with `{ ok:false, code:"TURNSTILE_BYPASS_FORBIDDEN" }`.
