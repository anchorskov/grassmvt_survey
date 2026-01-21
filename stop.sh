#!/bin/bash
# stop.sh

# stop.sh - Stop wrangler dev server(s)

PID_FILE=".wrangler-dev.pid"
LOG_FILE=".wrangler-dev.log"

echo "🛑 Stopping wrangler dev server..."

# Try to stop using PID file first
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "   Killing process PID: $PID"
    kill -9 "$PID" 2>/dev/null
    sleep 1
    
    # Verify it's gone
    if ! kill -0 "$PID" 2>/dev/null; then
      echo "   ✅ Process stopped successfully"
    else
      echo "   ⚠️  Process still running, forcing harder..."
      pkill -9 -f "wrangler dev"
    fi
  else
    echo "   ℹ️  PID $PID not running"
  fi
  
  # Clean up PID file
  rm -f "$PID_FILE"
else
  echo "   ℹ️  No PID file found, searching for wrangler processes..."
fi

# Force kill any remaining wrangler processes
echo "   Killing any remaining wrangler processes..."
pkill -9 -f "wrangler dev" 2>/dev/null || true
pkill -9 -f "npx.*wrangler" 2>/dev/null || true

sleep 1

# Verify all wrangler processes are stopped
if pgrep -f "wrangler dev" > /dev/null 2>&1; then
  echo "❌ Failed to stop wrangler server"
  exit 1
else
  echo "✅ All wrangler servers stopped"
fi

# Optional: show last lines of log if it exists
if [ -f "$LOG_FILE" ]; then
  echo ""
  echo "📝 Last log entries:"
  tail -3 "$LOG_FILE"
fi

exit 0
