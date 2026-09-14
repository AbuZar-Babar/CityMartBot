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
  return new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (scaledMax - scaledMin + 1)) + scaledMin)
  );
}

/**
 * Clicks a Puppeteer ElementHandle with natural human mouse path and delays.
 */
async function humanClickHandle(page, handle) {
  const el = handle.asElement ? handle.asElement() : handle;
  if (!el) return false;

  await page.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' }), el);
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

/**
 * Double clicks an element like a human.
 */
async function humanDoubleClickHandle(page, handle) {
  const el = handle.asElement ? handle.asElement() : handle;
  if (!el) return false;

  await page.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' }), el);
  await randomDelay(100, 200);

  const box = await el.boundingBox();
  if (!box) return false;

  const x = box.x + box.width / 2 + (Math.random() * 4 - 2);
  const y = box.y + box.height / 2 + (Math.random() * 4 - 2);

  await page.mouse.move(x - 15, y - 5, { steps: 4 });
  await randomDelay(40, 80);
  await page.mouse.move(x, y, { steps: 5 });
  await randomDelay(40, 80);

  // Click 1
  await page.mouse.down({ clickCount: 1 });
  await randomDelay(20, 50);
  await page.mouse.up({ clickCount: 1 });
  await randomDelay(30, 60);

  // Click 2 (Registers OS-level Double Click)
  await page.mouse.down({ clickCount: 2 });
  await randomDelay(20, 50);
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

  await randomDelay(100, 250);
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
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 90) + 60 });
    if (Math.random() < 0.06) await randomDelay(150, 400); // occasional human pause
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
    await randomDelay(300, 600);
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
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

module.exports = {
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
