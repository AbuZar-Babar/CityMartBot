const { getLoggedInPage } = require('./browser.js');
const fs = require('fs');

(async () => {
  const { page } = await getLoggedInPage();

  const matches = [];

  page.on('response', async (res) => {
    const url = res.url();
    const contentType = res.headers()['content-type'] || '';
    if (
      url.toLowerCase().includes('pdf') ||
      url.toLowerCase().includes('print') ||
      url.toLowerCase().includes('report') ||
      contentType.includes('pdf')
    ) {
      console.log('\n>>> POSSIBLE PDF/PRINT CALL:', res.request().method(), url, '| content-type:', contentType);
      matches.push({ url, method: res.request().method(), contentType, status: res.status() });
      fs.writeFileSync('pdf-related-calls.json', JSON.stringify(matches, null, 2));
    }
  });

  await page.goto('https://citymart.i21web.com/iRelyProd/#/AR/Invoice?showSearch=true&menuId=833&moduleMenuId=829', {
    waitUntil: 'networkidle2'
  });

  console.log('Ready. In the Chrome window, please:');
  console.log('1. Double-click any row where Type = "Invoice" (not Credit Memo) to open it');
  console.log('2. Look for a Print, Export, or PDF button/icon and click it');
  console.log('3. Watch this terminal for ">>> POSSIBLE PDF/PRINT CALL" lines');
  console.log('\nThis script will keep watching for 90 seconds...');

  await new Promise(resolve => setTimeout(resolve, 90000));

  console.log('\nDone watching. Found', matches.length, 'matching calls. Check pdf-related-calls.json');
})();
