const puppeteer = require('puppeteer');
const fs = require('fs');

const ENDPOINT_FILE = './browser-endpoint.json';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: './chrome-profile',
    defaultViewport: null,
    args: ['--remote-debugging-port=9222']
  });

  const wsEndpoint = browser.wsEndpoint();

  fs.writeFileSync(ENDPOINT_FILE, JSON.stringify({ wsEndpoint }, null, 2));

  console.log('Browser server started.');
  console.log('WebSocket endpoint saved to browser-endpoint.json');
  console.log('This process must stay running — do not close this terminal.');

  const page = await browser.newPage();

  try {
    await page.goto('https://citymart.i21web.com/iRelyProd/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    console.log('Login page loaded (domcontentloaded).');
  } catch (err) {
    console.log('Navigation had trouble, but continuing anyway:', err.message);
    console.log('Check the Chrome window — the page may still be usable.');
  }

  console.log('\nIf not already logged in, log in manually now (solve CAPTCHA, click Login).');
  console.log('Once you reach the dashboard, this browser will stay open and ready for scripts.');
  console.log('Leave this terminal running. Press Ctrl+C only when you want to fully shut it down.');

  // Keep the process alive indefinitely, and never let an unhandled error kill it silently
  process.stdin.resume();

  process.on('uncaughtException', (err) => {
    console.log('Caught an unexpected error (server stays alive):', err.message);
  });
  process.on('unhandledRejection', (err) => {
  console.log('Caught an unhandled rejection (server stays alive):', err.message || err);
});

  process.on('SIGINT', () => {
    console.log('\nShutting down browser server...');
    if (fs.existsSync(ENDPOINT_FILE)) fs.unlinkSync(ENDPOINT_FILE);
    process.exit();
  });
})();