#!/bin/bash
# startDev.sh

# startDev.sh - Start local Cloudflare Worker dev server on port 8787

PID_FILE=".wrangler-dev.pid"
LOG_FILE=".wrangler-dev.log"
PORT=8787
CONFIG="wrangler.jsonc"

clear_port() {
  local port="$1"
  local found=0

  if command -v fuser >/dev/null 2>&1; then
    if fuser "$port"/tcp >/dev/null 2>&1; then
      found=1
      echo "🧹 Clearing stale process on port $port via fuser"
      fuser -k "$port"/tcp >/dev/null 2>&1 || true
      sleep 1
    fi
  fi

  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :$port )" | grep -q ":$port"; then
      found=1
      echo "🧹 Port $port still appears occupied after initial cleanup"
    fi
  fi

  return "$found"
}

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

# Clear any stale listener on the target port even if no PID file exists
clear_port "$PORT" || true

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

# Give wrangler a moment to fail fast if startup is broken
sleep 2
if ! kill -0 "$PID" 2>/dev/null; then
  echo "❌ Wrangler dev exited during startup"
  if [ -f "$LOG_FILE" ]; then
    echo ""
    echo "📝 Startup log:"
    tail -20 "$LOG_FILE"
  fi
  rm -f "$PID_FILE"
  exit 1
fi

echo "✅ Wrangler dev started (PID: $PID)"
echo "📝 Logs: $LOG_FILE"
echo "🛑 To stop: kill $PID or run: kill \$(cat $PID_FILE)"
