const fs = require('fs');
const path = require('path');
const { getLoggedInPage } = require('./browser.js');

const LOG_FILE = path.join(__dirname, 'session-check-log.txt');

function logResult(message) {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} - ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

(async () => {
  try {
    const { browser, page } = await getLoggedInPage();

    await page.goto(
      'https://citymart.i21web.com/iRelyProd/#/AR/Invoice?showSearch=true',
      { waitUntil: 'networkidle2', timeout: 30000 }
    );

    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    const pageTitle = await page.title();

    const looksLoggedOut =
      currentUrl.toLowerCase().includes('login') ||
      pageTitle.toLowerCase().includes('login');

    if (looksLoggedOut) {
      logResult('Session EXPIRED — redirected to login. URL: ' + currentUrl);
    } else {
      logResult('Session VALID — still authenticated. URL: ' + currentUrl);
    }

    browser.disconnect();

  } catch (err) {
    logResult('Session CHECK FAILED — error: ' + err.message);
  }
})();
