const fs = require('fs');
const path = require('path');
const config = require('../../config');

/**
 * Loads session cookies from session.json and builds standard HTTP request headers.
 */
function loadSession() {
  const sessionPath = config.PATHS.sessionFile;
  const legacyPath = path.join(config.PATHS.root, 'session.json');

  const fileToRead = fs.existsSync(sessionPath)
    ? sessionPath
    : fs.existsSync(legacyPath)
    ? legacyPath
    : null;

  if (!fileToRead) {
    throw new Error('session.json not found. Run scripts/save-session.js or login via browser.');
  }

  const raw = JSON.parse(fs.readFileSync(fileToRead, 'utf8'));
  const cookies = Array.isArray(raw) ? raw : raw.cookies || [];
  const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  const headers = {
    Cookie: cookieString,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest'
  };

  return { headers, cookies };
}

/**
 * Saves cookies to data/session.json.
 */
function saveSession(cookies) {
  if (!fs.existsSync(config.PATHS.data)) {
    fs.mkdirSync(config.PATHS.data, { recursive: true });
  }
  fs.writeFileSync(config.PATHS.sessionFile, JSON.stringify(cookies, null, 2), 'utf8');
}

/**
 * Checks if the current page session is logged in or redirected to login.
 */
async function isSessionValid(page) {
  const currentUrl = (page.url() || '').toLowerCase();
  const pageTitle = (await page.title() || '').toLowerCase();

  const looksLoggedOut = currentUrl.includes('login') || pageTitle.includes('login');
  return !looksLoggedOut;
}

module.exports = {
  loadSession,
  saveSession,
  isSessionValid
};
