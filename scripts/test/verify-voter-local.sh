# scripts/test/verify-voter-local.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"

read -rp "Session cookie value (session=...): " session_cookie
read -rp "First name: " first_name
read -rp "Last name: " last_name
read -rp "Street address: " street1
read -rp "City: " city
read -rp "ZIP: " zip

payload=$(python3 - <<PY
import json
print(json.dumps({
  "first_name": "${first_name}",
  "last_name": "${last_name}",
  "street1": "${street1}",
  "city": "${city}",
  "zip": "${zip}",
  "state": "WY",
}))
PY
)

curl -s -X POST \
  -H "content-type: application/json" \
  -H "cookie: session=${session_cookie}" \
  -d "$payload" \
  "$BASE_URL/api/location/verify-voter"

echo
