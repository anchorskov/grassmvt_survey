# Grassmvt Survey Static Site

A no-build static site intended for deployment from `/public` to Cloudflare Pages.

## Quick start

```bash
npm i
npm run build:surveyjs
npm run dev:worker
```

## Project structure

- `public/` - static site files served directly by Cloudflare Pages
- Config lives in the repo root for formatting, linting, and deploy tooling

## Scripts

- `npm run build:surveyjs` - bundle SurveyJS UI assets into `public/js` and `public/css`
- `npm run format` - format HTML/CSS/JS/MD in `public/`
- `npm run lint` - run ESLint, Stylelint, and HTMLHint
- `npm run check` - run lint and Prettier check
- `npm run dev` - serve `public/` at `http://localhost:8788`
- `npm run dev:worker` - run the Cloudflare Worker with D1 bindings
- `npm run deploy` - deploy `public/` to Cloudflare Pages via Wrangler

## Notes

- No framework is required. SurveyJS adds a small build step for its bundle.
- Keep all assets in `public/` and reference them with absolute paths like `/css/site.css`.
- Wrangler commands should use `--config wrangler.jsonc`.
- See `AI_CONTRACT.md` for workflow rules.

## SurveyJS build

```bash
npm run build:surveyjs
```

This writes `public/js/surveyjs-bundle.js` and `public/css/surveyjs.css`.

## Local dev with Worker

```bash
npm run dev:worker
```

Apply migrations locally:

```bash
wrangler d1 migrations apply wy_local --local --config wrangler.jsonc
```

Seed the SurveyJS version for `/surveys/abortion`:

```bash
curl -X POST http://localhost:8787/api/dev/seed-surveyjs
```

Visit:

- `http://localhost:8787/surveys/abortion`

## Auth setup

### Environment variables

Required in `.dev.vars` (local) and via `wrangler secret` (production):

```plaintext
TURNSTILE_SITE_KEY=0x4AAAAAACUGQXNTcuo9SlgJ
TURNSTILE_SECRET_KEY=<paste secret from Cloudflare Turnstile dashboard>
HASH_SALT=<random salt for password hashing>
ENVIRONMENT=local
TURNSTILE_BYPASS=true
```

- `TURNSTILE_SITE_KEY`: Public key, in `wrangler.jsonc` [vars] section
- `TURNSTILE_SECRET_KEY`: Private key, set via `wrangler secret put` (never commit)
- `HASH_SALT`: Random string for password hashing
- `ENVIRONMENT`: Set to 'production' to enforce Turnstile (disable bypass)
- `TURNSTILE_BYPASS`: Set to 'true' for local dev only (ignored in production)

### Setting up Turnstile in production

1. Get keys from https://dash.cloudflare.com/?to=/:account/security/turnstile
2. Register required hostnames in widget settings:
   - `grassmvtsurvey-production.anchorskov.workers.dev`
   - Any custom domains pointing to this Worker
3. Update `wrangler.jsonc`:
   ```jsonc
   "vars": {
     "TURNSTILE_SITE_KEY": "0x4AAAAAACUGQXNTcuo9SlgJ"
   }
   ```
4. Set secret key via Wrangler:
   ```bash
   wrangler secret put TURNSTILE_SECRET_KEY --env production --config wrangler.jsonc
   ```
5. Verify secret is set:
   ```bash
   wrangler secret list --env production --config wrangler.jsonc
   ```

### Local authentication flow

With bypass enabled (default):

1. Set `ENVIRONMENT=local` and `TURNSTILE_BYPASS=true` in `.dev.vars`
2. Run `npm run dev:worker`
3. Visit `http://localhost:8787/auth/signup/` to create account
4. Widget will not appear (bypass active)
5. Form submits directly without Turnstile validation
6. Visit `http://localhost:8787/auth/login/` to sign in
7. Call `http://localhost:8787/api/auth/me` to verify authentication

### Remote authentication testing

1. Deploy with `wrangler deploy --env production`
2. Visit `https://grassmvtsurvey-production.anchorskov.workers.dev`
3. Click "Sign in"
4. Complete Turnstile challenge (widget appears)
5. Fill form and submit
6. Open browser DevTools Console (F12) for debug logs:
   ```
   [Auth Debug] Turnstile token received, length: 300
   ```
7. Confirm user created and session established

### Debugging Turnstile issues

See [TURNSTILE_SECURITY_HARDENING.md](TURNSTILE_SECURITY_HARDENING.md) for:
- Widget not rendering
- Token submission failures
- Error code reference
- Server-side logging
- Hostname configuration

Key debug commands:

```bash
# Check local Turnstile config
curl -s http://localhost:8787/api/auth/turnstile | jq .

# Check remote config
curl -s https://grassmvtsurvey-production.anchorskov.workers.dev/api/auth/turnstile | jq .

# View browser console logs
# Press F12, click Console tab, look for [Auth Debug] messages
```

## JSONC survey seeding

Survey definitions live in JSONC files at repo root:

- `surveys_abortion_v1.jsonc`
- `surveys_survey_process_v1.jsonc`

Seed from JSONC into D1:

```bash
node scripts/seed-surveys-from-jsonc.mjs --db=local --slug=all --version=1 --publish=true --changelog="Seed v1 from JSONC"
```

Production:

```bash
node scripts/seed-surveys-from-jsonc.mjs --db=prod --slug=all --version=1 --publish=true --changelog="Seed v1 from JSONC"
```

Verify the stored JSON length after comment stripping:

```bash
wrangler d1 execute wy_local --command "SELECT s.slug, v.version, length(v.json_text) AS json_len FROM survey_versions v JOIN surveys s ON s.id = v.survey_id ORDER BY s.slug, v.version" --local --config wrangler.jsonc
```

Confirm the survey loads:

- `http://localhost:8787/surveys/abortion`
- `http://localhost:8787/surveys/survey-process`

## Seed artifacts

The root `seed-*.sql` files are deprecated and kept only for reference. Use the JSONC seed script above.
