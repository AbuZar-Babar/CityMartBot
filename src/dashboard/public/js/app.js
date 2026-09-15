/**
 * CityMart Bot Automation Dashboard — Frontend Client Logic
 */

let socket = null;
let currentBotState = {};
let currentSettings = {};
let allPresets = {};
let allInvoices = [];
let allCompanies = [];
let activeLogFilter = 'all';
let runStartTime = null;
let runTimerInterval = null;

// =============================================================================
// DOM ELEMENTS
// =============================================================================
// Navigation Tabs
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanes = document.querySelectorAll('.tab-pane');
const activePresetBadge = document.getElementById('activePresetBadge');
const btnGoToSettings = document.getElementById('btnGoToSettings');

// Topbar Status & Telemetry
const cdpStatusBadge = document.getElementById('cdpStatusBadge');
const cdpStatusText = document.getElementById('cdpStatusText');
const sessionUser = document.getElementById('sessionUser');
const activeEntityLabel = document.getElementById('activeEntityLabel');
const activeOpText = document.getElementById('activeOpText');
const pulseIndicator = document.getElementById('pulseIndicator');

// Playback Controls
const btnStart = document.getElementById('btnStart');
const btnStartText = document.getElementById('btnStartText');
const btnPause = document.getElementById('btnPause');
const btnStep = document.getElementById('btnStep');
const btnStop = document.getElementById('btnStop');

// Main Control Deck Sliders & Progress
const delaySlider = document.getElementById('delaySlider');
const delayValueText = document.getElementById('delayValueText');
const presetButtons = document.querySelectorAll('.btn-preset');
const progressBarFill = document.getElementById('progressBarFill');
const progressMetricText = document.getElementById('progressMetricText');
const currentCompanyProgress = document.getElementById('currentCompanyProgress');
const queueTimeElapsed = document.getElementById('queueTimeElapsed');

// Invoices Stream Table
const invoicesTableBody = document.getElementById('invoicesTableBody');
const invoiceSearch = document.getElementById('invoiceSearch');
const invoiceCountBadge = document.getElementById('invoiceCountBadge');
const btnRefreshInvoices = document.getElementById('btnRefreshInvoices');

// Live Terminal
const terminalOutput = document.getElementById('terminalOutput');
const logFilters = document.querySelectorAll('.btn-filter');
const btnClearLogs = document.getElementById('btnClearLogs');

// Company Queue & Telemetry
const companiesQueueList = document.getElementById('companiesQueueList');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnSelectNone = document.getElementById('btnSelectNone');
const metricTotalInvoices = document.getElementById('metricTotalInvoices');
const metricStorage = document.getElementById('metricStorage');

// Folder & Reset
const btnOpenFolder = document.getElementById('btnOpenFolder');
const btnClearHistory = document.getElementById('btnClearHistory');

// PDF Modal
const pdfModal = document.getElementById('pdfModal');
const modalTitle = document.getElementById('modalTitle');
const pdfFrame = document.getElementById('pdfFrame');
const modalCloseBtn = document.getElementById('modalCloseBtn');

// Toast Container
const toastContainer = document.getElementById('toastContainer');

// Settings Elements
const presetCards = document.querySelectorAll('.preset-card');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const btnResetSettings = document.getElementById('btnResetSettings');
const savedStatusBadge = document.getElementById('savedStatusBadge');

// Stepper Subtitles
const stepperDelay1 = document.getElementById('stepperDelay1');
const stepperDelay2 = document.getElementById('stepperDelay2');
const stepperDelay3 = document.getElementById('stepperDelay3');
const stepperDelay4 = document.getElementById('stepperDelay4');
const stepperDelay5 = document.getElementById('stepperDelay5');

// Click Tester Box
const clickTesterBox = document.getElementById('clickTesterBox');
const testerFeedback = document.getElementById('testerFeedback');

// All Sliders Map
const sliderIds = [
  'clickDelayMs',
  'doubleClickDelayMs',
  'typingDelayMs',
  'step1_daemon',
  'step2_companySwitch',
  'step3_gridNav',
  'step4_scanFilter',
  'step5_openInvoice',
  'step5_exportReport',
  'step5_postExport',
  'delayBetweenInvoicesMs',
  'delayBetweenCompaniesMs',
  'maxInvoicesPerCompany',
  'navigationTimeoutMs',
  'downloadTimeoutMs'
];

