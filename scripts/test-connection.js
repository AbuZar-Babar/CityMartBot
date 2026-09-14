const { launchBrowser } = require('../src/core/browser');

(async () => {
  console.log('Testing Puppeteer & Chrome launching...');

  try {
    const browser = await launchBrowser({ headless: false });
    const page = await browser.newPage();
    await page.goto('https://example.com');

    console.log('Successfully navigated to example.com!');
    console.log('Page Title:', await page.title());

    await browser.close();
    console.log('Test completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
})();
