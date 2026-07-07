#!/bin/bash
while true; do
  # Check if server is running
  if ! pgrep -f "node.*server.js" > /dev/null 2>&1; then
    echo "[$(date)] Server died, restarting..." >> /home/z/my-project/dev.log
    cd /home/z/my-project/.next/standalone
    PORT=3000 HOSTNAME=0.0.0.0 node server.js >> /home/z/my-project/dev.log 2>&1 &
  fi
  sleep 5
done
