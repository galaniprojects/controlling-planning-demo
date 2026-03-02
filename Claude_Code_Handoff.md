# CPC Demo App — Claude Code Handoff

## 1. Project Summary

Build a fully working demo application called CPC (Controlling & Planning Centre) for Knorr-Bremse's IT financial planning transformation. The app replaces a legacy tool called CaPa with a modern planning and reporting system. This is a **demo with realistic mock data** — not connected to any real database. Its purpose is to show stakeholders (controllers, IT directors, executives) what the end-state system can do, securing buy-in and funding.

Success means: a presenter can switch between four roles, walk through 17 distinct demo scenarios (Section 6.15 of the spec), and every screen renders with realistic data — no empty states, no placeholder text, no broken workflows. The app should look and feel like a polished enterprise tool, not a prototype.

---

## 2. How to Use the Spec

The specification file `CPC_Demo_App_Specification.md` is the single source of truth. It is 2,156 lines across 12 sections. Here's the map:

| If you need to know... | Read... |
|------------------------|---------|
| What the app is and why | Section 1 (Project Context) |
| Tech stack | Section 2 |
| Module structure, navigation, roles | Section 3 (Application Architecture) |
| Data model concepts (baseline/forecast/actuals/CRs, variance model, RAG calculation) | Section 4 (Data Concepts) |
| Business workflows (new project, change requests, monthly forecast cycle) | Section 5 (Workflows) |
| All mock data: org structure, projects, people, financials, CRs, scenarios, AI Advisor goals, notifications, documentation content | Section 6 (Mock Data Specification) |
| Mock data generation approach (SQL seed + JSON fixtures) | Section 6.16 |
| Every screen layout, tab structure, interaction pattern, drill-down behavior | Section 7 (Module Screen Specifications) |
| Documentation requirements (API docs, module manuals, FAQ walkthroughs) | Section 8 |
| Visual design: components, colors, typography, spacing, chart styling, interaction patterns | Section 9 (Design System) |
| All 89 API endpoints: URLs, request/response shapes, authorization rules | Section 10 (API Design) |
| Decision log (all 25 decisions, all resolved) | Section 11 |
| Session history (context on why decisions were made) | Section 12 |

**Cross-referencing pattern:** Screen specs (Section 7) reference API endpoints (Section 10) which consume mock data (Section 6) rendered with design tokens (Section 9). When building a module, read all four sections for that module together.

---

## 3. Tech Stack

| Layer | Technology | Version Guidance |
|-------|-----------|-----------------|
| **Backend** | FastAPI (Python) | Python 3.12+, FastAPI latest stable |
| **ORM** | SQLAlchemy | Required — abstracts DB engine for future migration to MariaDB/PostgreSQL. Connection string today: `sqlite:///./cpc_demo.db` |
| **Database** | SQLite | Embedded, single file. No database server. |
| **Frontend** | React (Vite) | Node 20 LTS, latest Vite |
| **Component Library** | shadcn/ui (Radix UI + Tailwind CSS) | See Section 9.1 |
| **Chart Library** | Recharts | Bar, line, donut charts. See Section 9.2 |
| **Heatmaps** | CSS Grid + React components | Not Recharts — needs expandable rows and drill-down. See Section 9.2 |
| **Typography** | Inter | Google Fonts. See Section 9.5 |
| **Currency** | EUR (€) | All monetary values |
| **Language** | English | All UI text |

**Important:** SQLAlchemy is mandatory even though SQLite doesn't strictly require an ORM. The architecture must support a future migration to MariaDB or PostgreSQL by changing only the connection string. No raw SQLite-specific SQL — use SQLAlchemy's ORM models and query API throughout.

---

## 4. Recommended Build Order

The phases below follow a dependency chain — each phase builds on what the previous one produced. Within a phase, the order of sub-tasks is flexible. Each phase corresponds to a natural stopping point between Claude Code sessions.

### Phase A: Foundation — Database Schema + Seed Data
**Why first:** Everything else depends on the data layer existing.

1. Define SQLAlchemy ORM models for all entities (derive from Sections 4, 5.4, 6.1–6.15, and 7.6.4 architecture requirements)
2. Key schema requirements:
   - All reference data in proper tables (not constants in code)
   - Foreign keys throughout
   - `is_active` flag on deactivatable entities (cost centers, people, LoBs, competence centers)
   - Separate rate table with effective dates (not embedded in allocation rows)
   - KPI definitions in a table (even though only built-in KPIs exist now)
   - Planning parameters in a table (not config file)
   - Scenario state stored as full recalculated snapshots
