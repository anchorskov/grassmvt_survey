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