// =============================================================================
// TAB SWITCHING
// =============================================================================
function switchTab(tabId) {
  navTabs.forEach((tab) => {
    if (tab.getAttribute('data-tab') === tabId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  tabPanes.forEach((pane) => {
    if (pane.id === tabId) {
      pane.style.display = 'flex';
    } else {
      pane.style.display = 'none';
    }
  });

  refreshLucideIcons();
}

navTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab');
    switchTab(target);
  });
});

if (btnGoToSettings) {
  btnGoToSettings.addEventListener('click', () => {
    switchTab('tabSettings');
  });
}

// =============================================================================
// TOAST NOTIFICATIONS
// =============================================================================
function showToast(message, icon = 'check-circle-2') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
  toastContainer.appendChild(toast);
  refreshLucideIcons();

  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
}

// =============================================================================
// WEBSOCKET TELEMETRY CONNECTION
// =============================================================================
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    cdpStatusText.textContent = 'PORT 9222 CONNECTED';
    cdpStatusBadge.style.opacity = '1';
    addLogLine({ time: new Date().toLocaleTimeString(), message: 'Connected to Bot WebSocket Gateway', type: 'info' });
  };

  socket.onclose = () => {
    cdpStatusText.textContent = 'DISCONNECTED (RETRYING...)';
    cdpStatusBadge.style.opacity = '0.5';
    setTimeout(connectWebSocket, 2000);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'INIT_STATE') {
        if (msg.presets) allPresets = msg.presets;
        if (msg.data && msg.data.settings) syncSettingsToUI(msg.data.settings);
        updateBotUI(msg.data);
      } else if (msg.type === 'STATE_UPDATE') {
        updateBotUI(msg.data);
      } else if (msg.type === 'SETTINGS_UPDATE') {
        syncSettingsToUI(msg.data);
      } else if (msg.type === 'LOG_ENTRY') {
        addLogLine(msg.data);
      } else if (msg.type === 'STEP_UPDATE') {
        updateStepper(msg.data.stage);
      } else if (msg.type === 'INVOICE_SAVED') {
        fetchInvoices();
      }
    } catch (e) {
      console.error('WS Error:', e);
    }
  };
}

// =============================================================================
// SETTINGS MANAGEMENT & UI SYNC
// =============================================================================
function syncSettingsToUI(settings) {
  if (!settings) return;
  currentSettings = settings;

  // 1. Mouse & Keyboard
  setSliderAndLabel('clickDelayMs', settings.clickDelayMs, 'ms');
  setSliderAndLabel('doubleClickDelayMs', settings.doubleClickDelayMs, 'ms');
  setSliderAndLabel('typingDelayMs', settings.typingDelayMs, 'ms/char');

  const jitterCheck = document.getElementById('check_enableHumanJitter');
  if (jitterCheck) jitterCheck.checked = !!settings.enableHumanJitter;

  // 2. Step Delays
  const sd = settings.stepDelays || {};
  setSliderAndLabel('step1_daemon', sd.step1_daemon, 'ms');
  setSliderAndLabel('step2_companySwitch', sd.step2_companySwitch, 'ms');
  setSliderAndLabel('step3_gridNav', sd.step3_gridNav, 'ms');
  setSliderAndLabel('step4_scanFilter', sd.step4_scanFilter, 'ms');
  setSliderAndLabel('step5_openInvoice', sd.step5_openInvoice, 'ms');
  setSliderAndLabel('step5_exportReport', sd.step5_exportReport, 'ms');
  setSliderAndLabel('step5_postExport', sd.step5_postExport, 'ms');

  // Update Stepper captions in Cockpit
  if (stepperDelay1) stepperDelay1.textContent = `CDP Port 9222 (${formatSecs(sd.step1_daemon)})`;
  if (stepperDelay2) stepperDelay2.textContent = `#portalEntity (${formatSecs(sd.step2_companySwitch)})`;
  if (stepperDelay3) stepperDelay3.textContent = `ExtJS Grid (${formatSecs(sd.step3_gridNav)})`;
  if (stepperDelay4) stepperDelay4.textContent = `Verify Invoices (${formatSecs(sd.step4_scanFilter)})`;
  if (stepperDelay5) stepperDelay5.textContent = `DevExpress (${formatSecs(sd.step5_exportReport)})`;

  // 3. Queue Delays & Limits
  setSliderAndLabel('delayBetweenInvoicesMs', settings.delayBetweenInvoicesMs, 'ms');
  setSliderAndLabel('delayBetweenCompaniesMs', settings.delayBetweenCompaniesMs, 'ms');
  setSliderAndLabel('maxInvoicesPerCompany', settings.maxInvoicesPerCompany, 'invoices');
  setSliderAndLabel('navigationTimeoutMs', settings.navigationTimeoutMs, 'sec', 1000);
  setSliderAndLabel('downloadTimeoutMs', settings.downloadTimeoutMs, 'sec', 1000);

  // Sync main Cockpit delay slider
  if (delaySlider && document.activeElement !== delaySlider) {
    delaySlider.value = settings.clickDelayMs || 150;
    updateCockpitDelayLabel(settings.clickDelayMs || 150);
  }

  // Detect matching preset
  detectMatchingPreset(settings);
}