3. Generate `seed.sql` from Section 6 data inventory — all consistency arithmetic must be correct (allocations sum to utilization %, financial patterns match project narratives, CR states match request states)
4. Create JSON fixture files for static content: module manuals (Section 6.13.1), FAQ walkthroughs (Section 6.13.2), AI Advisor pre-computed goals (Section 6.12)
5. Build seed loading mechanism: populate SQLite on startup, plus a `POST /api/admin/reset-demo` endpoint to reload from seed
6. **Checkpoint:** All tables created, seed data loaded, you can query any entity and get consistent data back. Commit.

### Phase B: Backend API
**Why second:** Frontend needs endpoints to call.

Build endpoint groups in this order (each group is independently testable):

1. **Reference Data** (Section 10.8, 6 endpoints) — standalone, no dependencies
2. **Administration** (Section 10.9, 21 endpoints) — depends on reference data models
3. **Global / Launchpad** (Section 10.2, 6 endpoints) — role context, notifications, modules
4. **Portfolio Overview** (Section 10.3, 14 endpoints) — depends on project/CR models
5. **Project Workbench** (Section 10.4, 11 endpoints) — depends on forecast cycle and CR models
6. **Capacity Management** (Section 10.5, 14 endpoints) — depends on allocation and request models
7. **What-If Simulator** (Section 10.6, 13 endpoints) — depends on scenario models and recalculation logic
8. **Documentation** (Section 10.7, 4 endpoints) — reads from JSON fixtures

Cross-cutting concerns to implement first:
- `X-Current-User` header → `get_current_user` FastAPI dependency → `CurrentUser` context object (Section 10.1)
- Pydantic response models for all endpoints (feeds auto-generated Swagger/ReDoc docs)
- Authorization middleware (role-based access checks, ownership enforcement)
- Consistent response shapes: `{ items: [...], total: N }` for lists, object for detail, updated object for mutations

**Checkpoint:** All 89 endpoints responding with correct data. Swagger UI at `/docs` shows full API documentation. Commit.

### Phase C: Frontend Shell
**Why third:** Module UIs need the routing and layout infrastructure.

1. Vite + React project setup with Tailwind CSS and shadcn/ui
2. Install Inter font
3. Top bar: app logo + breadcrumb (left), global help icon + role switcher dropdown (right)
4. Role switcher: calls `GET /api/roles` and `GET /api/roles/{role_id}/context`, sets `X-Current-User` header globally for all subsequent API calls
5. Launchpad: notification section, module tiles (role-dependent ordering and visibility), "Submit New Project" button (PL only), KPI strip
6. Routing: Launchpad → Module screens, breadcrumb updates, cross-module deep-linking
7. Side panel component (reusable: portfolio summary, module guide, FAQ, AI Advisor)
8. Bottom drawer component (reusable: capacity detail, project breakdown)
9. Color tokens, spacing tokens, RAG/utilization color mappings from Section 9

**Checkpoint:** Role switcher works, Launchpad renders with real data for all 4 roles, navigation between modules works. Commit.

### Phase D: Module UIs
**Why this order:** Each module introduces components the next module reuses.

1. **Portfolio Overview** (Section 7.2) — establishes expandable tree pattern, filter bar, chart components, approval action pattern. Three tabs: Dashboard, Intake Queue, Approvals.
2. **Project Workbench** (Section 7.3) — establishes master-detail pattern, 3-point comparison, trajectory chart, 5-phase forecast wizard. Three tabs: Overview, Forecast & Planning, Change History.
3. **Capacity Management** (Section 7.4) — establishes heatmap pattern (CSS grid), utilization color coding, bottom drawer detail. Two tabs: My Team, Organization Overview. Plus Request Management sub-view with master-detail.
4. **What-If Simulator** (Section 7.5) — most complex module. Three phases: Scenario Manager, Scenario Workspace (split layout with action panel + impact dashboard), Comparison View. Plus AI Advisor panel (collapsible right-side, distinct visual identity).
5. **Administration** (Section 7.6) — entity type selector, CRUD tables, detail panel for complex operations, planning parameters form. Tiers 1–2 only.

For each module:
- Read the corresponding Section 7 subsection, Section 10 endpoint group, Section 9 design tokens, and Section 6 mock data together
- Verify all demo walkthrough anchors (Section 6.15) for that module work end-to-end
- Commit after each module is complete

**Checkpoint:** All 6 modules functional, all 17 demo walkthrough scenarios pass. Commit.

### Phase E: Documentation Content + Polish
1. Module manuals: render markdown from JSON fixtures in right-side panel via "Guide" button (Section 8.2)
2. FAQ walkthroughs: render in right-side panel from top bar help icon (Section 8.3)
3. Verify Swagger UI and ReDoc are clean (Section 8.1) — all endpoints have summaries, descriptions, example values
4. Cross-module navigation: verify all deep-links work (notification click-throughs, portfolio → workbench, etc.)
5. Loading states, hover states, empty states (Section 9.8)
6. Final demo walkthrough: run through all 17 scenarios from Section 6.15 in sequence

