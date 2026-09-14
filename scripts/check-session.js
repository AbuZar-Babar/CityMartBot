const config = require('../config');
const { getLoggedInPage } = require('../src/core/browser');
const { isSessionValid } = require('../src/core/session');

(async () => {
  try {
    const { browser, page } = await getLoggedInPage();

    await page.goto(config.INVOICE_SEARCH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: config.SCRAPER.navigationTimeoutMs
    });

    await new Promise((r) => setTimeout(r, 2000));

    const valid = await isSessionValid(page);
    const url = page.url();

    if (valid) {
      console.log(`[VALID] Session is ACTIVE. Current URL: ${url}`);
    } else {
      console.log(`[EXPIRED] Session is EXPIRED or redirected to login. URL: ${url}`);
    }

    browser.disconnect();
    process.exit(valid ? 0 : 1);
  } catch (err) {
    console.error(`[ERROR] Session check failed: ${err.message}`);
    process.exit(1);
  }
})();
