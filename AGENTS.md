<!-- AGENTS.md -->
# Agent Guide

This file gives repo-specific instructions for coding agents working in `/home/anchor/projects/grassmvt_survey`.

## Purpose

- Treat live code and config as the source of truth.
- Prefer minimal, targeted edits.
- Preserve both local and production behavior.

## Repo Map

- `public/`: static assets, page shells, shared CSS, shared JS, partials
- `src/worker.js`: dynamic routes, API handlers, HTML rendering for worker-served pages
- `db/migrations/`: Cloudflare D1 schema migrations
- `surveys/`: survey JSONC source and related survey assets
- `scripts/`: local utilities, seeding, smoke tests

## Main Entry Points

- `public/index.html`: landing page
- `public/surveys/list/index.html`: survey list shell
- `public/surveys/results/index.html`: results shell
- `public/js/surveys-list.js`: survey list rendering and auth-aware loading
- `public/js/survey-results.js`: results page loading and rendering
- `public/js/include-partials.js`: shared header/footer injection
- `src/worker.js`: dynamic survey routes and API surface

## Routing Notes

- `/` is served from `public/index.html`.
- `/surveys/list/` is a static page shell plus JS.
- `/surveys/results/` is a static page shell plus JS.
- `/surveys/<slug>` is worker-rendered and serves the SurveyJS app shell.
- `/surveys/take/<slug>` is worker-rendered and serves the legacy markdown/template flow.
- `public/surveys/index.html` is a redirect page, not the primary list implementation.

## UI Editing Rules

- Do not assume a button issue should be fixed in shared `.button` styles.
- Prefer page-scoped selectors for page-specific changes, for example `.survey-home ...`.
- Check `public/index.html`, `public/css/site.css`, and any related JS selectors together before editing.
- `public/js/include-partials.js` injects shared header/footer, so header and footer behavior may not be visible from a page file alone.

## D1 and Migration Rules

- Use `wrangler.jsonc` as the source of truth for D1 database names and environments.
- Migration directory: `db/migrations`.
- Local migration status:
  - `npx wrangler d1 migrations list wy_local --local --config wrangler.jsonc`
- Apply local migrations:
  - `npx wrangler d1 migrations apply wy_local --local --config wrangler.jsonc`
- Production migration status:
  - `npx wrangler d1 migrations list wy --remote --env production --config wrangler.jsonc`
- Production migration apply:
  - `npx wrangler d1 migrations apply wy --remote --env production --config wrangler.jsonc`
- Remote Wrangler checks require `CLOUDFLARE_API_TOKEN`.
- Do not assume text notes or deployment logs prove current remote migration state.
- Watch for duplicate migration numbers; this repo currently contains two `0015_*` migration files.

## Survey Flow Notes

- Landing page actions are currently hard-coded in `public/index.html`.
- Survey list data comes from both `/api/surveys/list` and `public/data/surveys.json`.
- Results pages resolve survey slug from query string or path and render client-side.
- Some older survey take/resume flows still exist alongside newer SurveyJS routes.

## Adding Surveys

- The primary survey creation and update path is `scripts/seed-surveys-from-jsonc.mjs`, not a create-survey API in `src/worker.js`.
- When adding a new survey:
  - create a new JSONC source file under `surveys/`
  - register it in `surveySources` in `scripts/seed-surveys-from-jsonc.mjs`
  - seed it into D1 with the JSONC seed script
  - verify the survey appears in `/api/surveys/list`
  - verify a matching `townhall_topics` row is created or updated
  - verify survey results and Town Hall links behave correctly
- Important files for survey addition:
  - `surveys/`
  - `scripts/seed-surveys-from-jsonc.mjs`
  - `public/data/surveys.json`
  - `src/worker.js`
  - `public/js/surveys-list.js`

## Town Hall Coupling For Surveys

- Every active survey should have a matching Town Hall topic.
- Canonical relationship:
  - `townhall_topics.survey_id` is the durable database link
  - `townhall_topics.survey_slug` remains for compatibility and readable lookup
- Agent rules:
  - do not add a survey without checking whether its Town Hall topic will be initialized
  - if editing survey seed logic, preserve automatic Town Hall topic creation
  - if repairing older data, use `scripts/backfill-townhall-topics.mjs`
  - do not show or re-enable “Discuss topic” links unless a matching Town Hall topic exists

## Removing Or Retiring Surveys

- Do not remove a survey by editing only one layer.
- Check all of these together:
  - `surveys/` source file
  - `scripts/seed-surveys-from-jsonc.mjs`
  - `public/data/surveys.json`
  - `surveys` and `survey_versions` rows in D1
  - linked `townhall_topics` row
  - any survey list, results, or Town Hall links
- Preferred approach:
  - retire surveys by changing status instead of deleting rows unless destructive cleanup is explicitly required
  - preserve historical responses, aggregates, receipts, and moderation records unless the task explicitly requires cleanup
  - if a survey is retired, intentionally decide what happens to the linked Town Hall topic

## Town Hall Handling When Surveys Change

- When a survey is removed, renamed, unpublished, or retired, review the linked Town Hall topic.
- Agent rules:
  - if a survey slug changes, update the linked `townhall_topics` record so `survey_id`, `survey_slug`, and topic slug behavior stay consistent
  - if a survey is retired but history should remain visible, decide whether the Town Hall topic should remain readable, be marked inactive, or be hidden from topic listings
  - do not leave a Town Hall topic pointing at a missing or renamed survey slug
  - do not show active “Discuss topic” links for surveys whose Town Hall topic was intentionally disabled
  - if cleanup or repair is needed, prefer a script or migration over ad hoc manual edits

## Survey Change Checklist

- For any survey add, remove, rename, or retire work:
  - inspect the survey source file
  - inspect `scripts/seed-surveys-from-jsonc.mjs`
  - verify D1 survey rows
  - verify `townhall_topics` linkage
  - verify survey list UI
  - verify results flow
  - verify Town Hall topic route
  - verify any repair or backfill script still behaves correctly

## Editing Conventions

- Add a top-of-file path comment when the file type supports comments.
- Prefer ASCII unless the file already requires something else.
- Keep changes scoped and minimal.
- Do not use `nano`.
- If a task depends on exact markup or styles, inspect the real files first.

## Verification Checklist

- For UI changes:
  - inspect affected HTML
  - inspect affected CSS
  - inspect related JS selectors or route renderers
- For migration changes:
  - check migration list before and after applying
- For survey flow changes:
  - verify landing, list, results, and worker-rendered survey routes still make sense together
- If tests or browser checks were not run, say that clearly

## Known Gotchas

- `public/data/surveys.json` can affect what appears in the survey list even when API data changes.
- `public/index.html` may contain hard-coded links that do not automatically follow the newest survey.
- Local and production D1 state can differ; confirm each environment explicitly when it matters.
- Adding a survey now also implies Town Hall initialization; survey seed changes must keep those two in sync.
- Survey slug changes have Town Hall impact; review both `surveys` and `townhall_topics` together.

## When To Update This File

Update `AGENTS.md` when any of the following change:

- a new primary route or page entry point is added
- survey flow behavior changes between landing, list, results, SurveyJS, or legacy take/resume routes
- D1 database names, Wrangler environments, or migration commands change
- new shared UI conventions or component-scoping rules are introduced
- survey source-of-truth files or seeding workflow change
- a recurring agent mistake is discovered and can be prevented with one short rule

Keep updates brief and operational. Prefer changing this file when workflow or structure changes, not for one-off task notes.
