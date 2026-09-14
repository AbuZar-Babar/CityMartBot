require('dotenv').config();
const { getLoggedInPage } = require('./browser.js');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------
// DIAGNOSTIC TOOL — run this manually while the Search Invoices grid is
// already open in the browser (with at least one invoice row visible).
//
// It does NOT guess selectors. It captures:
//   1. The real outerHTML of the grid rows (so we can see the actual
//      tag names, classes, and attributes instead of guessing).
//   2. Every network request fired in the 8 seconds after we double-click
//      a row (so we can see whether the click triggers any request at
//      all, and what URL/endpoint it hits if it does).
//   3. A screenshot immediately after the double-click.
//
// Run it with:  node diagnose-invoice-row.js
// Then send back the contents of:
//   debug/grid-rows-dump.html
//   debug/network-after-doubleclick.json
//   debug/diagnose-after-click.png
// ---------------------------------------------------------------------

(async () => {
  const { page } = await getLoggedInPage();
  fs.mkdirSync('debug', { recursive: true });

  const gridPresent = await page.evaluate(() => document.body.innerText.includes('Search Invoices'));
  if (!gridPresent) {
    console.log('The "Search Invoices" grid does not appear to be open right now.');
    console.log('Please navigate to Invoices in the browser first, make sure at least');
    console.log('one invoice row is visible, then re-run this script.');
    process.exit(1);
  }

  // 1. Dump the real outerHTML of the first few visible rows.
  const gridDump = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.x-grid-row, [role="row"], tr')]
      .filter(r => r.offsetParent !== null)
      .slice(0, 6);
    return rows.map(r => r.outerHTML);
  });
  fs.writeFileSync(
    path.resolve('debug/grid-rows-dump.html'),
    gridDump.join('\n\n<!-- ====== NEXT ROW ====== -->\n\n')
  );
 console.log(`Saved debug/grid-rows-dump.html with ${gridDump.length} row(s).`);

  // 2. Find the first row that looks like an invoice row and grab its
  //    bounding box directly from the live DOM (not a guessed selector).
  const rowInfo = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.x-grid-row, [role="row"], tr')]
      .find(r => r.offsetParent !== null && /\b[A-Z]{1,4}-[\dA-Z-]+\d/.test(r.textContent));
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return {
      tag: row.tagName,
      className: row.className,
      html: row.outerHTML.slice(0, 3000),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
  });

  if (!rowInfo) {
    console.log('Could not find any row matching an invoice-number pattern. Aborting.');
    process.exit(1);
  }

    console.log('\n--- First matching row (before scroll) ---');
  console.log('tag:', rowInfo.tag);
  console.log('class:', rowInfo.className);
  console.log('bounding box (stale):', rowInfo.rect);

  // Scroll the row into view, then re-measure — the first bounding box
  // was captured without ensuring the row is actually on-screen.
  await page.evaluate((rect) => {
    const els = [...document.querySelectorAll('.x-grid-row, [role="row"], tr')];
    // no-op placeholder; real re-query happens below
  }, rowInfo.rect);

  const rowInfoFresh = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr.x-grid-row')]
      .find(r => r.offsetParent !== null && /\b[A-Z]{1,4}-[\dA-Z-]+\d/.test(r.textContent));
    if (!row) return null;
    row.scrollIntoView({ block: 'center' });
    return true;
  });
  await new Promise(r => setTimeout(r, 400));

  const rowInfo2 = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr.x-grid-row')]
      .find(r => r.offsetParent !== null && /\b[A-Z]{1,4}-[\dA-Z-]+\d/.test(r.textContent));
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return { tag: row.tagName, className: row.className, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  });

  console.log('bounding box (after scrollIntoView):', rowInfo2.rect);
  const rowInfoToUse = rowInfo2;
  // 3. Start capturing network requests BEFORE we click, so we don't
  //    miss anything fired immediately.
  const requests = [];
  const onRequest = (req) => requests.push({ url: req.url(), method: req.method(), resourceType: req.resourceType() });
  page.on('request', onRequest);

  // 4. Real double-click at the row's actual center coordinates.
  const x = rowInfoToUse.rect.x + rowInfoToUse.rect.width / 2;
  const y = rowInfoToUse.rect.y + rowInfoToUse.rect.height / 2;
  console.log(`\nDouble-clicking at (${x.toFixed(0)}, ${y.toFixed(0)})...`);
  await page.mouse.move(x - 10, y - 5, { steps: 5 });
  await new Promise(r => setTimeout(r, 150));
  await page.mouse.move(x, y, { steps: 5 });
  await new Promise(r => setTimeout(r, 150));
  await page.mouse.click(x, y, { clickCount: 2, delay: 80 });

  // 5. Wait 8 seconds, watching for any network activity or DOM change.
  await new Promise(r => setTimeout(r, 8000));
  page.off('request', onRequest);

  fs.writeFileSync(
    path.resolve('debug/network-after-doubleclick.json'),
    JSON.stringify(requests, null, 2)
  );
 console.log(`\nSaved debug/network-after-doubleclick.json — ${requests.length} request(s) captured.`);

   const bodyTextAfter = await page.evaluate(() => document.body.innerText.slice(0, 800));
  console.log('\n--- Page text sample 8s after double-click ---');
  console.log(bodyTextAfter);

  // Check every frame for "Report Viewer" text to confirm it's inside an iframe.
  const frames = page.frames();
  console.log(`\n--- Found ${frames.length} frame(s) on the page ---`);
  for (const frame of frames) {
    try {
      const hasText = await frame.evaluate(() => document.body && document.body.innerText.includes('Report Viewer'));
      console.log(`  frame url: ${frame.url()} | has "Report Viewer": ${hasText}`);
    } catch (err) {
      console.log(`  frame url: ${frame.url()} | could not evaluate: ${err.message}`);
    }
  }

  await page.screenshot({ path: path.resolve('debug/diagnose-after-click.png'), fullPage: true });
  console.log('\nSaved debug/diagnose-after-click.png');

  console.log('\nDone. Please send back:');
  console.log('  1. debug/grid-rows-dump.html (or just paste its content)');
  console.log('  2. debug/network-after-doubleclick.json');
  console.log('  3. debug/diagnose-after-click.png');
})();