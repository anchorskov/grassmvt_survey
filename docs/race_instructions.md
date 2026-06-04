<!-- docs/race_instructions.md -->

# Race Polling Hub Instructions

## Overall Goal

Build a Wyoming race polling hub for GrassrootsMVT that helps citizens choose a race, review candidate information, and share public sentiment through short polls. This is a public sentiment tool, not an election prediction tool.

## Page Flow

1. A citizen visits `/races`.
2. They read the purpose of the race polling hub.
3. They choose a race category or browse race cards.
4. They open a race page, such as `/races/us-senate-2026`.
5. They review candidate information.
6. They answer the same support poll structure for each candidate.
7. They review aggregate results when results are available.

## Race Hub Route

The race hub route is:

```text
/races
```

The hub should explain the purpose, show how the process works, provide a race category selector, and list available race cards.

## Race Page Route Pattern

Race pages should use this pattern:

```text
/races/<race-slug>
```

Example:

```text
/races/us-senate-2026
```

Use short, stable slugs that include the office and election year. For statewide or federal races, include Wyoming only in visible page text unless the slug needs disambiguation.

## Candidate Card Standard

Every candidate card should use the same layout and include:

- Name
- Office
- Status
- Campaign website
- Public contact
- Candidate statement
- Source note

Use placeholder values only when candidate data has not been verified. Keep labels neutral and avoid editorial language.

## Poll Question Standard

Ask the same support question for each candidate:

```text
Based on what you know today, do you support this candidate for this office?
```

Use the same answer choices for every candidate:

- Strongly support
- Lean support
- Neutral or undecided
- Lean oppose
- Strongly oppose
- I need more information
- I am unfamiliar with this candidate

Additional race-level questions:

- Which issue matters most in this race?
- What quality matters most in a candidate for this office?
- What question should every candidate in this race answer?
- Optional comment: What should candidates in this race understand about Wyoming?

## Result Reporting Standard

Publish results as aggregate data only. The standard result display should include:

- Support
- Oppose
- Undecided
- Need more information
- Total responses
- Verified Wyoming voter responses
- Last updated

Reporting rules:

- Publish aggregate results.
- Show verified and unverified results separately when available.
- Publish exact question wording.
- Publish collection dates.
- Publish revision notes when wording changes.
- Protect individual responses.

Always include this label near results:

```text
This is a public sentiment poll, not an election prediction.
```

## Verification And Privacy Note

Verified Wyoming voter responses should be reported separately when verification is available. Verification should improve reporting quality without exposing individual identity, address, voter ID, or individual answers. Public pages should never expose internal user IDs or private response records.

## Data Integration

The race polling feature reuses the existing survey system for all poll storage
and reporting. See `docs/race_poll_data_plan.md` for the full data plan and
`docs/data_inventory.md` for the complete inventory of existing tables and
bindings.

### Summary

- **Poll storage**: Race polls are seeded as normal surveys into the `surveys`
  and `survey_versions` tables in the `DB` binding. The `responses`,
  `response_answers`, `response_aggregates`, and `aggregate_rollups` tables
  store and report responses unchanged.
- **Candidate metadata**: A new `race_candidates` table (migration 0033) stores
  race identity, candidate identity, public contact placeholders, source
  tracking, and optional links to `wy_legislators` and `surveys.slug`.
- **Verified voter results**: `responses.verified_flag` is already set to `1`
  for verified Wyoming voters. No new column is needed. The results display
  reads from the existing `/api/results/summary` route.
- **Legislator link**: `race_candidates.wy_legislator_name` provides a soft
  reference to `wy_legislators`. Contact info is read at query time from
  `wy_legislators`, not copied.
- **Voter data**: The `WY_VOTERS_DB` binding and existing verification flow are
  unchanged.
- **SOS candidate import**: Candidate rows can be seeded from the Wyoming
  Secretary of State roster with
  `scripts/upsert-race-candidates-from-sos.mjs`. Raw CSV files live under the
  ignored `races/source/` folder, and the generated review file omits mailing
  addresses.
- **Race source files**: Race data source files live in `races/source`.
  Generated review files live in `races/generated`. The `race_candidates` table
  should only receive public candidate/race fields needed for display and
  polling. Mailing addresses stay out of generated files and out of the
  database.

### Race page data loading pattern

When database loading is wired up, each race page should:

1. Query `race_candidates WHERE race_slug = ? AND is_active = 1 ORDER BY display_order`
   from `DB` to get candidate list and `survey_slug`.
2. If `survey_slug` is set, use `/api/results/summary?slug=<survey_slug>` to
   display aggregate results.
3. For incumbent state legislative candidates, join to `wy_legislators` on
   `name` plus derived chamber/district context. Derive chamber from
   `district_type` (`state_house` -> `House`, `state_senate` -> `Senate`) and
   match `district_number` to `wy_legislators.district`.
4. For poll submission, use the existing `/api/surveys/<survey_slug>/submit`
   route.

Do not expose `race_candidates.id`, internal `user_id` values, or individual
response records on public race pages. Do not copy legislator contact fields
from `wy_legislators` into `race_candidates`; read them live when rendering
candidate cards.

