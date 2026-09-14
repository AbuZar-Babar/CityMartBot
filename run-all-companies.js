require('dotenv').config();
const { getLoggedInPage } = require('./browser.js');
const fs = require('fs');
const path = require('path');

const pendingDownloads = new Map();

function waitForNextDownload(timeoutMs = 20000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = setInterval(() => {
      for (const [guid, entry] of pendingDownloads) {
        if (entry.done) {
          clearInterval(check);
          pendingDownloads.delete(guid);
          resolve(entry.path);
          return;
        }
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(check);
        resolve(null);
      }
    }, 200);
  });
}

// ---------------------------------------------------------------------
// Human-like mouse helpers
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

    const clicked = await humanClickByText(page, companyLabelText, { exact: true, timeoutMs: 3000 });
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
      const inputs = [...container.querySelectorAll('input')].filter(el => el.offsetParent !== null);
      const matchingInput = inputs.find(el => pattern.test((el.value || '').trim()));
      if (matchingInput) return matchingInput;
      if (inputs.length === 1) return inputs[0];
      if (inputs.length > 1) return inputs[0];
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

async function readRawFieldValue(page, fieldHandle) {
  const el = fieldHandle.asElement ? fieldHandle.asElement() : fieldHandle;
  return page.evaluate(el => (el.value !== undefined ? el.value : el.textContent) || '', el);
}

async function locateCompanyField(page, containerHandle) {
  return findCompanyFieldWithinContainer(page, containerHandle);
}

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
    await randomDelay(60, 140);
  }

  await page.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }, el);
  await randomDelay(200, 400);

  return true;
}

async function scrollOpenDropdownList(page, times = 6) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('ul, div')]
        .filter(el => el.offsetParent !== null && el.scrollHeight > el.clientHeight + 10);
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

// ---------------------------------------------------------------------
// Invoice row opening
// ---------------------------------------------------------------------

