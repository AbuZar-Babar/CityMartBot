const config = require('../../config');
const { humanClickByText, humanDoubleClickHandle } = require('../core/human');

async function openInvoiceSearchScreen(page) {
  let clicked = false;
  console.log('Searching for "Invoices" navigation menu item in the UI...');

  const navStart = Date.now();
  while (Date.now() - navStart < 5000) {
    const handle = await page.evaluateHandle(() => {
      const candidates = Array.from(document.querySelectorAll('a, span, div, button, li'));
      return (
        candidates.find((el) => {
          if (el.offsetParent === null) return false;
          const text = (el.textContent || '').trim();
          return text === 'Invoices' || text === 'Invoice';
        }) || null
      );
    });

    const el = handle.asElement();
    if (el) {
      const box = await el.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        console.log(
          `Found "Invoices" menu item at (${Math.round(box.x)}, ${Math.round(box.y)}), width: ${Math.round(box.width)}, height: ${Math.round(box.height)}. Dispatching trusted mouse click...`
        );
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        clicked = true;
        await handle.dispose();
        break;
      }
      await handle.dispose();
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  // Fallback to direct URL navigation if menu item not found or clicked
  if (!clicked) {
    console.log(
      'Could not find or click "Invoices" nav menu item within 5s. Falling back to direct URL navigation...'
    );
    try {
      await page.goto(config.INVOICE_SEARCH_URL, {
        waitUntil: 'domcontentloaded',
        timeout: config.SCRAPER.navigationTimeoutMs
      });
      clicked = true;
    } catch (e) {
      console.warn('Navigation notice:', e.message);
    }
  }

  // 3. FIX THE WAIT CONDITION:
  // Replace text check with page.waitForFunction waiting for actual grid rows in DOM
  let gridLoaded = false;
  try {
    console.log('Waiting for ExtJS grid rows (.x-grid-row, [role="row"]) to appear in DOM...');
    await page.waitForFunction(
      () => document.querySelectorAll('.x-grid-row, [role="row"]').length > 0,
      { timeout: 15000 }
    );
    gridLoaded = true;
    console.log('[SUCCESS] ExtJS grid rows detected in DOM!');
  } catch (err) {
    console.log(
      '[!] Grid rows never appeared after 15s — likely a data load trigger issue, not a timing issue'
    );
  }

  page._gridRowsLoaded = gridLoaded;
  return {
    ok: gridLoaded,
    reason: gridLoaded
      ? null
      : 'Grid rows never appeared after 15s — likely a data load trigger issue, not a timing issue'
  };
}

async function readInvoiceRowsFromGrid(page) {
  // 4. Verify waitForFunction resolved successfully before running evaluate()
  let hasRows = page._gridRowsLoaded;
  if (!hasRows) {
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('.x-grid-row, [role="row"]').length > 0,
        { timeout: 3000 }
      );
      hasRows = true;
    } catch (e) {
      hasRows = false;
    }
  }

  if (!hasRows) {
    console.warn(
      '[WARN] readInvoiceRowsFromGrid: Grid rows were not found or data store failed to load. Skipping extraction and returning empty array.'
    );
    return [];
  }

  const rows = await page.evaluate(() => {
    // 1. Detect column indices from headers if present
    const headers = [...document.querySelectorAll('.x-column-header, th')];
    let typeColIdx = -1;
    let invNumColIdx = -1;
    let invDateColIdx = -1;
    let dueDateColIdx = -1;

    headers.forEach((h, idx) => {
      const headerText = (h.innerText || h.textContent || '').trim().toLowerCase();
      if (/^type\b|transaction\s*type/i.test(headerText)) typeColIdx = idx;
      if (/invoice\s*#|invoice\s*no|reference\s*#/i.test(headerText)) invNumColIdx = idx;
      if (/invoice\s*date|trans\s*date|^date\b/i.test(headerText)) invDateColIdx = idx;
      if (/due\s*date/i.test(headerText)) dueDateColIdx = idx;
    });

    const rowEls = [...document.querySelectorAll('.x-grid-row, [role="row"]')];
    return rowEls
      .map((row) => {
        const cells = [...row.querySelectorAll('.x-grid-cell, td')];
        const cellTexts = cells.map((c) => (c.innerText || c.textContent || '').trim());
        const rowText = (row.textContent || '').trim();

        // 1. Locate Invoice Number
        let invoiceNumber = null;
        if (invNumColIdx >= 0 && cellTexts[invNumColIdx]) {
          const t = cellTexts[invNumColIdx];
          const m = t.match(/DR-[\d-]+|SI-\d+|\b\d{5,}\b/);
          invoiceNumber = m ? m[0] : t;
        }
        if (!invoiceNumber) {
          const invCellText = cellTexts.find((t) =>
            /^(DR-[\d-]+|SI-\d+|\d{5,})$/.test(t) || /(DR-\d+|SI-\d+)/.test(t)
          );
          if (invCellText) {
            const m = invCellText.match(/DR-[\d-]+|SI-\d+|\b\d{5,}\b/);
            invoiceNumber = m ? m[0] : invCellText;
          } else {
            const numberMatch = rowText.match(/SI-\d+|DR-[\d-]+|\b\d{5,}\b/);
            invoiceNumber = numberMatch ? numberMatch[0] : null;
          }
        }

        // 2. Locate Transaction Type
        let transactionType = '';
        if (typeColIdx >= 0 && cellTexts[typeColIdx]) {
          transactionType = cellTexts[typeColIdx];
        }
        if (!transactionType) {
          const typeMatch = cellTexts.find((t) =>
            /^(invoice|credit memo|debit memo|credit|debit)$/i.test(t)
          );
          if (typeMatch) {
            transactionType = typeMatch;
          } else if (cellTexts[2] && /^[a-zA-Z\s]+$/.test(cellTexts[2]) && cellTexts[2].length < 25) {
            transactionType = cellTexts[2];
          }
        }

        // 3. Locate Date Cells
        const dateValues = cellTexts.filter((t) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t));
        let invoiceDate = null;
        let dueDate = null;

        if (invDateColIdx >= 0 && cellTexts[invDateColIdx] && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(cellTexts[invDateColIdx])) {
          invoiceDate = cellTexts[invDateColIdx];
        } else {
          invoiceDate = dateValues[0] || null;
        }

        if (dueDateColIdx >= 0 && cellTexts[dueDateColIdx] && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(cellTexts[dueDateColIdx])) {
          dueDate = cellTexts[dueDateColIdx];
        } else {
          dueDate = dateValues[1] || null;
        }

        const isCreditMemo =
          (transactionType && /credit/i.test(transactionType)) ||
          /credit memo/i.test(rowText);

        const isInvoice =
          !isCreditMemo &&
          (transactionType
            ? /invoice/i.test(transactionType)
            : /invoice/i.test(rowText) || !isCreditMemo);

        return {
          invoiceNumber,
          transactionType: transactionType || (isInvoice ? 'Invoice' : 'Unknown'),
          isInvoice,
          isCreditMemo,
          invoiceDate,
          dueDate,
          rowText
        };
      })
      .filter((r) => r.invoiceNumber);
  });

  console.log(`[INFO] readInvoiceRowsFromGrid extracted ${rows.length} invoice rows.`);
  if (rows.length > 0) {
    console.log('[DEBUG] First 3 extracted rows:', JSON.stringify(rows.slice(0, 3), null, 2));
  }
  return rows;
}

async function openInvoiceRow(page, invoiceNumber, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle((targetNum) => {
      // 1. Prioritize finding the exact cell with the invoice number to double click directly on it
      const cells = [...document.querySelectorAll('.x-grid-cell, td')];
      const targetCell = cells.find((c) => {
        if (c.offsetParent === null) return false;
        const text = (c.innerText || c.textContent || '').trim();
        return text === targetNum || text.startsWith(targetNum);
      });
      if (targetCell) return targetCell;

      // 2. Fallback to matching the row
      const rows = [...document.querySelectorAll('.x-grid-row, [role="row"], tr')];
      return rows.find((r) => {
        if (r.offsetParent === null) return false;
        return (r.textContent || '').includes(targetNum);
      }) || null;
    }, invoiceNumber);

    const el = handle.asElement();
    if (el) {
      console.log(`    Double-clicking invoice element for: ${invoiceNumber}...`);
      const clicked = await humanDoubleClickHandle(page, handle);
      await handle.dispose();
      if (clicked) {
        await new Promise((r) => setTimeout(r, 2000));
        return true;
      }
    } else {
      await handle.dispose();
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

module.exports = {
  openInvoiceSearchScreen,
  readInvoiceRowsFromGrid,
  openInvoiceRow
};
