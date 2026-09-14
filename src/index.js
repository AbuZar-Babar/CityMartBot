const config = require('../config');
const { runBot } = require('./bot');
const { getLoggedInPage, launchBrowser } = require('./core/browser');
const session = require('./core/session');
const human = require('./core/human');

module.exports = {
  config,
  runBot,
  getLoggedInPage,
  launchBrowser,
  session,
  human
};
