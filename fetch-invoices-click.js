require('dotenv').config();
const { getLoggedInPage } = require('./browser.js');
const fs = require('fs');
const path = require('path');

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

async function debugDumpIconsNearPdf(page) {
  return page.evaluate(() => {
    const pdfLabel = [...document.querySelectorAll('*')]
      .find(el => el.offsetParent !== null && (el.textContent || '').trim() === 'PDF');
    if (!pdfLabel) return 'no PDF label found';
    const bar = pdfLabel.closest('div')?.parentElement;
    if (!bar) return 'no container found';
    return [...bar.querySelectorAll('a, button, img, svg, [role="button"]')]
      .filter(el => el.offsetParent !== null)
      .map(el => ({ tag: el.tagName, title: el.getAttribute('title'), alt: el.getAttribute('alt'), class: el.className, html: el.outerHTML.slice(0, 200) }));
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

// ---------------------------------------------------------------------
// Footer is the ONLY reliable source of the real active company. The
// top-right widget text never re-renders after a switch — it always
// literally shows "Charge Up 101" on screen regardless of what's active.
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

// The literal text that's always clickable on screen to open the dropdown,
// regardless of which company is actually active. Confirmed from logs —
// never changes even after switching companies.
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

async function readInvoiceRowsFromGrid(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('.x-grid-row, [role="row"]')];
    return rows
      .map(row => {
        const rowText = row.textContent.trim();
        // Invoice numbers aren't always "SI-####" — some are "DR-####-#####"
        // etc. Match any short letter-prefix + dash + digits pattern instead
        // of hardcoding "SI-", so DR-prefixed invoices aren't silently
        // dropped from the candidates list.
        const numberMatch = rowText.match(/\b[A-Z]{1,4}-[\dA-Z-]+\d/);
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
// Filter grid to one invoice number, then open its row (double-click,
// fallback checkbox + "Open Selected"). Report Viewer opens INLINE in
// the same page — confirmed from earlier runs: waiting for a separate
// browser tab/popup here just times out because there isn't one.
// ---------------------------------------------------------------------

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

// Selects the row's checkbox — confirmed from the screenshot that a plain
// click on the row (or double-click) DOES select it (shows "(1 selected)"
// in the toolbar), but there's no separate "Report Viewer" screen to open.
// The row's own checkbox column is the target here, not the whole row.
async function selectInvoiceCheckbox(page, invoiceNumber, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((invoiceNumber) => {
      const rows = [...document.querySelectorAll('.x-grid-row, [role="row"], tr')];
      const row = rows.find(r => r.textContent.includes(invoiceNumber));
      if (!row) return null;
      const input = row.querySelector('input[type="checkbox"]');
      if (input) return input;
      // Fall back to the first cell (checkbox column area) if there's no
      // native <input> — same layered-widget pattern seen elsewhere in
      // this app.
      const firstCell = row.querySelector('td, .x-grid-cell, div');
      return firstCell || row;
    }, invoiceNumber);

    const el = handle.asElement();
    if (el) {
      const clicked = await humanClickHandle(page, handle);
      await handle.dispose();
      if (clicked) {
        const selected = await waitForText(page, '(1 selected)', 3000);
        if (selected) return true;
      }
    } else {
      await handle.dispose();
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

// ---------------------------------------------------------------------
// Export the selected invoice via the grid's own "Export" toolbar button
// (confirmed present directly in the toolbar next to "Open Selected") —
// no separate Report Viewer screen is involved.
// ---------------------------------------------------------------------

async function waitForNewFile(dir, existingFiles, timeoutMs = 20000) {
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

async function debugDumpExportDropdown(page) {
  return page.evaluate(() => {
    const exportBtn = [...document.querySelectorAll('a, button, div, span')]
      .find(el => el.offsetParent !== null && (el.textContent || '').trim().startsWith('Export'));
    if (!exportBtn) return 'no Export button found';
    const menu = document.querySelector('.x-menu, [role="menu"], .dropdown-menu');
    return {
      exportButtonHtml: exportBtn.outerHTML.slice(0, 300),
      menuHtml: menu ? menu.outerHTML.slice(0, 800) : 'no open menu/dropdown found'
    };
  });
}

async function exportSelectedInvoiceToFolder(page, downloadDir, targetDir, invoiceNumber, dueDateRaw) {
  const existingFiles = new Set(fs.readdirSync(downloadDir));

  // Click the "Export" toolbar button.
  const clickedExport = await humanClickByText(page, 'Export', { exact: true, timeoutMs: 6000 });
  if (!clickedExport) {
    await debugSnapshot(page, `export-btn-not-found-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`);
    return { ok: false, reason: '"Export" toolbar button not found' };
  }
  await randomDelay(400, 700);

  // Some grids open a small format menu (PDF / Excel / CSV) after clicking
  // Export — try to pick "PDF" if one shows up. If nothing shows up within
  // a couple seconds, assume Export downloaded directly (as PDF or the
  // grid's default) and just watch for the file.
  const pdfOptionShown = await waitForText(page, 'PDF', 2500);
  if (pdfOptionShown) {
    const clickedPdf = await humanClickByText(page, 'PDF', { exact: true, timeoutMs: 3000 });
    if (!clickedPdf) {
      const dump = await debugDumpExportDropdown(page);
      console.log(`    [exportSelectedInvoiceToFolder] "PDF" text appeared but couldn't click it for ${invoiceNumber}. Dropdown dump:`, JSON.stringify(dump, null, 2));
    }
    await randomDelay(300, 500);
  }

  const downloadedFile = await waitForNewFile(downloadDir, existingFiles, 20000);
  if (!downloadedFile) {
    const dump = await debugDumpExportDropdown(page);
    console.log(`    [exportSelectedInvoiceToFolder] download never landed for ${invoiceNumber}. Dropdown dump:`, JSON.stringify(dump, null, 2));
    await debugSnapshot(page, `export-timeout-${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`);
    return { ok: false, reason: 'download timed out after clicking Export' };
  }

  const dueDateForFilename = (dueDateRaw || 'unknown-date').replace(/\//g, '-');
  const ext = path.extname(downloadedFile) || '.pdf';
  const finalPath = path.join(targetDir, `${invoiceNumber}_due-${dueDateForFilename}${ext}`);
  fs.renameSync(downloadedFile, finalPath);
  return { ok: true, path: finalPath };
}

// ---------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------

function companyFolderName(companyShortLabel) {
  return companyShortLabel.replace(/\s+/g, '');
}

function ensureCompanyInvoiceDir(companyShortLabel) {
  const dir = path.join(PDF_OUTPUT_ROOT, companyFolderName(companyShortLabel), 'Invoices');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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

const LATEST_INVOICES_PER_COMPANY = 1; // change to 5 etc. when you want more per company
const PDF_OUTPUT_ROOT = path.resolve('CityMart-Invoices');
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
    await closeOpenWindows(page);

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
      continue;
    }

    const allRows = await readInvoiceRowsFromGrid(page);
    const folderKey = companyFolderName(targetShortLabel);
    const alreadyDone = new Set(processedLog[folderKey] || []);

    const candidates = allRows
      .filter(r => !r.isCreditMemo && !r.isDebitMemo && r.invoiceDate && !alreadyDone.has(r.invoiceNumber))
      .sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate))
      .slice(0, LATEST_INVOICES_PER_COMPANY);

    console.log(`  ${candidates.length} new invoice(s) to save (latest ${LATEST_INVOICES_PER_COMPANY}, skipping ${alreadyDone.size} already saved previously).`);

    const targetDir = ensureCompanyInvoiceDir(targetShortLabel);
    let savedCount = 0;

    for (const candidate of candidates) {
      console.log(`    Selecting ${candidate.invoiceNumber} (dated ${candidate.invoiceDate})...`);
      await filterGridByInvoiceNumber(page, candidate.invoiceNumber);
      const selected = await selectInvoiceCheckbox(page, candidate.invoiceNumber);
      if (!selected) {
        console.log(`    FAILED to select ${candidate.invoiceNumber}`);
        await debugSnapshot(page, `select-failed-${candidate.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')}`);
        continue;
      }

      const dueDate = await extractDueDate(page, 3000); // best-effort; may be null here since there's no separate viewer screen
      const exportResult = await exportSelectedInvoiceToFolder(page, downloadDir, targetDir, candidate.invoiceNumber, dueDate);

      if (exportResult.ok) {
        console.log(`    Saved -> ${exportResult.path}`);
        savedCount += 1;
        alreadyDone.add(candidate.invoiceNumber);
        processedLog[folderKey] = [...alreadyDone];
        saveProcessedLog(processedLog);
      } else {
        console.log(`    FAILED to export ${candidate.invoiceNumber}: ${exportResult.reason}`);
      }

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