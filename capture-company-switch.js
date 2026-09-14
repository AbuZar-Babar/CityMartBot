const { getLoggedInPage } = require('./browser.js');
const fs = require('fs');

(async () => {
  const { page } = await getLoggedInPage();

  console.log('Listening on page URL:', page.url());
  console.log('If that is not the CityMart tab you plan to click in, this WILL miss everything.');

  const calls = [];

  page.on('response', async (response) => {
    const req = response.request();
    const url = req.url();
    const type = req.resourceType();

    // Skip pure static assets, keep everything else (document, xhr, fetch, script)
    if (['image', 'stylesheet', 'font', 'media'].includes(type)) return;
    // Skip the noisy build-number poll
    if (url.includes('GetLatestBuildNumber')) return;

    let body = null;
    try {
      body = await response.text();
    } catch (e) {
      body = `<could not read: ${e.message}>`;
    }

    calls.push({
      resourceType: type,
      method: req.method(),
      url,
      postData: req.postData() || null,
      status: response.status(),
      responseSnippet: body.slice(0, 2000)
    });
  });

  console.log('Listening for network calls...');
  console.log('Now manually: click "My Company" in the header, then select a different charge-up account.');
  console.log('Waiting 90 seconds for you to do that...');

  await new Promise(resolve => setTimeout(resolve, 90000));

  fs.writeFileSync('company-switch-calls.json', JSON.stringify(calls, null, 2));
  console.log(`Saved ${calls.length} network calls to company-switch-calls.json`);

  process.exit(0);
})();