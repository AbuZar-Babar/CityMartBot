require('dotenv').config();
const { getLoggedInPage } = require('./browser.js');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------
// Human-like mouse helpers (same approach as auto-login.js's humanClick)
// ---------------------------------------------------------------------

function randomDelay(min, max) {
  return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
}

async function humanClickHandle(page, handle) {
  const el = handle.asElement ? handle.asElement() : handle;
  if (!el) return false;

  await page.evaluate(el => el.scrollIntoView({ block: 'center' }), el);
  await randomDelay(150, 300);

  const box = await el.boundingBox();
  if (!box) return false;

  const x = box.x + box.width / 2 + (Math.random() * 6 - 3);
  const y = box.y + box.height / 2 + (Math.random() * 6 - 3);

  await page.mouse.move(x - 20, y - 10, { steps: 5 });
  await randomDelay(80, 180);
  await page.mouse.move(x, y, { steps: 10 });
  await randomDelay(100, 250);
  await page.mouse.down();
  await randomDelay(50, 120);
  await page.mouse.up();
  await randomDelay(150, 350);
  return true;
}

async function humanDoubleClickHandle(page, handle) {
  const el = handle.asElement ? handle.asElement() : handle;
  if (!el) return false;

  await page.evaluate(el => el.scrollIntoView({ block: 'center' }), el);
  await randomDelay(150, 300);

  const box = await el.boundingBox();
  if (!box) return false;

  const x = box.x + box.width / 2 + (Math.random() * 6 - 3);
  const y = box.y + box.height / 2 + (Math.random() * 6 - 3);

  await page.mouse.move(x - 20, y - 10, { steps: 5 });
  await randomDelay(80, 150);
  await page.mouse.move(x, y, { steps: 8 });
  await randomDelay(80, 150);

  await page.mouse.down();
  await randomDelay(40, 90);
  await page.mouse.up();
  await randomDelay(80, 150);

  await page.mouse.down();
  await randomDelay(40, 90);
  await page.mouse.up();
  await randomDelay(150, 300);
  return true;
}

