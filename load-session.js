const fs = require('fs');
const path = require('path');

async function loadSession() {
  if (!fs.existsSync('./session.json')) {
    throw new Error("session.json not found. Run save-session.js first");
  }
  
  const session = JSON.parse(fs.readFileSync('./session.json', 'utf8'));
  const cookies = session.cookies || [];

  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  const headers = {
    'Cookie': cookieString,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest'
  };
  
  return { headers, cookies };
}

module.exports = { loadSession }; // IMPORTANT: object ke andar export karo