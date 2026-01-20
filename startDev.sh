#!/bin/bash

# startDev.sh - Start local development server for public/ on port 8788

PID_FILE=".dev-server.pid"
LOG_FILE=".dev-server.log"
PORT=8788
PUBLIC_DIR="public"

# Check if server is already running and stop it
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "⏹️  Stopping existing dev server (PID: $OLD_PID)"
    kill "$OLD_PID"
    sleep 1
    # Force kill if still running
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID"
    fi
  fi
  # Clean up old PID file
  rm "$PID_FILE"
fi

# Check if public directory exists
if [ ! -d "$PUBLIC_DIR" ]; then
  echo "❌ Error: $PUBLIC_DIR directory not found"
  exit 1
fi

# Start the server
echo "🚀 Starting dev server on http://localhost:$PORT"
echo "📂 Serving from: $PUBLIC_DIR"

# Use Python's http.server if available (WSL-friendly)
if command -v python3 &> /dev/null; then
  cd "$PUBLIC_DIR"
  python3 -m http.server $PORT > "../$LOG_FILE" 2>&1 &
  PID=$!
  cd - > /dev/null
elif command -v python &> /dev/null; then
  cd "$PUBLIC_DIR"
  python -m SimpleHTTPServer $PORT > "../$LOG_FILE" 2>&1 &
  PID=$!
  cd - > /dev/null
else
  echo "❌ Error: python3 or python not found"
  exit 1
fi

# Save PID
echo "$PID" > "$PID_FILE"

echo "✅ Server started (PID: $PID)"
echo "📝 Logs: $LOG_FILE"
echo "🛑 To stop: kill $PID or run: kill \$(cat $PID_FILE)"
