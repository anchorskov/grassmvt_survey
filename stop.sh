#!/bin/bash

# stop.sh - Stop the local development server

PID_FILE=".dev-server.pid"
LOG_FILE=".dev-server.log"

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
  echo "❌ No dev server running (PID file not found)"
  exit 0
fi

# Read PID
PID=$(cat "$PID_FILE")

# Check if process is running
if ! kill -0 "$PID" 2>/dev/null; then
  echo "⚠️  Process $PID is not running"
  rm "$PID_FILE"
  exit 0
fi

# Kill the process
kill "$PID"

# Wait a moment for it to shut down
sleep 1

# Check if it actually died
if kill -0 "$PID" 2>/dev/null; then
  echo "⚠️  Process didn't stop gracefully, force killing..."
  kill -9 "$PID"
fi

# Remove PID file
rm "$PID_FILE"

echo "✅ Dev server stopped (PID: $PID)"
echo "📝 Logs saved in: $LOG_FILE"