function setSliderAndLabel(id, val, unit, divisor = 1) {
  if (val === undefined || val === null) return;
  const slider = document.getElementById(`slider_${id}`);
  const label = document.getElementById(`val_${id}`);
  
  if (slider && document.activeElement !== slider) {
    slider.value = val;
  }
  if (label) {
    const displayVal = divisor === 1 ? val : (val / divisor).toFixed(0);
    label.textContent = `${displayVal} ${unit}`;
  }
}

function formatSecs(ms) {
  const s = ((ms || 0) / 1000).toFixed(1);
  return `${s}s`;
}

function updateCockpitDelayLabel(ms) {
  let label = 'Stealth Human';
  if (ms <= 60) label = 'Turbo';
  else if (ms <= 110) label = 'Fast';
  else if (ms >= 250) label = 'Safe';
  delayValueText.textContent = `${ms}ms (${label})`;
}

function detectMatchingPreset(settings) {
  const cd = Number(settings.clickDelayMs);
  let matched = 'custom';

  if (cd <= 60) matched = 'turbo';
  else if (cd <= 110) matched = 'fast';
  else if (cd <= 180) matched = 'stealth';
  else if (cd >= 250) matched = 'safe';

  // Highlight Preset Cards
  presetCards.forEach((card) => {
    if (card.getAttribute('data-preset') === matched) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  // Highlight Cockpit preset buttons
  presetButtons.forEach((btn) => {
    if (btn.getAttribute('data-preset') === matched) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (activePresetBadge) {
    activePresetBadge.textContent = matched.toUpperCase();
  }
}

function gatherSettingsFromUI() {
  const getVal = (id) => {
    const el = document.getElementById(`slider_${id}`);
    return el ? Number(el.value) : undefined;
  };

  return {
    clickDelayMs: getVal('clickDelayMs'),
    doubleClickDelayMs: getVal('doubleClickDelayMs'),
    typingDelayMs: getVal('typingDelayMs'),
    enableHumanJitter: document.getElementById('check_enableHumanJitter') ? document.getElementById('check_enableHumanJitter').checked : true,
    stepDelays: {
      step1_daemon: getVal('step1_daemon'),
      step2_companySwitch: getVal('step2_companySwitch'),
      step3_gridNav: getVal('step3_gridNav'),
      step4_scanFilter: getVal('step4_scanFilter'),
      step5_openInvoice: getVal('step5_openInvoice'),
      step5_exportReport: getVal('step5_exportReport'),
      step5_postExport: getVal('step5_postExport')
    },
    delayBetweenInvoicesMs: getVal('delayBetweenInvoicesMs'),
    delayBetweenCompaniesMs: getVal('delayBetweenCompaniesMs'),
    maxInvoicesPerCompany: getVal('maxInvoicesPerCompany'),
    navigationTimeoutMs: getVal('navigationTimeoutMs'),
    downloadTimeoutMs: getVal('downloadTimeoutMs')
  };
}

async function saveSettings(settingsToSave) {
  const payload = settingsToSave || gatherSettingsFromUI();
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.ok) {
      syncSettingsToUI(json.settings);
      showToast('Bot settings saved and applied live!', 'check-circle-2');
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'UPDATE_SETTINGS', settings: payload }));
      }
    }
  } catch (err) {
    console.error('Failed to save settings:', err);
    showToast('Failed to save settings', 'alert-triangle');
  }
}

