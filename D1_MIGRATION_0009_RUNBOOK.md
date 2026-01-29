# D1 Migration 0009: Response Editing Runbook

Apply the `0009_response_editing.sql` migration to add user response editing capabilities.

## Prerequisites

- Wrangler CLI installed and authenticated
- Access to both local (wy_local) and production (wy) D1 databases
- Migration file: `db/migrations/0009_response_editing.sql`

## Local Migration

### Apply the migration

```bash
cd /home/anchor/projects/grassmvt_survey

wrangler d1 execute wy_local \
  --file db/migrations/0009_response_editing.sql \
  --config wrangler.jsonc
```

### Verify columns exist

```bash
wrangler d1 execute wy_local \
  --command "PRAGMA table_info(responses);" \
  --config wrangler.jsonc
```

Look for columns: `user_id`, `submitted_at`, `updated_at`, `edit_count`

### Verify unique index

```bash
wrangler d1 execute wy_local \
  --command "SELECT name, unique FROM pragma_index_list('responses') WHERE name LIKE '%unique%';" \
  --config wrangler.jsonc
```

Should return `idx_responses_user_surveyver_unique` with `unique=1`

### Full verification query

```bash
wrangler d1 execute wy_local \
  --command "SELECT user_id, submitted_at, updated_at, edit_count FROM responses LIMIT 1;" \
  --config wrangler.jsonc
```

Should succeed without errors (returns empty if no responses yet).

---

## Production Migration

### Apply the migration (with optional log directory)

```bash
cd /home/anchor/projects/grassmvt_survey

# Optional: Set log directory to avoid permission errors
export WRANGLER_LOG_DIR=/tmp/wrangler-logs

wrangler d1 execute wy \
  --env production \
  --remote \
  --file db/migrations/0009_response_editing.sql \
  --config wrangler.jsonc
```

### Verify columns exist

```bash
export WRANGLER_LOG_DIR=/tmp/wrangler-logs

wrangler d1 execute wy \
  --env production \
  --remote \
  --command "PRAGMA table_info(responses);" \
  --config wrangler.jsonc
```

Look for columns: `user_id`, `submitted_at`, `updated_at`, `edit_count`

### Verify unique index

```bash
export WRANGLER_LOG_DIR=/tmp/wrangler-logs

wrangler d1 execute wy \
  --env production \
  --remote \
  --command "SELECT name, unique FROM pragma_index_list('responses') WHERE name LIKE '%unique%';" \
  --config wrangler.jsonc
```

Should return `idx_responses_user_surveyver_unique` with `unique=1`

### Full verification query

```bash
export WRANGLER_LOG_DIR=/tmp/wrangler-logs

wrangler d1 execute wy \
  --env production \
  --remote \
  --command "SELECT user_id, submitted_at, updated_at, edit_count FROM responses LIMIT 1;" \
  --config wrangler.jsonc
```

Should succeed without errors.

---

## Comprehensive Verification Script

Run both local and production checks together:

```bash
#!/bin/bash
set -e

cd /home/anchor/projects/grassmvt_survey
export WRANGLER_LOG_DIR=/tmp/wrangler-logs

echo "=== LOCAL DATABASE ==="
echo "Checking columns..."
wrangler d1 execute wy_local \
  --command "PRAGMA table_info(responses);" \
  --config wrangler.jsonc | grep -E "user_id|submitted_at|updated_at|edit_count"

echo "Checking unique index..."
wrangler d1 execute wy_local \
  --command "SELECT name, unique FROM pragma_index_list('responses') WHERE name = 'idx_responses_user_surveyver_unique';" \
  --config wrangler.jsonc

echo ""
echo "=== PRODUCTION DATABASE ==="
echo "Checking columns..."
wrangler d1 execute wy \
  --env production \
  --remote \
  --command "PRAGMA table_info(responses);" \
  --config wrangler.jsonc | grep -E "user_id|submitted_at|updated_at|edit_count"

echo "Checking unique index..."
wrangler d1 execute wy \
  --env production \
  --remote \
  --command "SELECT name, unique FROM pragma_index_list('responses') WHERE name = 'idx_responses_user_surveyver_unique';" \
  --config wrangler.jsonc

echo ""
echo "✅ Migration 0009 verified on both databases"
```

---

## Troubleshooting

### Permission Errors

If you encounter permission errors with logs, set:

```bash
export WRANGLER_LOG_DIR=/tmp/wrangler-logs
mkdir -p /tmp/wrangler-logs
```

### Migration Already Applied

If the migration was already applied, you may see errors about duplicate columns or indexes. This is safe to ignore if the columns and index already exist as expected.

### Verify Migration Status

Check if migration was registered:

```bash
# Local
wrangler d1 execute wy_local \
  --command "SELECT * FROM _cf_kv ORDER BY key DESC LIMIT 5;" \
  --config wrangler.jsonc

# Production
export WRANGLER_LOG_DIR=/tmp/wrangler-logs
wrangler d1 execute wy \
  --env production \
  --remote \
  --command "SELECT * FROM _cf_kv ORDER BY key DESC LIMIT 5;" \
  --config wrangler.jsonc
```

---

## Rollback (if needed)

If the migration causes issues, restore from backup:

1. Alert team immediately
2. Stop accepting new responses
3. Contact Cloudflare support for D1 database restore
4. Revert any application code changes that depend on new columns

**Note:** Before running in production, test thoroughly in local dev first.

---

## What This Migration Adds

- **user_id**: Foreign key linking response to user (nullable for anonymous)
- **submitted_at**: Timestamp when response was first submitted (auto-set on INSERT)
- **updated_at**: Timestamp when response was last modified (auto-updated)
- **edit_count**: Counter of how many times response was edited (starts at 0)
- **idx_responses_user_surveyver_unique**: Ensures one response per user per survey version

This enables response editing workflows while maintaining referential integrity and edit history tracking.
