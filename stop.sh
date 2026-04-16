#!/usr/bin/env bash
# stop.sh — stop local dev servers and verify ports are clear
# Kills any processes using ports 8787 (wrangler) and 4321 (astro dev)
# Also kills lingering astro/wrangler processes by name

PORTS=(8787 4321 8788)
FOUND=0

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  Killing process(es) on port $port: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    FOUND=1
  fi
}

kill_by_name() {
  local name=$1
  local pids
  pids=$(pgrep -f "$name" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  Killing $name process(es): $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    FOUND=1
  fi
}

echo "Stopping dev servers..."

for port in "${PORTS[@]}"; do
  kill_port "$port"
done

kill_by_name "astro build"
kill_by_name "wrangler dev"

if [ "$FOUND" -eq 0 ]; then
  echo "  No dev server processes found."
fi

sleep 1

echo ""
echo "Port check:"
ALL_CLEAR=1
for port in "${PORTS[@]}"; do
  if lsof -ti tcp:"$port" &>/dev/null; then
    echo "  port $port — STILL IN USE (pid $(lsof -ti tcp:$port))"
    ALL_CLEAR=0
  else
    echo "  port $port — clear"
  fi
done

echo ""
if [ "$ALL_CLEAR" -eq 1 ]; then
  echo "All ports clear. Safe to run ./dev.sh"
else
  echo "Some ports still occupied. Wait a moment and re-run ./stop.sh"
  exit 1
fi
