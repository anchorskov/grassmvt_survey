<!-- docs/data_inventory.md -->

# GrassrootsMVT Data Inventory

This file documents existing data sources, tables, bindings, and routes
relevant to the race polling feature. It is intended as a reference for
Codex and Claude before any new table or migration is added.

Last reviewed: 2026-06-04 (branch: race)

---

## D1 Database Bindings

All bindings are defined in `wrangler.jsonc`.

| Binding         | Local DB name | Production DB name | Purpose                                      |
|----------------|---------------|--------------------|----------------------------------------------|
| `DB`           | `wy_local`    | `wy`               | Main application database. All survey, auth, legislator, verification, and Town Hall tables live here. |
| `WY_VOTERS_DB` | `wy_local`    | `wy`               | Voter file binding. Used for address-based voter matching during verification. Points to the same physical DB locally; may be a separate DB in some future state. |
| `SIBIDRIFT_DB` | `sibidrift.db`| `sibidrift.db`     | Separate external DB; not used by surveys or race polling. |

The main migrations directory is `db/migrations/`.

---

## Migration Files

All migrations are under `db/migrations/`. The naming convention is:

```
NNNN_short_description.sql
```

Header comment format (per project convention):

```sql
-- db/migrations/NNNN_description.sql
-- Migration: NNNN_description.sql
-- Purpose: ...
```

**Known issue:** There are two `0015_*` files (`0015_add_district_to_user_address_verification.sql` and `0015_add_senate_district.sql`). This is a pre-existing sequence conflict. Do not add another `0015`.

**Next available migration number: `0033`**

### Migration inventory

| File | Key tables / changes |
|------|----------------------|
| `0001_survey_tables.sql` | `surveys`, `survey_questions`, `survey_submissions`, `survey_answers`, `bias_reports` |
| `0005_survey_versions.sql` | `survey_versions`, `responses`, `response_answers`, `survey_flags` |
| `0006_auth_tables.sql` | `user`, `session`, `user_profile`, `user_verification`, `audit_events` |
| `0009_response_editing.sql` | Adds `user_id`, `submitted_at`, `updated_at`, `edit_count` to `responses` |
| `0014_user_address_verification.sql` | `user_address_verification` |
| `0015_*` (two files — known conflict) | Adds `district` and `senate_district` to `user_address_verification` |
| `0016_add_wy_voter_id.sql` | Adds `wy_voter_id` to `user_verification` |
| `0017_unique_voter_id.sql` | Unique index on `wy_voter_id` |
| `0018_response_aggregates.sql` | `response_aggregates`, `aggregate_rollups` |
| `0019_legislators_and_voter_counts.sql` | `legislators`, `district_voter_counts` |
| `0020_wy_legislators.sql` | `wy_legislators` (seeded with 2025 session data) |
| `0021_verify_voter_tokens.sql` | `voter_verify_tokens`, `audit_log`; adds `is_verified_voter`, `verified_at`, `verification_method`, `verified_scope`, `verified_district` to `user` |
| `0022_survey_flow_meta.sql` | Adds `flow_type`, `flow_meta` to `surveys` |
| `0023_add_audit_target_user_id.sql` | Adds `target_user_id` to `audit_log` |
| `0024_recreate_audit_log_text_id.sql` | Recreates `audit_log` with TEXT primary key |
| `0025_create_sms_optins.sql` | `sms_optins` |
| `0026_create_volunteers.sql` | `volunteers` |
| `0027_create_townhall_tables.sql` | `townhall_topics`, `townhall_statements`, `townhall_reactions`, `townhall_reports` |
| `0028_link_townhall_topics_to_surveys.sql` | Adds `survey_id` FK to `townhall_topics` |
| `0029_add_statement_sources_json.sql` | Adds `sources_json` to `townhall_statements` |
| `0030_add_townhall_statement_moderation_fields.sql` | Moderation metadata on `townhall_statements` |
| `0031_add_townhall_statement_parent_id.sql` | Adds `parent_id` to `townhall_statements` |
| `0032_add_townhall_user_tracking_columns.sql` | User tracking columns on townhall tables |

---

## Survey Data

### Static metadata (browse/list UI)

- **File:** `public/data/surveys.json`
- **Format:** JSONC array (has a `// ...` top comment; parsed client-side and by build tools)
- **Key fields per entry:** `id`, `slug`, `scope`, `title`, `description`, `landing_blurb`, `path`, `status`, `category_slug`, `display_order`, `estimated_minutes`, `featured`, `href`
- **Purpose:** Drives `/surveys/list/`, `/surveys/normal-life/`, `/surveys/divisive/` browse pages without hitting the API.
- **Note:** Must be kept in sync with D1 `surveys` table. Stale entries here can cause UI/API divergence.

### Survey JSONC source files

- **Directory:** `surveys/`
- **Files:** One `.jsonc` per survey (e.g. `surveys_grizzly_bear_delisting_v1.jsonc`)
- **Purpose:** Source of truth for SurveyJS question JSON. Seeded into D1 via `scripts/seed-surveys-from-jsonc.mjs`.

### Seeding script

- **File:** `scripts/seed-surveys-from-jsonc.mjs`
- **Usage:** `node scripts/seed-surveys-from-jsonc.mjs --db=local --slug=<key> --version=1 --publish=true --changelog="..."`

---

## Survey Response Tables (in `DB`)

