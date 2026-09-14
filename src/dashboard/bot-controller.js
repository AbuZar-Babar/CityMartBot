const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { setDelayMultiplier } = require('../core/human');

class BotController extends EventEmitter {
  constructor() {
    super();
    this.status = 'IDLE'; // IDLE | STARTING | RUNNING | PAUSED | STOPPING | STOPPED | ERROR
    this.autoMode = true;
    this.delayMs = 250;
    this.maxInvoicesPerCompany = config.SCRAPER.latestInvoicesPerCompany || 10;
    
    this.currentStep = {
      stage: 1, // 1: Daemon, 2: Switcher, 3: Grid Read, 4: Filtering, 5: Exporting
      name: 'Idle',
      description: 'Bot is ready to start'
    };

    this.activeCompany = null;
    this.activeInvoice = null;
    this.activeSessionUser = config.CREDENTIALS.username || 'Authenticated User';

    this.progress = {
      companyIndex: 0,
      totalCompanies: 0,
      downloadedInCompany: 0,
      totalInCompany: 0,
      globalDownloaded: 0,
      globalTarget: 0,
      percent: 0
    };

    this.logs = [];
    this.maxLogs = 200;

    // Pause / Step mechanism
    this._pausePromise = null;
    this._pauseResolve = null;
    this._stepRequested = false;
    this._stopRequested = false;
    this._activeRunPromise = null;
  }

  log(message, type = 'info', meta = null) {
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      time: new Date().toLocaleTimeString(),
      timestamp: Date.now(),
      message,
      type, // 'info' | 'success' | 'warn' | 'error' | 'step'
      meta
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    console.log(`[BOT-${type.toUpperCase()}] ${message}`);
    this.emit('log', entry);
  }

  setStep(stage, name, description) {
    this.currentStep = { stage, name, description };
    this.emit('step', this.currentStep);
    this.emit('state', this.getState());
  }

  setActiveCompany(company) {
    this.activeCompany = company;
    this.emit('company_change', company);
    this.emit('state', this.getState());
  }

  setActiveInvoice(invoiceNum) {
    this.activeInvoice = invoiceNum;
    this.emit('invoice_change', invoiceNum);
    this.emit('state', this.getState());
  }

  updateProgress(patch) {
    this.progress = { ...this.progress, ...patch };
    if (this.progress.globalTarget > 0) {
      this.progress.percent = Math.min(
        100,
        Math.round((this.progress.globalDownloaded / this.progress.globalTarget) * 100)
      );
    } else {
      this.progress.percent = 0;
    }
    this.emit('progress', this.progress);
    this.emit('state', this.getState());
  }

  setSpeed(delayMs) {
    const ms = Math.max(50, Math.min(2000, Number(delayMs) || 250));
    this.delayMs = ms;
    // Map 250ms -> 1.0x, 100ms -> 0.4x, 500ms -> 2.0x
    const multiplier = ms / 250;
    setDelayMultiplier(multiplier);
    this.log(`Operation delay calibrated to ${ms}ms (${multiplier.toFixed(2)}x human cadence)`, 'info');
    this.emit('state', this.getState());
  }

  getState() {
    return {
      status: this.status,
      autoMode: this.autoMode,
      delayMs: this.delayMs,
      maxInvoicesPerCompany: this.maxInvoicesPerCompany,
      currentStep: this.currentStep,
      activeCompany: this.activeCompany,
      activeInvoice: this.activeInvoice,
      activeSessionUser: this.activeSessionUser,
      progress: this.progress,
      isPaused: this.status === 'PAUSED',
      isStopping: this.status === 'STOPPING',
      logs: this.logs.slice(-50)
    };
  }

