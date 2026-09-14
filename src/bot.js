const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getLoggedInPage } = require('./core/browser');
const {
  closeOpenWindows,
  detectActiveProfileLabel,
  switchCompanyByModal
} = require('./services/company.service');
const {
  openInvoiceSearchScreen,
  readInvoiceRowsFromGrid,
  openInvoiceRow
} = require('./services/invoice-grid.service');
const {
  extractDueDate,
  ensureCompanyFolder,
  exportInvoiceToFolder,
  closeReportViewer
} = require('./services/invoice-export.service');
const {
  pauseForHuman,
  promptStepMenu,
  promptErrorRecovery
} = require('./core/prompt');
const { ensureLoggedIn } = require('./services/login.service');

function loadProcessedLog() {
  const filePath = config.PATHS.processedInvoicesFile;
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveProcessedLog(data) {
  if (!fs.existsSync(config.PATHS.data)) {
    fs.mkdirSync(config.PATHS.data, { recursive: true });
  }
  fs.writeFileSync(config.PATHS.processedInvoicesFile, JSON.stringify(data, null, 2), 'utf8');
}

async function executeWithRecovery(actionName, fn) {
  while (true) {
    try {
      const result = await fn();
      return result !== undefined ? result : { ok: true };
    } catch (err) {
      const recovery = await promptErrorRecovery(actionName, err.message);
      if (recovery === 'r') {
        console.log(`Retrying "${actionName}"...`);
        continue;
      } else if (recovery === 'm') {
        await pauseForHuman('Perform any actions needed in Chrome. Press Enter when ready...');
        continue;
      } else if (recovery === 's') {
        console.log(`Skipped step "${actionName}".`);
        return { ok: false, skipped: true };
      } else if (recovery === 'n') {
        console.log('Skipping to next company...');
        return { ok: false, skipCompany: true };
      } else if (recovery === 'q') {
        console.log('User requested quit.');
        return { ok: false, quit: true };
      }
    }
  }
}

async function runBot() {
  console.log('=== CityMart Invoice Portal Bot Starting ===\n');

  let { browser, page } = await getLoggedInPage();

  // Ensure user is authenticated and on dashboard
  await ensureLoggedIn(page);

  const tmpDownloadDir = config.PATHS.tmpDownloads;
  fs.mkdirSync(tmpDownloadDir, { recursive: true });

  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: tmpDownloadDir
  });

  try {
    if (!page.url().includes('#home')) {
      await page.goto(`${config.PORTAL_URL}#home`, {
        waitUntil: 'domcontentloaded',
        timeout: config.SCRAPER.navigationTimeoutMs
      });
    }
  } catch (navErr) {
    console.log('Navigation notice:', navErr.message);
  }
  await new Promise((r) => setTimeout(r, 1500));
  await closeOpenWindows(page);

  const companiesList = JSON.parse(fs.readFileSync(config.PATHS.companiesFile, 'utf8'));
  const processedLog = loadProcessedLog();
  const summaryResults = [];

  let currentLabel = config.CREDENTIALS.company || 'Charge Up 101';
  let interactiveMode = process.env.INTERACTIVE !== 'false'; // Ask for user approval step-by-step unless INTERACTIVE=false

  for (let cIdx = 0; cIdx < companiesList.length; cIdx++) {
    const company = companiesList[cIdx];
    const companyDisplayName = `${company.name} - ${company.entityNo}`;
    const targetShortLabel = company.name;
    const folderKey = targetShortLabel.replace(/\s+/g, '');

    // Re-verify page reference
    if (page.isClosed()) {
      const pages = await browser.pages();
      const citymartPage = pages.find((p) => (p.url() || '').includes('citymart.i21web.com'));
      page = citymartPage || pages[0] || (await browser.newPage());
    }

    await closeOpenWindows(page);

    const actualLabel = await detectActiveProfileLabel(page);
    const activeCurrent = actualLabel || currentLabel;

    let skipCurrentCompany = false;
    let autoRunThisCompany = !interactiveMode;

    while (interactiveMode && !autoRunThisCompany && !skipCurrentCompany) {
      const choice = await promptStepMenu(companyDisplayName, activeCurrent);

      if (choice === '1') {
        // Step 1: Switch company
        const res = await executeWithRecovery(`Switch to ${companyDisplayName}`, async () => {
          if (activeCurrent === targetShortLabel || activeCurrent.includes(targetShortLabel)) {
            console.log(`  Already on ${targetShortLabel}`);
            return { ok: true };
          }
          console.log(`  Switching from "${activeCurrent}" to "${companyDisplayName}"...`);
          const switchRes = await switchCompanyByModal(page, activeCurrent, companyDisplayName);
          if (!switchRes.ok) throw new Error(switchRes.reason);
          currentLabel = targetShortLabel;
          console.log('  [OK] Company switched successfully!');
          return switchRes;
        });
        if (res.quit) return;
        if (res.skipCompany) { skipCurrentCompany = true; break; }

      } else if (choice === '2') {
        // Step 2: Open Invoices Grid
        const res = await executeWithRecovery('Open Invoices Grid', async () => {
          console.log('  Opening Invoices search grid...');
          const navResult = await openInvoiceSearchScreen(page);
          if (!navResult.ok) throw new Error(navResult.reason);
          console.log('  [OK] Invoices grid loaded successfully!');
          return navResult;
        });
        if (res.quit) return;
        if (res.skipCompany) { skipCurrentCompany = true; break; }

      } else if (choice === '3') {
        // Step 3: Scan & Download Invoices
        const res = await executeWithRecovery(`Download Invoices for ${targetShortLabel}`, async () => {
          return await processCompanyInvoices(page, targetShortLabel, folderKey, tmpDownloadDir, processedLog);
        });
        if (res.quit) return;
        if (res.skipCompany) { skipCurrentCompany = true; break; }
        summaryResults.push({ company: company.name, status: 'DONE', details: res.details || 'Processed' });
        break; // Company processing complete, advance to next

      } else if (choice === '4') {
        // Move to next company
        console.log(`Skipping to next company...`);
        skipCurrentCompany = true;
        break;

      } else if (choice === '5') {
        // Auto-run this company
        autoRunThisCompany = true;

      } else if (choice.toLowerCase() === 'a') {
        // Auto-run ALL remaining companies
        interactiveMode = false;
        autoRunThisCompany = true;

      } else if (choice.toLowerCase() === 'm') {
        await pauseForHuman();

      } else if (choice.toLowerCase() === 'q') {
        console.log('Exiting bot...');
        return;
      }
    }

    if (skipCurrentCompany) continue;

    // Automated flow for this company (if choice was 5 or interactiveMode was disabled)
    if (autoRunThisCompany) {
      console.log(`\n--- Auto-running: ${companyDisplayName} ---`);

      // 1. Switch
      const switchStep = await executeWithRecovery(`Switch to ${companyDisplayName}`, async () => {
        if (activeCurrent !== targetShortLabel && !activeCurrent.includes(targetShortLabel)) {
          console.log(`  Switching from "${activeCurrent}" to "${companyDisplayName}"...`);
          const switchRes = await switchCompanyByModal(page, activeCurrent, companyDisplayName);
          if (!switchRes.ok) throw new Error(switchRes.reason);
          currentLabel = targetShortLabel;
        } else {
          console.log(`  Already on ${targetShortLabel}`);
        }
        return { ok: true };
      });

      if (switchStep.quit) return;
      if (switchStep.skipCompany) continue;

      // 2. Open Invoice Grid
      const navStep = await executeWithRecovery('Open Invoices Grid', async () => {
        console.log('  Navigating to Invoices grid...');
        const navRes = await openInvoiceSearchScreen(page);
        if (!navRes.ok) throw new Error(navRes.reason);
        return navRes;
      });

      if (navStep.quit) return;
      if (navStep.skipCompany) continue;

      // 3. Scan & Download Invoices
      const dlStep = await executeWithRecovery(`Download Invoices for ${targetShortLabel}`, async () => {
        return await processCompanyInvoices(page, targetShortLabel, folderKey, tmpDownloadDir, processedLog);
      });

      if (dlStep.quit) return;
      summaryResults.push({
        company: company.name,
        status: dlStep.ok !== false ? 'SUCCESS' : 'SKIPPED',
        details: dlStep.details || 'Processed'
      });
    }
  }

  console.log('\n================ RUN SUMMARY ================');
  console.table(summaryResults);

  if (!fs.existsSync(config.PATHS.data)) {
    fs.mkdirSync(config.PATHS.data, { recursive: true });
  }
  fs.writeFileSync(config.PATHS.runSummaryFile, JSON.stringify(summaryResults, null, 2), 'utf8');

  console.log('\nBot execution completed. Chrome browser remains open.');
}

