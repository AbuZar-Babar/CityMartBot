const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const config = require('../../config');
const { botController } = require('./bot-controller');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------------------------------------------------------
// WebSocket Event Dispatcher
// -----------------------------------------------------------------------------
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Forward controller events to all connected clients
botController.on('state', (state) => broadcast({ type: 'STATE_UPDATE', data: state }));
botController.on('log', (log) => broadcast({ type: 'LOG_ENTRY', data: log }));
botController.on('step', (step) => broadcast({ type: 'STEP_UPDATE', data: step }));
botController.on('progress', (prog) => broadcast({ type: 'PROGRESS_UPDATE', data: prog }));
botController.on('invoice_downloaded', (inv) =>
  broadcast({ type: 'INVOICE_SAVED', data: inv })
);

wss.on('connection', (ws) => {
  // Send immediate state sync on connect
  ws.send(JSON.stringify({ type: 'INIT_STATE', data: botController.getState() }));

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'START') {
        await botController.start(msg.options || {});
      } else if (msg.type === 'PAUSE') {
        botController.pause();
      } else if (msg.type === 'RESUME') {
        botController.resume();
      } else if (msg.type === 'STEP') {
        botController.step();
      } else if (msg.type === 'STOP') {
        botController.stop();
      } else if (msg.type === 'SET_SPEED') {
        botController.setSpeed(msg.delayMs);
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
    }
  });
});

// -----------------------------------------------------------------------------
// REST API Endpoints
// -----------------------------------------------------------------------------

// 1. Get Live Bot Status & Telemetry
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    data: botController.getState(),
    config: {
      portalUrl: config.PORTAL_URL,
      outputDir: config.PATHS.output,
      username: config.CREDENTIALS.username,
      port: 9222
    }
  });
});

// 2. Get Companies and their processed status
app.get('/api/companies', (req, res) => {
  try {
    const companies = JSON.parse(fs.readFileSync(config.PATHS.companiesFile, 'utf8'));
    let processedMap = {};
    if (fs.existsSync(config.PATHS.processedInvoicesFile)) {
      processedMap = JSON.parse(fs.readFileSync(config.PATHS.processedInvoicesFile, 'utf8'));
    }

    const enriched = companies.map((c) => {
      const key = c.name.replace(/\s+/g, '');
      const downloadedList = processedMap[key] || [];
      return {
        ...c,
        folderKey: key,
        downloadedCount: downloadedList.length,
        invoices: downloadedList
      };
    });

    res.json({ ok: true, companies: enriched });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 3. Get All Downloaded Invoices from output directory
app.get('/api/invoices', (req, res) => {
  try {
    const outDir = config.PATHS.output;
    const invoices = [];

    if (fs.existsSync(outDir)) {
      const companies = fs.readdirSync(outDir);
      for (const comp of companies) {
        const compPath = path.join(outDir, comp);
        if (fs.statSync(compPath).isDirectory()) {
          const files = fs.readdirSync(compPath).filter((f) => f.toLowerCase().endsWith('.pdf'));
          for (const file of files) {
            const filePath = path.join(compPath, file);
            const stat = fs.statSync(filePath);
            const m = file.match(/^(DR-[\d-]+|SI-\d+|\d+)_Due_([\d-]+)\.pdf$/i);
            invoices.push({
              fileName: file,
              company: comp,
              invoiceNumber: m ? m[1] : file.replace('.pdf', ''),
              dueDate: m ? m[2].replace(/-/g, '/') : 'Unknown',
              sizeBytes: stat.size,
              sizeFormatted: (stat.size / 1024).toFixed(1) + ' KB',
              modifiedAt: stat.mtime,
              downloadUrl: `/api/invoices/file/${encodeURIComponent(comp)}/${encodeURIComponent(file)}`
            });
          }
        }
      }
    }

    invoices.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    res.json({ ok: true, invoices, count: invoices.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 4. Stream or Download PDF File
app.get('/api/invoices/file/:company/:filename', (req, res) => {
  const { company, filename } = req.params;
  const safeComp = path.basename(company);
  const safeFile = path.basename(filename);
  const filePath = path.join(config.PATHS.output, safeComp, safeFile);

  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeFile}"`);
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.status(404).send('Invoice file not found');
  }
});

// 5. Open Invoices Output Folder in OS File Explorer
app.post('/api/invoices/open-folder', (req, res) => {
  const targetFolder = req.body.company
    ? path.join(config.PATHS.output, path.basename(req.body.company))
    : config.PATHS.output;

  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWin) {
    exec(`explorer "${targetFolder}"`);
  } else if (isMac) {
    exec(`open "${targetFolder}"`);
  } else {
    exec(`xdg-open "${targetFolder}"`);
  }

  res.json({ ok: true, path: targetFolder });
});

// 6. Reset Processed Log History
app.post('/api/invoices/clear-history', (req, res) => {
  try {
    fs.writeFileSync(config.PATHS.processedInvoicesFile, JSON.stringify({}, null, 2), 'utf8');
    botController.log('Invoice download history reset to empty.', 'warn');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 7. Playback Controls via REST
app.post('/api/bot/start', async (req, res) => {
  try {
    const result = await botController.start(req.body || {});
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/bot/pause', (req, res) => {
  res.json(botController.pause());
});

app.post('/api/bot/resume', (req, res) => {
  res.json(botController.resume());
});

app.post('/api/bot/step', (req, res) => {
  res.json(botController.step());
});

app.post('/api/bot/stop', (req, res) => {
  res.json(botController.stop());
});

app.post('/api/bot/speed', (req, res) => {
  botController.setSpeed(req.body.delayMs);
  res.json({ ok: true, delayMs: botController.delayMs });
});

// -----------------------------------------------------------------------------
// Server Initialization with Port Fallback
// -----------------------------------------------------------------------------
const DEFAULT_PORT = parseInt(process.env.PORT || '3000', 10);

function startServer(port) {
  const onError = (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[WARN] Port ${port} is in use, attempting fallback to port ${port + 1}...`);
      server.removeListener('error', onError);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  };

  server.once('error', onError);

  server.listen(port, () => {
    server.removeListener('error', onError);
    console.log(`\n=============================================================`);
    console.log(`⚡ CityMart Bot Automation Dashboard Live at:`);
    console.log(`👉 http://localhost:${port}`);
    console.log(`=============================================================\n`);
  });
}

if (require.main === module) {
  startServer(DEFAULT_PORT);
}

module.exports = { app, server, startServer };
