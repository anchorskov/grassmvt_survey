<!-- docs/race_poll_data_plan.md -->

# Race Poll Data Plan

This document describes how the race polling feature connects to the existing
GrassrootsMVT data layer. It is the authoritative reference before any
migration, API route, or page data-loading code is written.

Last reviewed: 2026-06-04 (branch: race)

See also: `docs/data_inventory.md` for a full inventory of existing tables,
bindings, and routes.

---

## Recommended Connection to Existing Survey Data

The race polling feature should **reuse the existing survey system** for poll
storage. Each race poll is a SurveyJS survey seeded through the existing path:

1. Create a JSONC source file under `surveys/` containing the candidate support
   poll questions.
2. Register it in `scripts/seed-surveys-from-jsonc.mjs`.
3. Seed it into D1 as a normal survey row.
4. The existing `responses`, `response_answers`, `response_aggregates`, and
   `aggregate_rollups` tables store and report poll data with zero schema
   changes.
5. `responses.verified_flag` already separates verified Wyoming voter responses
   from unverified responses — no new column is needed.

This means the race poll results are already reportable via:

- `/api/results/summary?slug=<race-slug>&tier=1&geo_type=all&geo_key=ALL`
- `/api/results/summary?slug=<race-slug>&tier=2&geo_type=state&geo_key=WY`

The only thing the existing survey system cannot provide is **which candidates
belong to which race**, and the structured candidate metadata needed to render
candidate cards. That is the single gap the new table fills.

---

## The One New Table

### Why it is needed

The existing `surveys` table has a `slug`, `title`, and `status`, but no
concept of an office, an election year, candidates, jurisdictions, or a link
to existing legislator data. The race pages need that structured data to render
candidate cards, link to the survey, and optionally link incumbents to
`wy_legislators`.

### What it will not duplicate

- **Voter data** — no voter columns. The `WY_VOTERS_DB` binding remains the
  sole source.
- **Response data** — no response columns. `responses` and `response_answers`
  remain the storage layer.
- **Legislator data** — no copy of legislator fields. A nullable
  `wy_legislator_name` reference column links to `wy_legislators` by name plus
  race context. For state legislative races, derive `wy_legislators.chamber`
  from `district_type` and match `wy_legislators.district` to
  `district_number`. Do not duplicate legislator contact info.
- **Aggregate data** — no aggregate columns. `response_aggregates` remains the
  reporting layer.

---

## Proposed Table Name

**`race_candidates`**

Rationale: Matches the naming style of existing tables (`wy_legislators`,
`townhall_topics`, `survey_versions`). Short, readable, and unambiguous.
`race_candidate_map` adds unnecessary verbosity. `election_race_candidates` is
too long. `candidate_races` inverts the primary noun.

---

## Proposed Columns