async function processCompanyInvoices(page, targetShortLabel, folderKey, tmpDownloadDir, processedLog) {
  const allRows = await readInvoiceRowsFromGrid(page);
  const alreadySaved = new Set(processedLog[folderKey] || []);

  const candidates = allRows
    .filter((r) => r.isInvoice && !r.isCreditMemo && r.invoiceDate && !alreadySaved.has(r.invoiceNumber))
    .sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate))
    .slice(0, config.SCRAPER.latestInvoicesPerCompany);

  console.log(
    `  Found ${candidates.length} new invoices to process (skipping ${alreadySaved.size} previously saved).`
  );

  const targetDir = ensureCompanyFolder(targetShortLabel);
  let savedCount = 0;

  for (const candidate of candidates) {
    console.log(`    Opening invoice: ${candidate.invoiceNumber} (${candidate.invoiceDate})...`);
    const opened = await openInvoiceRow(page, candidate.invoiceNumber);
    if (!opened) {
      console.warn(`    Could not open row for ${candidate.invoiceNumber}`);
      continue;
    }

    const extractedDate = await extractDueDate(page, 4000);
    const dueDate = extractedDate || candidate.dueDate;
    const exportResult = await exportInvoiceToFolder(
      page,
      tmpDownloadDir,
      targetDir,
      candidate.invoiceNumber,
      dueDate
    );

    if (exportResult.ok) {
      console.log(`    Saved -> ${exportResult.path}`);
      savedCount += 1;
      alreadySaved.add(candidate.invoiceNumber);
      processedLog[folderKey] = [...alreadySaved];
      saveProcessedLog(processedLog);
    } else {
      console.warn(`    Export failed for ${candidate.invoiceNumber}: ${exportResult.reason}`);
    }

    await closeReportViewer(page);
    await closeOpenWindows(page);
    await openInvoiceSearchScreen(page);
  }

  return {
    ok: true,
    details: `${savedCount} saved / ${candidates.length} attempted`
  };
}

if (require.main === module) {
  runBot().catch((err) => {
    console.error('Fatal bot error:', err.message);
  });
}

module.exports = { runBot };