  async checkPauseOrStop() {
    if (this._stopRequested) {
      this.status = 'STOPPED';
      this.setStep(1, 'Stopped', 'Execution stopped by operator');
      this.emit('state', this.getState());
      throw new Error('BOT_STOPPED_BY_USER');
    }

    if (this.status === 'PAUSED') {
      if (this._stepRequested) {
        this._stepRequested = false;
        this.log('Advancing single step...', 'step');
        return;
      }

      this.log('Bot execution paused. Waiting for operator resume/step...', 'warn');
      this.emit('state', this.getState());

      await new Promise((resolve) => {
        this._pauseResolve = resolve;
      });

      if (this._stopRequested) {
        this.status = 'STOPPED';
        this.emit('state', this.getState());
        throw new Error('BOT_STOPPED_BY_USER');
      }
    }
  }

  async start(options = {}) {
    if (this.status === 'RUNNING' || this.status === 'STARTING') {
      return { ok: false, message: 'Bot is already running' };
    }

    this.status = 'STARTING';
    this._stopRequested = false;
    this._stepRequested = false;
    this._pausePromise = null;
    this._pauseResolve = null;

    if (options.delayMs) this.setSpeed(options.delayMs);
    if (typeof options.autoMode === 'boolean') this.autoMode = options.autoMode;
    if (options.maxInvoicesPerCompany) {
      this.maxInvoicesPerCompany = Number(options.maxInvoicesPerCompany);
    }

    this.setStep(1, 'Initializing', 'Connecting to Chrome browser daemon (Port 9222)...');
    this.emit('state', this.getState());

    const { runBotProgrammatic } = require('../bot');

    this._activeRunPromise = (async () => {
      try {
        this.status = 'RUNNING';
        this.emit('state', this.getState());
        this.log('Bot execution started via Dashboard.', 'info');

        const result = await runBotProgrammatic(this, options);
        
        this.status = 'IDLE';
        this.setStep(1, 'Complete', 'All company queues finished successfully');
        this.log('Bot execution completed successfully!', 'success');
        this.emit('state', this.getState());
        return result;
      } catch (err) {
        if (err.message === 'BOT_STOPPED_BY_USER') {
          this.status = 'STOPPED';
          this.log('Bot stopped by user.', 'warn');
        } else {
          this.status = 'ERROR';
          this.log(`Bot encountered an error: ${err.message}`, 'error');
        }
        this.setStep(1, this.status, err.message);
        this.emit('state', this.getState());
        throw err;
      } finally {
        this._activeRunPromise = null;
      }
    })();

    return { ok: true, status: this.status };
  }

  pause() {
    if (this.status !== 'RUNNING' && this.status !== 'STARTING') {
      return { ok: false, message: 'Bot is not running' };
    }
    this.status = 'PAUSED';
    this.log('Operator requested Pause.', 'warn');
    this.emit('state', this.getState());
    return { ok: true };
  }

  resume() {
    if (this.status !== 'PAUSED') {
      return { ok: false, message: 'Bot is not paused' };
    }
    this.status = 'RUNNING';
    this.log('Operator requested Resume.', 'info');
    if (this._pauseResolve) {
      const resolve = this._pauseResolve;
      this._pauseResolve = null;
      resolve();
    }
    this.emit('state', this.getState());
    return { ok: true };
  }

  step() {
    if (this.status !== 'PAUSED') {
      return { ok: false, message: 'Bot must be paused to advance a step' };
    }
    this._stepRequested = true;
    if (this._pauseResolve) {
      const resolve = this._pauseResolve;
      this._pauseResolve = null;
      resolve();
    }
    return { ok: true };
  }

  stop() {
    if (this.status === 'IDLE' || this.status === 'STOPPED') {
      return { ok: false, message: 'Bot is already idle' };
    }
    this.status = 'STOPPING';
    this._stopRequested = true;
    this.log('Operator requested Stop.', 'warn');
    if (this._pauseResolve) {
      const resolve = this._pauseResolve;
      this._pauseResolve = null;
      resolve();
    }
    this.emit('state', this.getState());
    return { ok: true };
  }
}

// Singleton instance
const botController = new BotController();

module.exports = {
  BotController,
  botController
};