```sql
CREATE TABLE IF NOT EXISTS race_candidates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Race identity
  race_slug     TEXT NOT NULL,   -- e.g. 'us-senate-2026'; matches UI route and
                                 --   optionally surveys.slug
  race_title    TEXT NOT NULL,   -- e.g. 'U.S. Senate, Wyoming, 2026'
  election_year INTEGER NOT NULL,
  office_name   TEXT NOT NULL,   -- e.g. 'U.S. Senator'
  race_category TEXT NOT NULL,   -- 'Federal' | 'Statewide' | 'State Legislature'
                                 --   | 'County' | 'Local Board' | 'Judicial Retention'
  jurisdiction  TEXT NOT NULL,   -- e.g. 'Wyoming' or county name
  district_type TEXT,            -- 'state_house' | 'state_senate' | null for statewide
  district_number TEXT,          -- e.g. '01'; TEXT to match wy_legislators.district

  -- Candidate identity
  candidate_name TEXT NOT NULL,
  candidate_slug TEXT NOT NULL,  -- e.g. 'candidate-a'; used for sub-keys in poll
  filing_status  TEXT,           -- 'declared' | 'exploratory' | 'placeholder'

  -- Candidate campaign contact (nullable — placeholder until verified).
  -- Do not populate these fields from wy_legislators contact data.
  campaign_website TEXT,
  public_email     TEXT,
  public_phone     TEXT,

  -- Source tracking
  source_url   TEXT,
  source_note  TEXT,

  -- Existing data links (nullable)
  -- Match to wy_legislators by name plus derived chamber/district context
  wy_legislator_name TEXT,       -- denormalized name for display; do NOT copy contact info
  -- Match to surveys.slug when this race uses the survey system for polling
  survey_slug  TEXT REFERENCES surveys(slug),

  -- Display and lifecycle
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,  -- 0 = retired / placeholder hidden
  last_reviewed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Columns omitted and why

| Column considered | Decision |
|-------------------|----------|
| `legislator_id` (FK to `wy_legislators`) | `wy_legislators` has no integer PK; match by name + chamber + district at query time |
| `candidate_statement` | Long text; belongs in the JSONC survey source or a separate content file, not in a mapping table |
| `party` | Intentionally omitted to keep the table neutral; add only if needed for display filtering |
| `photo_url` | Belongs in a content or asset layer, not a mapping table |

---

## Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_race_candidates_race_slug
  ON race_candidates (race_slug, is_active, display_order);

CREATE INDEX IF NOT EXISTS idx_race_candidates_candidate_slug
  ON race_candidates (race_slug, candidate_slug);

CREATE INDEX IF NOT EXISTS idx_race_candidates_survey_slug
  ON race_candidates (survey_slug);

CREATE INDEX IF NOT EXISTS idx_race_candidates_legislator_name
  ON race_candidates (wy_legislator_name)
  WHERE wy_legislator_name IS NOT NULL;
```

---

## How Verified Voter Results Will Be Reported

No new columns are needed. The existing mechanism is:

1. `user.is_verified_voter = 1` is set when a voter match is confirmed.
2. At submission time, `responses.verified_flag` is set to `1`.
3. `response_aggregates` stores counts by `tier`. Tier 1 = all; Tier 2 = geo-bucketed.

For the race results page, the existing `/api/results/summary` route already
returns counts that include the `verified_flag`. The results display should
show two numbers: total responses and verified Wyoming voter responses. The
candidate support poll slug passed to that route is whatever `survey_slug` is
stored in `race_candidates`.

---

## How Legislator Data Will Be Linked

`wy_legislators` has no integer primary key. The link is soft:

- `race_candidates.wy_legislator_name` stores the legislator's name from
  `wy_legislators.name`.
- At display time, the race page can query `wy_legislators` by `name` plus
  race context. For state legislative races, derive `chamber` from
  `district_type` (`state_house` -> `House`, `state_senate` -> `Senate`) and
  match `district` to `district_number`.
- This prevents stale denormalization: if legislator contact info changes, the
  race card re-reads the live row.
- Candidate campaign contact fields in `race_candidates` are for candidate or
  campaign-provided public contact only. Do not copy `wy_legislators.phone`,
  `wy_legislators.email`, `campaign_website`, or `official_profile_url` into
  `race_candidates`.

---

## How Candidate Data Will Be Reviewed and Updated

Candidate records in `race_candidates` are managed via:

1. **Seed script** (preferred): Add a seeding path to
   `scripts/seed-surveys-from-jsonc.mjs` or a new `scripts/seed-races.mjs` that
   reads from a JSONC or JSON source file in `surveys/` or a new `races/`
   directory.
2. **`last_reviewed_at` column**: Update this timestamp when a human reviews
   the record against a public source. The `source_url` and `source_note`
   columns document where the data came from.
3. **`is_active = 0`**: Retire placeholder rows when real candidate data is
   available, rather than deleting them.

When a race poll survey is created, also update `public/data/surveys.json` if
the race poll should appear in existing survey browse/list surfaces. That file
uses JSONC conventions, including a top `// public/data/surveys.json` comment,
so scripts must strip comments before parsing rather than using raw
`JSON.parse`.

---

## SOS Candidate Import Workflow

Wyoming Secretary of State candidate roster imports use:

```bash
node scripts/upsert-race-candidates-from-sos.mjs --db=local --dry-run
node scripts/upsert-race-candidates-from-sos.mjs --db=local --apply
```

Default source:

```text
races/source/2026_WY_Primary_Election_Candidates.csv
```

