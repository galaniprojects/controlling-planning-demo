# CRETA

**Controlling, Reporting, Estimation, Tracking & Allocations**

A full-featured IT financial planning and portfolio management demo application built for Knorr-Bremse, replacing the legacy CaPa tool. CRETA provides end-to-end project portfolio visibility, capacity management, what-if scenario planning, and multi-dimensional reporting — all in a modern web interface.

> This is a **demo application** with realistic mock data. It is not connected to any production database.

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/launchpad.png" alt="CRETA Launchpad" width="100%">
  <br><em>Launchpad — personalized hub with module tiles and pending actions</em>
</p>

<p align="center">
  <img src="docs/screenshots/portfolio.png" alt="Portfolio Overview" width="100%">
  <br><em>Portfolio Overview — KPI dashboard, filterable project tree, and charts</em>
</p>

<p align="center">
  <img src="docs/screenshots/workbench.png" alt="Project Workbench" width="100%">
  <br><em>Project Workbench — master-detail view with timeline, forecast grid, and change history</em>
</p>

---

## Features

### Portfolio Overview
IT portfolio dashboard with KPI tiles (CY-scoped to current fiscal year), hierarchical project tree grouped by Line of Business, budget/forecast/actuals tracking, RAG status indicators, intake queue for new project submissions, change request approvals, and controller review with editable grids and diff comparison views.

### Project Workbench
Master-detail project workspace with three tabs: Overview (timeline chart, three-point estimates, resource summary), Forecast & Planning (monthly grid with collapsible year columns, CapEx/OpEx per line item), and Change History. Includes a 5-phase rolling forecast wizard with AI-generated suggestions and a full project submission workflow with resource planning, CC Owner confirmation, and controller change request review.

### Capacity Management
Team utilization heatmaps (CSS grid, person x month), cell-level drill-down showing allocated/available hours with person-level detail, organization-wide overview with 3 pivot views (Cost Center, Role, LoB), and resource request management with assignment preview.

### What-If Simulator
Scenario planning tool with 12 action types (7 project-level, 5 portfolio-level), real-time KPI impact calculation, year-scoped actions, multi-scenario comparison, portfolio drill-down, and an AI Advisor panel with optimization recommendations.

### Reporting
Five standard reports — Programme Rollup, Cost Center Financial Summary, Vendor Spend Analysis, Forecast Accuracy, and Year-over-Year Comparison. Features include custom project groupings, column configuration, saved views, and export capabilities.

### Administration
Entity management for Cost Centers, Competence Centers, Lines of Business, Locations, People, and Rate Tables. Configurable portfolio hierarchy with cross-module label propagation, location-aware planning parameters (standard hours per location), and audit logging.

---

## Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12+ | `brew install python@3.12` or [python.org](https://python.org) |
| Node.js | 20 LTS+ | [nodejs.org](https://nodejs.org) |

### Setup

```bash
git clone https://github.com/bill-pap/vision-demo-prototype.git
cd vision-demo-prototype

# Backend
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Run

```bash
./start.sh
```

This starts both servers, resets demo data, and opens the app at **http://localhost:5173**.

See [SETUP.md](SETUP.md) for manual start instructions, troubleshooting, and detailed configuration.

---

## Demo Personas

Four personas are available via the role switcher in the top-right corner:

| Persona | Role | Key Access |
|---------|------|------------|
| **Anna Meier** | Controller | Full access — all modules, admin, approvals, scenarios |
| **Thomas Brenner** | CC Owner | Capacity management, portfolio dashboard |
| **Priya Sharma** | Project Lead | Project workbench, forecast cycles, intake submission |
| **Thomas Becker** | Executive | Portfolio dashboard, scenarios (read-only) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy ORM, Pydantic |
| **Frontend** | React, TypeScript, Vite, Tailwind CSS |
| **UI Components** | shadcn/ui (Radix UI primitives) |
| **Charts** | Recharts |
| **Database** | SQLite (embedded, demo) |
| **Font** | Inter |

---

## Project Structure

```
vision-demo-prototype/
├── backend/              # FastAPI API (90+ endpoints across 9 routers)
│   ├── models/           # SQLAlchemy ORM models
│   ├── routers/          # Route handlers
│   ├── schemas/          # Pydantic request/response schemas
│   └── seed/             # seed.sql + JSON fixtures
├── frontend/             # React SPA
│   ├── src/modules/      # 7 module UIs
│   ├── src/components/   # Shared components (layout, ui, charts)
│   └── src/contexts/     # React contexts (Role, SidePanel, BottomDrawer)
├── qa/                   # Quality assurance
│   └── test-plan.md      # E2E regression test plan (138 scenarios)
├── docs/                 # Documentation assets
├── start.sh              # One-command launcher
├── SETUP.md              # Detailed setup guide
└── PROGRESS.md           # Build progress tracker
```

---

## API Documentation

The backend serves interactive API documentation via Swagger UI at **http://localhost:8000/docs** when the server is running.

The app also includes a built-in Documentation Hub accessible from the Launchpad, with module guides, API reference, data model overview, and FAQ.

### Key API Groups

| Router | Prefix | Endpoints | Description |
|--------|--------|-----------|-------------|
| **Launchpad** | `/api` | 8 | Roles, modules, KPIs, pending actions, project create/submit |
| **Portfolio** | `/api/portfolio` | 15 | Dashboard KPIs, project tree, intake queue (approve/reject/send-back/diff/accept-changes), CR approvals |
| **Workbench** | `/api/projects` | 10 | Project list, overview, timeline, forecast grid, 5-phase forecast cycle (start/acknowledge/suggestions/edit/review/submit) |
| **Capacity** | `/api/capacity` | 14 | Team heatmap, drill-down, resource requests, per-month assignments, org overview, project confirmation |
| **Scenarios** | `/api/scenarios` | 8 | CRUD, actions, comparison, AI advisor |
| **Reports** | `/api/reports` | 8 | Programme rollup, CC financial, vendor spend, forecast accuracy, YoY, saved views |
| **Admin** | `/api/admin` | 18 | Entity CRUD (cost centers, CCs, LoBs, locations, people), rates, parameters, hierarchy, audit log, demo reset |
| **Docs** | `/api/docs` | 3 | Module manuals, FAQ |
| **Reference** | `/api/reference` | 4 | Roles, cost types, LoBs, cost centers |

### Submission Workflow Endpoints

The project submission lifecycle (`draft` -> `pending_cc_confirmation` -> `pending_approval` -> `active` / `changes_requested`) is powered by:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/projects` | Create draft project with optional resource plan |
| `PUT` | `/api/projects/{id}/submit` | Submit draft for CC confirmation |
| `GET` | `/api/projects/{id}/resource-plan` | Get forecast data for resource plan editor |
| `PUT` | `/api/portfolio/intake/{id}/approve` | Controller approves project |
| `PUT` | `/api/portfolio/intake/{id}/reject` | Controller rejects project |
| `PUT` | `/api/portfolio/intake/{id}/send-back` | Controller requests changes with editable grid |
| `GET` | `/api/portfolio/intake/{id}/diff` | Get original vs proposed comparison grid |
| `PUT` | `/api/portfolio/intake/{id}/accept-changes` | PL accepts controller's proposed changes |
| `GET` | `/api/portfolio/intake/{id}/editable-grid` | Get forecast in editable format (controller) |
| `PUT` | `/api/portfolio/intake/{id}/resubmit` | PL resubmits after editing |

### Resource Assignment Endpoints (CC Owner)

The CC Owner assigns specific employees to resource requests before confirming to the controller:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/capacity/requests/{cc_id}/{req_id}/monthly-hours` | Per-month forecast hours for a resource request |
| `GET` | `/api/capacity/requests/{cc_id}/{req_id}/assignments` | Current per-month person assignments |
| `PUT` | `/api/capacity/requests/{cc_id}/{req_id}/assignments` | Save per-month person assignments |
| `GET` | `/api/capacity/project-assignment/{project_id}` | Project details with all requests and assignment status |

---

## Demo Context

- **Demo date:** March 2026
- **Currency:** EUR with European formatting (dot thousands, comma decimals)
- **Data range:** FY 2021 through FY 2029
- **Projects:** 32 across 4 Lines of Business
- **People:** ~52 active across 10 cost centres in 3 locations

---

## Reset Demo Data

Restore the original demo state at any time:

```bash
curl -X POST http://localhost:8000/api/admin/reset-demo
```

Or use the "Reset Demo" button in the Administration module.

---

## QA & Testing

A comprehensive regression test plan lives in [`qa/test-plan.md`](qa/test-plan.md) — 138 scenarios across 10 test suites covering all modules, personas, and features.

---

*Private repository — Knorr-Bremse IT*
