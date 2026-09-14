const { getLoggedInPage } = require('./browser.js');
const fs = require('fs');

(async () => {
  const { page } = await getLoggedInPage();

  const gridCalls = [];

  page.on('response', async (res) => {
    const url = res.url();
    const method = res.request().method();
    if (url.match(/\.(js|css|png|jpg|svg|woff|ico)(\?|$)/)) return;

    try {
      const contentType = res.headers()['content-type'] || '';
      if (contentType.includes('json')) {
        const body = await res.text();
        if (body.includes('InvoiceNumber') || body.includes('InvoiceDate') || (body.includes('Invoice') && body.length > 2000)) {
          gridCalls.push({ url, method, status: res.status(), bodyPreview: body.slice(0, 2000) });
          console.log('\n>>> FOUND GRID DATA CALL:', method, url);
        }
      }
    } catch (e) {}
  });

  await page.goto('https://citymart.i21web.com/iRelyProd/#/AR/Invoice?showSearch=true&menuId=833&moduleMenuId=829', {
    waitUntil: 'networkidle2'
  });
  console.log('Navigated to Invoices screen:', await page.title());

  console.log('Waiting 8 seconds for grid data to load...');
  await new Promise(resolve => setTimeout(resolve, 8000));

  fs.writeFileSync('grid-api-calls.json', JSON.stringify(gridCalls, null, 2));
  console.log('\nSaved', gridCalls.length, 'matching calls to grid-api-calls.json');

  console.log('\nChrome will remain open.');
})();
