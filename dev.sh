#!/usr/bin/env bash
# dev.sh — start local dev servers for grassmvt_survey
# Usage: ./dev.sh
# Runs: astro build --watch (Terminal pane 1) + wrangler dev (Terminal pane 2)
# Full stack available at http://localhost:8787

set -e

# Load nvm so the node version requirement is met
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  source "$NVM_DIR/nvm.sh"
  nvm use 22 --silent
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "Building initial dist/..."
npx astro build

echo ""
echo "Starting dev servers..."
echo "  astro build:watch  → rebuilds dist/ on .astro file saves (background)"
echo "  wrangler dev       → full stack: Worker + D1 + static assets"
echo ""
echo "  ➜  Open http://localhost:8787 in your browser"
echo "     (NOT 4321 — this project uses wrangler, not astro dev)"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

# Run both processes; kill both when either exits or Ctrl+C is pressed
trap 'kill 0' INT TERM EXIT

npx astro build --watch &
ASTRO_PID=$!

npx wrangler dev --config wrangler.jsonc &
WRANGLER_PID=$!

wait $ASTRO_PID $WRANGLER_PID
