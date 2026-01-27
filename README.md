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

Required environment variables:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `HASH_SALT`
- `ENVIRONMENT` set to `local` or `production`
- `TURNSTILE_BYPASS` set to `true` for local development

Run migrations after adding the auth tables:

```bash
wrangler d1 migrations apply wy_local --local --config wrangler.jsonc
```

Local auth flow:

1. Set `ENVIRONMENT=local` and `TURNSTILE_BYPASS=true` in `.dev.vars`.
2. Start the Worker with `npm run dev:worker`.
3. Visit `http://localhost:8787/auth/signup/` to create an account.
4. Visit `http://localhost:8787/auth/login/` to sign in.
5. Call `http://localhost:8787/api/auth/me` to confirm authentication state.

Turnstile is required in production. Requests must include a matching Origin header unless `ENVIRONMENT=local`.

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
