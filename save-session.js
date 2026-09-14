const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    defaultViewport: null
  });

  const page = await browser.newPage();
  await page.goto('https://citymart.i21web.com/iRelyProd/login');

  console.log('Please log in manually in the Chrome window (including the CAPTCHA).');
  console.log('Once you reach the dashboard, come back here and press Enter.');

  await new Promise(resolve => process.stdin.once('data', resolve));

  const cookies = await page.cookies();
  require('fs').writeFileSync('session.json', JSON.stringify(cookies, null, 2));
  console.log('Session saved to session.json');

  await browser.close();
})();