async function applyPresetByKey(presetKey) {
  try {
    const res = await fetch('/api/settings/preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: presetKey })
    });
    const json = await res.json();
    if (json.ok) {
      syncSettingsToUI(json.settings);
      showToast(`Applied speed preset: "${presetKey.toUpperCase()}"`, 'zap');
    }
  } catch (err) {
    console.error('Failed to apply preset:', err);
  }
}

async function resetSettingsToDefaults() {
  if (confirm('Reset all bot timings and step delays to recommended defaults?')) {
    try {
      const res = await fetch('/api/settings/reset', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        syncSettingsToUI(json.settings);
        showToast('Settings reset to recommended defaults', 'rotate-ccw');
      }
    } catch (err) {
      console.error('Failed to reset settings:', err);
    }
  }
}

// Attach Live Slider Input Listeners
sliderIds.forEach((id) => {
  const slider = document.getElementById(`slider_${id}`);
  const label = document.getElementById(`val_${id}`);
  if (slider) {
    slider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      let unit = 'ms';
      let divisor = 1;

      if (id === 'typingDelayMs') unit = 'ms/char';
      else if (id === 'maxInvoicesPerCompany') unit = 'invoices';
      else if (id.includes('Timeout')) {
        unit = 'sec';
        divisor = 1000;
      }

      if (label) {
        const displayVal = divisor === 1 ? val : (val / divisor).toFixed(0);
        label.textContent = `${displayVal} ${unit}`;
      }

      // If clickDelayMs changed, update Cockpit slider too
      if (id === 'clickDelayMs') {
        delaySlider.value = val;
        updateCockpitDelayLabel(val);
      }

      // Update active preset indicator
      if (activePresetBadge) activePresetBadge.textContent = 'CUSTOM';
      presetCards.forEach((c) => c.classList.remove('active'));
      presetButtons.forEach((b) => b.classList.remove('active'));
    });

    // Auto-save on slider release
    slider.addEventListener('change', () => {
      saveSettings();
    });
  }
});

const checkJitter = document.getElementById('check_enableHumanJitter');
if (checkJitter) {
  checkJitter.addEventListener('change', () => {
    saveSettings();
  });
}

// Preset Card Click Handlers
presetCards.forEach((card) => {
  card.addEventListener('click', () => {
    const key = card.getAttribute('data-preset');
    applyPresetByKey(key);
  });
});

presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-preset');
    applyPresetByKey(key);
  });
});

// Save & Reset Buttons
if (btnSaveSettings) btnSaveSettings.addEventListener('click', () => saveSettings());
if (btnResetSettings) btnResetSettings.addEventListener('click', resetSettingsToDefaults);

// Interactive Click Tester
if (clickTesterBox) {
  let testerTimeout = null;
  clickTesterBox.addEventListener('click', () => {
    const clickDelay = Number(document.getElementById('slider_clickDelayMs')?.value || 150);
    clickTesterBox.classList.add('active-click');
    testerFeedback.textContent = `Processing click (${clickDelay}ms hold)...`;
    testerFeedback.style.color = 'var(--cyan-electric)';

    if (testerTimeout) clearTimeout(testerTimeout);
    testerTimeout = setTimeout(() => {
      clickTesterBox.classList.remove('active-click');
      testerFeedback.textContent = `Click registered! (Cadence: ${clickDelay}ms)`;
      testerFeedback.style.color = 'var(--primary-emerald)';
    }, clickDelay);
  });

  clickTesterBox.addEventListener('dblclick', () => {
    const dblDelay = Number(document.getElementById('slider_doubleClickDelayMs')?.value || 100);
    testerFeedback.textContent = `Double-click pulse registered (${dblDelay}ms gap)!`;
    testerFeedback.style.color = '#c084fc';
  });
}

