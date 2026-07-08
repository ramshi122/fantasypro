#!/bin/bash
# Auto-restart watchdog for Next.js server
# Checks every 5 seconds, restarts if port 3000 is not responding

cd /home/z/my-project

while true; do
  # Check if port 3000 is listening
  if ! ss -tlnp 2>/dev/null | grep -q ":3000"; then
    echo "[$(date)] Server down — restarting..."
    cd /home/z/my-project/.next/standalone
    PORT=3000 HOSTNAME=0.0.0.0 node server.js </dev/null >/home/z/my-project/dev.log 2>&1 &
    sleep 3
    if ss -tlnp 2>/dev/null | grep -q ":3000"; then
      echo "[$(date)] Server restarted successfully"
    else
      echo "[$(date)] Server failed to start"
    fi
  fi
  sleep 5
done