## Agent Guidance For Codex And Claude

- Read `AGENTS.md` and `CLAUDE.md` before editing this repo.
- Prefer Astro pages under `src/pages` for public pages.
- Keep race pages environment-agnostic.
- Use relative or internal paths.
- Add a top-of-file path comment to every new or modified file when the file type supports comments.
- Keep language short, plain, and neutral.
- Avoid loaded language and election prediction claims.
- Keep candidate cards and support scales consistent across races.
- Do not add dependencies unless an existing dependency clearly fits the task.
- If database submission is added later, verify privacy, aggregate reporting, and voter verification behavior before release.

---

## User-Centered Race Flow

This section documents how the user-centered "My Races" flow works.

### Flow overview

1. A citizen visits `/races`. The hero asks them to **Find My Races** or browse all races.
2. **Find My Races** links to `/races/my` — a static page that fetches `/api/races/my` via client-side JS.
3. **Browse All Wyoming Races** scrolls to the `#browse-all` section on the same page.

### /api/races/my — race filtering logic

`GET /api/races/my` uses existing Worker helpers with no new auth code:
- `getSessionUser(request, env)` — reads the existing session cookie
- `getAddressVerification(env.DB, user.id)` — reads `user_address_verification.state_house_dist` and `state_senate_dist`
- `formatDistrictNumber(value, 2)` — zero-pads the district number to match `race_candidates.district_number`

**Filtering rules by verification state:**

| State | Races returned |
|---|---|
| Not authenticated | Empty list + sign-in note |
| Authenticated, not verified | Federal + Statewide + Judicial Retention only |
| Verified | Federal + Statewide + Judicial Retention + matched House district + matched Senate district |

**What is deferred:** County and local board races require a county field in `user_address_verification` that does not yet exist. These are excluded and a note is returned in the `notes` array.

### District number matching

`user_address_verification.state_house_dist` and `state_senate_dist` are stored as raw integer strings (e.g., `"5"`, `"57"`). `race_candidates.district_number` is zero-padded two-digit text (e.g., `"05"`, `"57"`). The API uses `formatDistrictNumber(value, 2)` — already in use at line 5637 of `src/worker.js` for geo-context matching — before comparing.

### Privacy rules

- `/api/races/my` never exposes voter ID, address, phone, email, or any raw field from `user_address_verification`.
- Only the derived district labels (`house_district`, `senate_district`) are returned, and only after verification.
- Public race fields and candidate counts are all that is returned.

### Hub card behavior

- Cards with a real `raceSlug` (individual pollable races): show "Take Poll", "View Candidates", "View Results".
- Cards with `raceSlug: null` (group/category pages): show "Browse Races" only — no poll link. These pages do not have a single poll.

### Email and text opt-in

Email and text updates are optional and separate from verification. `/races/my` shows an informational note; there is no opt-in form. Participation in polling must never require opting in to campaign or movement messages.

---

## Dynamic Race Data Method

This section documents how race cards and candidate cards load live data from `race_candidates`.

### Town Hall topics

Race polls use `skipTownhall: true` in their `surveySources` entry. The seed script skips Town Hall topic creation for race polls. Race polls are candidate support polls, not community issue discussions. If a future race type needs a discussion topic, remove `skipTownhall` from that entry.

### Data source

`race_candidates` is the single source of truth for race identity and candidate metadata. It is populated from the Wyoming Secretary of State candidate roster via `scripts/upsert-race-candidates-from-sos.mjs`. Cards update when the import is re-run and applied.

### API routes

| Route | Purpose |
|---|---|
| `GET /api/races` | Returns active race summaries grouped by `race_slug`. Includes `candidate_count`, `race_category`, `survey_slug`, and `last_reviewed_at`. |
| `GET /api/races/:slug/candidates` | Returns active candidates for one race in `display_order`. Includes public contact fields, `survey_slug`, and `source_note`. |

Both routes read only `is_active = 1` rows. Retired or placeholder candidates do not appear.

### Client-side loading

All race pages are static Astro pages. Dynamic content is loaded client-side by `public/js/races.js`:

- `RaceHub.enrichHubCards()` — fetches `/api/races` and adds live candidate counts to the `/races` hub cards.
- `RaceHub.loadRaceCandidates(slug, opts)` — fetches `/api/races/:slug/candidates` and replaces placeholder cards and poll fieldsets with live data.

Race pages call these functions on `DOMContentLoaded`. The static placeholder cards remain visible until the fetch resolves, so the page is never empty.

### Worker-rendered generic race page

For race slugs that do not have a static Astro page (e.g., `state-house-01-2026`, `secretary-of-state-2026`), the Worker intercepts `GET /races/:slug`, queries `race_candidates`, and serves a minimal HTML page that displays the race title and candidate cards. Unknown slugs fall through to `ASSETS` (and return 404 if no static file exists).

### `survey_slug` controls poll and results links

When a race has a `survey_slug` set in `race_candidates`:
- The poll link should point to `/surveys/{survey_slug}` (the existing SurveyJS route).
- The results link should point to `/surveys/results/?slug={survey_slug}`.
- `races.js` updates `[data-survey-link="poll"]` and `[data-survey-link="results"]` elements automatically when `survey_slug` is present.

