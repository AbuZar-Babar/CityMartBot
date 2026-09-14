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

async function waitForTextGone(page, text, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const stillThere = await page.evaluate((text) => document.body.innerText.includes(text), text);
    if (!stillThere) return true;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

// ---------------------------------------------------------------------
// FIXED: closeOpenWindows now clicks EVERY visible "Close" match (there
// can be more than one leftover window stacked up), falls back to icon
// close buttons and Escape, and ACTUALLY CONFIRMS via waitForTextGone
// before returning instead of assuming one click worked. This was the
// real blocker: a leftover "Search Invoices" grid was still fully
// present and eating clicks meant for the company switcher underneath
// it, even though the function returned as if it had succeeded.
// ---------------------------------------------------------------------
async function closeOpenWindows(page, maxIterations = 8) {
  for (let i = 0; i < maxIterations; i++) {
    const stillOpen = await page.evaluate(() => {
      const hasInvoices = document.body.innerText.includes('Search Invoices');
      const hasTransactions = document.body.innerText.includes('Search Transactions');
      return hasInvoices || hasTransactions;
    });
    if (!stillOpen) break;

    // Click every currently visible "Close" match, not just the first —
    // there can be more than one leftover window.
    const closeCount = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('a, div, span, button')]
        .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === 'Close');
      return candidates.length;
    });

    for (let c = 0; c < closeCount; c++) {
      const handle = await page.evaluateHandle((index) => {
        const candidates = [...document.querySelectorAll('a, div, span, button')]
          .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === 'Close');
        return candidates[index] || null;
      }, c);
      const el = handle.asElement();
      if (el) {
        await humanClickHandle(page, handle);
        await new Promise(r => setTimeout(r, 500));
      }
      await handle.dispose();
    }

    // Fallback: icon-style close buttons (×) that don't have "Close" as
    // their visible text.
    await page.evaluate(() => {
      const closeIcons = [...document.querySelectorAll('[aria-label="Close"], .close, [title="Close"]')]
        .filter(el => el.offsetParent !== null);
      closeIcons.forEach(el => el.click());
    });
    await new Promise(r => setTimeout(r, 400));
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 400));
  }

  const invoicesGone = await waitForTextGone(page, 'Search Invoices', 4000);
  const transactionsGone = await waitForTextGone(page, 'Search Transactions', 4000);

  if (!invoicesGone || !transactionsGone) {
    console.log('  [closeOpenWindows] WARNING — a window is still open after all close attempts.');
    await debugSnapshot(page, 'closeOpenWindows-still-open');
  }

  return invoicesGone && transactionsGone;
}

// ---------------------------------------------------------------------
// Detect what the top-right profile widget ACTUALLY currently shows —
// used both mid-run (this was already here) and now ALSO at startup,
// since the browser session persists between script runs and the real
// active company on screen may not be "Charge Up 101" at all.
// ---------------------------------------------------------------------