async function humanClickTopmostByText(page, text, { exact = false, timeoutMs = 10000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((text, exact) => {
      const tags = ['div', 'span', 'button', 'a', 'li', 'td'];
      const nodes = document.querySelectorAll(tags.join(','));
      let best = null;
      let bestTop = Infinity;
      for (const el of nodes) {
        if (el.offsetParent === null) continue;
        const t = (el.textContent || '').trim();
        const title = el.getAttribute('title') || '';
        const aria = el.getAttribute('aria-label') || '';
        const hit = exact
          ? (t === text || title === text || aria === text)
          : (t.includes(text) || title.includes(text) || aria.includes(text));
        if (!hit) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < bestTop) {
          bestTop = rect.top;
          best = el;
        }
      }
      return best;
    }, text, exact);

    const el = handle.asElement();
    if (el) {
      const clicked = await humanClickHandle(page, handle);
      await handle.dispose();
      if (clicked) return true;
    } else {
      await handle.dispose();
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function humanClickByText(page, text, { exact = false, timeoutMs = 10000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((text, exact) => {
      const tags = ['div', 'span', 'button', 'a', 'li', 'td'];
      const nodes = document.querySelectorAll(tags.join(','));
      for (const el of nodes) {
        if (el.offsetParent === null) continue;
        const t = (el.textContent || '').trim();
        const title = el.getAttribute('title') || '';
        const aria = el.getAttribute('aria-label') || '';
        const hit = exact
          ? (t === text || title === text || aria === text)
          : (t.includes(text) || title.includes(text) || aria.includes(text));
        if (hit) return el;
      }
      return null;
    }, text, exact);

    const el = handle.asElement();
    if (el) {
      const clicked = await humanClickHandle(page, handle);
      await handle.dispose();
      if (clicked) return true;
    } else {
      await handle.dispose();
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function humanClickByTagAndText(page, tagNames, text, { exact = true, timeoutMs = 10000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((tagNames, text, exact) => {
      const nodes = document.querySelectorAll(tagNames.join(','));
      for (const el of nodes) {
        if (el.offsetParent === null) continue;
        const t = (el.textContent || '').trim();
        const hit = exact ? t === text : t.includes(text);
        if (hit) return el;
      }
      return null;
    }, tagNames, text, exact);

    const el = handle.asElement();
    if (el) {
      const clicked = await humanClickHandle(page, handle);
      await handle.dispose();
      if (clicked) return true;
    } else {
      await handle.dispose();
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function isProfileDropdownOpen(page) {
  return page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    return links.some(el => (el.textContent || '').trim() === 'Change Company' && el.offsetParent !== null);
  });
}

async function openCompanyProfileDropdown(page, companyLabelText, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isProfileDropdownOpen(page)) return true;

    const clicked = await humanClickTopmostByText(page, companyLabelText, { exact: true, timeoutMs: 3000 });
    if (!clicked) {
      await new Promise(r => setTimeout(r, 300));
      continue;
    }
    await randomDelay(400, 700);

    if (await isProfileDropdownOpen(page)) return true;
  }
  return isProfileDropdownOpen(page);
}

// ---------------------------------------------------------------------
// Modal-scoped helpers
// ---------------------------------------------------------------------

async function waitForModalVisible(page, selector, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const visible = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }, selector);
    if (visible) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function getVisibleHandleBySelector(page, selector, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const rect = el.getBoundingClientRect();
      return (rect.width > 0 && rect.height > 0) ? el : null;
    }, selector);
    const el = handle.asElement();
    if (el) return handle;
    await handle.dispose();
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

const PORTAL_ENTITY_MODAL_SELECTOR = '#portalEntity';

async function closeStrayPortalEntityModal(page, timeoutMs = 6000) {
  const isOpen = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, PORTAL_ENTITY_MODAL_SELECTOR);
  if (!isOpen) return true;

  const clickedCancel = await humanClickByTagAndText(page, ['button', 'a'], 'Cancel', { exact: true, timeoutMs: 2000 });
  if (!clickedCancel) {
    await page.evaluate((selector) => {
      const btn = document.querySelector(`${selector} .close, ${selector} [data-dismiss="modal"]`);
      if (btn) btn.click();
    }, PORTAL_ENTITY_MODAL_SELECTOR);
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const stillOpen = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }, PORTAL_ENTITY_MODAL_SELECTOR);
    if (!stillOpen) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function humanClickWithinContainer(page, containerHandle, text, { exact = false, timeoutMs = 10000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((container, text, exact) => {
      const tags = ['div', 'span', 'button', 'a', 'li', 'td', 'input'];
      const nodes = container.querySelectorAll(tags.join(','));
      for (const el of nodes) {
        if (el.offsetParent === null) continue;
        const t = (el.textContent || el.value || '').trim();
        const title = el.getAttribute('title') || '';
        const aria = el.getAttribute('aria-label') || '';
        const hit = exact
          ? (t === text || title === text || aria === text)
          : (t.includes(text) || title.includes(text) || aria.includes(text));
        if (hit) return el;
      }
      return null;
    }, containerHandle, text, exact);

    const el = handle.asElement();
    if (el) {
      const clicked = await humanClickHandle(page, handle);
      await handle.dispose();
      if (clicked) return true;
    } else {
      await handle.dispose();
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function findCompanyFieldWithinContainer(page, containerHandle, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((container) => {
      const pattern = /Charge Up \d+\s*-\s*\d+/;

      // Prefer an actual <input> — some widgets show the selected value in
      // a separate read-only div/span layered on top of the real editable
      // input. Backspace/typing on the display element does nothing, which
      // silently breaks clearing and typing without any error.
      const inputs = [...container.querySelectorAll('input')].filter(el => el.offsetParent !== null);
      const matchingInput = inputs.find(el => pattern.test((el.value || '').trim()));
      if (matchingInput) return matchingInput;
      if (inputs.length === 1) return inputs[0];
      if (inputs.length > 1) return inputs[0]; // best guess if several

      // Fall back to the old behaviour only if there's truly no input.
      const nodes = container.querySelectorAll('div, span');
      for (const el of nodes) {
        if (el.offsetParent === null) continue;
        const t = (el.textContent || '').trim();
        if (pattern.test(t)) return el;
      }
      return null;
    }, containerHandle);

    const el = handle.asElement();
    if (el) return handle;
    await handle.dispose();
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

// Reads whatever the field's raw current text is, WITHOUT requiring it to
// match the "Charge Up ### - ###" pattern — needed because once we start
// clearing/typing, the value no longer looks like that pattern, so a
// pattern-based reader would just fail to find anything.
async function readRawFieldValue(page, fieldHandle) {
  const el = fieldHandle.asElement ? fieldHandle.asElement() : fieldHandle;
  return page.evaluate(el => (el.value !== undefined ? el.value : el.textContent) || '', el);
}

// Locates the company field ONCE, while it still shows the old
// "Charge Up ### - ###" text, and hands back a handle the caller keeps
// reusing for clear/type/read for the rest of this switch attempt.
// Re-locating by pattern after the text has been edited was the root
// cause of the garbled-digits bug: once the value stops matching the
// pattern, the old lookup silently fell back to "first visible input in
// the container", which isn't guaranteed to be the same element.
async function locateCompanyField(page, containerHandle) {
  return findCompanyFieldWithinContainer(page, containerHandle);
}

// Clicks into the field and forcibly empties it, VERIFYING it's actually
// empty afterward rather than trusting a fixed number of backspaces.
// Selects the full line explicitly (End, then Shift+Home) instead of
// relying on triple-click, since triple-click on this widget was only
// grabbing part of the text (e.g. just "101"), which is what let most of
// the original string survive.
async function robustClearField(page, fieldHandle, maxAttempts = 25) {
  const el = fieldHandle.asElement ? fieldHandle.asElement() : fieldHandle;

  await page.evaluate(el => el.scrollIntoView({ block: 'center' }), el);
  await randomDelay(150, 300);

  const box = await el.boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2 + (Math.random() * 4 - 2);
  const y = box.y + box.height / 2 + (Math.random() * 4 - 2);

  await page.mouse.move(x - 15, y - 5, { steps: 5 });
  await randomDelay(80, 150);
  await page.mouse.move(x, y, { steps: 6 });
  await randomDelay(80, 150);
  await page.mouse.click(x, y);
  await randomDelay(150, 300);

  await page.keyboard.press('End');
  await randomDelay(40, 80);
  await page.keyboard.down('Shift');
  await page.keyboard.press('Home');
  await page.keyboard.up('Shift');
  await randomDelay(80, 150);
  await page.keyboard.press('Backspace');
  await randomDelay(100, 200);

  for (let i = 0; i < maxAttempts; i++) {
    const current = await readRawFieldValue(page, fieldHandle);
    if (!current || current.trim() === '') return true;
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    await randomDelay(30, 70);
  }

  let finalValue = await readRawFieldValue(page, fieldHandle);
  if (finalValue && finalValue.trim() !== '') {
    // Backspace/Delete key-presses aren't budging it — this is the
    // signature of typing/deleting into a field the app's own JS isn't
    // listening to the way we expect (or a read-only display node).
    // Force it empty directly at the DOM level and fire the events the
    // framework would normally listen for, as a guaranteed fallback
    // rather than giving up.
    await page.evaluate((el) => {
      if (el.value !== undefined) {
        el.value = '';
      } else {
        el.textContent = '';
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }, el);
    await randomDelay(150, 300);
    finalValue = await readRawFieldValue(page, fieldHandle);
  }

  return !finalValue || finalValue.trim() === '';
}

// Kept for backward compatibility with the rest of the file's call sites
// that expect a "clear the field" step scoped to the container.
async function clearCompanyFieldWithinContainer(page, containerHandle) {
  const fieldHandle = await locateCompanyField(page, containerHandle);
  if (!fieldHandle) return false;
  try {
    return await robustClearField(page, fieldHandle);
  } finally {
    await fieldHandle.dispose();
  }
}

async function humanClickCompanyFieldWithinContainer(page, containerHandle, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((container) => {
      const nodes = container.querySelectorAll('input, div, span');
      const pattern = /Charge Up \d+\s*-\s*\d+/;
      for (const el of nodes) {
        if (el.offsetParent === null) continue;
        const t = (el.value || el.textContent || '').trim();
        if (pattern.test(t)) return el;
      }
      const firstInput = [...container.querySelectorAll('input')].find(el => el.offsetParent !== null);
      return firstInput || null;
    }, containerHandle);

    const el = handle.asElement();
    if (el) {
      const clicked = await humanClickHandle(page, handle);
      await handle.dispose();
      if (clicked) return true;
    } else {
      await handle.dispose();
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

// ---------------------------------------------------------------------
// NEW: type into the company field to FILTER the list, instead of
// relying on the raw list already showing the target row. The dropdown
// is virtualized/paginated — it only renders ~4 rows at a time, so
// scanning the DOM for text past those 4 will time out even though the
// company genuinely exists further down. Typing the account number
// makes the widget filter down to the matching row(s), the same way a
// person would type to narrow a combobox instead of scrolling forever.
// ---------------------------------------------------------------------
// Types into an ALREADY-LOCATED field handle (caller passes the same
// handle it got from locateCompanyField, rather than us re-finding the
// field by pattern — which breaks the moment the value stops looking
// like "Charge Up ### - ###").
async function typeIntoField(page, fieldHandle, text) {
  const el = fieldHandle.asElement ? fieldHandle.asElement() : fieldHandle;
  await page.evaluate(el => el.scrollIntoView({ block: 'center' }), el);
  await randomDelay(120, 250);

  const box = await el.boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2 + (Math.random() * 4 - 2);
  const y = box.y + box.height / 2 + (Math.random() * 4 - 2);

  await page.mouse.move(x - 15, y - 5, { steps: 5 });
  await randomDelay(60, 120);
  await page.mouse.move(x, y, { steps: 6 });
  await randomDelay(60, 120);
  await page.mouse.click(x, y);
  await randomDelay(150, 300);

  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 0 });
    await randomDelay(60, 140); // human-ish per-keystroke pacing
  }

  // Belt-and-braces: explicitly fire the events a JS framework's filter
  // logic typically listens for, in case Puppeteer's synthetic keystrokes
  // didn't trigger them the way a real OS-level keypress would.
  await page.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }, el);
  await randomDelay(200, 400);

  return true;
}

// Scrolls whatever dropdown/list panel is currently open, a few times,
// giving the virtualized list a chance to render further rows. Used as
// a fallback if typing to filter doesn't surface the row (some widgets
// only filter on exact prefix, so this covers the rest).
async function scrollOpenDropdownList(page, times = 6) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('ul, div')]
        .filter(el => el.offsetParent !== null && el.scrollHeight > el.clientHeight + 10);
      // Prefer the smallest scrollable container (most likely the dropdown
      // panel itself, not the whole page body).
      candidates.sort((a, b) => (a.clientHeight - b.clientHeight));
      const target = candidates[0];
      if (target) target.scrollTop += 200;
    });
    await randomDelay(200, 350);
  }
}

