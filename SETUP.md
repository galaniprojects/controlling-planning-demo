# CPC Demo App — Setup Guide

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
- **http://localhost:8000/docs** — interactive API documentation (Swagger UI)
- **http://localhost:8000/redoc** — alternative API documentation (ReDoc)

The database file (`cpc_demo.db`) is created automatically on first startup with all demo data pre-loaded.

---

## 3. Frontend Setup

> **Note:** The frontend is not yet built. This section will be updated in Phase C.

```bash
cd frontend
npm install
npm run dev
```

The frontend will run on **http://localhost:5173**.

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
- Delete the database file and restart: `rm backend/cpc_demo.db && python main.py`
- Or use the reset endpoint: `curl -X POST http://localhost:8000/api/admin/reset-demo`