When `survey_slug` is null, the poll and results links remain as static preview anchors.

### Privacy rules

1. No mailing addresses in `race_candidates` — the SOS import script deliberately omits them.
2. No voter data on any public race page.
3. No individual response records exposed — only aggregate counts via `/api/results/summary`.
4. Results are always labeled as public sentiment, not an election prediction.

### SOS import workflow

```bash
# Dry run — generates review file, does not write to DB
node scripts/upsert-race-candidates-from-sos.mjs --db=local --dry-run

# Apply to local D1
node scripts/upsert-race-candidates-from-sos.mjs --db=local --apply

# Apply to production (requires both flags)
node scripts/upsert-race-candidates-from-sos.mjs --db=remote --apply --remote-confirm
```

Source CSV: `races/source/2026_WY_Primary_Election_Candidates.csv` (gitignored — may contain mailing addresses).
Review file: `races/generated/2026_sos_race_candidates.jsonc` (safe to commit — mailing address fields omitted).

---

## Race Page Build Method

This section documents how race pages are built so future agents can follow the same pattern consistently.

### Reference template

Use `/races/us-senate-2026` as the primary template for all single-race pages. For group pages (covering multiple offices or districts), use `/races/statewide-offices-2026` as the secondary template.

### Legislative district polls

State legislative district polls are generated and seeded programmatically by `scripts/seed-legislative-polls.mjs`, not by individual JSONC files. Read that script for the poll structure. To add or refresh district polls, run the script with `--dry-run` first, then `--apply`. The script reads from `races/generated/2026_sos_race_candidates.jsonc` and skips withdrawn candidates. It does not create Town Hall topics.

### Shared components and data

All race pages import from two shared locations:

- `src/data/races.js` — placeholder candidate data, support choices, retention choices, poll questions, result rows
- `src/components/races/CandidateCard.astro` — renders one candidate or office card
- `src/components/races/SupportPollPreview.astro` — renders the support poll fieldsets and race-level questions

When real candidate data is available from `race_candidates`, replace the static imports with a Worker API fetch at build time or render time.

### Required support question and answer scale

Every candidate race page must use this exact question:

> "Based on what you know today, do you support this candidate for this office?"

Required answer choices (same order on every page):
1. Strongly support
2. Lean support
3. Neutral or undecided
4. Lean oppose
5. Strongly oppose
6. I need more information
7. I am unfamiliar with this candidate

**Judicial retention exception:** Use the adapted question "Based on what you know today, do you support retaining this person in this role?" with `RETENTION_CHOICES` from `src/data/races.js`. Do not use the standard candidate choices on retention pages.

### Required page sections (in order)

Every race page must include these sections with these anchor IDs:

1. Hero — race title, short purpose text, CTAs linking to `#support-poll` and `#candidates`
2. `id="candidates"` — candidate or office cards using `CandidateCard`
3. `id="support-poll"` — poll preview using `SupportPollPreview`
4. `id="results"` — aggregate sentiment display or placeholder note

Always include this label in the results section:

> "This is a public sentiment poll, not an election prediction."

### Group pages

Pages covering multiple offices or districts (statewide offices, state legislature, county offices, local boards) use office-level cards in the candidates section rather than named candidate cards. For these pages:

- Pass an empty array to `SupportPollPreview` — the component displays a "polls coming soon" note
- Show the race-level questions fieldset so citizens can still provide issue input
- Explain in the results section that results will appear by office or district once candidates are confirmed

### Candidate data lifecycle

Placeholder data lives in `src/data/races.js`. Real candidate data will come from `race_candidates` via the Worker API. When wiring up live data:

1. Query `race_candidates WHERE race_slug = ? AND is_active = 1 ORDER BY display_order` from `DB`
2. If `survey_slug` is set, use `/api/results/summary?slug=<survey_slug>` for aggregate results
3. Use `/api/surveys/<survey_slug>/submit` for poll submission
4. For incumbent state legislative candidates, join to `wy_legislators` by name and district

### Data and privacy rules

- Never expose `race_candidates.id`, internal `user_id` values, or individual response records
- Do not copy legislator contact fields from `wy_legislators` into `race_candidates`; read them live
- Report results as aggregate only — never show individual responses
- Always label results as public sentiment, not an election prediction

### Wiring live poll submission

Before enabling submission on any race page:
1. Create the SurveyJS JSONC race poll source file under `surveys/` or `races/`
2. Seed it into D1 using the existing seed script path
3. Connect the form `action` to `/api/surveys/<survey_slug>/submit`
4. Verify Turnstile and auth behavior match the existing survey submission flow
5. Confirm `responses.verified_flag` is set correctly for verified Wyoming voters

### File conventions

- Add a top-of-file path comment (`// src/pages/races/...`) to every new or modified file
- No inline CSS
- All asset paths are absolute (`/css/site.css`, not `../css/site.css`)
- Use one `h1` per page; keep heading order logical
- All form controls must have associated labels
- All buttons and links must have clear visible text
