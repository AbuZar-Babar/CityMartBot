#!/bin/bash
cd "$(dirname "$0")"

# Purani/stale endpoint file hata dein taake galti se purane band Chrome se connect na ho
rm -f browser-endpoint.json

# browser-server.js ko background mein chalayein (ye khud kabhi band nahi hota)
node browser-server.js &
BROWSER_PID=$!

# Jab tak browser-endpoint.json na ban jaye (matlab Chrome poori tarah ready ho),
# tab tak intezar karein — fixed guess wait karne ke bajaye
echo "Waiting for browser-server.js to be ready..."
while [ ! -f browser-endpoint.json ]; do
  sleep 1
done
sleep 3

node auto-login.js
node run-all-companies.js

echo "Done. Browser server (PID $BROWSER_PID) abhi bhi chal raha hai — agar band karna hai to us Chrome window ko close kar dein ya Ctrl+C dabayein."