The raw `races/source/` folder is ignored because it may contain CSV input with
mailing addresses. The importer never writes mailing address columns to
`race_candidates` and never includes them in generated review data.

Generated review file:

```text
races/generated/2026_sos_race_candidates.jsonc
```

The generated review file groups transformed rows by `race_slug` and keeps only
candidate campaign contact fields, source traceability, race metadata, and
display metadata. It is safe to review for candidate-card import purposes.

The script performs an application-generated upsert without requiring a unique
constraint: it updates by `race_slug + candidate_slug`, then inserts when no
matching row exists. Remote writes are refused unless both `--apply` and
`--remote-confirm` are present. Do not apply this workflow to production until
local import and race-page rendering have been verified.

The importer leaves `survey_slug` null until matching race poll surveys are
created and seeded into `surveys`. This avoids violating the
`race_candidates.survey_slug` foreign key before the SurveyJS race polls exist.

## Remaining Race Data Source Files

Additional race source work uses ignored CSV inputs under `races/source/` and
generated review output under `races/generated/`. These files are staging data
for the existing `race_candidates` import path; they do not require a new
database, migration, voter-data copy, legislator-data copy, or survey response
table.

Current source files:

- `races/source/2026_WY_Primary_Election_Candidates.csv` — Wyoming Secretary
  of State candidate roster base source for federal, statewide, and state
  legislative candidates.
- `races/source/wy_county_election_source_checklist.csv` — county clerk and
  county election source-review tracker for all 23 Wyoming counties.
- `races/source/sos_2026_offices_up_for_election.csv` — SOS race-definition
  reference for 2026 offices up for election.
- `races/source/sos_2026_judicial_retention.csv` — SOS judicial retention
  candidate source file.
- `races/source/wy_county_candidates_2026.csv` — county race candidate staging
  file; headers only until county candidate sources are verified.
- `races/source/wy_local_board_candidates_2026.csv` — local board candidate
  staging file; headers only because local board candidate filing may open
  later than statewide filing.

Generated review files must keep mailing addresses out. The
`race_candidates` table should receive only public candidate/race fields needed
for display and polling, including race identity, candidate identity, campaign
website, public email/phone, source traceability, display order, lifecycle
state, optional `wy_legislator_name`, and optional `survey_slug`.

County and local board candidate imports should stay in `status =
needs_review` until the county or local source URL is verified. Judicial
retention rows marked `needs_review` should not be imported as final display
records until source discrepancies are resolved against the final official SOS
retention roster.

Every race source CSV should keep simple, stable headers and include
`source_url`, `source_note`, `status`, and `last_checked` so review state is
visible before any import. Only reviewed rows should be upserted into
`race_candidates`.

---

## Local and Production Testing Notes

### Apply local migration

```bash
npx wrangler d1 migrations apply wy_local --local --config wrangler.jsonc
```

### Verify table exists locally

```bash
npx wrangler d1 execute wy_local --local --config wrangler.jsonc \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name='race_candidates';"
```

### Seed a test row locally

```bash
npx wrangler d1 execute wy_local --local --config wrangler.jsonc \
  --command "INSERT INTO race_candidates (race_slug, race_title, election_year, office_name, race_category, jurisdiction, candidate_name, candidate_slug, filing_status, source_note, survey_slug, is_active) VALUES ('us-senate-2026', 'U.S. Senate, Wyoming, 2026', 2026, 'U.S. Senator', 'Federal', 'Wyoming', 'Candidate A', 'candidate-a', 'placeholder', 'Placeholder for layout testing', null, 1);"
```

### Check migration list before applying to production

```bash
npx wrangler d1 migrations list wy --remote --env production --config wrangler.jsonc
```

Confirm `0033_race_candidates.sql` is listed as pending before applying it.

### Apply to production only after local verification

```bash
npx wrangler d1 migrations apply wy --remote --env production --config wrangler.jsonc
```

---

## What Existing Data Will Be Reused

