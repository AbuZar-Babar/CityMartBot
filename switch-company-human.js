// lib/switch-company-human.js
//
// Clicks the "Companies" typeahead box (#txtPortalEntity) the same way a
// person would: focus it, clear it, type the name character by character,
// wait for the suggestion dropdown, click the matching suggestion.
// This replaces the raw ChangePortalEntity API call, which was returning
// 500 because the real <select> is commented out of the page and the
// server expects the fuller payload that only the typeahead-click flow sends.

async function humanType(page, selector, text) {
  await page.click(selector, { clickCount: 3 }); // select any existing text
  await page.keyboard.press('Backspace');
  for (const ch of text) {
    await page.type(selector, ch, { delay: 60 + Math.random() * 90 });
  }
}

async function switchCompanyHuman(page, companyName) {
  await page.waitForSelector('#txtPortalEntity', { visible: true, timeout: 10000 });

  await humanType(page, '#txtPortalEntity', companyName);

  // Wait for the twitter-typeahead suggestion menu to actually populate.
  await page.waitForFunction(
    () => {
      const menu = document.querySelector('.tt-dataset-portal-entity-dataset');
      return menu && menu.querySelectorAll('.tt-suggestion').length > 0;
    },
    { timeout: 8000 }
  );

  // Click the suggestion whose text matches what we typed (exact match
  // first, falling back to "starts with" in case of formatting differences).
  const clicked = await page.evaluate((name) => {
    const suggestions = Array.from(
      document.querySelectorAll('.tt-dataset-portal-entity-dataset .tt-suggestion')
    );
    let match = suggestions.find(el => el.textContent.trim() === name);
    if (!match) match = suggestions.find(el => el.textContent.trim().startsWith(name));
    if (match) { match.click(); return match.textContent.trim(); }
    return null;
  }, companyName);

  if (!clicked) {
    throw new Error(`No matching suggestion found for "${companyName}" in the Companies typeahead.`);
  }

  // Switching company reloads the app shell, so wait for that.
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {
    // Some builds swap content via AJAX instead of a full navigation —
    // if no navigation event fires, just give the UI a moment to settle.
  });
  await new Promise(r => setTimeout(r, 1500));

  return clicked;
}

module.exports = { switchCompanyHuman };