| Table | Purpose |
|-------|---------|
| `surveys` | Survey metadata: `id`, `slug`, `scope`, `title`, `status`, `flow_type`, `flow_meta` |
| `survey_versions` | Versioned SurveyJS JSON per survey: `id`, `survey_id`, `version`, `json_text`, `json_hash`, `published_at` |
| `responses` | One row per submission: `id` (UUID), `survey_id`, `survey_version_id`, `verified_flag`, `district`, `user_id`, `submitted_at`, `updated_at`, `edit_count` |
| `response_answers` | One row per answer: `response_id`, `question_name`, `value_json` |
| `response_aggregates` | Pre-computed per-question/choice counts by `tier`, `geo_type`, `geo_key` |
| `aggregate_rollups` | Total response count per tier/geo for suppression checks |

**Verified flag:** `responses.verified_flag` is set to `1` when the submitting user has `is_verified_voter = 1` in `user`. Tier 1 = all responses. Tier 2 = geographically bucketed responses.

---

## Voter Data

### WY_VOTERS_DB binding

The `WY_VOTERS_DB` binding exposes the voter file. In local/preview it points to the same `wy_local` database. In production it points to `wy`.

Key voter file table (read-only, managed externally):

| Table | Key columns |
|-------|-------------|
| `voters_addr_norm` | `voter_id`, `house`, `senate`, `addr1`, `zip` |
| `voters` (if present) | `voter_id`, `house`, `senate` |

### User-to-voter link (in `DB`)

| Table | Key columns |
|-------|-------------|
| `user_verification` | `user_id`, `voter_match_status`, `residence_confidence`, `wy_voter_id`, `last_check_at` |
| `user` | `is_verified_voter`, `verified_at`, `verification_method`, `verified_scope`, `verified_district` |
| `voter_verify_tokens` | Admin-issued tokens for manual voter verification |

---

## Legislator Data (in `DB`)

Two legislator tables exist. **`wy_legislators` is the operational one** seeded with current session data. `legislators` (from 0019) is the older generic schema.

### `wy_legislators`

| Column | Notes |
|--------|-------|
| `voter_id` | Nullable — links to voter file when available |
| `name` | Full name |
| `chamber` | `'House'` or `'Senate'` |
| `district` | e.g. `'01'` |
| `city`, `county` | Location |
| `party` | `'R'`, `'D'`, etc. |
| `affiliations` | Text |
| `campaign_website`, `official_profile_url` | URLs |
| `phone`, `email`, `updated` | Contact info |

No integer primary key — no `id` column. The natural key is `(chamber, district)` via index `idx_wy_leg_chamber_district`. When linking a race candidate to a legislator, match on `(chamber, district)` or on `name` + `chamber` + `district`.

### `legislators` (older)

| Column | Notes |
|--------|-------|
| `id` | TEXT primary key |
| `chamber` | `'house'` or `'senate'` (lowercase) |
| `district_number` | INTEGER |
| `full_name`, `party`, `phone`, `email`, `website` | Standard fields |

---

## Verification Logic

Voter verification flow is in `src/worker.js`, around line 7138+.

1. User provides address.
2. Worker queries `WY_VOTERS_DB.voters_addr_norm` for candidate matches.
3. Match written to `user_verification` (`wy_voter_id`, `voter_match_status`).
4. `user.is_verified_voter` set to `1` on confirmed match.
5. `responses.verified_flag` set to `1` at submission time when user is verified.

Admin-issued verification tokens (`voter_verify_tokens`) support manual verification for users who cannot self-verify.

---

## Result Reporting Routes

All routes are in `src/worker.js`.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/surveys/list` | GET | Public survey list (non-sensitive metadata only) |
| `/api/surveys/:slug` | GET | Full SurveyJS JSON for a survey |
| `/api/surveys/:slug/submit` | POST | Submit a survey response |
| `/api/results/meta?slug=<slug>` | GET | Survey version and question metadata |
| `/api/results/summary?slug=<slug>&tier=1&geo_type=all&geo_key=ALL` | GET | Aggregate result counts |
| `/api/results/geo-options?slug=<slug>&tier=2` | GET | Available geography options |
| `/api/results/district-context?geo_type=...&geo_key=...` | GET | Legislator context for a district |

---

## Static Data Files

| File | Purpose |
|------|---------|
| `public/data/surveys.json` | Survey browse metadata |
| `public/data/help-registry.json` | Section-level help copy keyed by `page` + `section` |
| `public/data/wy_voter_registration_snapshots.json` | Voter registration count snapshots |

---

## Uncertainties and Gaps

1. **`wy_legislators` has no integer `id` column.** A race candidate table that wants a FK to `wy_legislators` must match on `(chamber, district)` or name, not an integer PK. Consider using `wy_legislators.voter_id` (nullable) or a composite match.

2. **`WY_VOTERS_DB` and `DB` share the same physical database locally** but may diverge in production. The voter table is read-only from the application; do not write to it from race polling code.

3. **No existing `races` or `candidates` table.** Race polling is a new feature with no prior DB row. Migration 0033 will be the first race-related table.

4. **`public/data/surveys.json` uses JSONC format** (has `// ...` comment at top). Standard `JSON.parse` will fail. The project reads it client-side after stripping comments or via build-time processing.

5. **`responses.verified_flag`** is the existing mechanism for separating verified from unverified responses. Any race poll using the survey submission path inherits this for free.
