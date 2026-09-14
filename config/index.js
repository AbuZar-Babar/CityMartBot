require('dotenv').config();
const path = require('path');
const { getChromePath } = require('./chrome.js');

const ROOT_DIR = path.resolve(__dirname, '..');

module.exports = {
  PORTAL_URL: process.env.PORTAL_URL || 'https://citymart.i21web.com/iRelyProd/',
  LOGIN_URL: process.env.LOGIN_URL || 'https://citymart.i21web.com/iRelyProd/login',
  INVOICE_SEARCH_URL: process.env.INVOICE_SEARCH_URL || 'https://citymart.i21web.com/iRelyProd/#/AR/Invoice?showSearch=true&menuId=833&moduleMenuId=829',

  CREDENTIALS: {
    username: process.env.CITYMART_USERNAME || '',
    password: process.env.CITYMART_PASSWORD || '',
    company: process.env.CITYMART_COMPANY || 'Charge Up 101'
  },

  SCRAPER: {
    latestInvoicesPerCompany: parseInt(process.env.LATEST_INVOICES_PER_COMPANY || '10', 10),
    downloadTimeoutMs: parseInt(process.env.DOWNLOAD_TIMEOUT_MS || '25000', 10),
    navigationTimeoutMs: parseInt(process.env.NAV_TIMEOUT_MS || '30000', 10)
  },

  PATHS: {
    root: ROOT_DIR,
    config: path.join(ROOT_DIR, 'config'),
    data: path.join(ROOT_DIR, 'data'),
    debug: path.join(ROOT_DIR, 'debug'),
    output: path.join(ROOT_DIR, 'CityMart-Invoices'),
    tmpDownloads: path.join(ROOT_DIR, 'pdf-downloads-tmp'),
    chromeProfile: path.join(ROOT_DIR, 'chrome-profile'),
    endpointFile: path.join(ROOT_DIR, 'browser-endpoint.json'),
    companiesFile: path.join(ROOT_DIR, 'config', 'companies.json'),
    processedInvoicesFile: path.join(ROOT_DIR, 'data', 'processed-invoices.json'),
    runSummaryFile: path.join(ROOT_DIR, 'data', 'run-summary.json'),
    sessionFile: path.join(ROOT_DIR, 'data', 'session.json')
  },

  CHROME_PATH: getChromePath()
};
