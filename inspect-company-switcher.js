const { getLoggedInPage } = require('./browser.js');
const fs = require('fs');

function randomDelay(min, max) {
  return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function humanClickHandle(page, elementHandle) {
  const box = await elementHandle.boundingBox();
  if (!box) throw new Error('Element not visible for click');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 8 });
  await randomDelay(100, 200);
  await page.mouse.down();
  await randomDelay(50, 100);
  await page.mouse.up();
  await randomDelay(200, 400);
}

async function clickByText(page, patternSource) {
  const handle = await page.evaluateHandle((patternSource) => {
    const re = new RegExp(patternSource);
    const all = Array.from(document.querySelectorAll('a, span, div, li, button'));
    const matches = all.filter(el => {
      const text = (el.innerText || '').trim();
      return text.length > 0 && text.length < 80 && re.test(text) && el.offsetParent !== null;
    });
    matches.sort((a, b) => a.innerText.length - b.innerText.length);
    return matches[0] || null;
  }, patternSource);
  const el = handle.asElement();
  if (!el) throw new Error(`Could not find element matching ${patternSource}`);
  await humanClickHandle(page, el);
}

async function clickByPlaceholder(page, placeholderText) {
  const handle = await page.evaluateHandle((placeholderText) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.find(i => i.placeholder === placeholderText && i.offsetParent !== null) || null;
  }, placeholderText);
  const el = handle.asElement();
  if (!el) throw new Error(`Could not find input with placeholder "${placeholderText}"`);
  await humanClickHandle(page, el);
}

(async () => {
  const { page } = await getLoggedInPage();

  console.log('Step 1: clicking "Charge Up" label in header...');
  await clickByText(page, 'Charge Up \\d+');
  await randomDelay(600, 900);

  console.log('Step 2: clicking "Change Company" button...');
  await clickByText(page, 'Change Company');
  await randomDelay(900, 1300);

  console.log('Step 3: dumping the modal HTML BEFORE clicking the input...');
  const modalBefore = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('*')).find(el =>
      el.innerText && el.innerText.trim().startsWith('My Company') && el.children.length < 5
    );
    const modal = heading ? heading.closest('.x-window, .x-panel, [role="dialog"], .modal') : null;
    return modal ? modal.outerHTML : 'MODAL NOT FOUND';
  });
  fs.writeFileSync('modal-before-click.html', modalBefore);
  console.log('Saved modal-before-click.html (' + modalBefore.length + ' chars)');

  console.log('Step 4: clicking the "Select Company" input...');
  await clickByPlaceholder(page, 'Select Company');
  await randomDelay(1200, 1800); // give the picker time to load/render

  console.log('Step 5: dumping the FULL page HTML after clicking (to find the dropdown list wherever it rendered)...');
  const fullHtmlAfter = await page.evaluate(() => document.body.outerHTML);
  fs.writeFileSync('page-after-click.html', fullHtmlAfter);
  console.log('Saved page-after-click.html (' + fullHtmlAfter.length + ' chars)');

  // Also take a screenshot for visual confirmation
  await page.screenshot({ path: 'company-picker-open.png' });
  console.log('Saved company-picker-open.png');

  console.log('\nDone. Chrome remains open — please check the 3 saved files.');
  console.log('If page-after-click.html is huge, search it for "Charge Up 102" to find the surrounding markup.');
})();