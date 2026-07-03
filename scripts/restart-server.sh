#!/usr/bin/env bash
# restart-server.sh — Restart the Socrates API server.
#
# The server runs as a systemd unit (socrates-api.service). Use
# `systemctl restart` so the supervisor:
#   - Sends SIGTERM and waits the configured TimeoutStopSec
#   - Re-spawns if the process exits with a non-zero status
#   - Streams stdout/stderr to journalctl (no log files to rotate)
#
# Usage: sudo ./scripts/restart-server.sh
#
# Effects of restart:
#   - All existing user sessions are preserved (sessions are in DB).
#   - In-flight LLM streams are interrupted (active chats will see
#     a "stream disconnected" error and can retry).
#   - The server picks up any new .env values that were edited
#     since the last start.

set -euo pipefail

if ! command -v systemctl >/dev/null 2>&1; then
  echo "ERROR: systemctl not found. Install systemd or run the"
  echo "       server with a different supervisor (pm2 / forever /"
  echo "       direct nohup invocation)."
  exit 1
fi

UNIT="socrates-api.service"

# Show the previous state.
echo "Current state:"
sudo systemctl status "$UNIT" --no-pager 2>&1 | grep -E "Active:|Main PID:" || true
echo

echo "Restarting $UNIT..."
sudo systemctl restart "$UNIT"

# Wait up to 30s for the unit to come back up.
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:3037/api/health > /dev/null 2>&1; then
    echo "Server is healthy after ${i}s."
    sudo systemctl status "$UNIT" --no-pager 2>&1 | grep -E "Active:|Main PID:" || true
    echo
    curl -s http://127.0.0.1:3037/api/health | python3 -m json.tool 2>/dev/null || true
    exit 0
  fi
  sleep 1
done

echo "ERROR: server did not become healthy within 30s. Recent logs:"
sudo journalctl -u "$UNIT" -n 30 --no-pager 2>&1 | tail -30
exit 1