async function filterGridByInvoiceNumber(page, invoiceNumber) {
  const inputHandle = await page.evaluateHandle(() => {
    const containsEls = [...document.querySelectorAll('*')]
      .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === 'Contains');

    for (const containsEl of containsEls) {
      let container = containsEl;
      for (let i = 0; i < 6 && container; i++) {
        const inputs = [...container.querySelectorAll('input[type="text"], input:not([type])')]
          .filter(el => el.offsetParent !== null);
        // Skip the two combo boxes ("Invoice Number" column selector and
        // "Contains" operator selector) — their own inputs display those
        // exact strings as their current value. The real free-text value
        // box is whichever input does NOT hold one of those two labels.
        const valueInput = inputs.find(el => {
          const v = (el.value || '').trim();
          return v !== 'Invoice Number' && v !== 'Contains';
        });
        if (valueInput) return valueInput;
        container = container.parentElement;
      }
    }
    return null;
  });

  const inputEl = inputHandle.asElement();
  if (!inputEl) {
    await inputHandle.dispose();
    console.log('  [filterGridByInvoiceNumber] could not locate the value input (only found the combo boxes)');
    return false;
  }

  await humanClickHandle(page, inputHandle);
  await randomDelay(150, 300);
  await page.keyboard.down('Shift');
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Backspace');
  await randomDelay(100, 200);

  // Extra safety: force-clear via DOM if any leftover text remains
  // (this is exactly how "SI-173398umber" happened before).
  const afterClear = await page.evaluate(el => (el.value || '').trim(), inputEl);
  if (afterClear !== '') {
    await page.evaluate((el) => {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, inputEl);
    await randomDelay(100, 200);
  }

  for (const ch of invoiceNumber) {
    await page.keyboard.type(ch, { delay: 0 });
    await randomDelay(40, 90);
  }
  await page.keyboard.press('Enter');
  await inputHandle.dispose();

  const filtered = await waitForText(page, invoiceNumber, 6000);
  await randomDelay(300, 600);
  if (!filtered) {
    console.log(`  [filterGridByInvoiceNumber] typed "${invoiceNumber}" but it never appeared in the grid — filter may not have applied`);
  }
  return filtered;
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

async function openInvoiceRow(page, invoiceNumber) {
  await filterGridByInvoiceNumber(page, invoiceNumber);

  // Checkbox + "Open Selected" is the reliable path — try it first.
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

  if (checkboxClicked) {
    await randomDelay(300, 500);
    const clickedOpenSelected = await humanClickByText(page, 'Open Selected', { exact: true, timeoutMs: 4000 });
       if (clickedOpenSelected) {
      const opened = await waitForTextAnyFrame(page, 'Report Viewer', 25000);
      console.log(`    [openInvoiceRow] viewerFound=${opened} for ${invoiceNumber}`);
      if (opened) return true;
      console.log(`    [openInvoiceRow] clicked "Open Selected" but "Report Viewer" never appeared for ${invoiceNumber} — trying double-click fallback`);
    } else {
      console.log(`    [openInvoiceRow] "Open Selected" button not found for ${invoiceNumber} — trying double-click fallback`);
    }
  } else {
    console.log(`    [openInvoiceRow] could not locate/click the checkbox for ${invoiceNumber} — trying double-click fallback`);
  }

  // Fallback: double-click the row directly.
   const doubleClicked = await humanDoubleClickInvoiceRow(page, invoiceNumber, 6000);
  if (doubleClicked) {
    const opened = await waitForTextAnyFrame(page, 'Report Viewer', 25000);
    console.log(`    [openInvoiceRow] (fallback double-click) viewerFound=${opened} for ${invoiceNumber}`);
    if (!opened) {
      await debugSnapshot(page, `row-open-failed-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`);
    }
    return opened;
  }

  console.log(`    [openInvoiceRow] both checkbox and double-click methods failed for ${invoiceNumber}`);
  await debugSnapshot(page, `row-open-failed-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`);
  return false;
}

// ---------------------------------------------------------------------
// Debug helpers
// ---------------------------------------------------------------------

async function debugSnapshot(page, label) {
  try {
    const dir = path.resolve('debug');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = Date.now();
    const screenshotPath = path.join(dir, `${label}-${stamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  [debug:${label}] screenshot -> ${screenshotPath}`);
  } catch (err) {
    console.log(`  [debug:${label}] diagnostic capture failed:`, err.message);
  }
}

async function debugDumpVisibleControls(page) {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll('[title], button, [role="button"]')]
      .filter(el => el.offsetParent !== null)
      .slice(0, 30)
      .map(el => ({
        tag: el.tagName,
        title: el.getAttribute('title'),
        aria: el.getAttribute('aria-label'),
        text: (el.textContent || '').trim().slice(0, 40)
      }));
    return candidates;
  });
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

