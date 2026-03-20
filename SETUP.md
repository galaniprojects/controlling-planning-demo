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

This single script:
1. Starts the backend (FastAPI on port 8000)
2. Resets demo data to a clean state
3. Starts the frontend (Vite on port 5173)

Once running, open **http://localhost:5173** in your browser. Press `Ctrl+C` to stop both servers.

---

## Manual Start (alternative)

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
# Runs on http://localhost:5173 (proxies /api/* to port 8000)
```

---

## Demo Personas

The app includes 4 demo personas, selectable via the role switcher in the top right:

| Persona | Name | Role | Access |
|---------|------|------|--------|
| `persona-controller` | Anna Meier | Controller | Full access (admin, approvals, scenarios) |
| `persona-cc-owner` | Thomas Brenner | Cost Center Owner | Capacity management (cc-muc-appdev) |
| `persona-pl` | Priya Sharma | Project Lead | Project workbench, forecast cycles |
| `persona-exec` | Dr. Klaus Weber | Executive | Dashboard, scenarios (read-only) |

For direct API access, pass the persona as a header:
```bash
curl -H "X-Current-User: persona-controller" http://localhost:8000/api/portfolio/kpis
```

---

## Reset Demo Data

Restore the original demo state at any time:

```bash
curl -X POST http://localhost:8000/api/admin/reset-demo
```

Or use the Swagger UI at http://localhost:8000/docs.

---

## Troubleshooting

### "python3.12: command not found"
- Install via Homebrew: `brew install python@3.12`
- Or check the full path: `/usr/local/bin/python3.12`

### "No module named 'fastapi'"
- Make sure you ran `.venv/bin/pip install -r requirements.txt`
- If using `activate`, verify the venv is active (prompt shows `(.venv)`)

### "Address already in use"
- Find the process: `lsof -i :8000` (or `:5173`)
- Kill it: `kill <PID>`

### Database issues
- Delete and restart: `rm backend/creta_demo.db` then start the backend again
- Or use the reset endpoint above
