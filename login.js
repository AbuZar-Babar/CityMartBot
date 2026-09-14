
const { getLoggedInPage } = require('./browser.js');

(async () => {
  try {
       const { browser, page } = await getLoggedInPage();
    console.log('Title:', await page.title());
    console.log('URL:', page.url());

    await browser.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Failed to get logged-in page:', err.message);
    process.exit(1);
  }
})();