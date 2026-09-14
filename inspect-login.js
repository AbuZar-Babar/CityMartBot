const { getLoggedInPage } = require('./browser.js');

(async () => {
  try {
    const { browser, page } = await getLoggedInPage();

    const fields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, button'));
      return inputs.map(el => ({
        tag: el.tagName,
        type: el.type || null,
        id: el.id || null,
        name: el.name || null,
        placeholder: el.placeholder || null,
        text: el.innerText || el.value || null
      }));
    });

    console.log(JSON.stringify(fields, null, 2));

    await browser.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
})();
