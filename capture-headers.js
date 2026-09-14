require('dotenv').config();
const { getLoggedInPage } = require('./browser.js');

(async () => {
  const { page } = await getLoggedInPage();

  const client = await page.target().createCDPSession();
  await client.send('Network.enable');

  console.log('Listening for the ChangePortalEntity request...');
  console.log('In the Chrome window that opened, please manually switch companies now');
  console.log('(click the company dropdown top-right -> Change Company -> pick any company).');
  console.log('Waiting up to 60 seconds...\n');

  let found = false;

  client.on('Network.requestWillBeSent', (params) => {
    if (params.request.url.includes('ChangePortalEntity')) {
      found = true;
      console.log('=== Captured ChangePortalEntity request ===');
      console.log('URL:', params.request.url);
      console.log('Method:', params.request.method);
      console.log('Headers:', JSON.stringify(params.request.headers, null, 2));
      console.log('PostData:', params.request.postData || '(none)');
      console.log('============================================\n');
    }
  });

  const start = Date.now();
  while (Date.now() - start < 60000 && !found) {
    await new Promise(r => setTimeout(r, 500));
  }

  if (!found) {
    console.log('No ChangePortalEntity request seen in 60 seconds. Try running again and switch companies faster, or let me know if the click itself failed.');
  } else {
    console.log('Done — you can close this now (Ctrl+C).');
  }
})();