# 🤖 CityMart Portal Invoice Bot

> An automated browser automation and RPA bot built with **Node.js** and **Puppeteer** to extract, parse, and download invoice PDFs across multi-entity accounts on the **CityMart iRely Web Portal**.

---

## 🌟 Key Features

- **Multi-Entity Company Switching:** Automatically handles the `#portalEntity` modal to switch across all configured legal entities (e.g. *Charge Up 101* through *Charge Up 117*).
- **Dynamic ExtJS Grid Parser:** Inspects live DOM tables, filters out credit/debit memos, and matches invoice rows (`SI-*`, `DR-*`) with transaction type verification.
- **Automated DevExpress PDF Export:** Automates the XtraReports ReportViewer toolbar, dispatches full mouse event lifecycles, and captures streamed invoice PDFs via Chrome DevTools Protocol (CDP).
- **Human-Like Emulation:** Emulates human mouse curves, natural typing speeds, and dynamic micro-delays to ensure UI event listeners fire reliably.
- **Smart Deduplication:** Tracks previously downloaded invoices in `data/processed-invoices.json` to prevent duplicate processing on subsequent runs.
- **Clean Output Organization:** Automatically organizes invoices by company and names them with their due dates:  
  `CityMart-Invoices/<Company>/<InvoiceNumber>_Due_<DueDate>.pdf`

---

## 📋 Prerequisites

Before running the bot, ensure you have the following installed:

1. **Node.js** (v18.0.0 or higher) — [Download Node.js](https://nodejs.org/)
2. **Google Chrome** (standard browser installation)
3. **Git** — [Download Git](https://git-scm.com/)

---

## 🚀 Quick Start Guide

### 1. Clone the Repository
```bash
git clone https://github.com/AbuZar-Babar/CityMartBot.git
cd CityMartBot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the `.env.example` template to create your `.env` file:

```bash
# Windows (cmd / powershell)
copy .env.example .env

# Mac / Linux
cp .env.example .env
```

Open `.env` in any text editor and fill in your CityMart portal credentials:
```env
CITYMART_USERNAME=your_username@domain.com
CITYMART_PASSWORD=your_password
CITYMART_COMPANY=Charge Up 101
```

---

## 💻 How to Run the Bot

### Option 1: 🖥️ Cybernetic Web Dashboard (Recommended)
Launch the full interactive Web Dashboard UI with live telemetry, dynamic speed control, PDF previews, and multi-tenant entity management:

```bash
npm run dashboard
# or
npm start
```
Then open **[http://localhost:3000](http://localhost:3000)** in your browser.

**Dashboard Capabilities:**
- 🎮 **Playback Engine:** Start, Pause, Resume, Step-through, and Stop automation runs on demand.
- ⚡ **Dynamic Speed Control:** Adjust interaction delay from 50ms (ultra-fast) to 1000ms (cautious) in real time without restarting the bot.
- 🏢 **Multi-Tenant Entity Selector:** Select specific companies to process or run all with 1 click.
- 📑 **In-Browser PDF Viewer:** Preview downloaded invoice PDFs instantly in modal viewer.
- 📂 **Quick Folder Access:** Open `CityMart-Invoices/` directly in File Explorer.
- 📟 **Live Terminal Console:** Real-time log streaming with severity filters (INFO, WARN, ERROR, SUCCESS).

---

### Option 2: ⌨️ Standard Interactive CLI
Launch the bot in interactive terminal mode:

```bash
npm run bot
```

The bot will automatically launch Google Chrome with a persistent profile on debugging port `9222`, check your session, and present an interactive menu for each company:

```text
============================================================
TARGET COMPANY: Charge Up 101 - 66290108
CURRENT ACTIVE IN PORTAL: [Charge Up 101]
============================================================
  [1] Switch Company in portal
  [2] Open Invoices Grid tab/screen
  [3] Scan & Download Invoices for this company
  [4] Move to Next Company (Skip remaining)
  [5] Auto-run all 3 steps for this company (1 -> 2 -> 3)
  [a] Auto-run ALL remaining companies without prompts
  [m] Manual pause (interact with Chrome yourself)
  [q] Quit
------------------------------------------------------------
Choose an option [1/2/3/4/5/a/m/q] (default: 5):
```

### Option 3: 1-Click Batch Run
- **Windows**: Double-click `run-all.bat`
- **macOS / Linux**: Double-click or execute `./run-all.command`

---

## 📁 Output Directory Structure

Extracted invoices are automatically stored in the `CityMart-Invoices/` directory:

```text
CityMart-Invoices/
├── ChargeUp101/
│   ├── DR-1462-260908223539_Due_9-17-2026.pdf
│   └── SI-176013_Due_9-8-2026.pdf
├── ChargeUp102/
│   └── SI-170595_Due_9-10-2026.pdf
└── ChargeUp103/
    └── SI-170611_Due_9-15-2026.pdf
```

---

## 🛠️ Available npm Commands

| Command | Description |
| :--- | :--- |
| `npm run dashboard` / `npm start` | Launches the Cybernetic Web Dashboard on `http://localhost:3000` |
| `npm run bot` | Runs the invoice extraction bot in interactive CLI mode |
| `npm run server` | Starts the persistent Chrome browser daemon on port 9222 |
| `npm run login` | Runs the automated login flow and saves session cookies |
| `npm run check-session` | Checks if the current portal session is still authenticated |
| `npm run test` | Tests Chrome DevTools Protocol (CDP) connection to port 9222 |

---

## ⚙️ Configuration & Customization

### Companies List
You can add, remove, or modify the list of target companies in [`config/companies.json`](config/companies.json):

```json
[
  {
    "name": "Charge Up 101",
    "entityNo": "66290108"
  },
  {
    "name": "Charge Up 102",
    "entityNo": "66290120"
  }
]
```

### Resetting Processed Invoice History
If you want to re-download all invoices from scratch, reset [`data/processed-invoices.json`](data/processed-invoices.json) to `{}`:

```json
{}
```

---

## 🔍 Troubleshooting & FAQs

#### 1. Chrome is already running or port 9222 is busy
If Chrome fails to start with remote debugging, close all existing Chrome windows or run:
```bash
# Windows
taskkill /F /IM chrome.exe

# Mac
pkill -f "Google Chrome"
```
Then rerun `npm run bot`.

#### 2. CAPTCHA or Two-Factor Authentication (2FA) appears
If the portal triggers a CAPTCHA, solve it directly in the open Chrome browser window. Choose option `[m]` in the CLI menu for a temporary pause, and press Enter when complete.

#### 3. Custom Chrome Executable Path
If Chrome is installed in a non-standard location, define `CHROME_PATH` in your `.env` file:
```env
CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
```

---

## 📜 License
ISC License — Created for enterprise accounting workflow automation.
