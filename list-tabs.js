const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const { wsEndpoint } = JSON.parse(fs.readFileSync('./browser-endpoint.json', 'utf8'));
  const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });

  const pages = await browser.pages();
  console.log(`Found ${pages.length} open tab(s):`);

  for (let i = 0; i < pages.length; i++) {
    const title = await pages[i].title();
    const url = pages[i].url();
    console.log(`[${i}] Title: "${title}" | URL: ${url}`);
  }

  await browser.disconnect();
  process.exit(0);
})();