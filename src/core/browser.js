const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

/**
 * Connects to a running Chrome instance.
 * Automatically tries:
 * 1. Direct connection to http://127.0.0.1:9222 (works if user started Chrome with --remote-debugging-port=9222)
 * 2. browser-endpoint.json (written by browser-server.js)
 */
async function getLoggedInPage() {
  let browser;

  // 1. Try connecting directly via standard Chrome debugging port 9222
  try {
    browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null
    });
  } catch (directErr) {
    // 2. Fall back to browser-endpoint.json if available
    const endpointFile = config.PATHS.endpointFile;
    if (fs.existsSync(endpointFile)) {
      try {
        const { wsEndpoint } = JSON.parse(fs.readFileSync(endpointFile, 'utf8'));
        browser = await puppeteer.connect({
          browserWSEndpoint: wsEndpoint,
          defaultViewport: null
        });
      } catch (wsErr) {
        // failed both
      }
    }
  }

  if (!browser) {
    console.log('Chrome is not running on port 9222.');
    console.log('Automatically launching Google Chrome with your profile...');
    browser = await launchBrowser();
    const wsEndpoint = browser.wsEndpoint();
    fs.writeFileSync(config.PATHS.endpointFile, JSON.stringify({ wsEndpoint }, null, 2));

    const pages = await browser.pages();
    let citymartPage = pages.find((p) => (p.url() || '').includes('citymart.i21web.com'));
    let page = citymartPage || pages[0] || (await browser.newPage());

    await page.bringToFront();

    if (!citymartPage || page.url() === 'about:blank') {
      console.log(`Navigating tab to CityMart: ${config.LOGIN_URL}...`);
      try {
        await page.goto(config.LOGIN_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        console.log('Opened CityMart login page in Chrome.');
      } catch (e) {
        console.error('Navigation notice:', e.message);
      }
    }

    return { browser, page, newlyLaunched: true };
  }

  const pages = await browser.pages();

  // Find a tab already on the CityMart portal, or pick the first active tab
  let citymartPage = pages.find((p) => (p.url() || '').includes('citymart.i21web.com'));
  let page = citymartPage || pages.find((p) => p.url() !== 'about:blank') || (pages.length > 0 ? pages[0] : await browser.newPage());

  await page.bringToFront();

  if (!citymartPage || page.url() === 'about:blank') {
    console.log(`Navigating tab to CityMart: ${config.LOGIN_URL}...`);
    try {
      await page.goto(config.LOGIN_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      console.log('Opened CityMart portal in Chrome tab.');
    } catch (e) {
      console.error('Navigation notice:', e.message);
    }
  }

  return { browser, page, newlyLaunched: false };
}

/**
 * Launches Chrome using the persistent project profile with direct URL navigation.
 */
async function launchBrowser(options = {}) {
  const profileDir = options.userDataDir || config.PATHS.chromeProfile;
  const chromeExe = config.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const targetUrl = config.LOGIN_URL || 'https://citymart.i21web.com/iRelyProd/login';

  console.log('================================================================');
  console.log('[BROWSER LAUNCH CONFIG]');
  console.log(`1. Persistent Profile Directory : ${profileDir}`);
  console.log(`2. Chrome Executable            : ${chromeExe}`);
  console.log(`3. Target URL                   : ${targetUrl}`);
  console.log('================================================================');

  const launchOptions = {
    headless: false,
    executablePath: chromeExe,
    userDataDir: profileDir,
    defaultViewport: null,
    args: [
      targetUrl,
      '--start-maximized',
      '--disable-session-crashed-bubble',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check'
    ],
    ...options
  };

  return await puppeteer.launch(launchOptions);
}

module.exports = {
  getLoggedInPage,
  launchBrowser
};
