# scripts/test/location-setup.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"

print_step() {
  echo "=== $1 ==="
}

print_step "Checking /account/location"
status_code=$(curl -s -L -o /dev/null -w "%{http_code}" "$BASE_URL/account/location")
if [ "$status_code" != "200" ]; then
  echo "Expected 200 from /account/location, got $status_code"
  exit 1
fi

print_step "Checking /api/geo (US)"
geo_us=$(curl -s -H "CF-IPCountry: US" "$BASE_URL/api/geo")
echo "$geo_us"

print_step "Checking /api/geo (CA)"
geo_ca=$(curl -s -H "CF-IPCountry: CA" "$BASE_URL/api/geo")
echo "$geo_ca"

print_step "Validating US address"
address_payload='{"street1":"1600 Pennsylvania Ave NW","street2":"","city":"Washington","state":"DC","zip":"20500"}'
address_resp=$(curl -s -X POST -H "content-type: application/json" -d "$address_payload" "$BASE_URL/api/location/validate-address")
echo "$address_resp"

addr_lat=$(echo "$address_resp" | python3 -c "import json,sys;print(json.load(sys.stdin).get('addr_lat'))")
addr_lng=$(echo "$address_resp" | python3 -c "import json,sys;print(json.load(sys.stdin).get('addr_lng'))")

if [ "$addr_lat" = "None" ] || [ "$addr_lng" = "None" ]; then
  echo "Address geocoding returned null coordinates. Device verify skipped."
  exit 0
fi

print_step "Verifying device location"
verify_payload=$(python3 - <<PY
import json, time
lat = float("$addr_lat")
lng = float("$addr_lng")
print(json.dumps({
  "addr_lat": lat,
  "addr_lng": lng,
  "device_lat": lat,
  "device_lng": lng,
  "accuracy_m": 25,
  "timestamp_ms": int(time.time() * 1000),
}))
PY
)
verify_resp=$(curl -s -X POST -H "content-type: application/json" -d "$verify_payload" "$BASE_URL/api/location/verify-device")
echo "$verify_resp"

print_step "Done"
