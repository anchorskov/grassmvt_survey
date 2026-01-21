#!/bin/bash
# startDev.sh

# startDev.sh - Start local Cloudflare Worker dev server on port 8787

PID_FILE=".wrangler-dev.pid"
LOG_FILE=".wrangler-dev.log"
PORT=8787
CONFIG="wrangler.jsonc"

# Check if server is already running and stop it
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "⏹️  Stopping existing wrangler dev (PID: $OLD_PID)"
    kill "$OLD_PID"
    sleep 1
    # Force kill if still running
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID"
    fi
  fi
  rm "$PID_FILE"
fi

# Start the server
echo "🚀 Starting wrangler dev on http://localhost:$PORT"
echo "🧭 Config: $CONFIG"

if npx wrangler dev --config "$CONFIG" --port "$PORT" > "$LOG_FILE" 2>&1 &
then
  PID=$!
else
  echo "❌ Error: failed to start wrangler dev"
  exit 1
fi

# Save PID
echo "$PID" > "$PID_FILE"

echo "✅ Wrangler dev started (PID: $PID)"
echo "📝 Logs: $LOG_FILE"
echo "🛑 To stop: kill $PID or run: kill \$(cat $PID_FILE)"
