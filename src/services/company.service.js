const fs = require('fs');
const path = require('path');
const config = require('../../config');
const {
  randomDelay,
  humanClickHandle,
  humanClickByText,
  humanClickTopmostByText
} = require('../core/human');

const PORTAL_ENTITY_MODAL_SELECTOR = '#portalEntity';

async function waitForText(page, text, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await page.evaluate((t) => document.body.innerText.includes(t), text);
    if (found) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function waitForTextGone(page, text, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const stillThere = await page.evaluate((t) => document.body.innerText.includes(t), text);
    if (!stillThere) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function closeOpenWindows(page, maxIterations = 5) {
  for (let i = 0; i < maxIterations; i++) {
    const handle = await page.evaluateHandle(() => {
      const candidates = [...document.querySelectorAll('a, div, span, button')].filter(
        (el) => el.offsetParent !== null && (el.textContent || '').trim() === 'Close'
      );
      return candidates[0] || null;
    });
    const el = handle.asElement();
    if (!el) {
      await handle.dispose();
      break;
    }
    await humanClickHandle(page, handle);
    await handle.dispose();
    await new Promise((r) => setTimeout(r, 800));
  }

  const invoicesGone = await waitForTextGone(page, 'Search Invoices', 4000);
  const transactionsGone = await waitForTextGone(page, 'Search Transactions', 4000);

  if (!invoicesGone || !transactionsGone) {
    await page.evaluate(() => {
      const closeIcons = [
        ...document.querySelectorAll('[aria-label="Close"], .close, [title="Close"]')
      ].filter((el) => el.offsetParent !== null);
      closeIcons.forEach((el) => el.click());
    });
    await new Promise((r) => setTimeout(r, 500));
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 500));
    await waitForTextGone(page, 'Search Invoices', 3000);
    await waitForTextGone(page, 'Search Transactions', 3000);
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
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

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

  const clickedCancel = await page.evaluate((selector) => {
    const btn = document.querySelector(`${selector} .close, ${selector} [data-dismiss="modal"]`);
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, PORTAL_ENTITY_MODAL_SELECTOR);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const stillOpen = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }, PORTAL_ENTITY_MODAL_SELECTOR);
    if (!stillOpen) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function isProfileDropdownOpen(page) {
  return page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    return links.some(
      (el) => (el.textContent || '').trim() === 'Change Company' && el.offsetParent !== null
    );
  });
}

async function openCompanyProfileDropdown(page, companyLabelText, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isProfileDropdownOpen(page)) return true;

    // First try: finding the smallest visible element matching the company label
    const handle = await page.evaluateHandle((targetText) => {
      const all = Array.from(document.querySelectorAll('a, span, div, li, button'));
      const matches = all.filter((el) => {
        const text = (el.innerText || '').trim();
        return (
          text.length > 0 &&
          text.length < 80 &&
          (text.includes(targetText) || /Charge Up \d+/i.test(text)) &&
          el.offsetParent !== null
        );
      });
      matches.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
      return matches[0] || null;
    }, companyLabelText);

    const el = handle.asElement();
    if (el) {
      await humanClickHandle(page, handle);
      await handle.dispose();
      await randomDelay(400, 700);
      if (await isProfileDropdownOpen(page)) return true;
    } else {
      await handle.dispose();
    }

    // Fallback: search topmost text
    await humanClickTopmostByText(page, companyLabelText, { exact: false, timeoutMs: 2000 });
    await randomDelay(400, 700);
    if (await isProfileDropdownOpen(page)) return true;

    await new Promise((r) => setTimeout(r, 400));
  }
  return isProfileDropdownOpen(page);
}

async function readRawFieldValue(page, fieldHandle) {
  const el = fieldHandle.asElement ? fieldHandle.asElement() : fieldHandle;
  return page.evaluate((e) => (e.value !== undefined ? e.value : e.textContent) || '', el);
}

async function robustClearField(page, fieldHandle, maxAttempts = 25) {
  const el = fieldHandle.asElement ? fieldHandle.asElement() : fieldHandle;

  await page.evaluate((e) => e.scrollIntoView({ block: 'center' }), el);
  await randomDelay(150, 300);

  const box = await el.boundingBox();
  if (!box) return false;

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await randomDelay(150, 300);

  await page.keyboard.press('End');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Home');
  await page.keyboard.up('Shift');
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
    await page.evaluate((e) => {
      if (e.value !== undefined) e.value = '';
      else e.textContent = '';
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, el);
    finalValue = await readRawFieldValue(page, fieldHandle);
  }

  return !finalValue || finalValue.trim() === '';
}

