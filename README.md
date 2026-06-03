# VIPER

**IT Financial Planning Platform**

VIPER is a working demo of an end-to-end IT financial planning and portfolio management application. It covers the full controller's life-cycle — intake, ranking, planning, forecasting, capacity, charging, scenario analysis, and reporting — for an IT organisation that runs a mix of transformation projects, productised offerings, and internal services.

> This is a **demo** with realistic, hand-curated mock data. It is not connected to any production system, and it can be reset to its initial state at any time.

---

## A quick look

<p align="center">
  <img src="docs/screenshots/launchpad.png" alt="Launchpad — module-card grid with role-aware KPIs and a pending-actions strip" width="100%">
  <br><em>Launchpad — persona greeting, pending actions, and a 3-column module-card grid with role-aware KPIs</em>
</p>

<p align="center">
  <img src="docs/screenshots/portfolio.png" alt="Portfolio Overview — Change vs Run sub-modules, KPI strip, and configurable hierarchy tree" width="100%">
  <br><em>Portfolio Overview — Change vs Run sub-module selector, KPI strip, and a configurable n-level hierarchy tree drilling into project detail</em>
</p>

<p align="center">
  <img src="docs/screenshots/workbench-overview.png" alt="Workbench — Overview tab showing the 3×3 tile grid for a single project" width="100%">
  <br><em>Workbench — Overview tab with three-point summary, milestones, resource plan, cost mix, progress tracker, and Tech Navigator tiles</em>
</p>

<p align="center">
  <img src="docs/screenshots/forecast-grid.png" alt="Forecast & Planning — mixed-granularity grid with phase highlighting and three-point cells" width="100%">
  <br><em>Forecast &amp; Planning — mixed-granularity grid (monthly inner zone, quarterly outer zone) with milestone phase tinting and Baseline / Forecast / Actuals stacked in each cell</em>
</p>

<p align="center">
  <img src="docs/screenshots/charging-rollup.png" alt="Charging & Allocations — world map of location costs" width="100%">
  <br><em>Charging &amp; Allocations — world map of location costs, drillable from country down to individual charging-location bubbles</em>
</p>

---

## What's inside

VIPER is organised as ten modules. They share a left-rail navigation, a role-aware top bar, and a configurable n-level portfolio hierarchy.

### Launchpad
The home screen. A persona-aware greeting, the current date and forecast cycle status, a horizontal pending-actions strip (urgent items first), and a fixed 3-column **module-card grid** that doubles as the primary navigation entry. Each card carries a one-line description and 1–2 live KPIs computed for your role — the Workbench card, for example, reads "Forecast cycle: Q2 2026 Cycle · 4 projects overdue" for a Controller and "Your 5 projects" for a Project Lead. Cards you don't have access to are hidden entirely rather than greyed.

### Portfolio Overview
A two-pillar dashboard reflecting how the IT organisation actually runs:

- **Change Portfolio** — transformation projects with a KPI strip (forecast, run-vs-change split, plan drift), a configurable hierarchy tree (Line of Business → Programme → Project, but the levels are admin-editable), RAG indicators, an intake queue with controller approve / reject / send-back actions, a change request approval queue with editable grids and side-by-side diff, and an External Spend tab for cross-project vendor and category analysis. Projects handed over to a Run entity show a **Continuing cost** panel on their detail view — the linked Offering / Internal Service, its annual cost, cumulative cost since handover, and a deep-link into the Run entity's workspace.
- **Run Portfolio** — productised offerings and internal services, organised into three contextual tabs. **Dashboard** carries the annual-cost KPIs, a To-Business vs internal split, mix by entity type, an outsourcing ratio, region / division / country rollup panels, and a type-filtered entity list that drills into a slim entity workspace. **External Spend** shows cross-vendor and category analysis scoped to the projects that handed over to a Run entity. **Cost Distributions** is a hybrid surface: a *Roll-up* mode that accumulates Run cost up the org hierarchy (group by Line of Business, Programme, or Region / Division / Country — a Programme-attached entity correctly rolls into its parent LoB), and a *Cascade* mode that opens a vertical allocation tree for a selected entity (upstream feeders → focal → downstream consumers / BTC business terminals) reusing the shared allocation-flow visual.

A full-width segmented selector bar at the top of the module, with live Change/Run metrics, flips between the two pillars; the chosen view is remembered across sessions. Clicking any project from either view opens a full-page detail with a hierarchy breadcrumb and four tabs: Overview, Financial Detail, Resources & Costs, History.