// =============================================================================
// STATE & UI SYNCHRONIZATION
// =============================================================================
function updateBotUI(state) {
  currentBotState = state;

  if (state.activeSessionUser) {
    sessionUser.textContent = state.activeSessionUser;
  }

  if (state.activeCompany) {
    activeEntityLabel.textContent = `[${state.activeCompany.name || state.activeCompany}]`;
  } else {
    activeEntityLabel.textContent = '[Ready]';
  }

  // Playback Button State
  const status = state.status || 'IDLE';
  if (status === 'RUNNING') {
    btnStart.disabled = true;
    btnStart.innerHTML = '<span class="btn-icon"><i data-lucide="loader-2" class="spin-icon"></i></span> <span id="btnStartText">Running...</span>';
    btnPause.disabled = false;
    btnPause.innerHTML = '<span class="btn-icon"><i data-lucide="pause"></i></span> <span id="btnPauseText">Pause</span>';
    btnStep.disabled = true;
    btnStop.disabled = false;

    pulseIndicator.className = 'pulse-indicator active';
    if (!runStartTime) {
      runStartTime = Date.now();
      startTimer();
    }
  } else if (status === 'PAUSED') {
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnPause.innerHTML = '<span class="btn-icon"><i data-lucide="play"></i></span> <span id="btnPauseText">Resume</span>';
    btnStep.disabled = false;
    btnStop.disabled = false;

    pulseIndicator.className = 'pulse-indicator paused';
  } else if (status === 'STARTING') {
    btnStart.disabled = true;
    btnStart.innerHTML = '<span class="btn-icon"><i data-lucide="loader-2" class="spin-icon"></i></span> <span id="btnStartText">Connecting...</span>';
    btnPause.disabled = true;
    btnStep.disabled = true;
    btnStop.disabled = false;

    pulseIndicator.className = 'pulse-indicator active';
  } else {
    // IDLE / STOPPED / ERROR
    btnStart.disabled = false;
    btnStart.innerHTML = '<span class="btn-icon"><i data-lucide="play"></i></span> <span id="btnStartText">Start Automation</span>';
    btnPause.disabled = true;
    btnPause.innerHTML = '<span class="btn-icon"><i data-lucide="pause"></i></span> <span id="btnPauseText">Pause</span>';
    btnStep.disabled = true;
    btnStop.disabled = true;

    pulseIndicator.className = status === 'ERROR' ? 'pulse-indicator error' : 'pulse-indicator';
    stopTimer();
  }

  refreshLucideIcons();

  // Active Operation Text
  if (state.currentStep) {
    activeOpText.textContent = state.currentStep.description || state.currentStep.name;
    updateStepper(state.currentStep.stage || 1);
  }

  // Delay Slider
  if (state.delayMs && document.activeElement !== delaySlider) {
    delaySlider.value = state.delayMs;
    updateCockpitDelayLabel(state.delayMs);
  }

  // Progress update
  if (state.progress) {
    const prog = state.progress;
    progressBarFill.style.width = `${prog.percent || 0}%`;
    progressMetricText.textContent = `${prog.globalDownloaded || 0} / ${prog.globalTarget || 0} Invoices (${prog.percent || 0}%)`;

    if (state.activeCompany) {
      currentCompanyProgress.textContent = `Current Entity: ${state.activeCompany.name || state.activeCompany} (${prog.downloadedInCompany || 0}/${prog.totalInCompany || 0})`;
    } else {
      currentCompanyProgress.textContent = 'Current Entity: Idle';
    }
  }

  // Highlight active company item in queue
  document.querySelectorAll('.company-queue-item').forEach((el) => {
    const compName = el.getAttribute('data-name');
    if (state.activeCompany && (state.activeCompany.name === compName || state.activeCompany === compName)) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

function updateStepper(currentStage) {
  for (let i = 1; i <= 5; i++) {
    const node = document.getElementById(`stepNode${i}`);
    const line = document.getElementById(`stepLine${i}`);

    if (node) {
      if (i < currentStage) {
        node.className = 'step-node completed';
      } else if (i === currentStage) {
        node.className = 'step-node active';
      } else {
        node.className = 'step-node';
      }
    }

    if (line) {
      if (i < currentStage) {
        line.className = 'step-line completed';
      } else {
        line.className = 'step-line';
      }
    }
  }
}

// =============================================================================
// TIMER
// =============================================================================
function startTimer() {
  if (runTimerInterval) clearInterval(runTimerInterval);
  runTimerInterval = setInterval(() => {
    if (!runStartTime) return;
    const diff = Math.floor((Date.now() - runStartTime) / 1000);
    const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const secs = String(diff % 60).padStart(2, '0');
    queueTimeElapsed.textContent = `Time: ${hrs}:${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  if (runTimerInterval) clearInterval(runTimerInterval);
  runTimerInterval = null;
  runStartTime = null;
}

// =============================================================================
// TERMINAL LOGS
// =============================================================================
function addLogLine(log) {
  const line = document.createElement('div');
  line.className = `log-line log-${log.type || 'info'}`;
  line.setAttribute('data-type', log.type || 'info');

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = `[${log.time || new Date().toLocaleTimeString()}]`;

  const msgSpan = document.createElement('span');
  msgSpan.textContent = ` ${log.message}`;

  line.appendChild(timeSpan);
  line.appendChild(msgSpan);

  terminalOutput.appendChild(line);

  // Auto-scroll to bottom
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
  applyLogFilter();
}

function applyLogFilter() {
  const lines = terminalOutput.querySelectorAll('.log-line');
  lines.forEach((l) => {
    const t = l.getAttribute('data-type');
    if (activeLogFilter === 'all' || activeLogFilter === t) {
      l.style.display = 'block';
    } else {
      l.style.display = 'none';
    }
  });
}

logFilters.forEach((btn) => {
  btn.addEventListener('click', () => {
    logFilters.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeLogFilter = btn.getAttribute('data-filter');
    applyLogFilter();
  });
});

btnClearLogs.addEventListener('click', () => {
  terminalOutput.innerHTML = '';
});

// =============================================================================
// INVOICES & COMPANIES FETCHING
// =============================================================================
async function fetchCompanies() {
  try {
    const res = await fetch('/api/companies');
    const json = await res.json();
    if (json.ok && json.companies) {
      allCompanies = json.companies;
      renderCompaniesQueue(allCompanies);
    }
  } catch (e) {
    console.error('Failed to load companies:', e);
  }
}

function renderCompaniesQueue(companies) {
  companiesQueueList.innerHTML = '';
  companies.forEach((comp) => {
    const item = document.createElement('div');
    item.className = 'company-queue-item';
    item.setAttribute('data-name', comp.name);

    item.innerHTML = `
      <label class="company-check-label">
        <input type="checkbox" class="company-check" value="${comp.name}" checked>
        <span>${comp.name}</span>
      </label>
      <span class="company-tag">${comp.downloadedCount || 0} saved</span>
    `;

    companiesQueueList.appendChild(item);
  });
}

async function fetchInvoices() {
  try {
    const res = await fetch('/api/invoices');
    const json = await res.json();
    if (json.ok && json.invoices) {
      allInvoices = json.invoices;
      renderInvoicesTable(allInvoices);
      updateMetrics(allInvoices);
    }
  } catch (e) {
    console.error('Failed to load invoices:', e);
  }
}

function renderInvoicesTable(invoices) {
  const search = (invoiceSearch.value || '').trim().toLowerCase();
  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    return (
      (inv.invoiceNumber || '').toLowerCase().includes(search) ||
      (inv.company || '').toLowerCase().includes(search) ||
      (inv.dueDate || '').toLowerCase().includes(search)
    );
  });

  invoiceCountBadge.textContent = `${invoices.length} Downloaded`;

  if (filtered.length === 0) {
    invoicesTableBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">No invoices match search criteria.</td>
      </tr>
    `;
    return;
  }

  invoicesTableBody.innerHTML = '';
  filtered.forEach((inv) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${inv.invoiceNumber}</strong></td>
      <td><span class="badge badge-cyan">${inv.company}</span></td>
      <td>${inv.dueDate || 'N/A'}</td>
      <td>${inv.sizeFormatted || 'Unknown'}</td>
      <td><span style="color: var(--text-muted); font-size: 0.75rem;">${new Date(inv.modifiedAt).toLocaleTimeString()}</span></td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-xs btn-view-pdf" data-url="${inv.downloadUrl}" data-title="${inv.fileName}">
          <i data-lucide="eye"></i>
          <span>View PDF</span>
        </button>
      </td>
    `;
    invoicesTableBody.appendChild(tr);
  });

  refreshLucideIcons();

  document.querySelectorAll('.btn-view-pdf').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      const title = btn.getAttribute('data-title');
      openPdfModal(url, title);
    });
  });
}

function refreshLucideIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function updateMetrics(invoices) {
  metricTotalInvoices.textContent = invoices.length;
  let totalBytes = 0;
  invoices.forEach((inv) => {
    totalBytes += inv.sizeBytes || 0;
  });

  if (totalBytes > 1024 * 1024) {
    metricStorage.textContent = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    metricStorage.textContent = `${(totalBytes / 1024).toFixed(1)} KB`;
  }
}

invoiceSearch.addEventListener('input', () => {
  renderInvoicesTable(allInvoices);
});

btnRefreshInvoices.addEventListener('click', () => {
  fetchInvoices();
  fetchCompanies();
});

// =============================================================================
// MODAL
// =============================================================================
function openPdfModal(url, title) {
  modalTitle.textContent = title || 'Invoice Preview';
  pdfFrame.src = url;
  pdfModal.style.display = 'flex';
}

modalCloseBtn.addEventListener('click', () => {
  pdfModal.style.display = 'none';
  pdfFrame.src = 'about:blank';
});

window.addEventListener('click', (e) => {
  if (e.target === pdfModal) {
    pdfModal.style.display = 'none';
    pdfFrame.src = 'about:blank';
  }
});

// =============================================================================
// CONTROLS & EVENT LISTENERS
// =============================================================================
btnStart.addEventListener('click', () => {
  const selectedChecks = [...document.querySelectorAll('.company-check:checked')].map((c) => c.value);
  if (selectedChecks.length === 0) {
    alert('Please select at least one company in the queue.');
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: 'START',
        options: {
          selectedCompanies: selectedChecks,
          delayMs: Number(delaySlider.value) || 150,
          autoMode: true
        }
      })
    );
  }
});

btnPause.addEventListener('click', () => {
  if (currentBotState.status === 'PAUSED') {
    if (socket) socket.send(JSON.stringify({ type: 'RESUME' }));
  } else {
    if (socket) socket.send(JSON.stringify({ type: 'PAUSE' }));
  }
});

btnStep.addEventListener('click', () => {
  if (socket) socket.send(JSON.stringify({ type: 'STEP' }));
});

btnStop.addEventListener('click', () => {
  if (confirm('Are you sure you want to stop the bot queue?')) {
    if (socket) socket.send(JSON.stringify({ type: 'STOP' }));
  }
});

delaySlider.addEventListener('input', (e) => {
  const ms = Number(e.target.value);
  updateCockpitDelayLabel(ms);
  const clickSlider = document.getElementById('slider_clickDelayMs');
  const clickLabel = document.getElementById('val_clickDelayMs');
  if (clickSlider) clickSlider.value = ms;
  if (clickLabel) clickLabel.textContent = `${ms} ms`;

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'SET_SPEED', delayMs: ms }));
  }
});

btnSelectAll.addEventListener('click', () => {
  document.querySelectorAll('.company-check').forEach((c) => (c.checked = true));
});

btnSelectNone.addEventListener('click', () => {
  document.querySelectorAll('.company-check').forEach((c) => (c.checked = false));
});

btnOpenFolder.addEventListener('click', async () => {
  await fetch('/api/invoices/open-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
});

btnClearHistory.addEventListener('click', async () => {
  if (confirm('Are you sure you want to reset download history? The bot will re-examine all invoices on next run.')) {
    await fetch('/api/invoices/clear-history', { method: 'POST' });
    fetchCompanies();
    fetchInvoices();
  }
});

// =============================================================================
// INITIALIZATION
// =============================================================================
async function fetchInitialSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.ok) {
      allPresets = json.presets || {};
      syncSettingsToUI(json.settings);
    }
  } catch (e) {
    console.error('Failed to fetch settings:', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  refreshLucideIcons();
  connectWebSocket();
  fetchInitialSettings();
  fetchCompanies();
  fetchInvoices();
});