async function waitForTextGone(page, text, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const stillThere = await page.evaluate((text) => document.body.innerText.includes(text), text);
    if (!stillThere) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function waitForTextAnyFrame(page, text, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const frame of page.frames()) {
      try {
        const found = await frame.evaluate((text) => {
          return document.body && document.body.innerText.includes(text);
        }, text);
        if (found) return true;
      } catch {
        // frame may have detached/navigated mid-check; skip it
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function waitForTextGoneAnyFrame(page, text, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let stillThere = false;
    for (const frame of page.frames()) {
      try {
        const found = await frame.evaluate((text) => {
          return document.body && document.body.innerText.includes(text);
        }, text);
        if (found) { stillThere = true; break; }
      } catch {
        // detached frame counts as "gone"
      }
    }
    if (!stillThere) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function humanClickHandleAnyFrame(page, frame, handle) {
  const el = handle.asElement ? handle.asElement() : handle;
  if (!el) return false;

  await frame.evaluate(el => el.scrollIntoView({ block: 'center' }), el);
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

async function humanClickByTitleIncludesAnyFrame(page, substrings, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const frame of page.frames()) {
      try {
        const handle = await frame.evaluateHandle((substrings) => {
          const attrs = ['title', 'aria-label', 'data-qtip'];
          const els = [...document.querySelectorAll('[title], [aria-label], [data-qtip], button, a, [role="button"], span, div')];
          return els.find(el => {
            if (el.offsetParent === null) return false;
            return attrs.some(attr => {
              const v = (el.getAttribute(attr) || '').toLowerCase();
              return substrings.every(s => v.includes(s.toLowerCase()));
            });
          }) || null;
        }, substrings);

        const el = handle.asElement();
        if (el) {
          const clicked = await humanClickHandleAnyFrame(page, frame, handle);
          await handle.dispose();
          if (clicked) return true;
        } else {
          await handle.dispose();
        }
      } catch (err) {
        console.log(`  [humanClickByTitleIncludesAnyFrame] error on frame ${frame.url().slice(0, 60)}: ${err.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function debugDumpVisibleControlsAnyFrame(page) {
  const results = [];
  for (const frame of page.frames()) {
    try {
      const controls = await frame.evaluate(() => {
        const candidates = [...document.querySelectorAll('[title], button, [role="button"]')]
          .filter(el => el.offsetParent !== null)
          .slice(0, 30)
          .map(el => ({
            tag: el.tagName,
            title: el.getAttribute('title'),
            aria: el.getAttribute('aria-label'),
            text: (el.textContent || '').trim().slice(0, 40)
          }));
        return candidates;
      });
      results.push({ frameUrl: frame.url(), controls });
    } catch {
      // skip detached/inaccessible frames
    }
  }
  return results;
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

  const invoicesGone = await waitForTextGone(page, 'Search Invoices', 4000);
  const transactionsGone = await waitForTextGone(page, 'Search Transactions', 4000);
  const viewerGone = await waitForTextGone(page, 'Report Viewer', 4000);

  if (!invoicesGone || !transactionsGone || !viewerGone) {
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
    await waitForTextGone(page, 'Report Viewer', 3000);
  }
}

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

const PROFILE_WIDGET_CLICK_LABEL = 'Charge Up 101';

// ---------------------------------------------------------------------
// Company switching
// ---------------------------------------------------------------------

async function switchCompanyByClick(page, targetCompanyName) {
  const clearedStrayModal = await closeStrayPortalEntityModal(page);
  if (!clearedStrayModal) {
    await debugSnapshot(page, '00-stray-modal-would-not-close');
    return { ok: false, reason: 'a leftover "My Company" modal was open and could not be closed' };
  }

  const openedSwitcher = await openCompanyProfileDropdown(page, PROFILE_WIDGET_CLICK_LABEL);
  if (!openedSwitcher) {
    await debugSnapshot(page, '01-switcher-not-found');
    return { ok: false, reason: `could not open profile dropdown for "${PROFILE_WIDGET_CLICK_LABEL}"` };
  }
  await randomDelay(400, 700);

  const clickedChange = await humanClickByTagAndText(page, ['a'], 'Change Company', { exact: true });
  if (!clickedChange) {
    await debugSnapshot(page, '02-change-company-panel-link-not-found');
    return { ok: false, reason: 'could not find "Change Company" link in profile panel' };
  }

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

  const fieldHandle = await locateCompanyField(page, modalHandle);
  if (!fieldHandle) {
    await debugSnapshot(page, '04b-company-field-not-found');
    return { ok: false, reason: 'could not locate the company input field' };
  }

  try {
    const shortCode = (targetCompanyName.match(/\d+/) || [])[0] || targetCompanyName;

    let targetVisible = false;
    let attempt = 0;
    const MAX_CLEAR_TYPE_ATTEMPTS = 2;

    while (attempt < MAX_CLEAR_TYPE_ATTEMPTS && !targetVisible) {
      attempt += 1;

      const cleared = await robustClearField(page, fieldHandle);
      console.log(`  [switch] clear attempt ${attempt}: cleared=${cleared}, field now reads "${await readRawFieldValue(page, fieldHandle)}"`);
      if (!cleared) {
        await debugSnapshot(page, `04c-clear-failed-attempt-${attempt}`);
        continue;
      }
      await randomDelay(300, 500);

      await typeIntoField(page, fieldHandle, shortCode);
      await randomDelay(600, 900);

      const typedBack = await readRawFieldValue(page, fieldHandle);
      console.log(`  [switch] typed "${shortCode}", field.value now reads "${typedBack}"`);

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

    await page.keyboard.press('ArrowDown');
    await randomDelay(200, 350);
    await page.keyboard.press('Enter');
    await randomDelay(400, 700);

    const fieldValueAfterKeySelect = await readRawFieldValue(page, fieldHandle);
console.log(`  [switch] after ArrowDown+Enter, field.value reads "${fieldValueAfterKeySelect}"`);

// Must match the FULL company label (e.g. "Charge Up 102 - 66290120"), not
// just the bare number — otherwise a raw, un-selected "102" still sitting
// in the field satisfies a numbers-only check and we wrongly think the
// dropdown selection stuck.
if (fieldValueAfterKeySelect.trim() !== targetCompanyName.trim()) {
  console.log('  [switch] keyboard selection didn\'t stick — falling back to mouse click on the row');
  await humanClickWithinContainer(page, modalHandle, targetCompanyName)
    || await humanClickByText(page, targetCompanyName);
  await randomDelay(400, 700);

  // Re-check after the mouse-click fallback, and retry the whole
  // clear -> type -> arrowdown/enter sequence once more if it still
  // didn't stick (covers slow-loading dropdowns).
  const fieldValueAfterFallback = await readRawFieldValue(page, fieldHandle);
  console.log(`  [switch] after mouse-click fallback, field.value reads "${fieldValueAfterFallback}"`);

  if (fieldValueAfterFallback.trim() !== targetCompanyName.trim()) {
    await debugSnapshot(page, '07-selection-did-not-stick');
    return { ok: false, reason: `dropdown selection for "${targetCompanyName}" never stuck (field reads "${fieldValueAfterFallback}")` };
  }
}

    const confirmedChange = await humanClickByTagAndText(page, ['button'], 'Change Company', { exact: true });
    if (!confirmedChange) {
      await debugSnapshot(page, '08-modal-submit-btn-not-found');
      return { ok: false, reason: 'could not find modal\'s "Change Company" submit button' };
    }

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

  await new Promise(r => setTimeout(r, 2500));
  return { ok: true };
}

// ---------------------------------------------------------------------
// Navigate to Invoices search screen and read the grid
// ---------------------------------------------------------------------

async function openInvoiceSearchScreen(page) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const step1 = await humanClickByText(page, 'Invoices', { exact: true });
    if (!step1) {
      if (attempt === 2) return { ok: false, reason: 'could not click Invoices' };
      continue;
    }

    const gridLoaded = await waitForText(page, 'Search Invoices', 15000);
    if (gridLoaded) {
      await new Promise(r => setTimeout(r, 1000));
      return { ok: true, reason: null };
    }
    console.log(`  [openInvoiceSearchScreen] attempt ${attempt} timed out waiting for grid — retrying`);
    await new Promise(r => setTimeout(r, 1500));
  }
  return { ok: false, reason: 'invoice grid did not load' };
}

async function readInvoiceRowsFromGrid(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('.x-grid-row, [role="row"]')];
    return rows
      .map(row => {
        // Read each cell separately and join with a space so adjacent
        // cells' text can never merge into a false-positive number/date
        // (e.g. a "7" at the end of one cell + "8/15/2026" at the start
        // of the next cell used to become the bogus date "78/15/2026").
        const cells = [...row.querySelectorAll('td, [role="gridcell"], .x-grid-cell')]
          .map(c => (c.textContent || '').trim());
        const rowText = cells.length ? cells.join(' | ') : row.textContent.trim();

        const numberMatch = rowText.match(/\b[A-Z]{1,4}-[\dA-Z-]+\d/);
        const dateMatches = rowText.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) || [];
        // Grid column order is: ... Invoice Date | Days Old | Due Date | ...
        // "Days Old" is a plain number, not a date, so it never shows up in
        // dateMatches — the two date-shaped values we do capture are, in
        // order, Invoice Date then Due Date.
        return {
          invoiceNumber: numberMatch ? numberMatch[0] : null,
          isCreditMemo: rowText.includes('Credit Memo'),
          isDebitMemo: rowText.includes('Debit Memo'),
          invoiceDate: dateMatches[0] || null,
          dueDate: dateMatches[1] || null,
          rowText
        };
      })
      .filter(r => r.invoiceNumber);
  });
}
async function waitForGridRowsStable(page, timeoutMs = 8000) {
  const start = Date.now();
  let lastCount = -1;
  let stableSince = null;
  while (Date.now() - start < timeoutMs) {
    const count = await page.evaluate(() => document.querySelectorAll('.x-grid-row, [role="row"]').length);
    if (count === lastCount && count > 0) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince > 500) return count;
    } else {
      stableSince = null;
    }
    lastCount = count;
    await new Promise(r => setTimeout(r, 300));
  }
  return lastCount;
}

async function extractInvoiceNumberFromViewer(page, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const frame of page.frames()) {
      try {
        const num = await frame.evaluate(() => {
          const text = document.body && document.body.innerText;
          if (!text) return null;
          const match = text.match(/Invoice:\s*([\s\S]*?)\s*Invoice Date:/);
          if (!match) return null;
          const cleaned = match[1].replace(/\s+/g, '');
          return cleaned || null;
        });
        if (num) return num;
      } catch {
        // skip detached/inaccessible frames
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

async function extractDueDate(page, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const frame of page.frames()) {
      try {
        const dueDate = await frame.evaluate(() => {
          const match = document.body && document.body.innerText.match(/Due Date:\s*([\d/]+)/);
          return match ? match[1] : null;
        });
        if (dueDate) return dueDate;
      } catch {
        // skip detached/inaccessible frames
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

// ---------------------------------------------------------------------
// Due-date + duplicate-download guards
// ---------------------------------------------------------------------

function parseDateString(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map(Number);
  if (!m || !d || !y) return null;
  const parsed = new Date(y, m - 1, d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// If the due date can't be parsed at all, we do NOT block the download —
// an unknown due date should never silently skip a real invoice.
function isDueDatePassed(dueDateStr) {
  const dueDate = parseDateString(dueDateStr);
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate.getTime() < today.getTime();
}

// Authoritative "already downloaded" check — looks directly at what's
// actually sitting in the company's Invoices folder.
function invoiceFileAlreadyExists(targetDir, invoiceNumber) {
  if (!invoiceNumber) return false;
  let files;
  try {
    files = fs.readdirSync(targetDir);
  } catch {
    return false;
  }
  return files.some(f => f.startsWith(`${invoiceNumber}_due-`));
}

// ---------------------------------------------------------------------
// PDF export from the Report Viewer
// ---------------------------------------------------------------------

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

// Clicks the Report Viewer's export/save icon, waits for the CDP download
// event, then moves + renames it into <targetDir>/<invoiceNumber>_due-<date>.pdf
async function exportInvoiceToFolder(page, targetDir, invoiceNumber, dueDateRaw) {
  const toolbarFrameReady = await (async () => {
    const start = Date.now();
    while (Date.now() - start < 15000) {
      for (const frame of page.frames()) {
        try {
          const hasExportTitle = await frame.evaluate(() => {
            const els = [...document.querySelectorAll('[title]')];
            return els.some(el => (el.getAttribute('title') || '').toLowerCase().includes('export'));
          });
          if (hasExportTitle) return true;
        } catch {
          // frame not ready / detached; keep polling
        }
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  })();
  console.log(`    [exportInvoiceToFolder] toolbar frame ready: ${toolbarFrameReady}`);

  const downloadPromise = waitForNextDownload(20000);

  let clickedExport = await humanClickByTitleIncludesAnyFrame(page, ['export', 'disk']);

  if (!clickedExport) {
    clickedExport = await humanClickByTitleIncludesAnyFrame(page, ['export']);
  }
  if (!clickedExport) {
    clickedExport = await humanClickByTitleIncludesAnyFrame(page, ['save']);
  }

  if (!clickedExport) {
    const visible = await debugDumpVisibleControlsAnyFrame(page);
    console.log(`    [exportInvoiceToFolder] export icon not found for ${invoiceNumber}. Visible controls per frame:`, JSON.stringify(visible, null, 2));
    await debugSnapshot(page, `export-icon-not-found-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`);
    return { ok: false, reason: 'export icon not found in Report Viewer' };
  }

  const tempPath = await downloadPromise;
  if (!tempPath || !fs.existsSync(tempPath)) {
    return { ok: false, reason: 'download did not complete (no CDP download event fired)' };
  }

  const dueDateForFilename = (dueDateRaw || 'unknown-date').replace(/\//g, '-');
  const finalPath = path.join(targetDir, `${invoiceNumber}_due-${dueDateForFilename}.pdf`);
  fs.renameSync(tempPath, finalPath);
  return { ok: true, path: finalPath };
}

// Closes the Report Viewer modal specifically.
async function closeReportViewer(page, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const isOpen = await waitForTextAnyFrame(page, 'Report Viewer', 100);
    if (!isOpen) return true;

    const handle = await page.evaluateHandle(() => {
      const archiveEls = [...document.querySelectorAll('*')]
        .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === 'Archive');
      for (const archiveEl of archiveEls) {
        let container = archiveEl.parentElement;
        for (let i = 0; i < 3 && container; i++) {
          const closeEl = [...container.querySelectorAll('a, div, span, button')]
            .find(el => el.offsetParent !== null && (el.textContent || '').trim() === 'Close');
          if (closeEl) return closeEl;
          container = container.parentElement;
        }
      }
      return null;
    });

    const el = handle.asElement();
    if (el) {
      await humanClickHandle(page, handle);
      await handle.dispose();
    } else {
      await handle.dispose();
      await humanClickByText(page, 'Close', { exact: true, timeoutMs: 2000 });
    }

    await new Promise(r => setTimeout(r, 700));

    const stillOpen = await waitForTextAnyFrame(page, 'Report Viewer', 100);
    if (!stillOpen) return true;
  }

  await page.evaluate(() => {
    const closeIcons = [...document.querySelectorAll('[aria-label="Close"], .close, [title="Close"]')]
      .filter(el => el.offsetParent !== null);
    closeIcons.forEach(el => el.click());
  });
  await new Promise(r => setTimeout(r, 500));
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 500));

  return !(await waitForTextAnyFrame(page, 'Report Viewer', 100));
}

async function clearAnyStuckModals(page) {
  await closeStrayPortalEntityModal(page);
  await closeReportViewer(page, 6000);
  await closeOpenWindows(page);

  const stillStuck = await waitForTextAnyFrame(page, 'Report Viewer', 100)
    || await page.evaluate(() => document.body.innerText.includes('Search Transactions'));

  if (stillStuck) {
    console.log('  [clearAnyStuckModals] something is still stuck open — reloading the page as a last resort');
    await page.goto('https://citymart.i21web.com/iRelyProd/#home', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await closeOpenWindows(page);
  }
}

// ---------------------------------------------------------------------
// Processed-invoice tracking + output-folder helpers
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

function companyFolderName(companyShortLabel) {
  return companyShortLabel.replace(/\s+/g, '');
}

function ensureCompanyInvoiceDir(companyShortLabel) {
  const dir = path.join(PDF_OUTPUT_ROOT, companyFolderName(companyShortLabel), 'Invoices');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------

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
];

const MAX_INVOICES_PER_COMPANY_SAFETY_CAP = 30; // just a safety net against runaway backlogs, not a "latest N" selection rule // how many latest invoices to save per company
const PDF_OUTPUT_ROOT = path.resolve('CityMart-Invoices');
const PROCESSED_LOG_PATH = path.resolve('processed-invoices.json');

// ---------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------

(async () => {
  const { page } = await getLoggedInPage();

  const downloadDir = path.resolve('pdf-downloads-tmp');
  fs.mkdirSync(downloadDir, { recursive: true });

  const browser = page.browser();
  let cdpSession;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      cdpSession = await browser.target().createCDPSession();
      break;
    } catch (err) {
      console.log(`  [cdp-setup] createCDPSession attempt ${attempt} failed: ${err.message}`);
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  await cdpSession.send('Browser.setDownloadBehavior', {
    behavior: 'allowAndName',
    downloadPath: downloadDir,
    eventsEnabled: true
  });

  cdpSession.on('Browser.downloadWillBegin', (event) => {
    pendingDownloads.set(event.guid, { suggestedFilename: event.suggestedFilename, done: false, path: null });
  });

  cdpSession.on('Browser.downloadProgress', (event) => {
    const entry = pendingDownloads.get(event.guid);
    if (!entry) return;
    if (event.state === 'completed') {
      entry.done = true;
      entry.path = path.join(downloadDir, event.guid);
    } else if (event.state === 'canceled') {
      entry.done = true;
      entry.path = null;
    }
  });

  await page.goto('https://citymart.i21web.com/iRelyProd/#home', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await clearAnyStuckModals(page);

  if (COMPANY_NAMES.length === 0) {
    console.log('COMPANY_NAMES is empty — fill it in, then rerun.');
    process.exit(1);
  }

  let currentLabel = await detectActiveProfileLabel(page);
  console.log(`Starting company detected as: "${currentLabel}"`);

  const results = [];
  const processedLog = loadProcessedLog();

  for (const companyName of COMPANY_NAMES) {
    const targetShortLabel = companyName.split(' - ')[0].trim();

    console.log(`\n--- Switching to ${companyName} ---`);
    await clearAnyStuckModals(page);

    const actualLabel = await detectActiveProfileLabel(page);
    if (actualLabel) currentLabel = actualLabel;

    let switchResult;
    if (targetShortLabel === currentLabel) {
      console.log(`  Already on ${targetShortLabel} — skipping the switch modal.`);
      switchResult = { ok: true };
    } else {
      switchResult = await switchCompanyByClick(page, companyName);
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
      await clearAnyStuckModals(page);
      continue;
    }

    await waitForGridRowsStable(page);
    const allRows = await readInvoiceRowsFromGrid(page);
    const folderKey = companyFolderName(targetShortLabel);
    const alreadyDone = new Set(processedLog[folderKey] || []);
    const targetDir = ensureCompanyInvoiceDir(targetShortLabel);

const candidates = allRows
  .filter(r => !r.isCreditMemo && !r.isDebitMemo && r.invoiceDate)
  .filter(r => !invoiceFileAlreadyExists(targetDir, r.invoiceNumber))
  .filter(r => !isDueDatePassed(r.dueDate)) // only invoices whose due date hasn't passed yet
  .sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate))
  .slice(0, MAX_INVOICES_PER_COMPANY_SAFETY_CAP); // safety cap, not a "latest N" rule

console.log(`  ${candidates.length} new invoice(s) to save (due date not yet passed, already-downloaded ones filtered out by checking the folder directly).`);

    let savedCount = 0;

    for (const candidate of candidates) {
      console.log(`    Opening ${candidate.invoiceNumber} (dated ${candidate.invoiceDate})...`);
      const opened = await openInvoiceRow(page, candidate.invoiceNumber);
      if (!opened) {
        console.log(`    FAILED to open ${candidate.invoiceNumber}`);
        await closeReportViewer(page);
        await closeOpenWindows(page);
        await openInvoiceSearchScreen(page);
        continue;
      }

      // Due date now comes straight from the grid row we already scraped —
// no need to (unreliably) scrape it out of the Report Viewer anymore.
const dueDate = candidate.dueDate;
const scrapedInvoiceNumber = await extractInvoiceNumberFromViewer(page, 8000);
const invoiceNumberForFile = scrapedInvoiceNumber || candidate.invoiceNumber;
if (scrapedInvoiceNumber && scrapedInvoiceNumber !== candidate.invoiceNumber) {
  console.log(`    [invoice-number] grid said "${candidate.invoiceNumber}", viewer says "${scrapedInvoiceNumber}" — using the viewer's number for the filename`);
}

if (invoiceFileAlreadyExists(targetDir, invoiceNumberForFile)) {
  console.log(`    Skipping ${invoiceNumberForFile} — a PDF for this invoice already exists in the folder.`);
  alreadyDone.add(candidate.invoiceNumber);
  processedLog[folderKey] = [...alreadyDone];
  saveProcessedLog(processedLog);
  await closeReportViewer(page);
  await closeOpenWindows(page);
  await openInvoiceSearchScreen(page);
  continue;
}

const exportResult = await exportInvoiceToFolder(page, targetDir, invoiceNumberForFile, dueDate);
      if (exportResult.ok) {
        console.log(`    Saved -> ${exportResult.path}`);
        savedCount += 1;
        alreadyDone.add(candidate.invoiceNumber);
        alreadyDone.add(invoiceNumberForFile);
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