### Backlog
Ranked demand pipeline with a composite scoring model. Each project is scored on three Complexity sub-criteria (Standardisation, Usage, Maintenance) and three Value Creation sub-criteria (Financial Benefit, Payback, Competitive Advantage), each on a 1–5 scale. Weights are admin-configurable and feed a single composite ranking.

Two views: a **Ranked List** with cutoff bands inserted at the budget-envelope cutoff and the reality-cutoff line, and a **Cube view** of three scatter charts grouped by transformation level (Just better / Paper to software / New business) with bubble size proportional to budget. A budget-envelope KPI strip stays visible across both views. Clicking into a project opens its project home (the Define page) with Identity, Tech Navigator, Financials, and Approval & Milestones tabs.

The demo seeds **22 pre-execution projects** (Proposed / Under Evaluation / Approved, four of them P3 pre-funded) against a **€13M ranked envelope** (the admin-editable `ranking_total_available_budget` planning parameter), so the should-be cutoff line falls mid-list — the ranking and cutoff are visibly meaningful rather than "all fit". Project lifecycle advancement is driven from the Define page: an **Advance to DoI N** button on the Approval & Milestones tab (visible once the DoI gate is satisfied, to the assigned PL up to DoI 2 and to controllers at any level) and a controller-only **Stage** menu in the header for off-path moves (Pause / Cancel / Reactivate). Creating a project (`POST /api/projects/define`) also mints its 1:1 `ChargeableEntity`, so new projects immediately surface in the Workbench and charging surfaces.

A project's state lives on two orthogonal axes: **`pipeline_stage`** is the single lifecycle source of truth (Proposed → … → Active → … → Cancelled), and **`review_state`** is a nullable intake/submission review sub-state (`pending_cc_confirmation` / `pending_approval` / `changes_requested`); the legacy overloaded `status` column was retired. Stage badges across the app (Workbench sidebar, overview, Define header) render `pipeline_stage` with the review sub-state shown as a separate badge. Entering execution (`Active` / `Hyper-maintenance`) requires a confirmed baseline (≥1 baseline row) — a controller override-with-reason is the only bypass.

### Workbench
The canonical workspace for **every chargeable entity** — Projects, Offerings, and Internal Services. A sidebar lists the entities you have access to with a segmented **All / Project / Offering / Internal Service** filter (Service Workbench S3); the main pane is type-aware, swapping between the project tab set and a service tile grid based on `entity.entity_type`.

The canonical URL is `/workbench?entity=<chargeable_entity_id>`. The legacy `?project=<project_id>` alias still works: on first render it resolves to the matching ChargeableEntity and the URL is rewritten to `?entity=…`, so external deep-links keep functioning.

**For Projects** the main pane shows five tabs:

