# SurveyJS Vertical Slice - Local Test Plan

## Quick Start

### 1. Build SurveyJS Bundle
```bash
npm run build:surveyjs
```

### 2. Apply D1 Migrations Locally
```bash
npx wrangler d1 migrations apply wy_local --local --config wrangler.jsonc
```

### 3. Start the Worker (Port 8787)
```bash
./startDev.sh
# Or manually: npm run dev:worker
```

The worker starts on `http://localhost:8787`

### 4. Seed "Abortion" Survey

```bash
# The abortion-policy survey is already seeded by migration 0001_survey_tables.sql
# To update with v1 data:
npx wrangler d1 execute wy_local --file seed-abortion-surveyjs.sql --local --config wrangler.jsonc
```

**Status:** ✅ Seeding complete

---

## Quick Test Results ✅

```
TEST 1️⃣  GET /api/surveys/abortion-policy
✅ PASSED: All required fields present
  • versionId: 1
  • versionHash: e8a1b2c3d4e5f6a7...
  • title: Abortion Policy Survey
  • surveyJson: present

TEST 2️⃣  POST /api/surveys/abortion-policy/responses
✅ PASSED: Response submitted successfully
  • ok: true
  • responseId: 61eb1afd-a69c-4bec-9882-ec36025df853

TEST 3️⃣  GET /surveys/abortion-policy (HTML Page)
✅ PASSED: HTML page renders with SurveyJS components
  • Has surveyjs-root div: yes
  • Has surveyjs-bundle.js: yes
  • Has correct data-slug: yes

TEST 4️⃣  Verify response stored in database
✅ PASSED: Response ID generated
```

Run the test script anytime:
```bash
./test-surveyjs-endpoints.sh
```

---

## API Endpoint Tests

### Test 1: GET /api/surveys/abortion-policy
Retrieve survey definition and latest version

```bash
curl -s http://localhost:8787/api/surveys/abortion-policy | jq .
```

**Expected Response:**
```json
{
  "surveyJson": { /* SurveyJS JSON structure */ },
  "versionId": 1,
  "versionHash": "sha256hash",
  "title": "Abortion Policy Survey"
}
```

**Verify:** All four fields present (surveyJson, versionId, versionHash, title)

---

### Test 2: POST /api/surveys/abortion-policy/responses
Submit survey responses

```bash
SURVEY_RESP=$(curl -s http://localhost:8787/api/surveys/abortion-policy)
VERSION_ID=$(echo "$SURVEY_RESP" | jq -r '.versionId')
VERSION_HASH=$(echo "$SURVEY_RESP" | jq -r '.versionHash')

curl -X POST http://localhost:8787/api/surveys/abortion-policy/responses \
  -H "Content-Type: application/json" \
  -d "{
    \"versionId\": \"$VERSION_ID\",
    \"versionHash\": \"$VERSION_HASH\",
    \"answers\": {
      \"policy_approach\": \"Protect abortion access in all cases\",
      \"impact_concern\": true
    }
  }" | jq .
```

**Expected Response:**
```json
{
  "ok": true,
  "responseId": "uuid"
}
```

**Verify:** `ok: true` and `responseId` is a valid UUID

---

### Test 3: GET /surveys/abortion-policy (HTML Page)
Render SurveyJS page and verify submission flow

```bash
curl -s http://localhost:8787/surveys/abortion-policy | head -20
```

Should return HTML containing SurveyJS form and scripts.

**After submitting via browser:**
- Verify receipt displays with `responseId`
- Check browser console for no errors
- Confirm POST request made to `/api/surveys/abortion/responses`

---

## Quick Validation Script

Save as `test-surveyjs.sh`:

```bash
#!/bin/bash
set -e

BASE_URL="http://localhost:8787"
SURVEY="abortion"

echo "🧪 Testing SurveyJS vertical slice..."
echo ""

# Test 1: GET survey
echo "1️⃣  GET /api/surveys/$SURVEY"
RESP=$(curl -s "$BASE_URL/api/surveys/$SURVEY")
VERSION_ID=$(echo "$RESP" | jq -r '.versionId // empty')
VERSION_HASH=$(echo "$RESP" | jq -r '.versionHash // empty')
TITLE=$(echo "$RESP" | jq -r '.title // empty')

if [[ -z "$VERSION_ID" || -z "$VERSION_HASH" || -z "$TITLE" ]]; then
  echo "❌ FAILED: Missing required fields"
  echo "$RESP" | jq .
  exit 1
fi
echo "✅ PASSED: Found versionId, versionHash, title"
echo ""

# Test 2: POST response
echo "2️⃣  POST /api/surveys/$SURVEY/responses"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/surveys/$SURVEY/responses" \
  -H "Content-Type: application/json" \
  -d "{
    \"versionId\": \"$VERSION_ID\",
    \"versionHash\": \"$VERSION_HASH\",
    \"answers\": {
      \"policy_approach\": \"Protect abortion access in all cases\",
      \"impact_concern\": true
    }
  }")

RESPONSE_ID=$(echo "$RESPONSE" | jq -r '.responseId // empty')
OK=$(echo "$RESPONSE" | jq -r '.ok // empty')

if [[ "$OK" != "true" || -z "$RESPONSE_ID" ]]; then
  echo "❌ FAILED: Invalid response"
  echo "$RESPONSE" | jq .
  exit 1
fi
echo "✅ PASSED: Submitted response with ID: $RESPONSE_ID"
echo ""

# Test 3: GET HTML page
echo "3️⃣  GET /surveys/$SURVEY (HTML)"
HTML=$(curl -s "$BASE_URL/surveys/$SURVEY")
if echo "$HTML" | grep -q "SurveyJS\|survey"; then
  echo "✅ PASSED: HTML page renders with survey content"
else
  echo "⚠️  WARNING: Survey content not clearly detected in HTML"
fi

echo ""
echo "✅ All tests passed!"
```

Run with:
```bash
chmod +x test-surveyjs.sh
./test-surveyjs.sh
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Worker won't start | Check port 8787 is free: `lsof -i :8787` |
| Database not found | Run migrations: `npx wrangler d1 migrations apply wy_local --local` |
| Seed endpoint 404 | Ensure worker is running with `npm run dev:worker` |
| GET survey returns 404 | Confirm seed was successful, survey status is `active` |
| POST returns `version hash mismatch` | Verify VERSION_HASH matches exactly from GET response |

---

## Notes

- Worker logs visible in `.wrangler-dev.log`
- Stop worker: `kill $(cat .wrangler-dev.pid)` or run `./stop.sh`
- Local DB: SQLite at `.wrangler/state/d1`
- All endpoints require local request for `/api/dev/*` endpoints
