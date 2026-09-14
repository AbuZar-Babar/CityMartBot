const config = require('../../config');
const { randomDelay, humanClick, humanType } = require('../core/human');
const { pauseForHuman } = require('../core/prompt');

const readline = require('readline');

async function isDashboardReached(page) {
  try {
    if (page.isClosed()) return false;
    const url = (page.url() || '').toLowerCase();
    if (!url.includes('citymart.i21web.com')) return false;
    const emailField = await page.$('#Email').catch(() => null);
    return !url.includes('login') && !emailField;
  } catch (e) {
    return false;
  }
}

async function waitForDashboard(page, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await isDashboardReached(page)) {
        return true;
      }
    } catch (e) {
      // Page might be navigating
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function clickLoginButton(page) {
  console.log('Locating and clicking the Login button...');
  
  // 1. Try common login button selectors
  const buttonSelectors = ['#Login', 'button[type="submit"]', 'input[type="submit"]', '.btn-login', 'button.btn-primary'];
  for (const selector of buttonSelectors) {
    const el = await page.$(selector).catch(() => null);
    if (el) {
      const box = await el.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        console.log(`Found login button via selector "${selector}". Dispatching mouse click...`);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        return true;
      }
    }
  }

  // 2. Try searching by text content "Login" or "Sign In"
  const handle = await page.evaluateHandle(() => {
    const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a, div'));
    return candidates.find(el => {
      if (el.offsetParent === null) return false;
      const text = (el.innerText || el.value || el.textContent || '').trim().toLowerCase();
      return text === 'login' || text === 'log in' || text === 'sign in';
    }) || null;
  });

  const el = handle.asElement();
  if (el) {
    const box = await el.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      console.log(`Found login button via text content. Dispatching mouse click...`);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await handle.dispose();
      return true;
    }
    await handle.dispose();
  }

  // 3. Fallback: evaluate click
  const evalClicked = await page.evaluate(() => {
    const btn = document.querySelector('#Login') || 
                document.querySelector('button[type="submit"]') || 
                document.querySelector('input[type="submit"]') ||
                [...document.querySelectorAll('button, input, a')].find(el => (el.innerText || el.value || '').trim().toLowerCase() === 'login');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  if (evalClicked) {
    console.log('Clicked login button via DOM click()');
    return true;
  }

  // 4. Press Enter on focused field
  console.log('Pressing Enter key on page...');
  await page.keyboard.press('Enter');
  return true;
}

async function ensureLoggedIn(page) {
  if (await isDashboardReached(page)) {
    console.log('Already authenticated on dashboard.');
    return true;
  }

  // Wait for login elements to appear
  console.log('Waiting for login form to render in Chrome...');
  await page.waitForSelector('#Login, input[type="submit"], button[type="submit"], #Email', { timeout: 15000 }).catch(() => null);
  await randomDelay(800, 1500); // Give password manager a moment to autofill

  // Check if fields are already prefilled
  const fieldValues = await page.evaluate(() => ({
    email: document.querySelector('#Email')?.value || '',
    password: document.querySelector('#Password')?.value || '',
    company: document.querySelector('#Company')?.value || ''
  }));

  const emailPrefilled = fieldValues.email.trim().length > 0;
  const passwordPrefilled = fieldValues.password.trim().length > 0;

  if (emailPrefilled && passwordPrefilled) {
    console.log('Login credentials are ALREADY pre-filled by browser. Skipping re-typing.');
  } else {
    // Only fill fields if they are empty and credentials exist in .env
    const email = config.CREDENTIALS.username;
    const password = config.CREDENTIALS.password;
    const company = config.CREDENTIALS.company;

    if (!emailPrefilled && email) {
      console.log('Typing email into #Email...');
      await humanClick(page, '#Email');
      await humanType(page, '#Email', email);
      await randomDelay(200, 400);
    }

    if (!passwordPrefilled && password) {
      console.log('Typing password into #Password...');
      await humanClick(page, '#Password');
      await humanType(page, '#Password', password);
      await randomDelay(200, 400);
    }

    if (!fieldValues.company && company) {
      const companyField = await page.$('#Company');
      if (companyField) {
        console.log('Typing company into #Company...');
        await humanClick(page, '#Company');
        await humanType(page, '#Company', company);
        await randomDelay(800, 1200);

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
    }
  }

  await randomDelay(400, 800);

  // Click the login button
  console.log('Submitting login...');
  await Promise.all([
    clickLoginButton(page),
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
  ]);

  console.log('\nLogin submitted.');
  console.log('If a CAPTCHA appears, please solve it in the Chrome window.');
  console.log('Waiting for portal dashboard to load...');

  const reached = await waitForDashboard(page, 90000);
  if (!reached) {
    console.log('\n===============================================================');
    console.log(' [ACTION REQUIRED] Please complete login in the Chrome window.');
    console.log(' - The bot will automatically continue once dashboard loads!');
    console.log('===============================================================\n');

    const manualReached = await waitForDashboard(page, 180000);
    if (!manualReached) {
      throw new Error('Timed out waiting for dashboard. Please check the Chrome window.');
    }
  }

  console.log('\n[SUCCESS] Login verified! Dashboard reached.\n');
  return true;
}

module.exports = {
  isDashboardReached,
  waitForDashboard,
  ensureLoggedIn
};
