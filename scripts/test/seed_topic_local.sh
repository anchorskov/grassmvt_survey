#!/bin/bash

# Reminder to export SESSION and SURVEY_SLUG before running
if [[ -z "$SESSION" || -z "$SURVEY_SLUG" ]]; then
  echo "Usage: export SESSION=... SURVEY_SLUG=...; ./scripts/test/seed_topic_local.sh"
  echo "Both SESSION and SURVEY_SLUG environment variables are required."
  exit 1
fi

URL="http://localhost:8787/api/townhall/admin/seed-topic"

response=$(curl -s -w "\n%{http_code}" -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$SESSION" \
  -d '{"surveySlug":"'$SURVEY_SLUG'"}')

body=$(echo "$response" | sed '$d')
status=$(echo "$response" | tail -n1)

echo "STATUS=$status"
echo "BODY=$body"

if [[ $status -ge 400 ]]; then
  exit 2
fi
