const config = require('../config');
const { getLoggedInPage } = require('../src/core/browser');
const { randomDelay, humanClick, humanType } = require('../src/core/human');

async function isDashboardReached(page) {
  const url = (page.url() || '').toLowerCase();
  const emailField = await page.$('#Email');
  return !url.includes('login') && !emailField;
}

async function waitForDashboard(page, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isDashboardReached(page)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

(async () => {
  let browser;
  try {
    const result = await getLoggedInPage();
    browser = result.browser;
    const page = result.page;

    // Check if user is already logged in
    if (await isDashboardReached(page)) {
      console.log('Already logged in and on dashboard. Proceeding directly to scraper.');
      await browser.disconnect();
      process.exit(0);
    }

    const email = config.CREDENTIALS.username;
    const password = config.CREDENTIALS.password;
    const company = config.CREDENTIALS.company;

    const emailField = await page.$('#Email');

    if (email && password && emailField) {
      console.log('Login form detected and credentials found in .env. Auto-filling...');

      await humanClick(page, '#Email');
      await humanType(page, '#Email', email);
      await randomDelay(300, 600);

      await humanClick(page, '#Password');
      await humanType(page, '#Password', password);
      await randomDelay(300, 600);

      if (company) {
        await humanClick(page, '#Company');
        await humanType(page, '#Company', company);
        await randomDelay(1000, 1500);

        const suggestionHandle = await page.evaluateHandle(() => {
          const candidates = Array.from(
            document.querySelectorAll(
              'li, .ui-menu-item, .autocomplete-suggestion, .dropdown-item, [role="option"]'
            )
          );
          return (
            candidates.find(
              (el) => el.innerText && el.innerText.trim().length > 0 && el.offsetParent !== null
            ) || null
          );
        });

        const suggestionEl = suggestionHandle.asElement();
        if (suggestionEl) {
          const box = await suggestionEl.boundingBox();
          if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            console.log('Selected company suggestion.');
          }
        }
      }

      await randomDelay(500, 800);

      console.log('Submitting login form...');
      await Promise.all([
        humanClick(page, '#Login'),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {
          // Navigation may be handled in-page via AJAX
        })
      ]);

      console.log('\nLogin submitted.');
      console.log('If a CAPTCHA or 2FA prompt appears, please solve it in the Chrome window.');
      console.log('Waiting for portal dashboard to load...');

      const reached = await waitForDashboard(page, 90000);
      if (!reached) {
        throw new Error('Timed out waiting for dashboard after auto-login. Please check the Chrome window.');
      }
    } else {
      console.log('\n===============================================================');
      console.log(' [ACTION REQUIRED] Please log in to the portal in the Chrome window:');
      if (!email || !password) {
        console.log(' - Reason: CITYMART_USERNAME or CITYMART_PASSWORD is empty in .env');
      }
      console.log(' - Enter your email, password, company, and complete any CAPTCHA.');
      console.log(' - This script will automatically detect when you reach the dashboard.');
      console.log('===============================================================\n');

      console.log('Waiting for login to complete...');
      const reached = await waitForDashboard(page, 180000);
      if (!reached) {
        throw new Error('Login timed out. Please try again.');
      }
    }

    console.log('\n[SUCCESS] Login verified! Dashboard reached.');
    console.log('Current URL:', page.url());

    await browser.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\nAuto-login error:', err.message);
    if (browser) await browser.disconnect();
    process.exit(1);
  }
})();
