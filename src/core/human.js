const { getSettings, calculateDelay } = require('./settings');

let globalDelayMultiplier = 1.0;

function setDelayMultiplier(multiplier) {
  globalDelayMultiplier = Math.max(0.1, Math.min(5.0, Number(multiplier) || 1.0));
}

function getDelayMultiplier() {
  return globalDelayMultiplier;
}

function randomDelay(min = 100, max = 300) {
  const scaledMin = Math.round(min * globalDelayMultiplier);
  const scaledMax = Math.max(scaledMin, Math.round(max * globalDelayMultiplier));
  const base = Math.floor(Math.random() * (scaledMax - scaledMin + 1)) + scaledMin;
  return new Promise((resolve) => setTimeout(resolve, calculateDelay(base)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, calculateDelay(ms)));
}

/**
 * Clicks a Puppeteer ElementHandle with natural human mouse path and delays.
 */
async function humanClickHandle(page, handle) {
  const el = handle.asElement ? handle.asElement() : handle;
  if (!el) return false;

  const settings = getSettings();
  const clickBase = Number(settings.clickDelayMs) || 150;
  const ratio = clickBase / 150;

  await page.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' }), el);
  await randomDelay(100 * ratio, 200 * ratio);

  const box = await el.boundingBox();
  if (!box) return false;

  const x = box.x + box.width / 2 + (Math.random() * 6 - 3);
  const y = box.y + box.height / 2 + (Math.random() * 6 - 3);

  await page.mouse.move(x - 20, y - 10, { steps: Math.max(2, Math.round(5 * ratio)) });
  await randomDelay(50 * ratio, 120 * ratio);
  await page.mouse.move(x, y, { steps: Math.max(3, Math.round(8 * ratio)) });
  await randomDelay(60 * ratio, 150 * ratio);
  await page.mouse.down();
  await randomDelay(40 * ratio, 90 * ratio);
  await page.mouse.up();
  await randomDelay(100 * ratio, 250 * ratio);
  return true;
}

/**
 * Double clicks an element like a human.
 */
async function humanDoubleClickHandle(page, handle) {
  const el = handle.asElement ? handle.asElement() : handle;
  if (!el) return false;

  const settings = getSettings();
  const dblBase = Number(settings.doubleClickDelayMs) || 100;
  const ratio = dblBase / 100;

  await page.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' }), el);
  await randomDelay(80 * ratio, 150 * ratio);

  const box = await el.boundingBox();
  if (!box) return false;

  const x = box.x + box.width / 2 + (Math.random() * 4 - 2);
  const y = box.y + box.height / 2 + (Math.random() * 4 - 2);

  await page.mouse.move(x - 15, y - 5, { steps: Math.max(2, Math.round(4 * ratio)) });
  await randomDelay(30 * ratio, 60 * ratio);
  await page.mouse.move(x, y, { steps: Math.max(2, Math.round(5 * ratio)) });
  await randomDelay(30 * ratio, 60 * ratio);

  // Click 1
  await page.mouse.down({ clickCount: 1 });
  await randomDelay(15 * ratio, 40 * ratio);
  await page.mouse.up({ clickCount: 1 });
  await randomDelay(20 * ratio, 50 * ratio);

  // Click 2 (Registers OS-level Double Click)
  await page.mouse.down({ clickCount: 2 });
  await randomDelay(15 * ratio, 40 * ratio);
  await page.mouse.up({ clickCount: 2 });
  
  // Fallback: trigger DOM dblclick event directly on element if needed by ExtJS
  await page.evaluate((element) => {
    try {
      const evt = new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(evt);
    } catch (e) {}
  }, el).catch(() => {});

  await randomDelay(80 * ratio, 200 * ratio);
  return true;
}

/**
 * Clicks a selector on the page with human-like motion.
 */
async function humanClick(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  const clicked = await humanClickHandle(page, el);
  if (!clicked) throw new Error(`Element not clickable/visible: ${selector}`);
}

/**
 * Types text character by character with randomized speed and natural pauses.
 */
async function humanType(page, selector, text) {
  const settings = getSettings();
  const typingBase = Number(settings.typingDelayMs) || 70;
  await page.focus(selector);
  for (const char of text) {
    const charDelay = Math.max(10, Math.floor(typingBase + (Math.random() * 30 - 15)));
    await page.keyboard.type(char, { delay: charDelay });
    if (settings.enableHumanJitter && Math.random() < 0.06) {
      await randomDelay(100, 300); // occasional human pause
    }
  }
}

/**
 * Finds and clicks the highest matching element containing given text.
 */
async function humanClickByText(page, text, { exact = false, timeoutMs = 10000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((targetText, isExact) => {
      const tags = ['div', 'span', 'button', 'a', 'li', 'td'];
      const nodes = document.querySelectorAll(tags.join(','));
      for (const el of nodes) {
        if (el.offsetParent === null) continue;
        const t = (el.textContent || '').trim();
        const title = el.getAttribute('title') || '';
        const aria = el.getAttribute('aria-label') || '';
        const hit = isExact
          ? (t === targetText || title === targetText || aria === targetText)
          : (t.includes(targetText) || title.includes(targetText) || aria.includes(targetText));
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
    await randomDelay(200, 400);
  }
  return false;
}

async function humanClickTopmostByText(page, text, { exact = false, timeoutMs = 10000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((targetText, isExact) => {
      const tags = ['div', 'span', 'button', 'a', 'li', 'td'];
      const nodes = document.querySelectorAll(tags.join(','));
      let best = null;
      let bestTop = Infinity;
      for (const el of nodes) {
        if (el.offsetParent === null) continue;
        const t = (el.textContent || '').trim();
        const title = el.getAttribute('title') || '';
        const aria = el.getAttribute('aria-label') || '';
        const hit = isExact
          ? (t === targetText || title === targetText || aria === targetText)
          : (t.includes(targetText) || title.includes(targetText) || aria.includes(targetText));
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
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

module.exports = {
  sleep,
  randomDelay,
  setDelayMultiplier,
  getDelayMultiplier,
  humanClick,
  humanClickHandle,
  humanDoubleClickHandle,
  humanType,
  humanClickByText,
  humanClickTopmostByText
};
