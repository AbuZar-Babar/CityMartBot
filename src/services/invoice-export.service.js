const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { humanClickHandle, humanClickByText } = require('../core/human');

async function extractDueDate(page, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const dueDate = await page.evaluate(() => {
      const match = document.body.innerText.match(/Due Date:\s*([\d/]+)/i);
      return match ? match[1] : null;
    });
    if (dueDate) return dueDate;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function humanClickExportButton(page, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const handle = await page.evaluateHandle(() => {
      // 1. By exact or partial title attribute
      const byTitle = [...document.querySelectorAll('[title]')].find((el) => {
        if (el.offsetParent === null) return false;
        const t = (el.getAttribute('title') || '').toLowerCase();
        return t.includes('export') || t.includes('save it to disk');
      });
      if (byTitle) return byTitle;

      // 2. By data-qtip (ExtJS tooltips)
      const byQtip = [...document.querySelectorAll('[data-qtip]')].find((el) => {
        if (el.offsetParent === null) return false;
        const q = (el.getAttribute('data-qtip') || '').toLowerCase();
        return q.includes('export') || q.includes('save it to disk');
      });
      if (byQtip) return byQtip;

      // 3. By aria-label
      const byAria = [...document.querySelectorAll('[aria-label]')].find((el) => {
        if (el.offsetParent === null) return false;
        return /export/i.test(el.getAttribute('aria-label') || '');
      });
      if (byAria) return byAria;

      // 4. By inner text (Export, Export to PDF)
      const byText = [...document.querySelectorAll('button, a, span, div.x-btn')].find((el) => {
        if (el.offsetParent === null) return false;
        const text = (el.innerText || el.textContent || '').trim();
        return text === 'Export' || text === 'Export to PDF' || text.startsWith('Export');
      });
      if (byText) return byText;

      // 5. By common ExtJS export icon classes
      const byIcon = document.querySelector('.x-tool-export, .x-btn-icon-export, .x-tbar-page-export');
      return byIcon || null;
    });

    const el = handle.asElement();
    if (el) {
      const clicked = await humanClickHandle(page, handle);
      await handle.dispose();
      if (clicked) return true;
    } else {
      await handle.dispose();
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function waitForNewDownloadedFile(dir, existingFiles, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
      const newFile = files.find((f) => !existingFiles.has(f));
      if (newFile) {
        await new Promise((r) => setTimeout(r, 500));
        return path.join(dir, newFile);
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

function sanitizeForFilename(str) {
  return (str || '').replace(/[\\/:*?"<>|]/g, '-').trim();
}

function ensureCompanyFolder(companyLabel) {
  const safeName = sanitizeForFilename(companyLabel.replace(/\s+/g, ''));
  const folderPath = path.join(config.PATHS.output, safeName);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  return folderPath;
}

async function exportInvoiceToFolder(page, tmpDownloadDir, targetDir, invoiceNumber, dueDate) {
  fs.mkdirSync(tmpDownloadDir, { recursive: true });
  const existingFiles = new Set(fs.readdirSync(tmpDownloadDir));

  const clickedExport = await humanClickExportButton(page);
  if (!clickedExport) {
    return { ok: false, reason: 'Export button not found' };
  }

  const downloadedPath = await waitForNewDownloadedFile(tmpDownloadDir, existingFiles, config.SCRAPER.downloadTimeoutMs);
  if (!downloadedPath) {
    return { ok: false, reason: 'PDF download timed out' };
  }

  const cleanDueDate = dueDate ? sanitizeForFilename(dueDate.replace(/\//g, '-')) : 'NoDueDate';
  const targetFileName = `${sanitizeForFilename(invoiceNumber)}_Due_${cleanDueDate}.pdf`;
  const finalPath = path.join(targetDir, targetFileName);

  fs.copyFileSync(downloadedPath, finalPath);
  try {
    fs.unlinkSync(downloadedPath);
  } catch (e) {}

  return { ok: true, path: finalPath };
}

async function closeReportViewer(page) {
  await humanClickByText(page, 'Close', { exact: true });
  await new Promise((r) => setTimeout(r, 500));
}

module.exports = {
  extractDueDate,
  ensureCompanyFolder,
  exportInvoiceToFolder,
  closeReportViewer
};
