const fs = require('fs');
const path = require('path');
const config = require('../../config');

const SETTINGS_FILE = path.join(config.PATHS.data, 'bot-settings.json');

const DEFAULT_SETTINGS = {
  // Mouse & Keyboard Cadence
  clickDelayMs: 150,           // Base click duration / pause
  doubleClickDelayMs: 100,     // Delay between double-click pulses
  typingDelayMs: 70,           // Per-keystroke typing speed
  enableHumanJitter: true,     // Natural +/- 20% random timing variance

  // Individual 5-Stage Step Delays
  stepDelays: {
    step1_daemon: 1000,        // Step 1: Browser connect & auth verification wait
    step2_companySwitch: 1500, // Step 2: Company switch modal selection & confirm wait
    step3_gridNav: 1200,       // Step 3: Invoices search navigation & grid load wait
    step4_scanFilter: 600,     // Step 4: Grid row parsing & invoice filtering wait
    step5_openInvoice: 1200,   // Step 5: Invoice row double-click & detail view wait
    step5_exportReport: 1800,  // Step 5: ReportViewer toolbar render & export click wait
    step5_postExport: 1000     // Step 5: PDF save & window cleanup cooldown wait
  },

  // Queue Delays
  delayBetweenInvoicesMs: 1200, // Cooldown pause between consecutive invoices
  delayBetweenCompaniesMs: 2500, // Cooldown pause before switching to next company

  // Scraper Limits & Timeouts
  maxInvoicesPerCompany: config.SCRAPER.latestInvoicesPerCompany || 10,
  navigationTimeoutMs: config.SCRAPER.navigationTimeoutMs || 30000,
  downloadTimeoutMs: config.SCRAPER.downloadTimeoutMs || 25000
};

const PRESETS = {
  turbo: {
    name: 'Turbo Speed',
    description: 'Minimal delays for maximum processing throughput on fast network',
    clickDelayMs: 50,
    doubleClickDelayMs: 40,
    typingDelayMs: 25,
    enableHumanJitter: false,
    stepDelays: {
      step1_daemon: 400,
      step2_companySwitch: 600,
      step3_gridNav: 500,
      step4_scanFilter: 200,
      step5_openInvoice: 500,
      step5_exportReport: 800,
      step5_postExport: 400
    },
    delayBetweenInvoicesMs: 400,
    delayBetweenCompaniesMs: 1000
  },
  fast: {
    name: 'Fast Mode',
    description: 'Optimized snappy delays with moderate human safety margins',
    clickDelayMs: 100,
    doubleClickDelayMs: 70,
    typingDelayMs: 45,
    enableHumanJitter: true,
    stepDelays: {
      step1_daemon: 700,
      step2_companySwitch: 1000,
      step3_gridNav: 800,
      step4_scanFilter: 400,
      step5_openInvoice: 800,
      step5_exportReport: 1200,
      step5_postExport: 700
    },
    delayBetweenInvoicesMs: 800,
    delayBetweenCompaniesMs: 1800
  },
  stealth: {
    name: 'Stealth Human (Default)',
    description: 'Realistic human behavior and natural pauses to prevent rate limits and bot flags',
    clickDelayMs: 150,
    doubleClickDelayMs: 100,
    typingDelayMs: 70,
    enableHumanJitter: true,
    stepDelays: {
      step1_daemon: 1000,
      step2_companySwitch: 1500,
      step3_gridNav: 1200,
      step4_scanFilter: 600,
      step5_openInvoice: 1200,
      step5_exportReport: 1800,
      step5_postExport: 1000
    },
    delayBetweenInvoicesMs: 1200,
    delayBetweenCompaniesMs: 2500
  },
  safe: {
    name: 'Ultra Safe & Reliable',
    description: 'Extended delays for slow internet connections or high server latency',
    clickDelayMs: 300,
    doubleClickDelayMs: 200,
    typingDelayMs: 120,
    enableHumanJitter: true,
    stepDelays: {
      step1_daemon: 2000,
      step2_companySwitch: 3000,
      step3_gridNav: 2500,
      step4_scanFilter: 1200,
      step5_openInvoice: 2500,
      step5_exportReport: 3500,
      step5_postExport: 2000
    },
    delayBetweenInvoicesMs: 2500,
    delayBetweenCompaniesMs: 5000
  }
};

let currentSettings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const fileData = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(fileData);
      currentSettings = mergeSettings(DEFAULT_SETTINGS, parsed);
    } else {
      currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      saveSettings(currentSettings);
    }
  } catch (err) {
    console.error('Error loading bot settings file, using defaults:', err.message);
    currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  return currentSettings;
}

function mergeSettings(defaults, custom) {
  const merged = { ...defaults, ...custom };
  if (custom.stepDelays) {
    merged.stepDelays = { ...defaults.stepDelays, ...custom.stepDelays };
  }
  return merged;
}

function saveSettings(settings) {
  try {
    if (!fs.existsSync(config.PATHS.data)) {
      fs.mkdirSync(config.PATHS.data, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save bot settings file:', err.message);
  }
}

function getSettings() {
  return JSON.parse(JSON.stringify(currentSettings));
}

function updateSettings(patch) {
  currentSettings = mergeSettings(currentSettings, patch);
  saveSettings(currentSettings);
  return getSettings();
}

function resetToDefaults() {
  currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  saveSettings(currentSettings);
  return getSettings();
}

function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return currentSettings;
  const { name, description, ...settingsValues } = preset;
  return updateSettings(settingsValues);
}

function calculateDelay(baseMs) {
  const ms = Number(baseMs) || 0;
  if (ms <= 0) return 0;
  if (!currentSettings.enableHumanJitter) return ms;
  // Apply jitter: +/- 15% random variation
  const jitterRange = ms * 0.15;
  const delta = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(10, Math.round(ms + delta));
}

function getStepDelay(stepKey) {
  const base = (currentSettings.stepDelays && currentSettings.stepDelays[stepKey]) || 500;
  return calculateDelay(base);
}

// Initialize on module require
loadSettings();

module.exports = {
  DEFAULT_SETTINGS,
  PRESETS,
  loadSettings,
  saveSettings,
  getSettings,
  updateSettings,
  resetToDefaults,
  applyPreset,
  calculateDelay,
  getStepDelay
};