**Checkpoint:** Application complete. Final commit.

---

## 5. Project Structure

```
cpc-demo/
├── README.md                    # Setup and run instructions
├── PROGRESS.md                  # Updated by Claude Code each session (see Section 8)
├── CPC_Demo_App_Specification.md  # The spec — read-only reference, do not modify
├── docker-compose.yml           # Optional — for containerized deployment
│
├── backend/
│   ├── requirements.txt
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Settings, DB connection string
│   ├── database.py              # SQLAlchemy engine, session, Base
│   ├── dependencies.py          # get_current_user, auth middleware
│   ├── models/                  # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── organization.py      # LoBs, CCs, competence centers, locations
│   │   ├── people.py            # People, roles, rate tables
│   │   ├── projects.py          # Projects, services, programs
│   │   ├── financial.py         # Baseline, forecast, actuals data
│   │   ├── change_requests.py   # CRs, requests, approvals
│   │   ├── capacity.py          # Allocations, utilization
│   │   ├── scenarios.py         # What-If scenarios, actions, snapshots
│   │   ├── system.py            # Parameters, KPI definitions, notifications
│   │   └── users.py             # Demo personas, role definitions
│   ├── routers/                 # FastAPI routers, one per API group
│   │   ├── __init__.py
│   │   ├── global_launchpad.py  # Section 10.2
│   │   ├── portfolio.py         # Section 10.3
│   │   ├── workbench.py         # Section 10.4
│   │   ├── capacity.py          # Section 10.5
│   │   ├── scenarios.py         # Section 10.6
│   │   ├── documentation.py     # Section 10.7
│   │   ├── reference.py         # Section 10.8
│   │   └── admin.py             # Section 10.9
│   ├── schemas/                 # Pydantic request/response models
│   │   └── (mirrors routers/)
│   ├── services/                # Business logic (calculations, recalculation engine)
│   │   ├── variance.py          # RAG calculation, 3-point variance
│   │   ├── forecast_cycle.py    # Session management, diff grouping
│   │   ├── scenario_engine.py   # What-If recalculation
│   │   └── advisor.py           # AI Advisor pattern matching
│   ├── seed/
│   │   ├── seed.sql             # All relational data
│   │   └── fixtures/
│   │       ├── manuals/         # Module manual JSON files
│   │       ├── faq/             # FAQ walkthrough JSON files
│   │       └── advisor/         # AI Advisor goal/path JSON files
│   └── tests/                   # Optional — endpoint smoke tests
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx              # Routing, role context provider
│   │   ├── api/                 # API client, X-Current-User header management
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   ├── layout/          # TopBar, Breadcrumb, SidePanel, BottomDrawer
│   │   │   ├── charts/          # Recharts wrappers (bar, line, donut)
│   │   │   └── shared/          # RAGBadge, StatusBadge, KPICard, FilterBar, etc.
│   │   ├── modules/
│   │   │   ├── launchpad/
│   │   │   ├── portfolio/
│   │   │   ├── workbench/
│   │   │   ├── capacity/
│   │   │   ├── simulator/
│   │   │   └── admin/
│   │   ├── contexts/            # RoleContext, etc.
│   │   ├── hooks/               # useApi, useCurrentUser, etc.
│   │   ├── types/               # TypeScript interfaces matching Pydantic schemas
│   │   └── lib/                 # Utilities, formatters (€, %, dates)
│   └── public/
│
└── .gitignore
```

This structure is a recommendation. Adjust if a different organization makes more sense during implementation — but keep the separation between models, routers, schemas, and services on the backend.

---

## 6. Key Architectural Rules

These are non-negotiable patterns drawn from across the spec. They apply everywhere.

**Data & Database:**
- SQLAlchemy ORM for all database access — no raw SQL queries in application code (seed.sql is the exception)
- All reference data in database tables, never in code constants or config files
- Deactivation, not deletion — `is_active` flag on cost centers, people, LoBs, competence centers
- Rate tables with effective dates — historical cost calculations use the rate in effect at the time
- Foreign keys throughout — cascade rules must work correctly for deactivation and reassignment
- KPI definitions stored in a table even though only built-in KPIs exist now

**API:**
- `X-Current-User` header on every request → resolved by `get_current_user` dependency → `CurrentUser` context object with: user_id, name, role, cost_center_id (if CC Owner), project_ids (if PL)
- Server-side computation — the frontend receives ready-to-render data. No roll-ups, variance calculations, tree building, or CR grouping in the frontend.
- Consistent response shapes: `{ items: [...], total: N }` for lists, object for detail, updated object for mutations
- Authorization enforced server-side on all mutation endpoints (role checks, ownership checks, 403 on violation)
- Pydantic models with type hints, descriptions, and example values on every endpoint

