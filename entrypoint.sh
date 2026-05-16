#!/bin/sh
set -e

# Start Lobster Trap in background. LT_BACKEND/LT_MODEL come from fly.toml/env.
# --no-dashboard keeps LT headless; Next.js owns the UI.
./lobstertrap serve \
  --backend "${LT_BACKEND:-http://localhost:11434}" \
  --listen :8080 \
  --policy configs/default_policy.yaml \
  --no-dashboard &

# Wait for LT to accept connections on :8080. wget exits 7 when the port
# isn't listening yet; any other exit means it's reachable (the chat
# endpoint may 404/405 on a GET, that's fine — we just want a TCP handshake).
echo "[entrypoint] waiting for lobstertrap on :8080..."
i=0
until wget -q --spider http://localhost:8080/v1/chat/completions 2>/dev/null || [ $? -ne 7 ]; do
  i=$((i+1))
  if [ "$i" -gt 100 ]; then
    echo "[entrypoint] lobstertrap did not come up within 20s" >&2
    exit 1
  fi
  sleep 0.2
done
echo "[entrypoint] lobstertrap ready"

# Seed the audit DB on first boot so the dashboard isn't empty.
# /app/data is the Fly volume mount destination.
if [ ! -f /app/data/agentmarshal.db ]; then
  mkdir -p /app/data
  echo "[entrypoint] seeding audit log..."
  node seed-audit.js || echo "[entrypoint] seed failed (non-fatal)"
fi

# Hand off to the Next.js standalone server (holds the container).
exec node server.js
