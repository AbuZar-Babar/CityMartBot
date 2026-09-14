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
    const rowEls = [...document.querySelectorAll('.x-grid-row, [role="row"]')];
    return rowEls
      .map((row) => {
        const cells = [...row.querySelectorAll('.x-grid-cell, td')];

        // 1. Locate the exact invoice cell (typically gridcolumn-1158 or cell matching pattern)
        const invCell = cells.find((c) => {
          const colId = c.getAttribute('data-columnid') || '';
          const t = (c.innerText || c.textContent || '').trim();
          return colId.includes('1158') || /^(DR-[\d-]+|SI-\d+|\d{5,})$/.test(t) || /(DR-\d+|SI-\d+)/.test(t);
        });

        let invoiceNumber = null;
        if (invCell) {
          const t = (invCell.innerText || invCell.textContent || '').trim();
          const m = t.match(/DR-[\d-]+|SI-\d+|\b\d{5,}\b/);
          invoiceNumber = m ? m[0] : t;
        } else {
          // Bounded regex match fallback
          const rowText = (row.textContent || '').trim();
          const numberMatch = rowText.match(/SI-\d+|DR-[\d-]+|\b\d{5,}\b/);
          invoiceNumber = numberMatch ? numberMatch[0] : null;
        }

        // 2. Locate Transaction Type cell (data-columnid="gridcolumn-1163" or column with matching classes / position)
        const typeCell =
          cells.find((c) => {
            const colId = c.getAttribute('data-columnid') || '';
            return colId.includes('1163') || c.className.includes('gridcolumn-1163');
          }) || (invCell ? cells[cells.indexOf(invCell) + 1] : cells[2]);

        const transactionType = typeCell
          ? (typeCell.innerText || typeCell.textContent || '').trim()
          : '';

        // 3. Locate date cells (Invoice Date & Due Date)
        const dateCells = cells.filter((c) => {
          const colId = c.getAttribute('data-columnid') || '';
          return (
            colId.includes('datecolumn') ||
            c.className.includes('datecolumn') ||
            /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(c.textContent || '')
          );
        });
        const invoiceDate = dateCells[0]
          ? (dateCells[0].innerText || dateCells[0].textContent || '').trim()
          : null;
        const dueDate = dateCells[1]
          ? (dateCells[1].innerText || dateCells[1].textContent || '').trim()
          : null;

        const rowText = (row.textContent || '').trim();
        const isInvoice = transactionType
          ? transactionType.toLowerCase() === 'invoice'
          : !rowText.toLowerCase().includes('credit memo');
        const isCreditMemo =
          transactionType.toLowerCase().includes('credit') ||
          rowText.toLowerCase().includes('credit memo');

        return {
          invoiceNumber,
          transactionType,
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