**Frontend:**
- shadcn/ui components only — do not introduce additional component libraries
- Design tokens from Section 9 (colors, spacing, typography) applied consistently
- Role-dependent rendering: module visibility, data filtering, write permissions all driven by the role context
- Side panels slide in from the right, content area shrinks (no overlay). Bottom drawers slide up with overlay.
- Charts use Recharts. Heatmaps use CSS grid with React components (not a chart library).

**What-If Simulator:**
- Every action POST returns the full recalculated scenario state — frontend never computes impacts locally
- Pre-computed scenario snapshots stored in the database — no runtime recalculation of pre-built scenarios
- AI Advisor uses keyword matching against pre-computed goals, returns pre-built paths. No AI/LLM calls.

**Demo Integrity:**
- Demo date is February 2026. All time-dependent logic calibrated to this date.
- All 4 demo personas must produce meaningful, populated views when selected
- No empty states in the default demo — every list, queue, chart, and notification has content

---

## 7. Definition of Done

### Per Module
- [ ] All endpoints for the module return correct data (verified via Swagger UI)
- [ ] Screen renders correctly for each role that has access
- [ ] All demo walkthrough anchors (Section 6.15) for this module work end-to-end
- [ ] Role-dependent visibility and permissions enforced (write actions disabled/hidden for wrong roles)
- [ ] Drill-down and cross-module navigation functional
- [ ] Design tokens applied (colors, typography, spacing match Section 9)
- [ ] Loading states present (skeleton loaders for data fetch)

### Overall Application
- [ ] All 89 endpoints functional
- [ ] Swagger UI at `/docs` and ReDoc at `/redoc` complete with descriptions and examples
- [ ] Role switcher cycles through all 4 personas with correct landing views
- [ ] All 17 demo walkthrough scenarios (Section 6.15) pass without data gaps
- [ ] Module manuals accessible via Guide button on each module
- [ ] FAQ walkthroughs accessible via top bar help icon
- [ ] Demo reset endpoint (`POST /api/admin/reset-demo`) reloads seed data
- [ ] Application starts with `pip install -r requirements.txt` + `python main.py` (backend) and `npm install` + `npm run dev` (frontend)
- [ ] Git repository has clean commit history with commits at each phase checkpoint

---

## 8. Multi-Session Continuity

This application is too large for a single Claude Code session. Use the following protocol to maintain continuity across sessions.

### PROGRESS.md
Maintain a `PROGRESS.md` file in the repository root. Update it at the end of every session with:

```markdown
# CPC Demo — Build Progress

## Current Status
Phase: [A/B/C/D/E]
Last completed: [what was finished]
Next up: [what the next session should start with]

## Completed
- [x] Phase A: Database schema + seed data (commit: abc1234)
- [x] Phase B: Backend API — reference and admin endpoints (commit: def5678)
- [ ] Phase B: Backend API — remaining endpoint groups
- [ ] Phase C: Frontend shell
...

## Deviations from Spec
- [any places where implementation diverged from the spec, and why]

## Known Issues
- [anything that needs attention in a future session]
```

### Session Start Protocol
When starting a new Claude Code session:
1. Read `PROGRESS.md` to understand current state
2. Read the relevant sections of `CPC_Demo_App_Specification.md` for the current phase
3. Run the app to verify the current state matches what PROGRESS.md claims
4. Continue from where the last session left off

### Git Discipline
- Commit after every meaningful milestone (schema done, each endpoint group, each module UI)
- Use descriptive commit messages: `"Phase A: database schema and seed data"`, `"Phase B: portfolio overview endpoints (14)"`, `"Phase D: capacity management module UI"`
- Do not squash — preserve the build history

---

## 9. Running the Application

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Backend runs on `http://localhost:8000`. Swagger UI at `http://localhost:8000/docs`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173` (Vite default). Configure API proxy to backend in `vite.config.ts`.

### Demo Reset
```bash
curl -X POST http://localhost:8000/api/admin/reset-demo
```
Reloads seed data, restoring the demo to its initial state.

---

## 10. GitHub Repository Setup

Initialize the repository before starting development:

```bash
git init cpc-demo
cd cpc-demo
cp /path/to/CPC_Demo_App_Specification.md .
cp /path/to/Claude_Code_Handoff.md .
```

Create `.gitignore`:
```
# Python
__pycache__/
*.pyc
*.pyo
.venv/
venv/
*.egg-info/
dist/
build/

# Node
node_modules/
dist/

# Database
*.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
```

Initial commit:
```bash
git add .
git commit -m "Initial commit: spec and handoff documents"
```

Create `PROGRESS.md` with initial state and commit:
```bash
echo "# CPC Demo — Build Progress\n\n## Current Status\nPhase: Not started\nNext up: Phase A — Database schema + seed data" > PROGRESS.md
git add PROGRESS.md
git commit -m "Add progress tracking"
```

Push to GitHub:
```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```
