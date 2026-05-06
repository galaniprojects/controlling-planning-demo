# CPC Demo App — Setup Guide

This guide covers fresh-clone setup for **macOS** and **Windows** side by side. The codebase itself is platform-agnostic — only the install commands and venv-activation paths differ.

## Prerequisites

| Tool | Required version | macOS install | Windows install |
|------|------------------|---------------|-----------------|
| **Python** | 3.12+ | `brew install python@3.12` or [python.org installer](https://www.python.org/downloads/macos/) | [python.org installer](https://www.python.org/downloads/windows/) — tick **"Add python.exe to PATH"** during setup |
| **Node.js** | 20 LTS+ | `brew install node@20` or [nodejs.org installer](https://nodejs.org) | [nodejs.org installer](https://nodejs.org) (or `winget install OpenJS.NodeJS.LTS`) |
| **Git** | any recent | preinstalled / `brew install git` | [git-scm.com](https://git-scm.com) (ships **Git Bash** which we'll use for `start.sh`) |

Verify the installs in a terminal:

```bash
# macOS / Linux
python3.12 --version
node --version
git --version
```

```powershell
# Windows (PowerShell or cmd) — Python ships a `py` launcher on Windows
py -3.12 --version
node --version
git --version
```

> **Where this guide diverges:** macOS uses `python3.12` and `source .venv/bin/activate`; Windows uses `py -3.12` and `.venv\Scripts\activate`. Where a step is identical on both, only one block is shown.

---

## Quick Start

```bash
git clone https://github.com/galaniprojects/controlling-planning-demo.git
cd controlling-planning-demo
```

### One-time setup

#### macOS / Linux

```bash
# Backend — Python venv + dependencies
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Frontend — Node packages
cd ../frontend
npm install
```

#### Windows (PowerShell)

```powershell
# Backend — Python venv + dependencies
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt

# Frontend — Node packages
cd ..\frontend
npm install
```

> Windows tip: if PowerShell blocks the `Activate.ps1` script later, run once per machine: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. We don't need `Activate.ps1` for install (we call `.venv\Scripts\python` directly), but it's needed for `activate` in the manual-start path below.

The backend creates `creta_demo.db` (SQLite) on first launch from `backend/seed/seed.sql`. There is no separate database server to install.

### Environment variables

The demo runs end-to-end with no environment variables set. Two optional knobs:

| Variable | Where | Default | When you need it |
|----------|-------|---------|------------------|
| `ANTHROPIC_API_KEY` | Administration → Planning Parameters → Integrations (preferred) **or** shell env | unset | The AI Report Builder feature requires it. Get a key at [console.anthropic.com](https://console.anthropic.com). Without it the AI Report Builder UI loads but reports a "missing API key" error on submit. |
| `VITE_APP_TITLE` | `frontend/.env` | `CPC — Controlling & Planning Center` | Override the browser tab title; useful for demo whitelabeling. |

Setting the Anthropic key:

```bash
# macOS / Linux — for the current shell only
export ANTHROPIC_API_KEY="sk-ant-..."

# macOS / Linux — persistent (zsh)
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
```

```powershell
# Windows — for the current PowerShell session
$env:ANTHROPIC_API_KEY = "sk-ant-..."

# Windows — persistent (writes to user environment)
setx ANTHROPIC_API_KEY "sk-ant-..."
```

The preferred path is still the Administration UI (Controller persona → Administration → Planning Parameters → Integrations) — it persists in the database alongside other planning parameters and survives `reset-demo`. The env-var path is a headless fallback for CI / scripted runs.

### Run the app

#### macOS / Linux

From the project root:

```bash
./start.sh
```

#### Windows

`start.sh` is a bash script. The simplest way to run it on Windows is **Git Bash** (installed alongside Git for Windows):

```bash
# In Git Bash, from the project root
./start.sh
```

Alternatively, run the two servers manually (see below) — there is no `start.bat` equivalent in the repo.

`start.sh` (or the manual-start sequence):
1. Starts the backend (FastAPI on port 8000)
2. Waits for the backend health check to pass
3. Resets demo data to a clean state
4. Starts the frontend dev server (Vite on port 5173)

Once running, open **http://localhost:5173** in your browser. Press `Ctrl+C` to stop both servers.

### Manual Start (alternative)

If you prefer to run each server in a separate terminal — or you're on Windows without Git Bash — start them by hand:

#### macOS / Linux

**Terminal 1 — Backend:**
```bash
cd backend
source .venv/bin/activate
python main.py
# Runs on http://localhost:8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
```

#### Windows (PowerShell)

**Terminal 1 — Backend:**
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python main.py
# Runs on http://localhost:8000
```

**Terminal 2 — Frontend:**
```powershell
cd frontend
npm run dev
# Runs on http://localhost:5173
```

If PowerShell rejects `Activate.ps1`, you can skip activation entirely:

```powershell
cd backend
.\.venv\Scripts\python main.py
```

---

## Run the tests

#### macOS / Linux

```bash
# Backend — unit tests (1554 tests as of v5.1 Wave 6)
cd backend
source .venv/bin/activate
python -m pytest tests/ -v

# Frontend — type check (the canonical type gate)
cd frontend
npx tsc --noEmit       # expects 0 errors
```

#### Windows (PowerShell)

```powershell
# Backend
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest tests/ -v

# Frontend
cd frontend
npx tsc --noEmit       # expects 0 errors
```

`npm run build` currently surfaces a pre-existing `DiffData`/`DetailViewLineItem` type-narrowing error in `IntakeDetail` — this is on `main` and unrelated to current wave work; use `tsc --noEmit` for type verification.

For visual regression and feature verification, the team uses Playwright MCP and Chrome DevTools MCP via the Claude Code IDE. Screenshots land in `qa/screenshots/` (gitignored).

---

## Project Structure

```
controlling-planning-demo/
├── backend/                # FastAPI + SQLAlchemy + SQLite
│   ├── main.py             # App entry point (port 8000)
│   ├── models/             # SQLAlchemy ORM models
│   ├── routers/            # API route handlers (~22 routers, 200+ endpoints)
│   ├── schemas/            # Pydantic v2 request/response schemas
│   ├── services/           # Business logic (calculations, forecast cycle, BTC, scenarios, rollup, ...)
│   ├── seed/               # seed.sql + JSON fixtures (manuals / FAQ / changelog / advisor goals)
│   ├── tests/              # Pytest suites
│   └── requirements.txt
├── frontend/               # React + Vite + shadcn/ui + Recharts
│   ├── src/
│   │   ├── modules/        # 10 module UIs (launchpad, portfolio, workbench, capacity, simulator, reporting, admin, charging, docs, backlog)
│   │   ├── components/     # Shared components (shared, layout, ui, charts)
│   │   ├── contexts/       # React contexts (Theme, Role, SidePanel, BottomDrawer)
│   │   ├── hooks/          # Custom hooks
│   │   ├── api/            # API client + endpoint definitions
│   │   └── App.tsx         # Router (10 module routes)
│   └── vite.config.ts      # Dev server config (proxy /api/* to port 8000)
├── qa/                     # Quality assurance
│   ├── test-plan.md        # E2E regression test plan (198 scenarios across 15 suites)
│   ├── bug-report.md       # Created during testing sessions
│   └── screenshots/        # Visual verification artefacts (gitignored)
├── guides/                 # Active spec documents and session guides for current/upcoming work
├── docs_archive/           # Completed / superseded specs (v5 workshop spec, v5 implementation guide)
├── start.sh                # One-command app launcher
├── CLAUDE.md               # Claude Code project instructions
├── PROGRESS.md             # Build progress tracker
└── SETUP.md                # This file
```

---

## Key URLs

| URL | Description |
|-----|-------------|
| http://localhost:5173 | Frontend app |
| http://localhost:8000 | Backend API |
| http://localhost:8000/docs | Swagger UI (interactive API docs) |
| http://localhost:8000/health | Health check endpoint |

The Vite dev server proxies all `/api/*` requests to the backend, so the frontend only talks to `localhost:5173` in development.

---

## Demo Personas

The app includes 4 demo personas, selectable via the role switcher dropdown in the top-right corner:

| ID | Name | Role | Title | Default Module | Key Access |
|----|------|------|-------|----------------|------------|
| `persona-controller` | Anna Meier | Controller | IT Controller | Portfolio | Full access — all modules, admin, approvals, scenarios |
| `persona-cc-owner` | Thomas Brenner | CC Owner | Head of Application Dev | Capacity | Capacity management (cc-muc-apd), portfolio dashboard |
| `persona-pl` | Priya Sharma | Project Lead | Senior Project Lead | Workbench | Project workbench, forecast cycles, intake submission |
| `persona-exec` | Dr. Klaus Weber | Executive | VP IT Strategy & Governance | Portfolio | Portfolio dashboard, simulator (read-only) |

For direct API access, pass the persona as a header:
```bash
curl -H "X-Current-User: persona-controller" http://localhost:8000/api/portfolio/kpis
```

---

## Demo Context

- **Demo date:** April 2026 — all time-dependent logic (actuals cutoffs, forecast boundaries, elapsed-month tinting) keys off this date
- **Currency:** EUR with European formatting — dot for thousands, comma for decimals (e.g., EUR 14.400,00)
- **Language:** English
- **Data range:** FY 2021 through FY 2029 (9 fiscal years)
- **Chargeable entities:** 34 total — 11 Projects (incl. 2 Run-stage at DoI 5) + 6 Offerings + 17 Internal Services (v5 polymorphic ChargeableEntity model)
- **Demo flagship:** Master Data Hub offering (`off-mdh` / S-code S042) — touches every v5 surface (Stage 1 distribution chain, automatic-mode BTC, Workbench tile grid, simulator Lever-12 rebalance scenario)
- **Hierarchy:** configurable n-level via `GroupingEntity`; demo seed renders 4 top-level Lines of Business
- **People:** ~52 active across 10 cost centres in 3 locations (Munich, Budapest, Pune)

---

## Reset Demo Data

Restore the original demo state at any time:

```bash
curl -X POST http://localhost:8000/api/admin/reset-demo
```

This drops and recreates all tables, re-runs `seed.sql`, and reloads JSON fixtures. It takes a few seconds. You can also trigger it from:
- The Swagger UI at http://localhost:8000/docs
- The Administration module in the app (Controller role only) via the "Reset Demo" button

Note: `start.sh` automatically resets demo data on every launch.

---

## Quality Assurance

QA artifacts live in the `qa/` directory:

- **`qa/test-plan.md`** — E2E regression test plan (198 scenarios across 15 suites)
- **`qa/bug-report.md`** — Created during each testing round to track issues found
- **`qa/screenshots/`** — Visual verification artefacts (gitignored — local-only)

Visual verification uses **Playwright MCP** and **Chrome DevTools MCP** via the Claude Code IDE — both servers are pre-configured. See `qa/test-plan.md` for full execution protocol and bug report template.

---

## Troubleshooting

### "python3.12: command not found" (macOS)
- Install via Homebrew: `brew install python@3.12`
- Or check the full path: `/opt/homebrew/bin/python3.12` (Apple Silicon) or `/usr/local/bin/python3.12` (Intel)

### "py: command not found" or `'py' is not recognized…` (Windows)
- Reinstall Python from [python.org](https://www.python.org/downloads/windows/) and tick **"Add python.exe to PATH"** + **"Install launcher for all users"**
- The `py` command is the Python launcher; if you used the Microsoft Store installer it may not be present — fall back to `python` if `python --version` reports 3.12+

### "No module named 'fastapi'"
- Make sure dependencies installed: `.venv/bin/pip install -r requirements.txt` (macOS) or `.\.venv\Scripts\python -m pip install -r requirements.txt` (Windows)
- If using `activate`, verify the venv is active — the shell prompt should show `(.venv)`

### "Address already in use" (port 8000 or 5173)

```bash
# macOS / Linux
lsof -i :8000                           # find the process
kill <PID>                              # stop it
pkill -f "python main.py"               # blanket-stop the backend
pkill -f vite                           # blanket-stop the frontend
```

```powershell
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 8000    # find the owning PID
Stop-Process -Id <PID>                  # stop it
# Or in cmd:
#   netstat -ano | findstr :8000
#   taskkill /PID <PID> /F
```

### Windows-only: PowerShell refuses to run `Activate.ps1`
- Run once per machine in an elevated PowerShell: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- Or sidestep activation entirely by calling `.\.venv\Scripts\python` directly

### Windows-only: line-ending warnings during `git clone`
- Set `git config --global core.autocrlf input` before cloning to avoid CRLF noise on commits
- The repo uses LF line endings; mixing them can confuse `start.sh` if you edit it on Windows

### Database issues
- Delete and restart: `rm backend/creta_demo.db` then start the backend again
- The database is auto-created on startup from `seed.sql`
- Or use the reset endpoint: `curl -X POST http://localhost:8000/api/admin/reset-demo`
- After pulling a branch that adds new schema columns, the DB file may carry the old shape; delete and let it re-seed (this project has no Alembic migrations)

### Frontend proxy errors (ECONNREFUSED on /api/*)
- Make sure the backend is running on port 8000 before starting the frontend
- `start.sh` handles this automatically (waits for backend health check)

### `npm run build` fails with a `DiffData` / `DetailViewLineItem` type error
- This is a pre-existing type-narrowing issue on `main` and is unrelated to wave work — `npx tsc --noEmit` is the canonical type gate (passes 0 errors)
- It does not affect the dev server (`npm run dev`) or runtime behaviour

### Anthropic API key not picked up by the AI Report Builder
- Confirm the key is set under Administration → Planning Parameters → Integrations (Controller persona only)
- Or, for headless runs, export `ANTHROPIC_API_KEY` in the shell that starts the backend
- After setting via UI, reset is not required — the value is read from the database on each request

---

## Fresh clone smoke test

A 5-minute walkthrough to verify a clean clone is healthy.

#### macOS / Linux

```bash
git clone https://github.com/galaniprojects/controlling-planning-demo.git
cd controlling-planning-demo

# Install
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ../frontend && npm install

# Launch
cd ..
./start.sh
```

#### Windows (PowerShell + Git Bash)

```powershell
# In PowerShell — clone and install
git clone https://github.com/galaniprojects/controlling-planning-demo.git
cd controlling-planning-demo

cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
cd ..\frontend
npm install
cd ..
```

```bash
# Switch to Git Bash to launch (start.sh is bash)
./start.sh
```

If you'd rather stay in PowerShell, open two terminals and run the manual-start commands shown earlier (backend in one, frontend in the other).

In the browser at **http://localhost:5173**, you should see:

1. The Launchpad with a 3-zone layout: branding band + greeting (`Good afternoon, Anna`), pending actions strip, and a fixed 3-column **module-card grid** with 9 cards (Portfolio Overview / Backlog / Project Workbench / Charging & Allocations / Capacity Management / What-If Simulator / Reporting / Administration / Documentation).
2. The role switcher (top-right) lets you cycle through **Anna Meier** (Controller, 9 cards) / **Priya Sharma** (PL, 8 cards) / **Thomas Brenner** (CC Owner, 7 cards) / **Dr. Klaus Weber** (Executive, 6 cards).
3. The Sun/Moon toggle (top-right, next to the role switcher) flips between light + dark themes; both render cleanly.
4. Clicking any module card navigates to that module — the grid is the primary navigation entry.
5. The Documentation Hub (`/docs`) loads with six tabs: Overview, Module Guides, API Reference, Data Model, FAQ, Changelog.

If any of those checks fails, see Troubleshooting above.