async function waitForTextWithinContainer(page, containerHandle, text, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await page.evaluate((container, text) => {
      return (container.innerText || '').includes(text);
    }, containerHandle, text);
    if (found) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function humanDoubleClickInvoiceRow(page, invoiceNumber, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((invoiceNumber) => {
      const rows = [...document.querySelectorAll('.x-grid-row, [role="row"], tr')];
      return rows.find(r => r.textContent.includes(invoiceNumber)) || null;
    }, invoiceNumber);

    const el = handle.asElement();
    if (el) {
      const clicked = await humanDoubleClickHandle(page, handle);
      await handle.dispose();
      if (clicked) return true;
    } else {
      await handle.dispose();
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function debugSnapshot(page, label) {
  try {
    const dir = path.resolve('debug');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = Date.now();
    const screenshotPath = path.join(dir, `${label}-${stamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const info = await page.evaluate(() => {
      const frames = [...document.querySelectorAll('iframe')].map(f => f.src || '(no src)');
      const matches = [...document.querySelectorAll('*')]
        .filter(el => (el.textContent || '').trim() === 'Change Company')
        .map(el => ({
          tag: el.tagName,
          className: el.className && el.className.toString ? el.className.toString() : '',
          visible: el.offsetParent !== null,
          rect: el.getBoundingClientRect ? (({ top, left, width, height }) => ({ top, left, width, height }))(el.getBoundingClientRect()) : null,
          outerHTML: el.outerHTML.slice(0, 300)
        }));
      return { frames, changeCompanyMatches: matches, bodySnippet: document.body.innerText.slice(0, 1000) };
    });

    console.log(`  [debug:${label}] screenshot -> ${screenshotPath}`);
    console.log(`  [debug:${label}] iframes on page:`, info.frames);
    console.log(`  [debug:${label}] elements with exact text "Change Company":`, JSON.stringify(info.changeCompanyMatches, null, 2));
    console.log(`  [debug:${label}] visible body text (first 1000 chars):\n${info.bodySnippet}`);
  } catch (err) {
    console.log(`  [debug:${label}] diagnostic capture failed:`, err.message);
  }
}

async function humanClickExportButton(page, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle(() => {
      const byTitle = [...document.querySelectorAll('[title]')]
        .find(el => el.title === 'Export the report and save it to disk');
      if (byTitle) return byTitle;
      const byAria = [...document.querySelectorAll('[aria-label]')]
        .find(el => /export/i.test(el.getAttribute('aria-label') || ''));
      return byAria || null;
    });

    const el = handle.asElement();
    if (el) {
      const clicked = await humanClickHandle(page, handle);
      await handle.dispose();
      if (clicked) return true;
    } else {
      await handle.dispose();
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function waitForText(page, text, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await page.evaluate((text) => {
      return document.body.innerText.includes(text);
    }, text);
    if (found) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

// Waits until text disappears from the page — used to actually CONFIRM
// the invoice search window closed, instead of just clicking "Close"
// once and hoping. This matters because a leftover invoice grid sitting
// open behind the "My Company" modal was likely eating some clicks meant
// for the modal (that's the "1,363 records" text showing up in debug
// snapshots taken while we thought we were only interacting with the
// company-switch modal).
async function waitForTextGone(page, text, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const stillThere = await page.evaluate((text) => document.body.innerText.includes(text), text);
    if (!stillThere) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function closeOpenWindows(page, maxIterations = 5) {
  for (let i = 0; i < maxIterations; i++) {
    const handle = await page.evaluateHandle(() => {
      const candidates = [...document.querySelectorAll('a, div, span, button')]
        .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === 'Close');
      return candidates[0] || null;
    });
    const el = handle.asElement();
    if (!el) {
      await handle.dispose();
      break;
    }
    await humanClickHandle(page, handle);
    await handle.dispose();
    await new Promise(r => setTimeout(r, 800));
  }

  // Confirm the common leftover windows are actually gone before moving
  // on — don't just assume the click worked. A "Search Transactions"
  // window (Card Fueling module) sitting open was silently swallowing
  // clicks meant for other things in earlier runs.
  const invoicesGone = await waitForTextGone(page, 'Search Invoices', 4000);
  const transactionsGone = await waitForTextGone(page, 'Search Transactions', 4000);

  if (!invoicesGone || !transactionsGone) {
    // "Close" text click isn't landing — fall back to the window's own
    // "×" icon button, then Escape, then re-check.
    await page.evaluate(() => {
      const closeIcons = [...document.querySelectorAll('[aria-label="Close"], .close, [title="Close"]')]
        .filter(el => el.offsetParent !== null);
      closeIcons.forEach(el => el.click());
    });
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));
    await waitForTextGone(page, 'Search Invoices', 3000);
    await waitForTextGone(page, 'Search Transactions', 3000);
  }
}

// ---------------------------------------------------------------------
// Detect what the top-right profile widget ACTUALLY currently shows.
// This widget does not reliably re-render after a switch, so we can't
// trust our own tracked `currentLabel` variable to know what text is
// clickable on screen right now — we have to check the live DOM.
// ---------------------------------------------------------------------

async function detectActiveProfileLabel(page, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const label = await page.evaluate(() => {
      const m = document.body.innerText.match(/Company:\s*\d+\s*\|\s*(.+)/);
      return m ? m[1].trim() : null;
    });
    if (label) return label;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}


// ---------------------------------------------------------------------
// Company switching — human-click based
// ---------------------------------------------------------------------

async function switchCompanyByClick(page, currentCompanyLabel, targetCompanyName) {
  const clearedStrayModal = await closeStrayPortalEntityModal(page);
  if (!clearedStrayModal) {
    await debugSnapshot(page, '00-stray-modal-would-not-close');
    return { ok: false, reason: 'a leftover "My Company" modal was open and could not be closed' };
  }

  // 1. Click the current company label top-right.
  const openedSwitcher = await openCompanyProfileDropdown(page, currentCompanyLabel);
  if (!openedSwitcher) {
    await debugSnapshot(page, '01-switcher-not-found');
    return { ok: false, reason: `could not open profile dropdown for "${currentCompanyLabel}"` };
  }
  await randomDelay(400, 700);

  // 2. Click "Change Company" link -> opens modal.
  const clickedChange = await humanClickByTagAndText(page, ['a'], 'Change Company', { exact: true });
  if (!clickedChange) {
    await debugSnapshot(page, '02-change-company-panel-link-not-found');
    return { ok: false, reason: 'could not find "Change Company" link in profile panel' };
  }

  // 3. Wait for the "My Company" modal.
  const modalOpened = await waitForModalVisible(page, PORTAL_ENTITY_MODAL_SELECTOR, 8000);
  if (!modalOpened) {
    await debugSnapshot(page, '03-my-company-modal-not-opened');
    return { ok: false, reason: '"My Company" modal did not open' };
  }
  await randomDelay(300, 600);

  const modalHandle = await getVisibleHandleBySelector(page, PORTAL_ENTITY_MODAL_SELECTOR, 4000);
  if (!modalHandle) {
    await debugSnapshot(page, '04-modal-container-not-found');
    return { ok: false, reason: 'could not locate "My Company" modal container' };
  }

  // Locate the field ONCE, while it still shows the OLD company value —
  // this is what the pattern-match lookup needs to succeed. Every later
  // step reuses this exact handle instead of re-searching by pattern
  // (which breaks the moment we've started editing the text).
  const fieldHandle = await locateCompanyField(page, modalHandle);
  if (!fieldHandle) {
    await debugSnapshot(page, '04b-company-field-not-found');
    return { ok: false, reason: 'could not locate the company input field' };
  }

  try {
    // Type just enough to FILTER the list (the short numeric code) —
    // typing the full exact label can make the widget treat the field as
    // already "complete" and never actually open a live options list to
    // select from, which is exactly the trap that caused the last round
    // of failures: the displayed text looked right, but nothing was ever
    // genuinely SELECTED through the widget's own selection mechanism, so
    // the submit button had no real entity to act on and silently did
    // nothing.
    const shortCode = (targetCompanyName.match(/\d+/) || [])[0] || targetCompanyName;

    let targetVisible = false;
    let attempt = 0;
    const MAX_CLEAR_TYPE_ATTEMPTS = 2;

    while (attempt < MAX_CLEAR_TYPE_ATTEMPTS && !targetVisible) {
      attempt += 1;

      // 4. Force the field empty and VERIFY it's actually empty.
      const cleared = await robustClearField(page, fieldHandle);
      console.log(`  [switch] clear attempt ${attempt}: cleared=${cleared}, field now reads "${await readRawFieldValue(page, fieldHandle)}"`);
      if (!cleared) {
        await debugSnapshot(page, `04c-clear-failed-attempt-${attempt}`);
        continue;
      }
      await randomDelay(300, 500);

      // 5. Type the short code to filter the list down to the matching row.
      await typeIntoField(page, fieldHandle, shortCode);
      // Give the widget's own debounce/filter logic time to react —
      // typed-too-fast-then-checked-too-soon is a common false negative.
      await randomDelay(600, 900);

      const typedBack = await readRawFieldValue(page, fieldHandle);
      console.log(`  [switch] typed "${shortCode}", field.value now reads "${typedBack}" (informational — dropdown text is the real signal)`);

      targetVisible = await waitForTextWithinContainer(page, modalHandle, targetCompanyName, 5000)
        || await waitForText(page, targetCompanyName, 3000);

      if (!targetVisible) {
        await scrollOpenDropdownList(page, 6);
        targetVisible = await waitForTextWithinContainer(page, modalHandle, targetCompanyName, 4000)
          || await waitForText(page, targetCompanyName, 3000);
      }
    }

    if (!targetVisible) {
      await debugSnapshot(page, '06-target-company-not-visible');
      return { ok: false, reason: `company entry "${targetCompanyName}" never appeared in dropdown` };
    }

    // 6. SELECT the filtered option via keyboard, not a mouse click on
    // rendered text. This is the actual fix for "warning never appears":
    // Arrow Down + Enter is the interaction path combobox widgets like
    // this one bind their real "an option was chosen" handler to — a
    // mouse click landing on the wrong DOM layer (e.g. a display div
    // sitting over the real option) can look successful without ever
    // firing that handler, which is what silently broke the submit step
    // even when the displayed text looked completely correct.
    await page.keyboard.press('ArrowDown');
    await randomDelay(200, 350);
    await page.keyboard.press('Enter');
    await randomDelay(400, 700);

    const fieldValueAfterKeySelect = await readRawFieldValue(page, fieldHandle);
    console.log(`  [switch] after ArrowDown+Enter, field.value reads "${fieldValueAfterKeySelect}"`);

    // Fallback: if the keyboard path somehow didn't work (e.g. dropdown
    // wasn't focused), try a real mouse click on the row as a backup —
    // better than giving up outright, even though it's the less reliable
    // path based on what we've seen so far.
    if (!fieldValueAfterKeySelect.includes(targetCompanyName.match(/\d+/)[0])) {
      console.log('  [switch] keyboard selection didn\'t stick — falling back to mouse click on the row');
      await humanClickWithinContainer(page, modalHandle, targetCompanyName)
        || await humanClickByText(page, targetCompanyName);
      await randomDelay(400, 700);
    }

    // 7. Click the modal's blue "Change Company" submit button.
    const confirmedChange = await humanClickByTagAndText(page, ['button'], 'Change Company', { exact: true });
    if (!confirmedChange) {
      await debugSnapshot(page, '08-modal-submit-btn-not-found');
      return { ok: false, reason: 'could not find modal\'s "Change Company" submit button' };
    }

    // 8. Warning confirm dialog -> click "Yes".
    const warningShown = await waitForText(page, 'Warning', 6000);
    if (!warningShown) {
      await debugSnapshot(page, '09-warning-not-shown');
      return { ok: false, reason: 'warning dialog never appeared after confirming change' };
    }
    const confirmedYes = await humanClickByText(page, 'Yes', { exact: true });
    if (!confirmedYes) {
      await debugSnapshot(page, '10-yes-btn-not-found');
      return { ok: false, reason: 'warning dialog appeared but "Yes" button was not found' };
    }
  } finally {
    await fieldHandle.dispose();
    await modalHandle.dispose();
  }

  // 9. Let the app reload for the new company.
  await new Promise(r => setTimeout(r, 2500));
  return { ok: true };
}

// ---------------------------------------------------------------------
// Navigate to Invoices search screen and read the grid
// ---------------------------------------------------------------------

async function openInvoiceSearchScreen(page) {
  // Go straight to "Invoices" — do NOT click "Transactions" first. The
  // sidebar has more than one element with the exact text "Transactions"
  // (the Purchase-Orders-section header AND a separate Card Fueling >
  // Transactions menu item), and clicking "Transactions" was landing on
  // the wrong one, opening the Card Fueling transactions grid (DCC Ref
  // No / Vendor / Sunoco columns) instead of the invoice grid. "Invoices"
  // is already visible in the sidebar without expanding anything.
  const step1 = await humanClickByText(page, 'Invoices', { exact: true });
  if (!step1) return { ok: false, reason: 'could not click Invoices' };

  const gridLoaded = await waitForText(page, 'Search Invoices', 10000);
  await new Promise(r => setTimeout(r, 1000)); // let the grid rows actually render
  return { ok: gridLoaded, reason: gridLoaded ? null : 'invoice grid did not load' };
}

async function readInvoiceRowsFromGrid(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('.x-grid-row, [role="row"]')];
    return rows
      .map(row => {
        const rowText = row.textContent.trim();
        const numberMatch = rowText.match(/SI-\d+/);
        // Column order in the grid is "... Invoice Date, Days Old, Due Date,
        // Invoice Total" so the first date we see in the row text is the
        // Invoice Date. We only use this for SORTING which invoices are
        // "latest" — the actual Due Date used in the saved filename is read
        // later from the opened Report Viewer, which is more reliable.
        const dateMatches = rowText.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
        return {
          invoiceNumber: numberMatch ? numberMatch[0] : null,
          isCreditMemo: rowText.includes('Credit Memo'),
          invoiceDate: dateMatches[0] || null,
          rowText
        };
      })
      .filter(r => r.invoiceNumber);
  });
}
async function extractDueDate(page, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const dueDate = await page.evaluate(() => {
      const match = document.body.innerText.match(/Due Date:\s*([\d/]+)/);
      return match ? match[1] : null;
    });
    if (dueDate) return dueDate;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

// ---------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------

async function waitForNewFile(dir, existingFiles, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const files = fs.readdirSync(dir).filter(f => !f.endsWith('.crdownload'));
    const newFile = files.find(f => !existingFiles.has(f));
    if (newFile) {
      await new Promise(r => setTimeout(r, 500));
      return path.join(dir, newFile);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

async function debugDumpVisibleControls(page) {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll('[title], button, [role="button"]')]
      .filter(el => el.offsetParent !== null)
      .slice(0, 25)
      .map(el => ({
        tag: el.tagName,
        title: el.getAttribute('title'),
        aria: el.getAttribute('aria-label'),
        text: (el.textContent || '').trim().slice(0, 40)
      }));
    return candidates;
  });
}


// ---------------------------------------------------------------------
// Processed-invoice tracking (so we never re-download the same invoice
// on a later run) and output-folder helpers.
// ---------------------------------------------------------------------

function loadProcessedLog() {
  try {
    return JSON.parse(fs.readFileSync(PROCESSED_LOG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveProcessedLog(log) {
  fs.writeFileSync(PROCESSED_LOG_PATH, JSON.stringify(log, null, 2));
}

// "Charge Up 101" -> "ChargeUp101"
function companyFolderName(companyShortLabel) {
  return companyShortLabel.replace(/\s+/g, '');
}

function ensureCompanyInvoiceDir(companyShortLabel) {
  const dir = path.join(PDF_OUTPUT_ROOT, companyFolderName(companyShortLabel), 'Invoices');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Like humanClickByTagAndText but matches on a TITLE attribute containing
// all of the given substrings (case-insensitive). Needed because the
// export icon's tooltip text differs slightly between the grid view
// ("Export the report and save it to disk") and the Report Viewer
// ("Export a report and save it to the disk") — matching on "export" +
// "disk" covers both instead of hardcoding the exact wording.
async function humanClickByTitleIncludes(page, substrings, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((substrings) => {
      const els = [...document.querySelectorAll('[title]')];
      return els.find(el => {
        const t = (el.getAttribute('title') || '').toLowerCase();
        return substrings.every(s => t.includes(s.toLowerCase())) && el.offsetParent !== null;
      }) || null;
    }, substrings);

    const el = handle.asElement();
    if (el) {
      const clicked = await humanClickHandle(page, handle);
      await handle.dispose();
      if (clicked) return true;
    } else {
      await handle.dispose();
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

// Types into the grid's own "Invoice Number / Contains" filter box so the
// grid narrows down to just this one invoice, GUARANTEEING the row is
// actually rendered in the DOM before we try to click it. Without this,
// the grid's virtualization means rows outside the currently-rendered
// window simply don't exist to click on — that's what was causing rows
// to be "not found" or the wrong row to get selected.
async function filterGridByInvoiceNumber(page, invoiceNumber) {
  const addFilterHandle = await page.evaluateHandle(() => {
    const els = [...document.querySelectorAll('div, span, a, button')];
    return els.find(el => el.offsetParent !== null && (el.textContent || '').trim() === 'Add Filter') || null;
  });
  const addFilterEl = addFilterHandle.asElement();
  if (!addFilterEl) {
    await addFilterHandle.dispose();
    return false;
  }

  const inputHandle = await page.evaluateHandle((addFilterEl) => {
    // Walk up a few parents looking for a container that also holds a
    // visible text input — that's the filter row itself.
    let container = addFilterEl;
    for (let i = 0; i < 5 && container; i++) {
      const input = [...container.querySelectorAll('input[type="text"], input:not([type])')]
        .find(el => el.offsetParent !== null);
      if (input) return input;
      container = container.parentElement;
    }
    return null;
  }, addFilterEl);
  await addFilterHandle.dispose();

  const inputEl = inputHandle.asElement();
  if (!inputEl) {
    await inputHandle.dispose();
    return false;
  }

  await humanClickHandle(page, inputHandle);
  await randomDelay(150, 300);
  // Clear whatever filter text might be left over from a previous invoice.
  await page.keyboard.down('Shift');
  await page.keyboard.press('Home');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Backspace');
  await randomDelay(100, 200);

  for (const ch of invoiceNumber) {
    await page.keyboard.type(ch, { delay: 0 });
    await randomDelay(40, 90);
  }
  await page.keyboard.press('Enter');
  await inputHandle.dispose();

  await randomDelay(800, 1200); // let the grid actually refilter
  return true;
}

// Opens a single invoice row: double-click first (fast path), and if that
// doesn't get us into the Report Viewer, fall back to checkbox + "Open
// Selected". On total failure, captures a screenshot + DOM snapshot of the
// row so we can see exactly what's actually clickable there instead of
// guessing blind again.
async function openInvoiceRow(page, invoiceNumber) {
  await filterGridByInvoiceNumber(page, invoiceNumber);

    const doubleClicked = await humanDoubleClickInvoiceRow(page, invoiceNumber, 6000);
  if (doubleClicked) {
    const opened = await waitForText(page, 'Report Viewer', 6000)
      && await waitForTextGone(page, 'Search Invoices', 3000);
    if (opened) return true;
    console.log(`    [openInvoiceRow] double-click landed but "Report Viewer" never appeared for ${invoiceNumber} — trying checkbox fallback`);
  } else {
    console.log(`    [openInvoiceRow] could not even locate/double-click the row for ${invoiceNumber}`);
  }

  // Click the row's first cell (the checkbox column) via real mouse click
  // rather than looking for a native <input type="checkbox">, since this
  // grid's checkboxes are very likely a custom-styled widget the same way
  // the company field turned out to be a layered display div, not a plain
  // input.
  const cellHandle = await page.evaluateHandle((invoiceNumber) => {
    const rows = [...document.querySelectorAll('.x-grid-row, [role="row"], tr')];
    const row = rows.find(r => r.textContent.includes(invoiceNumber));
    if (!row) return null;
    const input = row.querySelector('input[type="checkbox"]');
    if (input) return input;
    return row.querySelector('td, .x-grid-cell, div') || row;
  }, invoiceNumber);

  const cellEl = cellHandle.asElement();
  let checkboxClicked = false;
  if (cellEl) {
    checkboxClicked = await humanClickHandle(page, cellHandle);
  }
  await cellHandle.dispose();

  if (!checkboxClicked) {
    console.log(`    [openInvoiceRow] checkbox-cell click also failed for ${invoiceNumber}`);
    await debugSnapshot(page, `row-open-failed-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`);
    return false;
  }
  await randomDelay(300, 500);

  const clickedOpenSelected = await humanClickByText(page, 'Open Selected', { exact: true, timeoutMs: 4000 });
  if (!clickedOpenSelected) {
    console.log(`    [openInvoiceRow] "Open Selected" button not found for ${invoiceNumber}`);
    await debugSnapshot(page, `row-open-failed-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`);
    return false;
  }

   const opened = await waitForText(page, 'Report Viewer', 8000)
    && await waitForTextGone(page, 'Search Invoices', 3000);
  if (!opened) {
    console.log(`    [openInvoiceRow] clicked "Open Selected" but "Report Viewer" never appeared for ${invoiceNumber}`);
    await debugSnapshot(page, `row-open-failed-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`);
  }
  return opened;
}

// Clicks the Report Viewer's export/save icon, waits for the download,
// then moves + renames it into <targetDir>/<invoiceNumber>_due-<date>.pdf
async function exportInvoiceToFolder(page, downloadDir, targetDir, invoiceNumber, dueDateRaw) {
  const existingFiles = new Set(fs.readdirSync(downloadDir));

  let clickedExport = await humanClickByTitleIncludes(page, ['export', 'disk']);

  // Broaden: some ExtJS-style toolbars expose the tooltip via aria-label or
  // data-qtip instead of the native title attribute.
  if (!clickedExport) {
    const handle = await page.evaluateHandle(() => {
      const attrs = ['title', 'aria-label', 'data-qtip'];
      const els = [...document.querySelectorAll('button, a, [role="button"], span, div')];
      return els.find(el => {
        if (el.offsetParent === null) return false;
        return attrs.some(attr => {
          const v = (el.getAttribute(attr) || '').toLowerCase();
          return v.includes('export') && (v.includes('disk') || v.includes('save'));
        });
      }) || null;
    });
    const el = handle.asElement();
    if (el) {
      clickedExport = await humanClickHandle(page, handle);
    }
    await handle.dispose();
  }

  if (!clickedExport) {
    // Still nothing — dump every clickable control's tag/title/aria/text
    // so next run tells us the real markup instead of another guess.
    const visible = await debugDumpVisibleControls(page);
    console.log(`    [exportInvoiceToFolder] export icon not found for ${invoiceNumber}. Visible controls:`, JSON.stringify(visible, null, 2));
    await debugSnapshot(page, `export-icon-not-found-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`);
    return { ok: false, reason: 'export icon not found in Report Viewer' };
  }
  const downloadedFile = await waitForNewFile(downloadDir, existingFiles, 20000);
  if (!downloadedFile) {
    return { ok: false, reason: 'download timed out' };
  }

  const dueDateForFilename = (dueDateRaw || 'unknown-date').replace(/\//g, '-');
  const finalPath = path.join(targetDir, `${invoiceNumber}_due-${dueDateForFilename}.pdf`);
  fs.renameSync(downloadedFile, finalPath);
  return { ok: true, path: finalPath };
}

async function closeReportViewer(page) {
  const clicked = await humanClickByText(page, 'Close', { exact: true, timeoutMs: 4000 });
  if (clicked) {
    await new Promise(r => setTimeout(r, 800));
    return true;
  }
  return false;
}

async function downloadInvoicePdf(page, downloadDir, savePath) {
  const existingFiles = new Set(fs.readdirSync(downloadDir));

  const clicked = await humanClickExportButton(page);
  if (!clicked) {
    const visible = await debugDumpVisibleControls(page);
    return { ok: false, reason: 'export button not found or not clickable', visibleControls: visible };
  }

  const downloadedFile = await waitForNewFile(downloadDir, existingFiles);
  if (!downloadedFile) return { ok: false, reason: 'download timed out' };

  fs.renameSync(downloadedFile, savePath);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------

const STARTING_COMPANY_LABEL = 'Charge Up 101';

const COMPANY_NAMES = [
  'Charge Up 101 - 66290109',
  'Charge Up 102 - 66290120',
  'Charge Up 103 - 66290133',
  'Charge Up 106 - 29520046',
  'Charge Up 113 - 939303965',
  'Charge Up 114 - 939303966',
  'Charge Up 115 - 939303930',
  'Charge Up 116 - 939303924',
  'Charge Up 117 - 939303922',
  // ...add the rest — scroll the list in the modal to get the full set
];

const INVOICES_PER_COMPANY = 5;

const PDF_OUTPUT_ROOT = path.resolve('CityMart-Invoices');
const LATEST_INVOICES_PER_COMPANY = 5;
const PROCESSED_LOG_PATH = path.resolve('processed-invoices.json');

// ---------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------

(async () => {
  const { page } = await getLoggedInPage();

  const downloadDir = path.resolve('pdf-downloads-tmp');
  fs.mkdirSync(downloadDir, { recursive: true });
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir
  });

  await page.goto('https://citymart.i21web.com/iRelyProd/#home', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await closeOpenWindows(page);

  if (COMPANY_NAMES.length === 0) {
    console.log('COMPANY_NAMES is empty — fill it in with the exact company names shown in the "Change Company" list, then rerun.');
    process.exit(1);
  }

    const results = [];
  const processedLog = loadProcessedLog();
  let currentLabel = STARTING_COMPANY_LABEL;

  for (const companyName of COMPANY_NAMES) {
    const targetShortLabel = companyName.split(' - ')[0].trim();

    console.log(`\n--- Switching to ${companyName} ---`);
    await closeOpenWindows(page);

    let switchResult;
    if (targetShortLabel === currentLabel) {
      console.log(`  Already on ${targetShortLabel} — skipping the switch modal.`);
      switchResult = { ok: true };
    } else {
         const actualLabel = await detectActiveProfileLabel(page);
      if (actualLabel && actualLabel !== currentLabel) {
        console.log(`  [note] tracked label was "${currentLabel}" but widget actually shows "${actualLabel}" — using the real one`);
      }
      switchResult = await switchCompanyByClick(page, actualLabel || currentLabel, companyName);
      console.log(`  Switch result:`, switchResult);
    }

    if (!switchResult.ok) {
      results.push({ name: companyName, switchStatus: `FAILED - ${switchResult.reason}`, recordCount: 'SKIPPED' });
      continue;
    }
    currentLabel = targetShortLabel;

    console.log('Opening invoice search screen...');
    const navResult = await openInvoiceSearchScreen(page);
    if (!navResult.ok) {
      console.log(`  FAILED to open invoice screen: ${navResult.reason}`);
      results.push({ name: companyName, switchStatus: 'ok', recordCount: `NAV FAILED - ${navResult.reason}` });
      continue;
    }

     const allRows = await readInvoiceRowsFromGrid(page);
    const folderKey = companyFolderName(targetShortLabel);
    const alreadyDone = new Set(processedLog[folderKey] || []);

    const candidates = allRows
      .filter(r => !r.isCreditMemo && r.invoiceDate && !alreadyDone.has(r.invoiceNumber))
      .sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate))
      .slice(0, LATEST_INVOICES_PER_COMPANY);

    console.log(`  ${candidates.length} new invoice(s) to save (latest ${LATEST_INVOICES_PER_COMPANY}, skipping ${alreadyDone.size} already saved previously).`);

    const targetDir = ensureCompanyInvoiceDir(targetShortLabel);
    let savedCount = 0;

    for (const candidate of candidates) {
      console.log(`    Opening ${candidate.invoiceNumber} (dated ${candidate.invoiceDate})...`);
      const opened = await openInvoiceRow(page, candidate.invoiceNumber);
      if (!opened) {
        console.log(`    FAILED to open ${candidate.invoiceNumber}`);
        continue;
      }

      const dueDate = await extractDueDate(page, 8000);
      const exportResult = await exportInvoiceToFolder(page, downloadDir, targetDir, candidate.invoiceNumber, dueDate);

      if (exportResult.ok) {
        console.log(`    Saved -> ${exportResult.path}`);
        savedCount += 1;
        alreadyDone.add(candidate.invoiceNumber);
        processedLog[folderKey] = [...alreadyDone];
        saveProcessedLog(processedLog);
      } else {
        console.log(`    FAILED to export ${candidate.invoiceNumber}: ${exportResult.reason}`);
      }

      await closeReportViewer(page);
      await closeOpenWindows(page);
      await openInvoiceSearchScreen(page);
    }

    results.push({
      name: companyName,
      switchStatus: 'ok',
      recordCount: `${savedCount} saved / ${candidates.length} attempted`
    });
  }

  console.log('\n=== SUMMARY ===');
  console.table(results);
  fs.writeFileSync('run-summary.json', JSON.stringify(results, null, 2));

  console.log('\nDone. Chrome will remain open.');
})();