async function typeIntoField(page, fieldHandle, text) {
  const el = fieldHandle.asElement ? fieldHandle.asElement() : fieldHandle;
  await page.evaluate((e) => e.scrollIntoView({ block: 'center' }), el);
  await randomDelay(120, 250);

  const box = await el.boundingBox();
  if (!box) return false;

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await randomDelay(150, 300);

  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 0 });
    await randomDelay(60, 140);
  }

  await page.evaluate((e) => {
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }, el);
}

async function switchCompanyByModal(page, currentCompanyLabel, targetCompanyName) {
  // Method 1: Check if navbar typeahead #txtPortalEntity is available
  try {
    const typeahead = await page.$('#txtPortalEntity');
    if (typeahead && (await page.evaluate((el) => el.offsetParent !== null, typeahead))) {
      console.log('  [switch] Found navbar typeahead #txtPortalEntity. Attempting typeahead switch...');
      await page.click('#txtPortalEntity', { clickCount: 3 });
      await page.keyboard.press('Backspace');
      for (const ch of targetCompanyName) {
        await page.type('#txtPortalEntity', ch, { delay: 40 + Math.random() * 60 });
      }

      const menuShown = await page.waitForFunction(
        () => {
          const menu = document.querySelector('.tt-dataset-portal-entity-dataset');
          return menu && menu.querySelectorAll('.tt-suggestion').length > 0;
        },
        { timeout: 4000 }
      ).catch(() => null);

      if (menuShown) {
        const clicked = await page.evaluate((name) => {
          const suggestions = Array.from(
            document.querySelectorAll('.tt-dataset-portal-entity-dataset .tt-suggestion')
          );
          let match = suggestions.find((el) => el.textContent.trim() === name);
          if (!match) match = suggestions.find((el) => el.textContent.trim().startsWith(name));
          if (match) {
            match.click();
            return match.textContent.trim();
          }
          return null;
        }, targetCompanyName);

        if (clicked) {
          console.log(`  [switch] Typeahead selected: ${clicked}`);
          await new Promise((r) => setTimeout(r, 2500));
          return { ok: true };
        }
      }
    }
  } catch (e) {
    console.log('  [switch] Typeahead notice:', e.message);
  }

  // Method 2: Profile dropdown -> "Change Company" modal
  await closeStrayPortalEntityModal(page);

  const openedSwitcher = await openCompanyProfileDropdown(page, currentCompanyLabel);
  if (!openedSwitcher) {
    return { ok: false, reason: `could not open profile dropdown for "${currentCompanyLabel}"` };
  }
  await randomDelay(400, 700);

  const clickedChange = await humanClickByText(page, 'Change Company', { exact: true });
  if (!clickedChange) {
    return { ok: false, reason: 'could not find "Change Company" link in profile panel' };
  }

  const modalHandle = await page.waitForSelector(PORTAL_ENTITY_MODAL_SELECTOR, { visible: true, timeout: 8000 });
  if (!modalHandle) {
    return { ok: false, reason: '"My Company" modal did not open' };
  }

  const fieldHandle = await page.evaluateHandle((selector) => {
    const container = document.querySelector(selector);
    if (!container) return null;
    const inputs = [...container.querySelectorAll('input')].filter((el) => el.offsetParent !== null);
    return inputs[0] || null;
  }, PORTAL_ENTITY_MODAL_SELECTOR);

  if (!fieldHandle || !fieldHandle.asElement()) {
    return { ok: false, reason: 'could not locate the company input field' };
  }

  try {
    const shortCode = (targetCompanyName.match(/\d+/) || [])[0] || targetCompanyName;
    await robustClearField(page, fieldHandle);
    await randomDelay(300, 500);

    await typeIntoField(page, fieldHandle, shortCode);
    await randomDelay(600, 900);

    await page.keyboard.press('ArrowDown');
    await randomDelay(200, 350);
    await page.keyboard.press('Enter');
    await randomDelay(400, 700);

    const confirmedChange = await humanClickByText(page, 'Change Company', { exact: true });
    if (!confirmedChange) {
      return { ok: false, reason: 'could not find modal Change Company submit button' };
    }

    const warningShown = await waitForText(page, 'Warning', 6000);
    if (warningShown) {
      await humanClickByText(page, 'Yes', { exact: true });
    }
  } finally {
    await fieldHandle.dispose();
  }

  await new Promise((r) => setTimeout(r, 2500));
  return { ok: true };
}

module.exports = {
  closeOpenWindows,
  detectActiveProfileLabel,
  closeStrayPortalEntityModal,
  switchCompanyByModal
};
