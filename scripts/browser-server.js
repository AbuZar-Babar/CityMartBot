const fs = require('fs');
const config = require('../config');
const { launchBrowser } = require('../src/core/browser');

(async () => {
  console.log('Starting persistent browser server...');

  const browser = await launchBrowser();
  const wsEndpoint = browser.wsEndpoint();

  fs.writeFileSync(config.PATHS.endpointFile, JSON.stringify({ wsEndpoint }, null, 2));

  console.log('Browser server started successfully.');
  console.log(`WebSocket endpoint saved to: ${config.PATHS.endpointFile}`);
  console.log('This process must stay running — do not close this terminal.');

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  try {
    await page.goto(config.LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    console.log('Portal login page loaded.');
  } catch (err) {
    console.log('Navigation notice (browser still usable):', err.message);
  }

  console.log('\nIf not already logged in, log in manually or run: npm run login');
  console.log('Leave this process running. Press Ctrl+C when you want to fully stop.');

  process.stdin.resume();

  process.on('uncaughtException', (err) => {
    console.log('Recovered from error (server staying alive):', err.message);
  });

  process.on('unhandledRejection', (err) => {
    console.log('Recovered from rejection (server staying alive):', err.message || err);
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down browser server...');
    if (fs.existsSync(config.PATHS.endpointFile)) {
      fs.unlinkSync(config.PATHS.endpointFile);
    }
    process.exit();
  });
})();