| Existing system | How it is reused |
|-----------------|-----------------|
| `surveys` + `survey_versions` | Race poll question JSON stored here via existing seed path |
| `responses` + `response_answers` | Poll submissions stored here with no changes |
| `response_aggregates` + `aggregate_rollups` | Aggregate results computed here |
| `responses.verified_flag` | Distinguishes verified Wyoming voter responses |
| `wy_legislators` | Linked by name lookup to display incumbent contact info |
| `WY_VOTERS_DB` / voter verification flow | Unchanged — handles voter ID matching |
| `/api/surveys/:slug/submit` | Race poll submission uses this existing route |
| `/api/results/summary` | Race result display uses this existing route |

## What Will Not Be Duplicated

- Voter data (no copy in `race_candidates`)
- Response data (no copy in `race_candidates`)
- Legislator contact info (read at query time from `wy_legislators`)
- Aggregate counts (computed by existing aggregate path)

---

## Candidate Matching Data Flow

### Overview

Candidate matching runs server-side only. Two paths are supported: voter-file match (primary) and Census geocoder fallback. Both paths return only public race summaries — no voter data is passed to the browser.

### Voter-file lookup path

Route: `POST /api/candidates/preview`

1. Accept `{ first_name, last_name, zip, street? }` from the browser.
2. Normalize inputs (`lower(fn)`, `lower(ln)`, `zip`).
3. Query `voters_addr_norm` in `WY_VOTERS_DB`:
   ```sql
   SELECT house, senate, addr_raw
   FROM voters_addr_norm
   WHERE lower(fn) = ? AND lower(ln) = ? AND zip = ?
   LIMIT 10
   ```
4. If exactly 1 result: use `row.house` (State House district) and `row.senate` (State Senate district). Set `match_status: 'matched'`.
5. If >1 result: check `addr_raw` against the provided street house number. If narrowed to 1: `match_status: 'matched'`. Still >1: `match_status: 'ambiguous'`.
6. If 0 results: proceed to geocoder fallback if `street` is provided.

`voters_addr_norm.house` and `voters_addr_norm.senate` are the authoritative district sources. These match the format used in `race_candidates.district_number` after zero-padding with `formatDistrictNumber`.

### Geocoder fallback path

Used only when voter-file matching fails and a street address is provided.

Function: `fetchGeocodeByAddress({ street, city: '', state: 'WY', zip })` at worker.js ~line 400.

Returns: `{ sldu, sldl }` where `sldu` = State Senate district and `sldl` = State House district.

Source: [Census Geocoder](https://geocoding.geo.census.gov/geocoder/) — `geographies/address` endpoint with `2024 State Legislative Districts` vintage.

`match_status: 'geocoded'` indicates the match came from the geocoder rather than the voter file. This is surfaced to the user with a note to verify their voter information for a more accurate match.

### House district matching

- Voter-file path: `voters_addr_norm.house` → zero-pad to 2 digits → match `race_candidates.district_number` WHERE `district_type = 'state_house'`
- Geocoder path: `sldl` field from Census → same zero-padding and matching

### Senate district matching

- Voter-file path: `voters_addr_norm.senate` → zero-pad to 2 digits → match `race_candidates.district_number` WHERE `district_type = 'state_senate'`
- Geocoder path: `sldu` field from Census → same zero-padding and matching

### Statewide and federal races

Always included regardless of district match. Filter: `race_category IN ('Federal', 'Statewide', 'Judicial Retention')`.

### County matching

Not yet implemented. `race_candidates` rows with `race_category = 'County'` are excluded from preview results until county from voter-file or geocoder is wired. Notes array returns: "County and local board matching is not yet available."

### Account-only poll submission

`requireSessionUser` in worker.js gates all `/api/surveys/*/submit` routes. Preview results are read-only. A "Sign in to submit poll responses" note is shown in the preview UI.

### Privacy boundaries

- `POST /api/candidates/preview` returns: `match_status`, `house_district`, `senate_district`, `races[]`, `notes[]`
- Never returns: `voter_id`, `addr_raw`, full address, phone, email, or any raw voter file field
- `GET /api/races/my` (session-based) follows the same privacy rules

### Future: local board matching

Local board races require a city or special district identifier not yet present in the match pipeline. When county and city fields are available from the voter file or geocoder, `race_category = 'Local Board'` rows can be included. Until then, they are excluded with a note.
