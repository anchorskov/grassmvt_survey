#!/bin/bash
# deploy_prod.sh
# Production deployment script for grassmvtsurvey Cloudflare Worker
set -euo pipefail

# Get the directory where this script is located (should be root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CONFIG_PATH="./wrangler.jsonc"
if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "[deploy] Missing $CONFIG_PATH at root."
  exit 1
fi

SRC_FILE="./src/worker.js"
if [[ ! -f "$SRC_FILE" ]]; then
  echo "[deploy] Missing $SRC_FILE"
  exit 1
fi

PUBLIC_DIR="./public"
if [[ ! -d "$PUBLIC_DIR" ]]; then
  echo "[deploy] Missing $PUBLIC_DIR"
  exit 1
fi

echo "[deploy] Starting production deploy..."
echo "[deploy] Config: $CONFIG_PATH"
echo "[deploy] Source: $SRC_FILE"
echo "[deploy] Assets: $PUBLIC_DIR"
echo ""

# Deploy to production
# shellcheck disable=SC2086
npx wrangler deploy --name grassmvtsurvey-production

echo ""
echo "[deploy] Production deploy complete."
echo "[deploy] Deployed to: https://grassmvtsurvey.anchorskov.workers.dev"
