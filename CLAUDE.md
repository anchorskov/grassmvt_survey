# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A Wyoming civic-engagement platform for surveys and public discussion. It uses **Astro v6** (static output → `dist/`) for all pages, **Tailwind v4** for the landing page, and a **Cloudflare Worker** (`src/worker.js`) with **Cloudflare D1** SQLite for all API routes. SurveyJS is bundled separately.

## Commands

```bash
npm i                        # install dependencies
npm run build:surveyjs       # bundle SurveyJS into public/js and public/css (required after install)
npm run build                # astro build → dist/
npm run dev:worker           # build then run Worker + dist/ assets at http://localhost:8787 (full stack)
npm run build:watch          # astro build --watch (run alongside dev:worker for live rebuild)
npm run dev:astro            # astro dev at http://localhost:4321 (frontend only, no Worker/D1)
npm run dev                  # http-server ./dist at http://localhost:8788 (static only, no Worker)
npm run check                # lint (ESLint + Stylelint) + astro check — run before every commit
npm run format               # auto-format public/ CSS/JS/MD
npm run lint                 # lint only
npm run deploy               # astro build + wrangler pages deploy dist (production)
npm run test:townhall-ui     # smoke-test the Town Hall UI
```

**Full local dev workflow (two terminals):**
```bash
# Terminal 1 — rebuilds dist/ on .astro file changes
npm run build:watch

# Terminal 2 — Worker + D1 + static assets at localhost:8787
wrangler dev --config wrangler.jsonc
```

Always use `--config wrangler.jsonc` for all Wrangler commands.

### D1 migrations

```bash
# Local
npx wrangler d1 migrations list wy_local --local --config wrangler.jsonc
npx wrangler d1 migrations apply wy_local --local --config wrangler.jsonc

# Production
npx wrangler d1 migrations list wy --remote --env production --config wrangler.jsonc
npx wrangler d1 migrations apply wy --remote --env production --config wrangler.jsonc
```

> There are two `0015_*` migration files in `db/migrations/` — this is a known issue; do not add another.

### Survey seeding

```bash
# Seed all surveys into local D1
node scripts/seed-surveys-from-jsonc.mjs --db=local --slug=all --version=1 --publish=true --changelog="Seed v1"

# Seed one survey
node scripts/seed-surveys-from-jsonc.mjs --db=local --slug=<source-key> --version=1 --publish=true --changelog="Add survey"

# Production
node scripts/seed-surveys-from-jsonc.mjs --db=prod --slug=all --version=1 --publish=true --changelog="Seed v1"
```

## Architecture

### Request flow

```
Browser → Cloudflare Pages (static assets in public/)
        → Cloudflare Worker (src/worker.js) → D1 SQLite
```

The Worker owns all `/api/*` routes, `/surveys/<slug>` (SurveyJS app shell), `/surveys/take/<slug>` (legacy), `/auth/*`, `/admin/*`, and `/townhall/*`. Everything else falls through to `public/` static files via the `ASSETS` binding.

### Two-layer survey data

| Layer | Source | Purpose |
|---|---|---|
| Static metadata | `public/data/surveys.json` | Browse/list UI metadata — what appears without hitting the API |
| Dynamic content | D1 `survey_versions` table | Actual SurveyJS JSON served at runtime |

Both layers must stay in sync. `public/data/surveys.json` can cause stale survey list UI even when the API data is correct.

### Survey browse paths

Surveys are categorized as `normal-life`, `divisive`, or `bridge`. The first two have dedicated static page shells (`public/surveys/normal-life/`, `public/surveys/divisive/`). `bridge` is surfaced as a section on `/surveys/list/`, not a dedicated route.

### Town Hall coupling

Every active survey must have a matching `townhall_topics` row. Survey slug changes must update both `surveys` and `townhall_topics`. The seed script handles initial Town Hall topic creation; use `scripts/backfill-townhall-topics.mjs` for repair.

### Auth stack

Lucia (session auth) + SimpleWebAuthn (passkeys) + Cloudflare Turnstile (bot protection). Turnstile is bypassed locally via `TURNSTILE_BYPASS=true` in `.dev.vars`. All posting actions (Town Hall statements, reactions, reports) are tied to the internal `user.id` from the backend session — never trust browser-supplied identity.

### Moderation

Town Hall statements pass through `src/lib/townhall-moderation.js` before save. Three outcomes: `pass`, `revise`, `block`. Provider is env-configured (`TOWNHALL_MODERATION_PROVIDER`).

## Key constraints (AI_CONTRACT)

- `npm run check` must pass before every commit or deploy.
- No inline CSS.
- No new frameworks or build pipelines without explicit request.
- All assets live under `public/` with absolute paths (`/css/site.css`, not `../css/site.css`).
- Every HTML/CSS/JS file must have a top-of-file path comment (HTML comment for HTML, block comment for CSS/JS).
- Keep `/api/surveys/list` and `public/data/surveys.json` to non-sensitive metadata only — full survey JSON is served only by `/api/surveys/:slug`.

## Adding a survey (canonical path)

1. Create `surveys/surveys_<slug>_v<version>.jsonc`
2. Register in `surveySources` in `scripts/seed-surveys-from-jsonc.mjs`
3. Seed into D1 with the seed script
4. Add entry to `public/data/surveys.json`
5. Verify `/api/surveys/list` includes it, `/surveys/<slug>` renders, and a `townhall_topics` row exists

Do not include state dropdown, Wyoming House/Senate district questions, or other district selectors in Wyoming survey questions — district info comes from the user's address verification, not survey answers.

## Local dev environment

`.dev.vars` (not committed) must contain:
```
TURNSTILE_SECRET_KEY=<from Cloudflare dashboard>
HASH_SALT=<random string>
ENVIRONMENT=local
TURNSTILE_BYPASS=true
```

## See also

- `AGENTS.md` — detailed routing map, D1 rules, Town Hall moderation rules, survey lifecycle checklist, and known gotchas
- `survey_flow.txt` — step-by-step survey build/seed/verify workflow
- `AI_CONTRACT.md` — full workflow and data exposure rules
