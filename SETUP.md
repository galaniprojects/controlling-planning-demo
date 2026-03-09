# CRETA Demo App — Setup Guide

Step-by-step instructions to get the project running from scratch.

---

## Prerequisites

Before you begin, make sure you have the following installed:

| Tool | Required Version | Check Command | Install |
|------|-----------------|---------------|---------|
| **Git** | Any recent version | `git --version` | [git-scm.com](https://git-scm.com) |
| **Python** | 3.12 or higher | `python3.12 --version` | `brew install python@3.12` or [python.org](https://python.org) |
| **Node.js** | 20 LTS or higher | `node --version` | [nodejs.org](https://nodejs.org) (needed for frontend, Phase C+) |

---

## 1. Clone the Repository

```bash
git clone https://github.com/bill-pap/vision-demo-prototype.git
cd vision-demo-prototype
```

---

## 2. Backend Setup

### 2.1 Create a Python virtual environment

```bash
cd backend
python3.12 -m venv .venv
```

### 2.2 Activate the virtual environment

**macOS / Linux:**
```bash
source .venv/bin/activate
```

**Windows (PowerShell):**
```powershell
.venv\Scripts\Activate.ps1
```

You should see `(.venv)` at the beginning of your terminal prompt.

### 2.3 Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2.4 Start the backend server

```bash
python main.py
```

The server will start on **http://localhost:8000**.

### 2.5 Verify it's working

Open your browser and go to:
- **http://localhost:8000/health** — should show `{"status": "ok"}`
- **http://localhost:8000/docs** — interactive API documentation (Swagger UI) — 90 endpoints across 8 groups
- **http://localhost:8000/redoc** — alternative API documentation (ReDoc)

The database file (`creta_demo.db`) is created automatically on first startup with all demo data pre-loaded.

> **Upgrading from v1:** If you have an existing `cpc_demo.db`, delete it and restart. The new `creta_demo.db` will be created automatically.

### 2.6 Test with different personas

All API requests require an `X-Current-User` header. Available personas:

| Header Value | Name | Role | Access |
|-------------|------|------|--------|
| `persona-controller` | Anna Meier | Controller | Full access (admin, approvals, scenarios) |
| `persona-cc-owner` | Thomas Brenner | Cost Center Owner | Capacity management (cc-muc-appdev) |
| `persona-pl` | Priya Sharma | Project Lead | Project workbench, forecast cycles |
| `persona-exec` | Dr. Klaus Weber | Executive | Dashboard, scenarios (read-only) |

Example with curl:
```bash
curl -H "X-Current-User: persona-controller" http://localhost:8000/api/portfolio/kpis
```

---

## 3. Frontend Setup

### 3.1 Install Node.js dependencies

```bash
cd frontend
npm install
```

### 3.2 Start the frontend dev server

```bash
npm run dev
```

The frontend will run on **http://localhost:5173**.

It proxies all `/api/*` requests to the backend on port 8000, so **make sure the backend is running first**.

### 3.3 Verify it's working

Open **http://localhost:5173** in your browser. You should see:
- The CRETA Launchpad with notifications and module tiles
- A role switcher dropdown (top right) with 4 demo personas
- Switching roles changes notifications and visible modules, and returns to the Launchpad

---

## 4. Reset Demo Data

If you've made changes through the app and want to restore the original demo state:

```bash
curl -X POST http://localhost:8000/api/admin/reset-demo
```

Or use the Swagger UI at http://localhost:8000/docs and find the `POST /api/admin/reset-demo` endpoint.

---

## 5. Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

To deactivate the virtual environment:
```bash
deactivate
```

---

## Troubleshooting

### "python3.12: command not found"
- Make sure Python 3.12 is installed: `brew install python@3.12`
- Try the full path: `/usr/local/bin/python3.12`

### "No module named 'fastapi'"
- Make sure you activated the virtual environment: `source .venv/bin/activate`
- Reinstall dependencies: `pip install -r requirements.txt`

### "Address already in use" when starting the server
- Another process is using port 8000
- Find it: `lsof -i :8000`
- Kill it: `kill -9 <PID>` (replace `<PID>` with the process ID from the previous command)

### Database issues
- Delete the database file and restart: `rm backend/creta_demo.db && python main.py`
- Or use the reset endpoint: `curl -X POST http://localhost:8000/api/admin/reset-demo`
