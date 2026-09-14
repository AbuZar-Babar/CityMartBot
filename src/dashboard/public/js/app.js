/**
 * CityMart Bot Automation Dashboard — Frontend Client Logic
 */

let socket = null;
let currentBotState = {};
let allInvoices = [];
let allCompanies = [];
let activeLogFilter = 'all';
let runStartTime = null;
let runTimerInterval = null;

// DOM Elements
const cdpStatusBadge = document.getElementById('cdpStatusBadge');
const cdpStatusText = document.getElementById('cdpStatusText');
const sessionUser = document.getElementById('sessionUser');
const activeEntityLabel = document.getElementById('activeEntityLabel');
const activeOpText = document.getElementById('activeOpText');
const pulseIndicator = document.getElementById('pulseIndicator');

const btnStart = document.getElementById('btnStart');
const btnStartText = document.getElementById('btnStartText');
const btnPause = document.getElementById('btnPause');
const btnStep = document.getElementById('btnStep');
const btnStop = document.getElementById('btnStop');

const delaySlider = document.getElementById('delaySlider');
const delayValueText = document.getElementById('delayValueText');
const speedPresets = document.querySelectorAll('.btn-preset');

const progressBarFill = document.getElementById('progressBarFill');
const progressMetricText = document.getElementById('progressMetricText');
const currentCompanyProgress = document.getElementById('currentCompanyProgress');
const queueTimeElapsed = document.getElementById('queueTimeElapsed');

const invoicesTableBody = document.getElementById('invoicesTableBody');
const invoiceSearch = document.getElementById('invoiceSearch');
const invoiceCountBadge = document.getElementById('invoiceCountBadge');
const btnRefreshInvoices = document.getElementById('btnRefreshInvoices');

const terminalOutput = document.getElementById('terminalOutput');
const logFilters = document.querySelectorAll('.btn-filter');
const btnClearLogs = document.getElementById('btnClearLogs');

const companiesQueueList = document.getElementById('companiesQueueList');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnSelectNone = document.getElementById('btnSelectNone');

const metricTotalInvoices = document.getElementById('metricTotalInvoices');
const metricStorage = document.getElementById('metricStorage');

const btnOpenFolder = document.getElementById('btnOpenFolder');
const btnClearHistory = document.getElementById('btnClearHistory');

const pdfModal = document.getElementById('pdfModal');
const modalTitle = document.getElementById('modalTitle');
const pdfFrame = document.getElementById('pdfFrame');
const modalCloseBtn = document.getElementById('modalCloseBtn');

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
      if (msg.type === 'INIT_STATE' || msg.type === 'STATE_UPDATE') {
        updateBotUI(msg.data);
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
    updateDelayLabel(state.delayMs);
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

function updateDelayLabel(ms) {
  let label = 'Stealth';
  if (ms <= 100) label = 'Turbo';
  else if (ms >= 400) label = 'Safe';
  delayValueText.textContent = `${ms}ms (${label})`;

  speedPresets.forEach((p) => {
    if (Number(p.getAttribute('data-ms')) === Number(ms)) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
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
          delayMs: Number(delaySlider.value) || 250,
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
  updateDelayLabel(ms);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'SET_SPEED', delayMs: ms }));
  }
});

speedPresets.forEach((p) => {
  p.addEventListener('click', () => {
    const ms = Number(p.getAttribute('data-ms'));
    delaySlider.value = ms;
    updateDelayLabel(ms);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'SET_SPEED', delayMs: ms }));
    }
  });
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
document.addEventListener('DOMContentLoaded', () => {
  refreshLucideIcons();
  connectWebSocket();
  fetchCompanies();
  fetchInvoices();
});
