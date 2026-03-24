# CRETA Demo App — Setup Guide

## Prerequisites

| Tool | Required Version | Check Command | Install |
|------|-----------------|---------------|---------|
| **Python** | 3.12+ | `python3.12 --version` | `brew install python@3.12` or [python.org](https://python.org) |
| **Node.js** | 20 LTS+ | `node --version` | [nodejs.org](https://nodejs.org) |

---

## Quick Start

```bash
git clone https://github.com/bill-pap/vision-demo-prototype.git
cd vision-demo-prototype
```

### One-time setup

```bash
# Backend
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Run the app

From the project root:

```bash
./start.sh
```

This script:
1. Starts the backend (FastAPI on port 8000)
2. Waits for the backend health check to pass
3. Resets demo data to a clean state
4. Starts the frontend dev server (Vite on port 5173)

Once running, open **http://localhost:5173** in your browser. Press `Ctrl+C` to stop both servers.

### Manual Start (alternative)

If you prefer to run each server in a separate terminal:

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

---

## Project Structure

```
vision-demo-prototype/
├── backend/                # FastAPI + SQLAlchemy + SQLite
│   ├── main.py             # App entry point (port 8000)
│   ├── models/             # SQLAlchemy ORM models
│   ├── routers/            # API route handlers (9 routers, 90+ endpoints)
│   ├── seed/               # seed.sql + JSON fixtures
│   └── requirements.txt
├── frontend/               # React + Vite + shadcn/ui + Recharts
│   ├── src/
│   │   ├── modules/        # 7 module UIs (launchpad, portfolio, workbench, capacity, simulator, reporting, admin)
│   │   ├── components/     # Shared components (layout, ui, charts)
│   │   ├── contexts/       # React contexts (Role, SidePanel, BottomDrawer)
│   │   ├── hooks/          # Custom hooks
│   │   ├── api/            # API client + endpoint definitions
│   │   └── App.tsx         # Router (7 module routes)
│   └── vite.config.ts      # Dev server config (proxy /api/* to port 8000)
├── qa/                     # Quality assurance
│   ├── test-plan.md        # E2E regression test plan (138 scenarios, 10 suites)
│   └── bug-report.md       # Created during testing sessions
├── .claude/
│   └── launch.json         # Claude Code preview server configs
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
| `persona-exec` | Thomas Becker | Executive | VP IT Strategy | Portfolio | Portfolio dashboard, simulator (read-only) |

For direct API access, pass the persona as a header:
```bash
curl -H "X-Current-User: persona-controller" http://localhost:8000/api/portfolio/kpis
```

---

## Demo Context

- **Demo date:** March 2026 — all time-dependent logic (actuals cutoffs, forecast boundaries, elapsed month tinting) uses this date
- **Currency:** EUR with European formatting — dot for thousands, comma for decimals (e.g., EUR 14.400,00)
- **Language:** English
- **Data range:** FY 2021 through FY 2029 (9 fiscal years)
- **Projects:** 32 across 4 Lines of Business
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

- **`qa/test-plan.md`** — E2E regression test plan (138 scenarios across 10 suites, organized into 4 testing sessions)
- **`qa/bug-report.md`** — Created during each testing round to track issues found

Testing is done via Claude Code using preview tools. See `qa/test-plan.md` for full instructions, execution protocol, and bug report template.

---

## Troubleshooting

### "python3.12: command not found"
- Install via Homebrew: `brew install python@3.12`
- Or check the full path: `/usr/local/bin/python3.12`

### "No module named 'fastapi'"
- Make sure you ran `.venv/bin/pip install -r requirements.txt`
- If using `activate`, verify the venv is active (prompt shows `(.venv)`)

### "Address already in use" (port 8000 or 5173)
- Find the process: `lsof -i :8000` (or `:5173`)
- Kill it: `kill <PID>`
- Or kill all Node/Python dev servers: `pkill -f "python main.py"; pkill -f "vite"`

### Database issues
- Delete and restart: `rm backend/creta_demo.db` then start the backend again
- The database is auto-created on startup from `seed.sql`
- Or use the reset endpoint: `curl -X POST http://localhost:8000/api/admin/reset-demo`

### Frontend proxy errors (ECONNREFUSED on /api/*)
- Make sure the backend is running on port 8000 before starting the frontend
- `start.sh` handles this automatically (waits for backend health check)