async function detectActiveProfileLabel(page, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const label = await page.evaluate(() => {
      const pattern = /Charge Up \d+/;
      const nodes = [...document.querySelectorAll('div, span, a, button')];
      for (const el of nodes) {
        if (el.offsetParent === null) continue;
        const t = (el.textContent || '').trim();
        if (pattern.test(t) && t.length < 30) {
          const rect = el.getBoundingClientRect();
          if (rect.top < 150) return t; // top nav area, not the grid/footer
        }
      }
      return null;
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

  const openedSwitcher = await openCompanyProfileDropdown(page, currentCompanyLabel);
  if (!openedSwitcher) {
    await debugSnapshot(page, '01-switcher-not-found');
    return { ok: false, reason: `could not open profile dropdown for "${currentCompanyLabel}"` };
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

    if (!fieldValueAfterKeySelect.includes(targetCompanyName.match(/\d+/)[0])) {
      console.log('  [switch] keyboard selection didn\'t stick — falling back to mouse click on the row');
      await humanClickWithinContainer(page, modalHandle, targetCompanyName)
        || await humanClickByText(page, targetCompanyName);
      await randomDelay(400, 700);
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
  const step1 = await humanClickByText(page, 'Invoices', { exact: true });
  if (!step1) return { ok: false, reason: 'could not click Invoices' };

  const gridLoaded = await waitForText(page, 'Search Invoices', 10000);
  await new Promise(r => setTimeout(r, 1000));
  return { ok: gridLoaded, reason: gridLoaded ? null : 'invoice grid did not load' };
}

// Reads each grid row and classifies its Type. FIXED: now also detects
// "Debit Memo" (previously only "Credit Memo" was excluded), so the main
// loop can keep true Invoice rows only.
async function readInvoiceRowsFromGrid(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('.x-grid-row, [role="row"]')];
    return rows
      .map(row => {
        const rowText = row.textContent.trim();
        const numberMatch = rowText.match(/SI-\d+/);
        const dateMatches = rowText.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
        return {
          invoiceNumber: numberMatch ? numberMatch[0] : null,
          isCreditMemo: rowText.includes('Credit Memo'),
          isDebitMemo: rowText.includes('Debit Memo'),
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

  await randomDelay(800, 1200);
  return true;
}

async function openInvoiceRow(page, invoiceNumber) {
  console.log(`    [openInvoiceRow] locating ${invoiceNumber}...`);

  // Filter the grid to the exact invoice.
  const filtered = await filterGridByInvoiceNumber(page, invoiceNumber);

  if (!filtered) {
    console.log(
      `    [openInvoiceRow] could not filter grid for ${invoiceNumber}`
    );

    await debugSnapshot(
      page,
      `row-open-filter-failed-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`
    );

    return false;
  }

  await randomDelay(800, 1200);

  // ---------------------------------------------------------------
  // Find the exact invoice row and select its checkbox.
  // CityMart uses an ExtJS-style grid.
  // ---------------------------------------------------------------
  const selected = await page.evaluate((invoiceNumber) => {
    const rows = [
      ...document.querySelectorAll(
        '.x-grid-row, [role="row"], tr'
      )
    ];

    const row = rows.find(row =>
      (row.textContent || '').includes(invoiceNumber)
    );

    if (!row) {
      return {
        ok: false,
        reason: 'invoice row not found'
      };
    }

    const checkboxSelectors = [
      '.x-grid-row-checker',
      '.x-grid-checkcolumn',
      '[class*="x-grid-row-checker"]',
      '[class*="x-grid-checkcolumn"]',
      'input[type="checkbox"]'
    ];

    let checkbox = null;

    for (const selector of checkboxSelectors) {
      checkbox = row.querySelector(selector);

      if (checkbox) {
        const rect = checkbox.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
          break;
        }

        checkbox = null;
      }
    }

    if (!checkbox) {
      return {
        ok: false,
        reason: 'invoice checkbox not found',
        rowHTML: row.outerHTML.slice(0, 3000)
      };
    }

    checkbox.scrollIntoView({
      block: 'center',
      inline: 'center'
    });

    checkbox.click();

    return {
      ok: true,
      checkboxClass: checkbox.className || '',
      checkboxTag: checkbox.tagName,
      rowClass: row.className || ''
    };
  }, invoiceNumber);

  console.log(
    `    [openInvoiceRow] checkbox selection result:`,
    selected
  );

  if (!selected.ok) {
    console.log(
      `    [openInvoiceRow] FAILED to select ${invoiceNumber}: ${selected.reason}`
    );

    await debugSnapshot(
      page,
      `checkbox-not-found-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`
    );

    return false;
  }

  await randomDelay(500, 900);

  // ---------------------------------------------------------------
  // Verify that the invoice is actually selected.
  // ---------------------------------------------------------------
  const selectionState = await page.evaluate((invoiceNumber) => {
    const rows = [
      ...document.querySelectorAll(
        '.x-grid-row, [role="row"], tr'
      )
    ];

    const row = rows.find(row =>
      (row.textContent || '').includes(invoiceNumber)
    );

    if (!row) {
      return {
        found: false,
        selected: false
      };
    }

    const className =
      typeof row.className === 'string'
        ? row.className
        : '';

    const ariaSelected =
      row.getAttribute('aria-selected');

    const checked =
      row.querySelector(
        'input[type="checkbox"]:checked'
      ) !== null;

    const checker = row.querySelector(
      '.x-grid-row-checker, .x-grid-checkcolumn, [class*="x-grid-row-checker"]'
    );

    const checkerClass = checker
      ? (
          typeof checker.className === 'string'
            ? checker.className
            : ''
        )
      : '';

    return {
      found: true,
      selected:
        checked ||
        ariaSelected === 'true' ||
        /x-grid-row-selected|selected/i.test(className) ||
        /checked|selected/i.test(checkerClass),
      rowClass: className,
      ariaSelected,
      checked,
      checkerClass
    };
  }, invoiceNumber);

  console.log(
    `    [openInvoiceRow] selection state:`,
    selectionState
  );

  if (!selectionState.selected) {
    console.log(
      `    [openInvoiceRow] WARNING: ${invoiceNumber} still does not appear selected.`
    );

    await debugSnapshot(
      page,
      `invoice-not-selected-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`
    );

    return false;
  }

  console.log(
    `    [openInvoiceRow] ${invoiceNumber} is selected. Clicking Open Selected...`
  );

  // ---------------------------------------------------------------
  // Click Open Selected.
  // ---------------------------------------------------------------
  const clickedOpenSelected = await humanClickByText(
    page,
    'Open Selected',
    {
      exact: true,
      timeoutMs: 5000
    }
  );

  if (!clickedOpenSelected) {
    console.log(
      `    [openInvoiceRow] "Open Selected" button not found`
    );

    await debugSnapshot(
      page,
      `open-selected-not-found-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`
    );

    return false;
  }

  console.log(
    `    [openInvoiceRow] "Open Selected" clicked for ${invoiceNumber}. Waiting for Report Viewer...`
  );

  await randomDelay(1000, 1500);

  // First try the normal Report Viewer text.
  const opened = await waitForText(
    page,
    'Report Viewer',
    10000
  );

  if (opened) {
    console.log(
      `    [openInvoiceRow] Report Viewer opened for ${invoiceNumber} ✅`
    );

    return true;
  }

  // ---------------------------------------------------------------
  // Extra diagnostic in case the viewer opens without the exact
  // "Report Viewer" text.
  // ---------------------------------------------------------------
  const viewerEvidence = await page.evaluate(() => {
    const bodyText = document.body.innerText || '';

    const exportElements = [
      ...document.querySelectorAll(
        '[title], [aria-label], [data-qtip]'
      )
    ]
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        tag: el.tagName,
        title: el.getAttribute('title'),
        aria: el.getAttribute('aria-label'),
        qtip: el.getAttribute('data-qtip'),
        text: (el.textContent || '').trim().slice(0, 80)
      }))
      .filter(x =>
        /export|save|disk|pdf|report/i.test(
          `${x.title || ''} ${x.aria || ''} ${x.qtip || ''} ${x.text || ''}`
        )
      )
      .slice(0, 30);

    return {
      hasReportViewerText: /Report Viewer/i.test(bodyText),
      hasDueDate: /Due Date:/i.test(bodyText),
      exportElements,
      bodySnippet: bodyText.slice(0, 2000)
    };
  });

  console.log(
    `    [openInvoiceRow] viewer diagnostic:`,
    JSON.stringify(viewerEvidence, null, 2)
  );

  if (
    viewerEvidence.hasReportViewerText ||
    viewerEvidence.hasDueDate ||
    viewerEvidence.exportElements.length > 0
  ) {
    console.log(
      `    [openInvoiceRow] Report Viewer evidence detected for ${invoiceNumber} ✅`
    );

    return true;
  }

  console.log(
    `    [openInvoiceRow] Report Viewer did NOT appear for ${invoiceNumber}`
  );

  await debugSnapshot(
    page,
    `row-open-failed-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`
  );

  return false;
}

// FIXED: broadened the title match. Your screenshot shows the Report
// Viewer's tooltip actually reads "Export a report and save it to disk"
// (note: "a report", not "the report") — matching on just ['export',
// 'disk'] as substrings already covers both wordings, so this works for
// the grid toolbar AND the Report Viewer toolbar without hardcoding
// either exact sentence.
async function exportInvoiceToFolder(page, downloadDir, targetDir, invoiceNumber, dueDateRaw) {
  const existingFiles = new Set(fs.readdirSync(downloadDir));

  let clickedExport = await humanClickByTitleIncludes(page, ['export', 'disk']);

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
  // ...add the rest — scroll the list in the modal to get the full set
];

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

  // FIXED: detect the REAL starting company instead of assuming
  // "Charge Up 101" — the browser session persists between runs, so
  // whatever company was active when the last run ended is still active.
  const detectedStart = await detectActiveProfileLabel(page);
  let currentLabel = detectedStart || 'Charge Up 101';
  console.log(`Starting company detected as: "${currentLabel}"`);

  const results = [];
  const processedLog = loadProcessedLog();

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

    // FIXED: exclude BOTH Credit Memo and Debit Memo, keep true Invoice
    // rows only, sorted by Invoice Date (latest first).
    const candidates = allRows
      .filter(r => !r.isCreditMemo && !r.isDebitMemo && r.invoiceDate && !alreadyDone.has(r.invoiceNumber))
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