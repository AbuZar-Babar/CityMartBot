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
    const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];

    for (const frame of frames) {
      try {
        const handle = await frame.evaluateHandle(() => {
          // 1. Direct DevExpress element IDs & classes
          const dxDirect = document.querySelector(
            '#InvoiceMainReport_Splitter_Toolbar_Menu_DXI9_Img, ' +
            '#InvoiceMainReport_Splitter_Toolbar_Menu_DXI9_T, ' +
            '#InvoiceMainReport_Splitter_Toolbar_Menu_DXI9_, ' +
            '.dxXtraReports_BtnSave_Mulberry, ' +
            '[id*="Toolbar_Menu_DXI9"], ' +
            '[id*="BtnSave"]'
          );
          if (dxDirect && dxDirect.offsetParent !== null) return dxDirect;

          // 2. By exact or partial title/alt attribute
          const byTitle = [...document.querySelectorAll('[title], [alt]')].find((el) => {
            if (el.offsetParent === null) return false;
            const t = (el.getAttribute('title') || el.getAttribute('alt') || '').toLowerCase();
            return (
              t.includes('export a report and save it to the disk') ||
              t.includes('export a report') ||
              t.includes('save it to the disk') ||
              t.includes('save it to disk')
            );
          });
          if (byTitle) return byTitle;

          // 3. By data-qtip (ExtJS tooltips)
          const byQtip = [...document.querySelectorAll('[data-qtip]')].find((el) => {
            if (el.offsetParent === null) return false;
            const q = (el.getAttribute('data-qtip') || '').toLowerCase();
            return q.includes('export') || q.includes('save');
          });
          if (byQtip) return byQtip;

          // 4. By aria-label
          const byAria = [...document.querySelectorAll('[aria-label]')].find((el) => {
            if (el.offsetParent === null) return false;
            return /export/i.test(el.getAttribute('aria-label') || '');
          });
          if (byAria) return byAria;

          // 5. By inner text (Export, Export to PDF)
          const byText = [...document.querySelectorAll('button, a, span, div.x-btn, li.dxm-item')].find((el) => {
            if (el.offsetParent === null) return false;
            const text = (el.innerText || el.textContent || '').trim();
            return text === 'Export' || text === 'Export to PDF' || text.startsWith('Export');
          });
          if (byText) return byText;

          return null;
        });

        const el = handle.asElement();
        if (el) {
          const box = await el.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            console.log(
              `    Found DevExpress export button at (${Math.round(box.x)}, ${Math.round(box.y)}). Clicking...`
            );
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            // Also trigger DOM click as a backup
            await frame.evaluate((node) => node.click(), el);
            await handle.dispose();
            return true;
          }

          const clicked = await humanClickHandle(page, handle);
          await handle.dispose();
          if (clicked) return true;
        } else {
          await handle.dispose();
        }
      } catch (err) {}
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function getMonitoredDownloadDirs(primaryDir) {
  const dirs = [primaryDir];
  const userDownloads = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');
  if (userDownloads && fs.existsSync(userDownloads) && !dirs.includes(userDownloads)) {
    dirs.push(userDownloads);
  }
  return dirs;
}

async function waitForNewDownloadedFile(primaryDir, existingFilesMap, timeoutMs = 20000) {
  const start = Date.now();
  const dirs = getMonitoredDownloadDirs(primaryDir);

  while (Date.now() - start < timeoutMs) {
    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir).filter(
            (f) =>
              !f.endsWith('.crdownload') &&
              !f.endsWith('.tmp') &&
              (f.toLowerCase().endsWith('.pdf') || !f.includes('.'))
          );
          const initialSet = existingFilesMap.get(dir) || new Set();
          const newFile = files.find((f) => !initialSet.has(f));

          if (newFile) {
            const fullPath = path.join(dir, newFile);
            // Verify file has non-zero size and is not locked
            let stat = fs.statSync(fullPath);
            if (stat.size > 0) {
              await new Promise((r) => setTimeout(r, 600));
              return fullPath;
            }
          }
        } catch (e) {}
      }
    }
    await new Promise((r) => setTimeout(r, 400));
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
  const dirs = getMonitoredDownloadDirs(tmpDownloadDir);
  const existingFilesMap = new Map();
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      existingFilesMap.set(dir, new Set(fs.readdirSync(dir)));
    } else {
      existingFilesMap.set(dir, new Set());
    }
  }

  const clickedExport = await humanClickExportButton(page);
  if (!clickedExport) {
    return { ok: false, reason: 'Export button not found' };
  }

  const downloadedPath = await waitForNewDownloadedFile(
    tmpDownloadDir,
    existingFilesMap,
    config.SCRAPER.downloadTimeoutMs
  );
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
