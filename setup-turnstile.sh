#!/bin/bash
# setup-turnstile.sh
# Script to guide Turnstile secret key setup
# Run from project root: bash setup-turnstile.sh

set -e

echo ""
echo "========================================"
echo "Cloudflare Turnstile Setup Script"
echo "========================================"
echo ""

echo "STEP 1: Get your Turnstile keys"
echo "Visit: https://dash.cloudflare.com/?to=/:account/security/turnstile"
echo "Create a new Turnstile site and copy:"
echo "  - Site Key (public)"
echo "  - Secret Key (private)"
echo ""

echo "STEP 2: Update wrangler.jsonc"
echo "Edit wrangler.jsonc and update [vars] section:"
echo "  \"vars\": {"
echo "    \"TURNSTILE_SITE_KEY\": \"<your_public_site_key>\""
echo "  }"
echo ""

echo "STEP 3: Update .dev.vars for local development"
echo "Edit .dev.vars and add:"
echo "  TURNSTILE_SITE_KEY=<your_public_site_key>"
echo "  TURNSTILE_SECRET_KEY=<your_private_secret_key>"
echo ""

echo "STEP 4: Set secret key using Wrangler CLI"
echo "Run these commands (paste secret when prompted, it won't echo):"
echo ""
echo "  wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.jsonc"
echo ""
echo "And for production:"
echo ""
echo "  wrangler secret put TURNSTILE_SECRET_KEY --env production --config wrangler.jsonc"
echo ""

echo "STEP 5: Restart local dev server"
echo "  npx wrangler dev --local --config wrangler.jsonc"
echo ""

echo "STEP 6: Test"
echo "  - Open http://localhost:8787"
echo "  - Click 'Sign in'"
echo "  - Confirm Turnstile widget renders"
echo "  - Test signup/login flow"
echo ""

echo "========================================"
echo "Setup complete! Run the commands above."
echo "========================================"
echo ""
