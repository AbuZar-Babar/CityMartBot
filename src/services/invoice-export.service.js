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

async function humanClickExportButton(page, timeoutMs = 15000) {
  const start = Date.now();
  console.log('    Waiting for DevExpress ReportViewer toolbar to initialize...');
  await new Promise((r) => setTimeout(r, 1500)); // Allow DevExpress scripts to attach handlers

  while (Date.now() - start < timeoutMs) {
    const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];

    for (const frame of frames) {
      try {
        const handle = await frame.evaluateHandle(() => {
          // 1. Direct DevExpress element IDs & classes (Image, Div, or Li)
          const img = document.querySelector('#InvoiceMainReport_Splitter_Toolbar_Menu_DXI9_Img');
          if (img && img.offsetParent !== null) return img;

          const div = document.querySelector('#InvoiceMainReport_Splitter_Toolbar_Menu_DXI9_T');
          if (div && div.offsetParent !== null) return div;

          const li = document.querySelector('#InvoiceMainReport_Splitter_Toolbar_Menu_DXI9_');
          if (li && li.offsetParent !== null) return li;

          const btnSave = document.querySelector('.dxXtraReports_BtnSave_Mulberry, [id*="BtnSave"]');
          if (btnSave && btnSave.offsetParent !== null) return btnSave;

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

          return null;
        });

        const el = handle.asElement();
        if (el) {
          console.log('    Found DevExpress export toolbar element. Triggering export...');

          // 1. Native Puppeteer element click with delay
          try {
            await el.click({ delay: 60 });
          } catch (e) {}

          // 2. Coordinate click via mouse if bounding box available
          try {
            const box = await el.boundingBox();
            if (box && box.width > 0 && box.height > 0) {
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            }
          } catch (e) {}

          // 3. Dispatch full DOM event lifecycle & invoke DevExpress JavaScript API
          await frame.evaluate((targetEl) => {
            const targets = [
              targetEl,
              targetEl.closest ? targetEl.closest('.dxm-item') : null,
              targetEl.querySelector ? targetEl.querySelector('img') : null,
              targetEl.parentElement
            ].filter(Boolean);

            for (const t of targets) {
              ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((evtName) => {
                const evt = new MouseEvent(evtName, {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  buttons: 1
                });
                t.dispatchEvent(evt);
              });
              if (typeof t.click === 'function') {
                try { t.click(); } catch (e) {}
              }
            }

            // Direct DevExpress client API calls
            try {
              if (window.InvoiceMainReport && typeof window.InvoiceMainReport.SaveToDisk === 'function') {
                window.InvoiceMainReport.SaveToDisk('pdf');
              } else if (window.InvoiceMainReport && typeof window.InvoiceMainReport.ExportTo === 'function') {
                window.InvoiceMainReport.ExportTo('pdf');
              } else if (typeof ASPxClientControl !== 'undefined') {
                const col = ASPxClientControl.GetControlCollection();
                const ctrl = col.GetByName('InvoiceMainReport') || col.GetByName('ReportViewer');
                if (ctrl && typeof ctrl.SaveToDisk === 'function') {
                  ctrl.SaveToDisk('pdf');
                } else if (ctrl && typeof ctrl.ExportTo === 'function') {
                  ctrl.ExportTo('pdf');
                }
              }
            } catch (e) {}
          }, el);

          await handle.dispose();
          return true;
        } else {
          await handle.dispose();
        }
      } catch (err) {}
    }
    await new Promise((r) => setTimeout(r, 500));
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

function clearTempDownloadDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file !== '.gitkeep') {
        try {
          fs.unlinkSync(path.join(dir, file));
        } catch (e) {}
      }
    }
  } catch (e) {}
}

async function waitForNewDownloadedFile(primaryDir, startTimestamp, existingUserDownloads, timeoutMs = 25000) {
  const start = Date.now();
  const userDownloads = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');

  while (Date.now() - start < timeoutMs) {
    // 1. Check primary tmp download directory first
    if (fs.existsSync(primaryDir)) {
      try {
        const files = fs.readdirSync(primaryDir).filter(
          (f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp') && f !== '.gitkeep'
        );
        for (const file of files) {
          const fullPath = path.join(primaryDir, file);
          const stat = fs.statSync(fullPath);
          if (stat.size > 0) {
            // Wait for file write to stabilize
            await new Promise((r) => setTimeout(r, 600));
            const statAfter = fs.statSync(fullPath);
            if (statAfter.size === stat.size) {
              return fullPath;
            }
          }
        }
      } catch (e) {}
    }

    // 2. Check user Downloads directory as fallback
    if (userDownloads && fs.existsSync(userDownloads)) {
      try {
        const files = fs.readdirSync(userDownloads).filter(
          (f) =>
            !f.endsWith('.crdownload') &&
            !f.endsWith('.tmp') &&
            (f.toLowerCase().endsWith('.pdf') || f.includes('InvoiceMainReport'))
        );
        for (const file of files) {
          if (!existingUserDownloads.has(file)) {
            const fullPath = path.join(userDownloads, file);
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs >= startTimestamp && stat.size > 0) {
              await new Promise((r) => setTimeout(r, 600));
              return fullPath;
            }
          }
        }
      } catch (e) {}
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
  // Clean temp folder before each export to prevent collision
  clearTempDownloadDir(tmpDownloadDir);

  const startTimestamp = Date.now() - 1000;
  const userDownloads = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');
  const existingUserDownloads = new Set(
    userDownloads && fs.existsSync(userDownloads) ? fs.readdirSync(userDownloads) : []
  );

  const clickedExport = await humanClickExportButton(page);
  if (!clickedExport) {
    return { ok: false, reason: 'Export button not found' };
  }

  const downloadedPath = await waitForNewDownloadedFile(
    tmpDownloadDir,
    startTimestamp,
    existingUserDownloads,
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

  const stats = fs.statSync(finalPath);
  return { ok: true, path: finalPath, size: stats.size };
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
