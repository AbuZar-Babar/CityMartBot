require('dotenv').config();
const { getLoggedInPage } = require('./browser.js');

// Human-like helpers
function randomDelay(min, max) {
  return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function humanClick(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`Element not visible: ${selector}`);

  const x = box.x + box.width / 2 + (Math.random() * 6 - 3);
  const y = box.y + box.height / 2 + (Math.random() * 6 - 3);

  await page.mouse.move(x - 20, y - 10, { steps: 5 });
  await randomDelay(80, 180);
  await page.mouse.move(x, y, { steps: 10 });
  await randomDelay(100, 250);
  await page.mouse.down();
  await randomDelay(50, 120);
  await page.mouse.up();
  await randomDelay(150, 350);
}

async function humanType(page, selector, text) {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 100) + 60 });
    if (Math.random() < 0.05) await randomDelay(150, 400); // occasional pause, like a human
  }
}

(async () => {
  let browser;
  try {
    const result = await getLoggedInPage();
    browser = result.browser;
    const page = result.page;

    page.on('dialog', async (dialog) => {
      console.log('DIALOG APPEARED:', dialog.message());
      await dialog.dismiss();
    });

    page.on('request', (request) => {
      if (request.method() === 'POST') console.log('POST REQUEST:', request.url());
    });
    page.on('response', (response) => {
      if (response.request().method() === 'POST') console.log('POST RESPONSE:', response.status(), response.url());
    });
    page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    const IRELY_EMAIL = process.env.CITYMART_USERNAME;
    const IRELY_PASSWORD = process.env.CITYMART_PASSWORD;
    const IRELY_COMPANY = process.env.CITYMART_COMPANY;

    if (!IRELY_EMAIL || !IRELY_PASSWORD || !IRELY_COMPANY) {
      throw new Error('Missing CITYMART_USERNAME, CITYMART_PASSWORD, or CITYMART_COMPANY in .env');
    }

    const emailField = await page.$('#Email');

    if (emailField) {
      console.log('Login form detected — filling it in like a human...');

      await humanClick(page, '#Email');
      await humanType(page, '#Email', IRELY_EMAIL);
      await randomDelay(300, 700);

      await humanClick(page, '#Password');
      await humanType(page, '#Password', IRELY_PASSWORD);
      await randomDelay(300, 700);

      await humanClick(page, '#Company');
      await humanType(page, '#Company', IRELY_COMPANY);

      // Wait for autocomplete dropdown to render, like a human pausing to look
      await randomDelay(1000, 1800);
      await page.screenshot({ path: 'company-dropdown.png' });

      const suggestionHandle = await page.evaluateHandle(() => {
        const candidates = Array.from(document.querySelectorAll(
          'li, .ui-menu-item, .autocomplete-suggestion, .dropdown-item, [role="option"]'
        ));
        return candidates.find(el =>
          el.innerText && el.innerText.trim().length > 0 && el.offsetParent !== null
        ) || null;
      });

      const suggestionElement = suggestionHandle.asElement();

      if (suggestionElement) {
        const text = await page.evaluate(el => el.innerText, suggestionElement);
        const box = await suggestionElement.boundingBox();
        if (box) {
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          await page.mouse.move(x - 15, y - 5, { steps: 5 });
          await randomDelay(100, 200);
          await page.mouse.move(x, y, { steps: 8 });
          await randomDelay(150, 300);
          await page.mouse.down();
          await randomDelay(50, 100);
          await page.mouse.up();
          console.log('Clicked company suggestion (human-like):', text);
        }
      } else {
        console.log('No autocomplete suggestion found — check company-dropdown.png');
      }

      await randomDelay(500, 900);
      await page.screenshot({ path: 'before-submit.png' });

      const loginBtnInfo = await page.evaluate(() => {
        const btn = document.querySelector('#Login');
        if (!btn) return null;
        return { disabled: btn.disabled, visible: btn.offsetParent !== null };
      });
      console.log('LOGIN BUTTON INFO:', JSON.stringify(loginBtnInfo));

      await Promise.all([
        humanClick(page, '#Login'),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch((e) => {
          console.log('No navigation detected after clicking Login:', e.message);
        })
      ]);

      console.log('Login submitted.');
      await page.screenshot({ path: 'after-submit.png' });

      const diagnostics = await page.evaluate(() => {
        const errors = Array.from(document.querySelectorAll('.field-validation-error, .validation-summary-errors, span.text-danger'))
          .map(el => el.innerText.trim())
          .filter(t => t.length > 0);
        return {
          errors,
          emailVal: document.querySelector('#Email')?.value,
          companyVal: document.querySelector('#Company')?.value,
          hiddenFields: Array.from(document.querySelectorAll('input[type="hidden"]'))
            .map(el => ({ name: el.name || el.id, value: el.value }))
        };
      });
      console.log('DIAGNOSTICS:', JSON.stringify(diagnostics, null, 2));
    } else {
      console.log('Already logged in — skipping login form.');
    }

    console.log('Title:', await page.title());
    console.log('URL:', page.url());

    await browser.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    if (browser) await browser.disconnect();
    process.exit(1);
  }
})();