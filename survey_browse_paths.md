<!-- survey_browse_paths.md -->
# Survey Browse Paths

This note documents the current survey browse path scaffold.

## Path model

- `normal-life`: short, practical, everyday issues
- `divisive`: higher-heat issues that need more framing and tradeoff context
- `bridge`: cross-cutting surveys that focus on understanding disagreement, shared ground, or how people reason across a divide

Canonical survey-taking routes do not change:

- `/surveys/<slug>`
- `/api/surveys/<slug>`
- `/surveys/results/`

Browse routes:

- `/surveys/list/` remains the compatibility browse hub
- `/surveys/normal-life/`
- `/surveys/divisive/`
- no dedicated `/surveys/bridge/` route is required today; bridge surveys are rendered as a separate section on `/surveys/list/`

## Source of truth

Browse metadata currently lives in `public/data/surveys.json`.

Each survey entry can include:

- `slug`
- `path`
- `status`
- `category_slug`
- `display_order`
- `estimated_minutes`
- `landing_blurb`
- `featured`

For live surveys, `/api/surveys/list` still provides runtime state such as response status, Town Hall linkage, and the current published survey version. The browse UI merges the API payload with `public/data/surveys.json`.

Current browse rendering behavior:

- `/surveys/normal-life/` shows only `normal-life` surveys
- `/surveys/divisive/` shows only `divisive` surveys
- `/surveys/list/` shows active and coming-soon surveys from the main browse paths plus a separate bridge section when `bridge` surveys are present
- `draft` and `archived` surveys remain hidden from public browse pages, including bridge surveys

## How to add a new survey

1. Create the JSONC survey source in `surveys/`.
2. Register it in `scripts/seed-surveys-from-jsonc.mjs`.
3. Seed it with the JSONC seed script described in `survey_flow.txt`.
4. Add or update the browse metadata entry in `public/data/surveys.json`.
5. Confirm `/api/surveys/list` includes the live survey.
6. Confirm the survey appears in the correct browse path and that Town Hall linkage still makes sense.

## How to assign a path

- Set `path` to `normal-life`, `divisive`, or `bridge` in `public/data/surveys.json`.
- Keep the canonical survey slug and runtime route unchanged.
- Use conservative classification when uncertain and note exceptions in the changelog or task summary.

## Status behavior

- `active`: shown in the active survey section and linked to the live survey route
- `coming_soon`: shown in the coming-soon section with a non-survey fallback CTA
- `draft`: hidden from the current public browse pages
- `archived`: hidden from the current public browse pages but retained for documentation/history

## Browse behavior files

- Landing-page chooser:
  - `public/index.html`
  - `public/js/homepage.js`
  - `public/css/site.css`
- Shared browse data and rendering:
  - `public/js/survey-browser.js`
  - `public/js/surveys-list.js`
  - `public/data/surveys.json`
- Browse shells:
  - `public/surveys/list/index.html`
  - `public/surveys/normal-life/index.html`
  - `public/surveys/divisive/index.html`

## Current content note

- `survey-process` is documented as `archived` in the browse metadata because it was found in archived survey assets, not in the current active seed registry.
- The scaffold chooses the least disruptive option for Normal Life surveys today: show real active surveys when they exist and otherwise show clear `coming_soon` cards.

## Migration note

No D1 migration was added for this scaffold. If path metadata needs to become authoritative for server-side filtering later, move the browse fields into the survey data model and update the seed workflow accordingly.

## Bridge path note

The current implementation intentionally does not add `/surveys/bridge/`.

- The lower-risk option is to treat bridge as a cross-cutting grouping on `/surveys/list/`.
- This avoids adding a new public route before there is enough bridge content to justify a dedicated page.
- If bridge content grows later, the shared filtering code is already prepared for a dedicated route.