- **Overview** — a 3×3 tile grid summarising project health: header, three-point summary (Baseline / Forecast / Actuals YTD with plan drift and execution variance), milestones, resource plan, cost mix (CapEx / OpEx donut + internal / external split), progress tracker (current milestone, deliverable checklist, confidence indicator, narrative), external costs, forecast health, and Tech Navigator scoring. Dialogs open from the tiles for a Variance Waterfall (baseline → grouped CR categories → current forecast) and a Progress vs Burn chart.
- **Forecast & Planning** — a mixed-granularity grid (monthly inner zone, quarterly outer zone, with a visible granularity boundary) showing Baseline / Forecast / Actuals stacked in each cell. Year columns collapse and expand; milestone phases tint the column backgrounds; a comparison chart sits below the grid in lockstep horizontal scroll. A 5-phase rolling forecast wizard handles the cycle submission workflow.
- **External Costs** — a vendor-by-month grid with stacked Forecast / Actuals / Accrual / PO-Obligo cells, procurement-status badges, sticky-right metadata (Role, PO #, Contract end, Status, Open PO), a 6-up KPI strip, and row expansion that shows delivery schedule + invoice history side by side.
- **Cost Allocation** (or **Distribution** when an entity has zero to-business share) — embeds the BTC profile editor for the project's chargeable entity, a sortable allocation breakdown table with click-to-drill into upstream cost paths, and an audit history.
- **Change History** — every approved change request and every cycle close becomes an immutable forecast version; this tab compares any two versions side by side.

**For Offerings and Internal Services** the main pane is a 3×3 **service tile grid** (Service Workbench S3): service header (identity + Run tag + owner + hierarchy), cost summary (own / inflows / rolled-up total), allocation flow (cascade counts + € totals, deep-links to the `/workbench/allocation-flow` view), Stage 1 distribution (to-business %, self-retained %, top 3 recipients — opens the global distribution surface), Stage 2 BTC (mode + top 3 charging locations — opens the global BTC surface), and an offering-hierarchy tile (Offerings only — Internal Services leave the 3,3 slot empty). Three tiles — Resource Plan, External Costs, Financial Health — render placeholders until the service-financial-parity phase ships.

**Allocation Flow page** (`/workbench/allocation-flow?entity=<id>`, Service Workbench S4): interactive SVG cascade DAG centred on the focal entity with three labelled columns — **UPSTREAM** (sources feeding the focal), **FOCAL ENTITY** (the queried entity in a bordered box with a self-retained dashed-badge), **DOWNSTREAM** (the focal's distribution targets) — plus a fourth column for Stage 2 business terminals (amber stadium pills per active BTC charging location, collapsing to a single "+N more (€X)" pill past the top-10 threshold). Cubic Bézier edges carry two-line %/€ labels and stroke-width scaled to the relative euro amount; the initial view is ±1 from focal with `+N` expand pills on boundary edges, click-to-expand depth by one, and a `Show full chain` toolbar button with a >20-node confirm. Hover an entity for own / inflows / effective breakdown; hover an edge for %, €, version, rationale. Click an entity to swap focus (URL rewrites to `?entity=<id>`); click a business pill to jump to the BTC surface. A top-right collapsible legend (sessionStorage-persisted) names the eight visual vocabularies (subtype colours via the violet / purple / blue palette, focal accent, business solid + dashed, self-retained dashed, edge thickness scale). A toolbar version-selector reuses the FD-3 `VersionSelector` pattern and refetches the cascade against the chosen `DistributionVersion`.

**Distribution Editor** (Stage 1 inter-service edges, Service Workbench S5 redesign): the per-entity editor opened from `/charging` → entity → `Edit edges` on a draft version uses a five-column destination table (Destination with subtype badge + identifier + colour strip / Percentage editable / Amount projected live / Depth badge `chain: N/max` with amber styling at depth ≥ max−1 / Action delete) plus a per-edge rationale Textarea and two terminal rows: **To Business** (amber accent, → icon, location count) and **Self-retained** (muted, ↺ icon, computed `100% − Σ distributions − to-business`). A segmented **sum validation bar** at the foot shows `Total allocation: X% / 100%` in three states (Normal / Complete green at exactly 100% / Over-allocated red — Save disabled). The dashed-border `+ Add distribution target` button opens a candidates-driven entity picker fed by `chargingApi.getDistributionCandidates`: filterable by subtype + free-text search, with depth badges and amber warnings at `near_max_depth_warning`, disabled rows with explanatory tooltips at `would_violate_max_depth`, and cycle-creators pre-excluded server-side. A `Show allocation preview` toggle opens a ~360px sticky **live side panel** ("Allocation Preview · Live · updates on edit") showing UPSTREAM INFLOWS + focal (with violet/purple/blue accent border) + DOWNSTREAM (pending percentages projected to € amounts with connector lines whose width scales to %) + To Business pill, and a footer link "Open full allocation flow →" that routes to the SVG DAG view for the same focal. **Whole-form Save** flushes pending edits in the strict order `deletes → updates → creates → to-business %` (avoids transient over-allocation 409s); 409 responses are parsed by `errors/parseAllocationError.ts` into a typed `{ type: 'cycle' | 'depth' | 'generic', … }` union and rendered as a red banner with the arrow-joined identifier path. Active versions render fully read-only (no inputs, no `+ Add`, no Save) with a blue `Lock` banner; the FD-3 `VersionSelector`, per-edge rationale, draft-only enforcement, and `DistributionSandboxHandlers` Simulator passthrough are all preserved.

### Capacity Management
Unified scope-driven workspace (v5.2 W3 + W4 + W5 + W6). The **Workspace** at `/capacity` renders a person-centric stacked-bar timeline with a collapsible year/quarter/month axis, project-colored segments, and over-allocation borders; a 5-card KPI summary bar (Headcount / Avg utilization / Over-allocated / Pending requests / Supply gap) drives smart filter chips (All / Over-allocated / Under-utilized / Pending requests / Unassigned months) with live count badges; a sticky-bottom demand-vs-supply strip shows unfulfilled-request pressure per period. Clicking a person row opens a 280px side panel (`PersonDetail`) with their allocations, monthly utilization summary, and pending-request entry points. Controllers and Executives at multi-CC scope (All-CCs / per-Location / per-hierarchy-node) see a collapsible **Capacity Dashboard** layer with four cards: utilization distribution histogram (six buckets), capacity forecast time-series (available / allocated / demand with green-surplus / red-deficit gap shading), headcount breakdown stacked bar (switchable across Location / Hierarchy / Role / CC), and a top-5 hotspot list spanning over-allocation, unfulfilled-demand, and chronic under-utilization (v5.2 W4). The dashboard auto-hides when scope narrows to a single CC. CC Owners triage requests by clicking **Review & assign** on a project-per-CC row; the workspace deep-links via `?assignment_project=…&cc=…` and opens a 400px assignment panel with project header, completion progress (shown as `N full · N partial · N unassigned` per spec §9.5), per-role sections (collapsible, with quick-fill bulk assignment), per-month assignment slots with person picker, and an action bar for Save Draft / Confirm / Decline. CR re-confirmations show inline diffs (blue increase / orange decrease) and pre-fill unchanged months. **Timeline ghost overlay (v5.2 W5)** — while assignment mode is active the timeline overlays dashed-border *ghost segments* on candidate person bars: 30% opacity / 1.5px dashed in the project's color for matching-role candidates, 15% opacity / 1px for fallback candidates; red border previews over-allocation; blue / orange borders mark CR increase / decrease months. Clicking a ghost assigns that person for the full remaining hours; clicking a just-assigned solid block reverts the gesture. Role groups containing matching candidates auto-expand on session entry. Beyond the inbox URL deep-link, two additional entry points open the same assignment session: the person-detail panel's **Review project** button on a pending-request card, and a click on an **Unfulfilled-demand strip cell** which opens a side panel listing pending projects with `Review project` CTAs. **Multi-person month splits (v5.2 W5)** — any month row supports a **+ Add** action that opens an hours-input variant of the picker pre-filled with the remaining hours; multiple people can split a single month with hours summing to the request total (rebalanced automatically when a typed value would over-commit), partial months are permitted and show a `Nh remaining` indicator, and the action bar offers **Confirm partial & send to controller** when partials exist. The **Resource Requests** queue at `/capacity/requests` shows a project-per-CC triage table with role badges, unassigned hours, age, priority, and status (new / in-progress / re-confirm); CR-triggered re-confirmations carry a distinct blue pill. A collapsible **Recently completed** section surfaces the user's actions over the last 7 days with action-type badges (Confirmed / Partial / Declined / Declined request / Re-confirmed). The **History** page at `/capacity/history` is a chronological audit trail with filters (acting user / action type / cost center / date range / project) and expandable detail-payload rows; capacity actions log six action types per spec §12.10 (`confirm`, `partial_confirm`, `decline`, `decline_request`, `assign_draft`, `cr_reconfirm`) with `partial_confirm` emitted automatically by the project-level confirm endpoint when any month's per-person sum is below the requested hours. Project Leads see a privacy-preserving **Resource Availability** view at `/capacity/availability` (v5.2 W4) — role-level capacity bars with two-layer fill (allocated / available), `⚡N` competing-demand badges, monthly breakdown side panel, location comparison, and a "Request this role" CTA into the Workbench. Person, project, and CC names are never exposed. **Cross-cutting integration & polish (v5.2 W6)** — every dashboard chart click is wired end-to-end: utilization-distribution buckets activate the matching filter chip on the timeline, capacity-forecast month bars expand the containing quarter and scroll the timeline to that column (per spec §11.4), headcount-breakdown segments push a scope change, and hotspot rows open the side panel; spec §10.8 cache-miss fallback now lets `ProjectSummaryPanel` resolve deep-linked projects that aren't in the workspace's current scope; the legacy `/capacity/project-assignment/{pid}` deprecation redirect preserves `cc` / `cr` query params and pins `scope=my_cc` so external bookmarks land cleanly inside the workspace; a new **Workbench → "Check availability" slide-over** (spec §13.9) lets PLs open the role-availability grid as a 50%-viewport drawer from the Forecast & Planning tab — selecting a slot closes the drawer and populates the F&P request banner with role / location / suggested period; SidePanel now closes on Escape, supports the `aria-pressed` state on FilterChipBar, and transitions smoothly between the 280px / 400px widths used across capacity panels.

### What-If Simulator
Scenario planning with a multi-tier action catalogue. Scenarios anchor against a specific forecast version rather than rebasing automatically. Tier 1 levers cover forecast grid edits, pipeline transitions, milestone slides, and cost reallocation; Tier 2 covers rate-table and Tech Navigator overrides; Tier 3 covers people / capacity-parameter / restructuring scenarios and is gated by an explicit visibility flag.

The flagship lever rebalances the Stage-2 BTC profile across charging locations: edits stay in a sandbox (Stage 1 distribution edges fork into a scenario-scoped `DistributionVersion` discriminated by `scenario_id`, anchored to a pinned production version at scenario creation so reactivations don't shift impact deltas mid-flight; BTC line edits live as overlays on the scenario rather than mutating canonical rows) until you explicitly **Promote**, which routes each diff through its native system path (forecast grid → direct or change request, pipeline → DoI gate, rate table → admin path, etc.). An 8-dimension impact dashboard (financial, backlog ranking, capacity, people, outsourcing ratio, investment mix, running cost, change summary) updates live as the scenario is edited. Project Leads have an **Apply-to-forecast** action that carries their own-project diffs into the next forecast cycle as provisional cells.

An optional AI Advisor panel surfaces optimisation recommendations using natural-language reasoning over the scenario state.

### Charging & Allocations
Two-stage IT cost flow with a polymorphic chargeable-entity model — the same machinery handles a Project, a productised Offering, or an Internal Service. Four primary surfaces in a left-rail layout:

- **Inter-service Distribution (Stage 1)** — sparse percentage edges between chargeable entities, organised into **effective-dated `DistributionVersion`** headers (FD-3, spec §4): each version is a draft/active state machine carrying a version-level rationale and a creation origin (blank / copy-active / copy-prior), with optional per-edge rationale. Resolution is purely by effective date — `in_force_version = max(active_from where active_from ≤ evaluated_date)` — with cadence-agnostic activation (no yearly assumption). Future-dated versions stay dormant until their `active_from`. A version diff report compares two versions edge-by-edge (added / removed / changed with old→new % + rationale deltas), defaulting to vs prior-by-effective-date. Per-entity Stage 1 surface renders a single entity's outbound edges, to-business %, self-retained residual, effective cost, and version timeline. The DAG resolver returns an effective cost per entity (own cost + sum of inflows). Save is blocked on cycle creation, with the cycle chain returned in the error body so the UI can render it. Active versions are immutable; edits scope to drafts only. Scenario forks (lever 12) are first-class versions discriminated by `scenario_id`, excluded from production resolution, and pinned to the production anchor at scenario creation so impact deltas don't shift mid-flight.
- **BTC Profiles** — per-entity Business-Transfer-Charging splits across charging locations. Manual mode is a hand-authored line list with a sum-to-100 gate; automatic mode snapshots from the User Measurement matrix for a chosen S-code, with a Refresh-from-UM diff dialog before commit. For automatic profiles the per-location grid is a **triple-display** (FD-5, spec §7) — each row carries the raw UM integer and the service's allocation key alongside the derived %, with the % the headline figure and the other two as interpretive context. A bulk year-rollover dialog scopes by All / By type / Specific entities for annual planning kickoff.
- **Location Cost Rollup** — a static SVG world map with country bubbles (size = magnitude, colour = dominant division) that drill into per-location bubbles, then into a side panel with the location's chargeable-entity inflows and the legal entities operating there. A tree-table view offers three pre-built rollup paths (Region → Country → Location, Division → Location, Country → Location) with cell drill-down to contributing entities and DAG upstream chains.
- **Reporting bridge** — quick-prompt buttons jump into the AI Report Builder with pre-filled prompts for cost-by-division, top-inflow-drivers, and regional year-over-year analyses.

WBS Element strings are **algorithmic, never stored** — generated at request time as `<identifier>-64-99-<charging_location_code>`.

### Reporting
Five standard reports with configurable groupings, column choices, saved views, and CSV / Excel export:

1. Programme Rollup
2. Cost Centre Financial Summary
3. Vendor Spend Analysis
4. Forecast Accuracy
5. Year-over-Year Comparison

Two additional report-building surfaces:

- **Interactive Report Builder** — click-to-build OLAP-style composer with a 18-dimension / 16-measure data catalogue. Drag dimensions into Rows / Columns / Filters, drop measures into Values, and watch a cross-tab table with collapsible row groups, subtotals, grand totals, sticky headers, conditional formatting (RAG presets), and four chart views (Table / Bar / Line / Pie). Calculated measures support two-operand formulas. Reports save, share with permission controls, and publish to a Report Library for team access.
- **AI Report Builder** — natural-language report generation. Describe a report in plain English through a guided chat interface; the assistant queries the database and renders tables, charts, and KPI summary cards. Iterative refinement happens through follow-up messages. Requires an Anthropic API key configurable in Administration → Planning Parameters → Integrations.

### Administration
Five-section sidebar navigation covering 24 admin sub-surfaces:

- **Master Data** — Cost Centres, Competence Centres, Lines of Business, Workforce Locations, People, Charging Locations, Legal Entities, Regions, Countries, User Measurement matrix.
- **Reference Catalogues** — Role Types, External Cost Types, Project Dependencies.
- **Planning & Ranking** — Rate Tables (with effective dates so historical cost calculations are accurate), Tech Navigator weight + threshold editor.
- **Portfolio Hierarchy** — configurable n-level node graph editor; controllers add or rename levels (e.g. "insert a Department level above LoB") without code changes.
- **System** — Users (with Tier 3 + change-reviewer flags), Role Permissions Grid (per-role per-entity-type grants for BTC profile / distribution / master-data overrides), Workflow Templates (six configurable workflows with per-step touchpoint editor), Scheduled Changes (a 5-state pending-review → activated lifecycle with a manual-trigger activation engine), Audit Log V2 (9 categories — incl. a dedicated Export category for SAP handoffs — with entity-scoped trail and CSV / Excel export), Planning Parameters.

Deactivation (`is_active` flags) is used everywhere instead of deletion so historical reports keep their references intact.

### Documentation Hub
In-app `/docs` route with six tabs:

- **Overview** — what each module does, at a glance.
- **Module Guides** — one manual per module with an Overview, key workflows, and tips.
- **API Reference** — live OpenAPI groupings with try-it-out forms.
- **Data Model** — entity reference grouped by domain (Organisation & People, Projects & Financials, Charging & Allocations, Scenarios, Workflow & System).
- **FAQ** — 40+ task-oriented Q&As, role-filtered.
- **Changelog** — release notes for demo storytelling.

---

## Cross-cutting features

- **Four personas, one app.** A role switcher in the top bar lets you experience the same data through Controller, Project Lead, Cost Centre Owner, or Executive eyes. Permissions, default modules, and KPI framings adapt automatically.
- **Dark mode.** Sun / moon toggle in the top bar; both themes are first-class. Theme preference persists in localStorage and respects the OS preference on first load.
- **European number formatting** throughout (dot for thousands, comma for decimals — `€14.400,00`).
- **Server-side computation.** The frontend receives ready-to-render rows; no roll-ups or calculations happen in the browser.
- **Configurable hierarchy.** The portfolio tree is a node graph, not hard-coded tables — admins reshape the organisation without a deploy.
- **Versioned forecasts.** Every approved change request and every cycle close creates an immutable snapshot; any two versions can be compared side by side.

---

## Quick Start

### Prerequisites

| Tool | Version | macOS install | Windows install |
|------|---------|---------------|-----------------|
| Python | 3.12+ | `brew install python@3.12` or [python.org](https://www.python.org/downloads/macos/) | [python.org installer](https://www.python.org/downloads/windows/) — tick **"Add python.exe to PATH"** |
| Node.js | 20 LTS+ | `brew install node@20` or [nodejs.org](https://nodejs.org) | [nodejs.org installer](https://nodejs.org) (or `winget install OpenJS.NodeJS.LTS`) |
| Git | any recent | preinstalled / `brew install git` | [git-scm.com](https://git-scm.com) — also installs **Git Bash**, needed to run `start.sh` |

### Setup — macOS / Linux

```bash
git clone https://github.com/bill-pap/viper-prototype.git
cd viper-prototype

# Backend
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Setup — Windows (PowerShell)

```powershell
git clone https://github.com/bill-pap/viper-prototype.git
cd viper-prototype

# Backend
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt

# Frontend
cd ..\frontend
npm install
```

### Run

From the project root:

```bash
# macOS / Linux — runs natively
./start.sh

# Windows — run from Git Bash (ships with Git for Windows)
./start.sh
```

This starts both servers, resets demo data, and opens the app at **http://localhost:5173**.

If you'd rather not use Git Bash on Windows, open two PowerShell terminals and start each server manually — see [SETUP.md](SETUP.md) for the exact commands plus environment variables, troubleshooting, and a fresh-clone smoke test.

---

## Demo Personas

Switch personas via the role dropdown in the top-right corner. Each persona has a different default landing module, set of Launchpad cards, and write permissions.

| Persona | Role | Title | Key Access |
|---------|------|-------|------------|
| **Anna Meier** | Controller | IT Controller | Full access — every module, all admin surfaces, all approvals |
| **Priya Sharma** | Project Lead | Senior Project Lead | Workbench, forecast cycle wizard, scenarios on own projects, intake submission |
| **Thomas Brenner** | CC Owner | Head of Application Development | Capacity Management, resource confirmations, scenarios scoped to managed cost centre |
| **Dr. Klaus Weber** | Executive | VP IT Strategy & Governance | Read-only portfolio + reports, scenario creation and comparison |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12 · FastAPI · SQLAlchemy ORM · Pydantic v2 |
| Frontend | React · TypeScript · Vite · Tailwind CSS |
| UI components | shadcn/ui (Radix UI primitives) |
| Charts | Recharts |
| Database | SQLite (embedded for demo) |
| Font | Inter |

---

## Project Structure

```
viper-prototype/
├── backend/              # FastAPI + SQLAlchemy + SQLite
│   ├── models/           # SQLAlchemy ORM models (Project, ChargeableEntity, BTCProfile, ...)
│   ├── routers/          # Route handlers (~22 routers, 200+ endpoints)
│   ├── schemas/          # Pydantic v2 request/response schemas
│   ├── services/         # Business logic (forecast cycle, BTC, scenarios, rollup, ...)
│   ├── seed/             # seed.sql + JSON fixtures (manuals / FAQ / changelog)
│   └── tests/            # Pytest suites
├── frontend/             # React SPA
│   ├── src/modules/      # 10 module UIs
│   ├── src/components/   # Shared components (shared, layout, ui, charts)
│   └── src/contexts/     # React contexts (Theme, Role, SidePanel, BottomDrawer)
├── qa/                   # E2E test plan + visual verification artefacts
├── start.sh              # One-command launcher
├── SETUP.md              # Detailed setup guide
└── PROGRESS.md           # Build progress tracker
```

---

## Demo Context

- **Demo date:** April 2026 — all time-dependent logic (actuals cutoffs, forecast boundaries, elapsed-month tinting) keys off this date.
- **Currency:** EUR with European formatting (dot for thousands, comma for decimals).
- **Data range:** FY 2021 through FY 2029.
- **Hierarchy:** four top-level Lines of Business out of the box; admin-configurable n-level via `GroupingEntity`.
- **People:** ~52 across 10 cost centres in 3 locations (Munich, Budapest, Pune).

---

## API Documentation

Interactive Swagger UI is available at **http://localhost:8000/docs** when the backend is running. The in-app Documentation Hub at `/docs` includes a live API Reference tab with the same OpenAPI groupings.

Authentication for development is header-based: every request carries an `X-Current-User` header with a persona ID (e.g. `persona-controller`). The backend resolves it to a `CurrentUser` context and applies role-based authorisation via FastAPI dependencies. For example:

```bash
curl -H "X-Current-User: persona-controller" http://localhost:8000/api/portfolio/kpis
```

Endpoints are grouped by domain:

| Domain | Path prefix | Purpose |
|--------|-------------|---------|
| Launchpad | `/api` | Roles, modules (with role-differentiated subtitle KPIs), KPIs, pending actions, project create/submit |
| Portfolio | `/api/portfolio` | Dashboard KPIs, project tree, intake queue, change request approvals, external-cost analysis (Change + Run-scoped via `/portfolio/run/external-costs/*`), **Run cost-distribution tree** (`GET /portfolio/run/cost-tree?group_by=lob\|program`) |
| Workbench | `/api/projects`, `/api/workbench`, `/api/charging` | Project list + overview + mixed-granularity forecast grid + forecast cycle + change-request diffs + version history (Projects); ChargeableEntity catalogue + cascade chain + effective cost + distribution summary + BTC profile (Offerings & Internal Services via the Service Workbench S3 tile grid) |
| Forecast Versions | `/api/forecast` | Cross-project version diff |
| Tech Navigator | `/api/projects` | Per-project Tech Navigator profile (read + partial update with score recompute) |
| Pipeline | `/api/projects` | Pipeline stage + DoI transitions, AI Council flag, within-cutoff override |
| Project Milestones | `/api/projects` | Milestone CRUD with controller-only baseline-edit gating |
| Define (project workflow) | `/api/projects` | Define-page surface: name-only `POST /define`, full `GET /{id}/define`, per-tab Save (`PUT /{id}/identity`, `PUT /{id}/approval-milestones`, `PUT /{id}/baseline-grid`) |
| Capacity | `/api/capacity` | Heatmap, drill-down, resource requests, role availability, dashboard (forecast / headcount-breakdown / hotspots / **utilization-distribution** v5.2 W4), audit history, inbox (project-per-CC triage queue, v5.2 W3), **`GET /planning-parameters?group=…`** read-only feed for client-side display thresholds (v5.2 closeout — any persona; trimmed payload vs the controller-only `/api/admin/parameters`) |
| Scenarios | `/api/scenarios` | CRUD, actions, comparison, AI advisor, BTC sandbox, 8-dimension impact, anchor + rebase + archive, promote, apply-to-forecast, **project-scope editable forecast grid** (`GET /{id}/projects` all selectable projects; `GET /{id}/projects/{pid}/grid` resolved overlay grid; `PUT`/`DELETE …/cells` cell-overlay write + revert per cell/line/all; `POST …/projects/{pid}/lines` add role line / `DELETE …/lines/{line_key}` remove (open to all authors); `GET`/`PUT`/`DELETE …/projects/{pid}/plan` project-plan overlay (start/end dates — date edits shift the resolved window — stage, DoI, milestones); `GET`/`PUT`/`DELETE …/projects/{pid}/mix` **Tier-3** seniority/sourcing mix swap (writes gated on Tier-3); `GET`/`POST`/`PUT`/`DELETE …/projects/{pid}/external-costs[/{line_key}]` external-cost line items add/remove/edit — vendor, category (cost-type), description, capex) |
| Reports | `/api/reports` | Five standard reports, saved views, AI report builder |
| Report Builder | `/api/report-builder` | Data catalogue, query execution, saved reports CRUD, share/publish, CSV export |
| Charging | `/api/charging`, `/api/admin` | ChargeableEntity CRUD (FD-6: allocation_key field, `chargeable-entity-types` metadata for the admin panel), **distribution versions** (effective-dated draft/active, create with blank/copy-active/copy-prior origin, activate with date + rationale, version diff, per-entity Stage 1 view) and **distribution edges** (scoped to a draft version, with per-edge rationale, save-time depth validation against `max_allocation_depth` per Service Workbench S1), **`GET /cascade/{entity_id}`** + **`GET /distribution-candidates/{source_entity_id}`** (Service Workbench S2 — full bidirectional chain for an entity; eligible distribution targets with resulting chain_depth + near-max warning, self/existing-target/cycle-creators pre-excluded), **BTC profiles** (FD-4: explicit `POST /btc-profiles/{id}/activate` freezes `um_snapshot_at` against the currently-active UM version; InternalService BTC is derivation-only — manual mode rejected by service + UI; FD-5: automatic-profile responses carry per-line `raw_um_value` read from the frozen UM version plus the entity's `allocation_key`, feeding the dashboard triple-display per `[F-DSH-01]`), **`GET /sap-export`** (FD-4: JSON/CSV; column-normalised % per service per charging location, WBS synthesised from active versions; FD-5: audited under the dedicated `export` category), **`/api/charging/user-measurement/*`** (FD-2: relocated from `/api/admin/user-measurement` — versions list/create with blank/copy_active/copy_prior origin, CSV draft import without auto-activate, bulk cell PATCH, activate, info reframed as system-of-record statement per `[F-DIR-01]`; FD-5: version detail returns `allocation_keys` per S-code so the matrix viewer surfaces each InternalService's allocation key per spec §3), rollup query, location breakdowns, WBS preview |
| Admin | `/api/admin` | Master-data CRUD, rates, planning parameters (Service Workbench S1: `max_allocation_depth` controller-editable with change-time validation against every active distribution version), hierarchy, audit log, demo reset |
| Docs | `/api/docs` | Module manuals, FAQ, changelog, OpenAPI proxy |
| Reference | `/api/reference` | Read-only role / cost-type / hierarchy / cost-centre catalogues |

---

## Reset Demo Data

Restore the original demo state at any time:

```bash
curl -X POST http://localhost:8000/api/admin/reset-demo
```

Or use the **Reset Demo** button in Administration. The reset is destructive (drops and recreates tables, re-runs `seed.sql`, reloads JSON fixtures) but takes only a few seconds.

---

## Quality Assurance

A regression test plan lives in [`qa/test-plan.md`](qa/test-plan.md) — 204 scenarios across 15 test suites covering all modules, personas, and features. Backend unit tests run with `python -m pytest tests/ -v` (2221 tests).
