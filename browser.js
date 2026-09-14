const puppeteer = require('puppeteer');
const fs = require('fs');

const ENDPOINT_FILE = './browser-endpoint.json';

async function getLoggedInPage() {
  if (!fs.existsSync(ENDPOINT_FILE)) {
    throw new Error(
      'browser-endpoint.json not found. Start browser-server.js first and leave it running.'
    );
  }

  const { wsEndpoint } = JSON.parse(fs.readFileSync(ENDPOINT_FILE, 'utf8'));

  let browser;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
  } catch (err) {
    throw new Error(
      'Could not connect to browser-server.js. Is it still running? ' +
      'If it crashed or was closed, delete browser-endpoint.json and restart it. ' +
      `(Original error: ${err.message})`
    );
  }

  const pages = await browser.pages();
  const realPage = pages.find(p => p.url()!== 'about:blank');
  const page = realPage || (pages.length > 0? pages[0] : await browser.newPage());

  return { browser, page }; // browser bhi return kar rahe hain taake popup close kar saken
}

module.exports = { getLoggedInPage };