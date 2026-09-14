#!/bin/bash
cd "$(dirname "$0")"

echo "==================================================="
echo "    CityMart Invoice Portal Bot Runner (macOS/Linux)"
echo "==================================================="

# Remove stale endpoint file
rm -f browser-endpoint.json

# Start browser server in background
node scripts/browser-server.js &
BROWSER_PID=$!

echo "Waiting for browser-server to be ready..."
while [ ! -f browser-endpoint.json ]; do
  sleep 1
done
sleep 2

node scripts/auto-login.js
node src/bot.js

echo "==================================================="
echo "Process complete. Browser PID ($BROWSER_PID) remains running."
echo "==================================================="