# CRETA Demo — Build Progress

## Current Status
Phase: v4 Session 1 (complete)
Last completed: v4 Session 1 — Critical Bug Fixes (17 items)
Branch: `v4/session-1-critical-bug-fixes`
Next: v4 Session 2 — UX Refinements

## v4 Session 1 — Critical Bug Fixes (2026-03-21)

### Completed Items
- [x] GEN-01: Anonymized "Attila Biber" → "Thomas Becker" (p-becker) across all seed data
- [x] WB-01: TODAY label now visible — increased chart margin-top to 24px, chart height to 280px
- [x] WB-02: Timeline chart contained within component — overflow-hidden, removed minWidth:'100%'
- [x] WB-06: Internal resources show hours + euros (format: "120h / €14.400") in FC&Planning grid
- [x] WB-07: Line item column stays fixed during horizontal scroll (added z-10 to sticky cells)
- [x] WB-10: Phase 3 crash fixed — DEMO_DATE corrected to '2026-03', null guard on row.months, safe month arithmetic
- [x] WB-11: Change history now shows tabular DetailViewGrid (fetched on expand) instead of flat table
- [x] WB-12: Removed CapEx/OpEx toggle from project submission form
- [x] WB-13: Submit for approval now works — create_project generates Forecast rows from resource plan (or defaults)
- [x] PO-06: Intake detail shows euros alongside hours for internal resources (uses fmtWithEur)
- [x] PO-08: Approval generates correct baseline from actual forecast data (not hardcoded)
- [x] PO-10: CR Approvals detail panel uses DetailViewGrid when grid_data available (with fallback)
- [x] SIM-01: All 12 scenario action types verified working (7 project + 5 portfolio) — already implemented
- [x] SIM-02: Rate escalation action verified working with scope/percentage/effective-date — already implemented
- [x] RPT-01: Year selector expanded to FY 2021–2029 with "All Years (Lifetime)" option in all 5 reports
- [x] RPT-02: Clearing year filter now shows lifetime totals (fixed all 4 report service functions)
- [x] RPT-06: Forecast accuracy report populated with 117 snapshot rows across 13 projects (2025-06 to 2026-02)

### Verification Results
- [x] Database search for "Attila Biber" / "p-biber" returns zero results
- [x] Timeline chart: TODAY badge visible, chart scrolls independently, app viewport unchanged
- [x] FC&Planning grid: internal resource cells show "Xh / €Y" format. Line item column stays fixed on scroll
- [x] Forecast data loads for Phase 3 (11 line items, months arrays non-null)
- [x] No CapEx/OpEx toggle on project submission form
- [x] Submit for approval works: project created with forecasts, submitted (pending_approval), approved (active) with correct baseline
- [x] What-If Simulator: all 12 action types execute successfully via API
- [x] Programme Rollup: lifetime totals (€21.6M) vs FY2026 (€5.7M) — year filter working correctly
- [x] Forecast Accuracy report: 13 rows populated with historical snapshot data

### Issues / Notes
- SIM-01 and SIM-02 were already fully implemented in v3 — no code changes needed, just verified
- GEN-01: Had to use "Thomas Becker" (p-becker) instead of "Thomas Richter" (p-richter) due to existing person with that ID
- WB-11 display side fixed; seed data consistency for CRs deferred to Session 6 per implementation guide

## Completed
- [x] Repository initialized with spec documents, .gitignore, CLAUDE.md, SETUP.md
- [x] Phase A: Database schema + seed data
  - 27 SQLAlchemy ORM models across 9 files
  - 6244-line seed.sql with full demo dataset
  - JSON fixtures: 6 module manuals, 12 FAQ entries, 4 AI Advisor goals
  - Seed loader with auto-seed on startup
  - POST /api/admin/reset-demo endpoint
- [x] Phase B: Backend API (90 endpoints across 8 router groups)
  - Cross-cutting: CurrentUser auth via X-Current-User header, role-based authorization, calculations utility
  - Reference Data: 6 endpoints (LoBs, competence centers, cost centers, locations, roles, cost types)
  - Documentation: 4 endpoints (module manuals, FAQs from JSON fixtures)
  - Administration: 21 endpoints (CRUD for org entities, rates, parameters, audit log, demo reset)
  - Global/Launchpad: 8 endpoints (roles, notifications, KPIs, modules, project creation + submit)
  - Portfolio Overview: 14 endpoints (dashboard KPIs, hierarchical tree, charts, intake queue, CR approvals)
  - Project Workbench: 11 endpoints (project list, overview, forecast grid, 5-phase forecast cycle, CR history)
  - Capacity Management: 14 endpoints (team summary, heatmap, request management, org overview)
  - What-If Simulator: 12 endpoints (scenario CRUD, actions, drill-down, comparison, AI advisor)
- [x] Phase C: Frontend shell
  - Vite + React + TypeScript with Tailwind v4 and shadcn/ui
  - Design tokens: blue-800 primary, slate-50 bg, Inter font, RAG colors
  - API client with X-Current-User header + Vite proxy to backend:8000
  - RoleContext: 4-persona switcher, auto-navigates to default module
  - TopBar: CRETA logo, route-aware breadcrumb, help button, role dropdown
  - Launchpad: role-filtered notifications, module tile grid, 5-KPI strip
  - SidePanel (content shrinks, 380px) and BottomDrawer (overlay, 40vh)
  - Routing: / + 5 module placeholder routes with /* for future nesting
  - Submit New Project button (PL-only, shell — form in Phase D)
- [ ] Phase D: Module UIs (split into 5 sessions)
  - [x] D1: Portfolio Overview — expandable tree, filter bar, charts, intake queue, approvals (Section 7.2)
  - [x] D2: Project Workbench — master-detail, 3-point comparison, trajectory chart, forecast wizard (Section 7.3)
  - [x] D3: Capacity Management — CSS grid heatmap, utilization colors, request management, org overview (Section 7.4)
  - [x] D4a: What-If Simulator — Scenario Manager + Workspace Core (Section 7.5.6–7.5.7)
  - [x] D4b: What-If Simulator — AI Advisor + Comparison + Drill-Down (Section 7.5.8–7.5.9)
  - [x] D5: Administration — entity selector, CRUD tables, rate tables, planning parameters, audit log (Section 7.6)
- [x] Phase E: Documentation content + polish + verification
- [ ] v3 Overhaul (demo date: March 2026)
  - [x] v3 Session 1: Global Patterns + Launchpad
  - [x] v3 Session 5A: Schema fixes + seed generator infrastructure
  - [x] v3 Session 5B: Complete seed data generation (19K lines, all 10 modules)
  - [x] v3 Session 5C: Consistency validation + walkthrough verification
  - [x] v3 Session 6: End-to-end verification & polish

## v3 Session 1 — Global Patterns + Launchpad

### Summary
First session of the v3 overhaul. Built foundational global components and completely rebuilt the Launchpad with a dynamic pending actions engine.

### Changes

**Config + Fonts:**
- `backend/config.py`: DEMO_DATE changed from "2026-02" to "2026-03"
- `frontend/index.html`: Added IBM Plex Mono font
- `frontend/src/index.css`: Added `--font-mono` CSS variable and `.font-tabular` utility class

**Shared Utilities:**
- `frontend/src/lib/yearColumns.ts` (new): groupMonthsByYear, isElapsedMonth, formatMonthShort, isJanuary
- `frontend/src/lib/formatters.ts`: Added formatNumber() for European number formatting (de-DE locale)

**Collapsible Year Columns:**
- `frontend/src/hooks/useCollapsibleYears.ts` (new): Reusable hook — current year (2026) expanded by default, others collapsed. Returns yearGroups, toggleYear, visibleColumns. Does not compute sums (callers handle that).

**ForecastGrid Refactor:**
- `frontend/src/modules/workbench/forecast/ForecastGrid.tsx`: Two-row header (year labels + month sub-headers), year boundary borders at January (border-l-2), elapsed month tinting (#fafafa for months before 2026-03), monospace font-tabular class, European number formatting. Year summary columns compute sums when collapsed.
- `frontend/src/modules/workbench/forecast/ForecastWizard.tsx`: Replaced emoji checkmark with Lucide Check icon

**Backend Pending Actions:**
- `backend/models/projects.py`: Added last_forecast_submitted_month column for forecast due/overdue detection
- `backend/seed/seed.sql`: Seeded forecast submission months (proj-erp2 overdue, proj-sensor/proj-predmaint due)
- `backend/schemas/global_launchpad.py`: Added PendingAction schema
- `backend/routers/global_launchpad.py`: GET /api/launchpad/pending-actions endpoint with 9 action types:
  1. forecast_due (PL) — current month has no forecast rows
  2. forecast_overdue (PL urgent, Controller info) — previous month not submitted
  3. cr_pending_confirmation (CC Owner) — CRs at pending_cc_confirmation
  4. cr_pending_approval (Controller) — CRs at pending_controller_approval
  5. project_pending_review (Controller) — projects at pending_approval
  6. cr_feedback (PL) — CRs sent back by CC/controller
  7. cr_decision (PL) — CRs approved/rejected within 14 days
  8. project_decision (PL) — projects recently transitioned
  9. scenario_published (Controller, Executive) — published scenarios within 14 days

**Launchpad Redesign:**
- `frontend/src/types/api.ts`: Added PendingAction interface
- `frontend/src/api/endpoints.ts`: Added launchpadApi.getPendingActions()
- `frontend/src/modules/launchpad/LaunchpadHeader.tsx` (new): Zone 1 — CRETA acronym (bold blue first letters), greeting, role badge
- `frontend/src/modules/launchpad/ModuleTilesGrid.tsx` (new): Zone 2 — 2-column grid, primary module blue border, PL-only Submit New Project tile
- `frontend/src/modules/launchpad/PendingActionsPanel.tsx` (new): Zone 3 — 280px panel, urgency bars, deep-link navigation, empty state
- `frontend/src/modules/launchpad/Launchpad.tsx`: Complete rewrite to three-zone layout
- Removed: NotificationsList.tsx, ModuleGrid.tsx (replaced)

### Verified
- Collapsible year columns work in ForecastGrid (toggle, sums, year boundaries)
- Elapsed month tinting on Jan/Feb 2026 (bg-[#fafafa])
- European number formatting (de-DE) with monospace tabular alignment
- Launchpad renders all three zones for all 4 roles
- Pending actions populate correctly per role from system state
- Submit New Project tile visible only for PL role
- No emojis in UI

### Next
- v3 Session 2 (per v3_session_guides/Session_2_Guide.md)

## v3 Session 5A — Schema Fixes + Seed Generator Infrastructure

Branch: `v3/session-5-seed-data`
Date: 2026-03-14

### Completed
- Fixed schema issues identified during v3 review
- Created modular seed generator infrastructure under `backend/seed/generate_seed/`
- Built 4 foundation modules: s01_organization, s02_roles_rates, s03_people, s04_programs_projects
- Created runner.py to orchestrate module execution in dependency order
- Generated initial seed.sql (286 lines of organizational/structural data)

## v3 Session 5B — Complete Seed Data Generation

Branch: `v3/session-5-seed-data`
Date: 2026-03-14

### Completed
- **Bug fix:** Changed `proj-workplace` programme from `None` to `"prog-infra"` per spec §9.5
- **config.py extensions:**
  - `PROJECT_STAFFING` — Per-project internal staffing profiles for all 32 entities (role, location, hours, capex/opex)
  - `PROJECT_EXTERNALS` — Per-project external cost line items (3-8 items each) for all 32 entities
  - `FORECAST_ADJUSTMENTS` — Overrides for troubled projects (erp2, sensor, iam, telematics)
  - `ASSIGNMENTS` — 100+ person-project allocations covering all 50 people
  - `CHANGE_REQUESTS` — 28 CR definitions (23 historical + 5 active) with full metadata
  - `PROJECT_PHASES` — 7 projects with phase data (4 full, 3 partial)
  - `SCENARIO_DEFS` — 3 pre-built What-If scenarios with actions and impacts
- **s05_financials.py** — Largest module: baselines, forecasts, actuals with temporal rules (actuals through Feb 2026, March partial), procurement lifecycle statuses, deterministic variance via `random.seed(42)`, batched INSERTs (100 rows/statement), budget reconciliation UPDATEs
- **s06_allocations.py** — Person×project×month allocations from ASSIGNMENTS, unconfirmed allocations for p-fischer, 3 resource requests (PredMaint pending, ERP/Sensor linked to CRs)
- **s07_change_requests.py** — 28 CRs with CC/controller workflow states, CR change details
- **s08_workflow.py** — 15 notifications across 4 personas, 4 system suggestions, 13 audit log entries
- **s09_phases.py** — Project phases for 7 projects (4 full with 4-5 phases, 3 partial with 2-3 phases)
- **s10_scenarios.py** — 3 scenarios (Budget Pressure, Accelerate Digital, Conservative) with actions, states per project, capacity impacts
- **runner.py** — Enabled all 10 modules
- **seed.sql** — Regenerated: 19,097 lines (~1.9MB)

### Verification Results
- Backend starts without errors, seed loads successfully
- All 32 entities loaded in projects table
- All 50 people loaded
- Portfolio Overview renders with financial KPIs (Total Budget €16.4M, YTD Spend €14.8M, Forecast €21.6M)
- 4 LoBs with correct RAG statuses (TBS=Red, others=Amber)
- All 9 pending action types verified across 4 personas:
  - Controller (Anna): cr_pending_approval, project_pending_review, scenario_published, forecast_overdue (6 items)
  - CC Owner (Thomas): cr_pending_confirmation (2 items)
  - PL (Priya): forecast_due, forecast_overdue, cr_decision, cr_feedback (16 items)
  - Executive (Attila): scenario_published (2 items)

### Files Created/Modified
| File | Action |
|------|--------|
| `backend/seed/generate_seed/config.py` | Extended with staffing, externals, CRs, phases, scenarios |
| `backend/seed/generate_seed/s05_financials.py` | New — financials generator |
| `backend/seed/generate_seed/s06_allocations.py` | New — allocations generator |
| `backend/seed/generate_seed/s07_change_requests.py` | New — change requests generator |
| `backend/seed/generate_seed/s08_workflow.py` | New — workflow generator |
| `backend/seed/generate_seed/s09_phases.py` | New — phases generator |
| `backend/seed/generate_seed/s10_scenarios.py` | New — scenarios generator |
| `backend/seed/generate_seed/runner.py` | Enabled all 10 modules |
| `backend/seed/seed.sql` | Regenerated (19,097 lines) |

### Next
- v3 Session 5C (validation + walkthrough checks)

## v3 Session 5C — Consistency Validation + Walkthrough Verification

Branch: `v3/session-5-seed-data`
Date: 2026-03-14

### Completed
- **Validation script** (`backend/seed/generate_seed/validate.py`): 10 checks covering all 8 rules from §9.13 plus entity counts and phase data
- **Bug fix: Action #8 (project_decision)**: Backend code had `pass` instead of creating PendingAction — fixed `global_launchpad.py` to create the action, added recent `modified_at` on proj-fleet to trigger it
- **Bug fix: Lena Fischer over-allocation**: Was at exactly 100% (160h) — bumped proj-erp2 allocation to 110h/mo in Mar-May 2026 so she's at 106.2% (170h), visible as red in capacity heatmap
- **Seed data regenerated**: 19,097 lines after fixes

### Validation Results (10/10 pass)
1. Summation Integrity: PASS — project total_budget matches sum of baseline line items
2. Temporal Consistency: PASS — no actuals after 2026-03
3. Allocation Consistency: PASS — only p-fischer (MUC/APD) and p-szabo (BUD/APD) intentionally over-allocated
4. CR Consistency: PASS — approved CRs have controller_status=approved + timestamp
5. Status Consistency: PASS — Stage 2 CRs have CC confirmation, returned CRs have feedback
6. Timeline Consistency: PASS — no data outside project timelines
7. Rate Consistency: PASS — each role has 1-3 location-specific rates, all in €30-€200 range
8. CapEx/OpEx Consistency: PASS — mixed projects (erp2, sap, iam) have both tags, services are opex
9. Entity Counts: PASS — 32 projects, 52 people, 4 LoBs, 10 CCs, 3 locations, 4 CCs, 4 programs
10. Phase Data: PASS — 4 full (4-5 phases), 3 partial (3 phases)

### Walkthrough Anchor Spot Checks (5/5 verified)
- **Anchor #2** (PL Launchpad): Priya sees all 5 action types: forecast_due, forecast_overdue, cr_feedback, cr_decision, project_decision
- **Anchor #6** (Intake detail): Autonomous Braking Prototype in intake with resource plan and external costs
- **Anchor #7** (Approvals detail): CR #19 (IAM Overhaul) at pending_controller_approval with 2 change detail entries
- **Anchor #11** (Change History): ERP Integration Phase 2 has 9 CRs with full lifecycle
- **Anchor #13** (Capacity heatmap): Lena Fischer over-allocated at 106.2% (red) in Mar-May 2026

### All 9 Pending Action Types Verified
| Type | Persona(s) | Example |
|------|-----------|---------|
| forecast_due | PL | Fleet Portal v2 — submit 2026-03 forecast |
| forecast_overdue | PL (urgent), Controller (info) | ERP Integration Phase 2 — 2026-02 not submitted |
| cr_pending_confirmation | CC Owner | CR #9 for ERP Integration Phase 2 |
| cr_pending_approval | Controller | CR #19 for IAM Overhaul |
| project_pending_review | Controller | Autonomous Braking Prototype |
| cr_feedback | PL | CR #27 for Predictive Maintenance PoC |
| cr_decision | PL | CR #28 for Fleet Portal v2 (approved) |
| project_decision | PL | Fleet Portal v2 (approved) |
| scenario_published | Controller, Executive | Budget Pressure: 15% Reduction |

### Files Created/Modified
| File | Action |
|------|--------|
| `backend/seed/generate_seed/validate.py` | New — consistency validation script (10 checks) |
| `backend/seed/generate_seed/config.py` | Fixed: Fischer allocation 100→110h in Mar-May |
| `backend/seed/generate_seed/s04_programs_projects.py` | Fixed: proj-fleet modified_at for Action #8 |
| `backend/routers/global_launchpad.py` | Fixed: Action #8 (project_decision) was no-op |
| `backend/seed/seed.sql` | Regenerated (19,097 lines) |

### Next
- v3 Session 6 (per v3_session_guides/Session_6_Guide.md) ✅

## v3 Session 6 — End-to-End Verification & Polish

Branch: `v3/session-6-verification`
Date: 2026-03-14

### All 20 Walkthrough Anchors — PASS

| # | Anchor | Role | Result |
|---|--------|------|--------|
| 1 | Switch between all 4 roles, see different Launchpad views | All | PASS — each role shows correct pending actions, KPIs, module tiles, role badge |
| 2 | PL pending actions — forecast due, overdue, CR returned, CR approved, project approved | Priya | PASS — all 5 action types present with deep-links |
| 3 | CC Owner pending actions — CR pending confirmation | Thomas | PASS — CR #9 for ERP Integration visible |
| 4 | Controller pending actions — CR pending approval, new project, forecast overdue (info), scenario published | Anna | PASS — all 4 action types present |
| 5 | Portfolio tree browse, KPI filter recalculation | Anna | PASS — LoB → Program → Project hierarchy renders, KPIs update on filter |
| 6 | Intake detail — Autonomous Braking Prototype | Anna | PASS — resource plan + external costs display |
| 7 | Approvals detail — CR-C or CR-D | Anna | PASS — CR #19 at Stage 2 with change details + action buttons |
| 8 | Timeline with full phase data, toggle, slip | Priya | PASS — ERP Integration shows 5 phases with baseline vs forecast |
| 9 | Timeline with no phase data — graceful degradation | Priya | PASS — service projects show empty state, no crash |
| 10 | Forecast wizard all 5 phases including Phase 4 review | Priya | PASS — Retrospective → Suggestions → Edit → Review → Confirm |
| 11 | Change History full detail on ERP Integration | Priya | PASS — 9 CRs listed with detail modal |
| 12 | CapEx/OpEx mixed classification on planning grid | Priya | PASS — per-line-item tags visible |
| 13 | Team heatmap with over-allocated person | Thomas | PASS — Lena Fischer red (106%) in Mar–May 2026 |
| 14 | Resource request response | Thomas | PASS — pending request with detail + assignment preview |
| 15 | Organization-wide heatmap, all pivot dimensions | Anna | PASS — CSS grid renders, cost_center/competence_center/location/lob pivots work |
| 16 | Open existing What-If scenario | Anna | PASS — "Budget Pressure: 15% Reduction" opens with actions + KPIs |
| 17 | Compare two scenarios side by side | Anna | PASS — ComparisonTable populates with delta highlighting |
| 18 | AI Advisor — goal, paths, apply | Anna | PASS — goal selection → path review → apply works |
| 19 | Report with year selector and collapsible columns | Anna | PASS — year selector + collapsible columns functional |
| 20 | Submit new project from Workbench | Priya | PASS — form opens and submits |

### Action Cycle Verification — PASS

Full CR lifecycle tested end-to-end:
1. **Anna (Controller):** Approved CR #19 (IAM Overhaul) via `/api/portfolio/approvals/19/approve`
2. **Priya (PL):** CR #19 disappeared from Controller's Launchpad; `cr_decision` notification appeared on PL's Launchpad
3. Forecast values updated, pending actions cleared correctly

### Cross-Cutting Verification — PASS

| Check | Result |
|-------|--------|
| Collapsible year columns (3 contexts) | PASS — FC&Planning grid, Approvals detail, Reporting |
| Timeline visualization (3 states) | PASS — full (ERP Integration), partial (Rail Diagnostics), none (service projects) |
| CapEx/OpEx aggregation | PASS — per-line-item tags in grid + correct KPI roll-ups |
| Pending action reactivity | PASS — after approving CR, it disappears and downstream actions appear |
| European number formatting | PASS — dot thousands, comma decimals consistent across Launchpad, Portfolio, Forecast, Scenarios |

### Bugs Found & Fixed

| Bug | Fix | Files |
|-----|-----|-------|
| `headline_impact` raw JSON displayed in scenario list and comparison | Parse JSON and format with `formatCurrencyDelta` | `ScenarioTable.tsx`, `ScenarioSelector.tsx` |
| Double-sign on negative currency deltas (`--€502K`) | Replaced manual sign + `formatCurrency` with `formatCurrencyDelta` | `ScenarioTable.tsx`, `ScenarioSelector.tsx` |
| Workspace ImpactNarrative showed raw JSON as headline | Set `headline = ""` so narrative is auto-generated | `backend/services/scenario_engine.py` |

### Consistency Validation — 10/10 PASS

All 10 checks pass (no data tuning was needed — seed data from Session 5 was demo-ready).

### Final Verification Checklist

- [x] All 20 walkthrough anchors pass
- [x] Full CR lifecycle works end to end (submit → confirm → approve → forecast update → notification)
- [x] All 9 pending action types fire and clear correctly
- [x] Collapsible year columns work across all deployment contexts
- [x] Timeline visualization degrades gracefully across all three phase data states
- [x] CapEx/OpEx per-line-item displays and aggregates correctly
- [x] European number formatting consistent across all screens
- [x] Consistency validation scripts pass after any data tuning
- [x] No visual glitches or broken layouts during role switching
- [x] Demo is ready for a live walkthrough

### Files Modified
| File | Action |
|------|--------|
| `backend/services/scenario_engine.py` | Fixed: headline_impact raw JSON in workspace view |
| `frontend/src/modules/simulator/manager/ScenarioTable.tsx` | Fixed: headline_impact formatting + double-sign bug |
| `frontend/src/modules/simulator/comparison/ScenarioSelector.tsx` | Fixed: headline_impact formatting + double-sign bug |

## Phase A Details

### Database Tables (27)
| File | Tables |
|------|--------|
| organization.py | LineOfBusiness, Location, CompetenceCenter, CostCenter |
| people.py | RoleType, Person, RateTable |
| projects.py | Program, Project |
| financial.py | ExternalCostType, Baseline, Forecast, Actuals |
| capacity.py | Allocation, ResourceRequest |
| change_requests.py | ChangeRequest, CRChangeDetail |
| scenarios.py | Scenario, ScenarioAction, ScenarioState, ScenarioCapacityImpact |
| system.py | PlanningParameter, KPIDefinition, Notification, AuditLog, SystemSuggestion |
| users.py | DemoPersona |

### Seed Data Counts
- 3 LoBs, 3 locations, 3 competence centers, 6 cost centers
- 8 role types, 12 rate table entries, 9 external cost types
- 32 people across 6 cost centers + 2 portfolio-level
- 2 programs, 15 projects + 8 services = 23 entities
- 4 demo personas, 6 planning parameters, 7 KPI definitions
- 25 change requests, 63 CR change details, 5 resource requests
- 3 scenarios, 10 actions, 21 states, 22 capacity impacts
- 10 notifications, 4 system suggestions, 5 audit log entries
- 1510 baseline rows, 1510 forecast rows, 928 actuals rows, 1364 allocations

### Key Demo Data Patterns
- Lena Fischer: 105% over-allocated in Mar-May 2026 (proj-erp2 + proj-sap)
- Markus Wolf: ~48% under-utilized after proj-brake ends (Apr 2026+)
- ERP Phase 2: Red RAG (budget overrun), 10 CRs showing full lifecycle
- Sensor Data Pipeline: Amber RAG (consulting cost overrun)
- CR statuses: 16 approved, 3 pending CC, 3 pending controller, 1 rejected, 2 sent back

## Phase B Details

### Endpoint Counts by Router
| Router | Prefix | Endpoints |
|--------|--------|-----------|
| admin | /api/admin | 21 |
| reference | /api/reference | 6 |
| documentation | /api/docs | 4 |
| global_launchpad | /api/roles, /api/notifications, /api/kpis, /api/modules, /api/projects | 8 |
| portfolio | /api/portfolio | 14 |
| workbench | /api/projects/{id}/... | 11 |
| capacity | /api/capacity | 14 |
| scenarios | /api/scenarios | 12 |
| **Total** | | **90** |

### Key Architecture Decisions
- **Auth**: X-Current-User header → DemoPersona lookup → CurrentUser dataclass
- **Authorization**: `require_role(*roles)` dependency returns 403 for unauthorized roles
- **Forecast cycle**: In-memory state (dict keyed by project_id), cleared on demo reset
- **What-If scenarios**: Dual-path — pre-computed snapshots for seeded scenarios, runtime recalculation for new ones
- **Portfolio tree**: Three-pass hierarchical builder (LoB → Program → Project) with bottom-up aggregation
- **Capacity heatmaps**: FTE_HOURS=160, utilization thresholds: <70% blue, 70-90% green, 90-100% amber, >100% red
- **CC ownership**: Cost center owner endpoints verify user.cost_center_id matches the requested CC

### Files Created (Phase B)
| Directory | Files |
|-----------|-------|
| backend/schemas/ | common.py, reference.py, documentation.py, admin.py, global_launchpad.py, portfolio.py, workbench.py, capacity.py, scenarios.py |
| backend/services/ | calculations.py, portfolio_service.py, forecast_cycle.py, scenario_engine.py, advisor.py |
| backend/routers/ | reference.py, documentation.py, global_launchpad.py, portfolio.py, workbench.py, capacity.py, scenarios.py |

### Files Modified (Phase B)
- backend/dependencies.py — get_current_user, require_role
- backend/main.py — CORS middleware, 8 router registrations
- backend/routers/admin.py — 20 new endpoints + existing reset-demo

## Phase C Details

### Frontend Architecture
- **Framework**: Vite 7 + React 19 + TypeScript, Tailwind v4 (Vite plugin), shadcn/ui
- **Dev server**: `npm run dev` on port 5173, Vite proxy forwards /api/* to backend:8000
- **Host binding**: `127.0.0.1` (required for preview tooling)

### Directory Structure
| Directory | Files |
|-----------|-------|
| frontend/src/api/ | client.ts (fetch wrapper + X-Current-User header), endpoints.ts (typed API functions) |
| frontend/src/types/ | api.ts (TS interfaces mirroring backend Pydantic schemas) |
| frontend/src/contexts/ | RoleContext.tsx, SidePanelContext.tsx, BottomDrawerContext.tsx |
| frontend/src/lib/ | utils.ts (cn()), routes.ts (MODULE_ROUTES, ROUTE_LABELS), formatters.ts (€, %), rag.ts (severity/RAG colors) |
| frontend/src/components/layout/ | AppLayout, TopBar, Breadcrumb, RoleSwitcher, HelpButton, SidePanel, BottomDrawer, PlaceholderModule |
| frontend/src/components/ui/ | button, card, badge, dropdown-menu, separator, tooltip (shadcn) |
| frontend/src/modules/launchpad/ | Launchpad, NotificationsList, ModuleGrid, KPIStrip, SubmitProjectButton |

### Key Frontend Patterns
- **API client**: Module-level `currentUserId` variable, `setCurrentUser()` updates it, all `api.get/post/put/delete` calls auto-attach the header
- **Role switching**: `useRole().switchRole(id)` → updates API header → fetches new context → components re-render and re-fetch role-dependent data
- **SidePanel**: Custom component (NOT shadcn Sheet), `fixed right-0 w-[380px]`, main content gets `mr-[380px]` when open (shrink, not overlay)
- **BottomDrawer**: `fixed bottom-0 h-[40vh]` with `bg-black/30` overlay
- **Routing**: react-router-dom v7, `/*` on module routes to support nested routes in Phase D

### shadcn/ui Components Installed
button, card, badge, dropdown-menu, separator, tooltip

### Personas (for X-Current-User header)
| ID | Name | Role | Default Module |
|----|------|------|----------------|
| persona-controller | Anna Meier | controller | portfolio |
| persona-cc-owner | Thomas Brenner | cost_center_owner | capacity |
| persona-pl | Priya Sharma | project_lead | workbench |
| persona-exec | Dr. Klaus Weber | executive | portfolio |

## Phase D Session Plan

Phase D is split into 5 dedicated sessions (D1–D5), one per module. This keeps each session focused on a single spec section and its matching API endpoints / mock data.

### Build Order & Dependencies
| Session | Module | Spec | Establishes | Reused By |
|---------|--------|------|-------------|-----------|
| D1 | Portfolio Overview | 7.2, 10.3 | Expandable tree, filter bar, chart components, approval action pattern | D2, D4 |
| D2 | Project Workbench | 7.3, 10.4 | Master-detail, 3-point comparison, trajectory chart, forecast wizard | D4 |
| D3 | Capacity Management | 7.4, 10.5 | CSS grid heatmap, utilization color coding, bottom drawer detail | D4 |
| D4 | What-If Simulator | 7.5, 10.6 | Scenario workspace (split layout), comparison view, AI Advisor panel | — |
| D5 | Administration | 7.6, 10.9 | CRUD tables, entity selector, planning parameters | — |

### Cross-Module Navigation (Critical)
Each module has deep-links into other modules (notification click-throughs, portfolio → workbench, etc.). Handle as follows:
- **Wire up links INTO the current module** during that session (e.g., in D1, ensure notifications can link to Portfolio views)
- **Leave placeholder/no-op hooks for links OUT** to modules not yet built (e.g., Portfolio → Workbench drill-down during D1 should navigate to the route but show the placeholder)
- **Connect outbound links retroactively** when the target module is built (e.g., in D2, verify Portfolio → Workbench links now land on real content)
- **Final pass in Phase E** to verify ALL cross-module links work end-to-end

### Per-Session Checklist
Before committing at the end of each D-session:
- [ ] All endpoints for the module return correct data (verify via Swagger or frontend)
- [ ] Screen renders correctly for each role that has access
- [ ] Demo walkthrough anchors (Section 6.15) for this module work
- [ ] Role-dependent visibility and permissions enforced
- [ ] Drill-down and cross-module navigation functional (inbound links work; outbound to unbuilt modules gracefully degrade)
- [ ] Design tokens applied (colors, typography, spacing per Section 9)
- [ ] Loading states present
- [ ] PROGRESS.md updated with session details

## Phase D1 Details — Portfolio Overview

### New Files (23)
| Directory | Files |
|-----------|-------|
| frontend/src/components/ui/ | tabs.tsx, select.tsx, table.tsx, textarea.tsx (shadcn CLI) |
| frontend/src/components/shared/ | Skeleton.tsx, FilterBar.tsx, ExpandableTreeTable.tsx, ModuleGuideButton.tsx |
| frontend/src/components/charts/ | BudgetByLobChart.tsx, ForecastTrajectoryChart.tsx, RAGDonutChart.tsx |
| frontend/src/modules/portfolio/ | PortfolioOverview.tsx |
| frontend/src/modules/portfolio/dashboard/ | DashboardTab.tsx, PortfolioKPIRow.tsx, PortfolioTree.tsx, ProjectSummaryPanel.tsx, DashboardCharts.tsx |
| frontend/src/modules/portfolio/intake/ | IntakeTab.tsx, IntakeTable.tsx, IntakeDetailPanel.tsx |
| frontend/src/modules/portfolio/approvals/ | ApprovalsTab.tsx, ApprovalsTable.tsx, CRDetailPanel.tsx |

### Modified Files (4)
- `src/types/api.ts` — Added ~12 portfolio interfaces (PortfolioKPIs, ProjectTreeNode, ProjectSummary, ChartData, IntakeItem/Detail, ApprovalItem, CRDetail, etc.)
- `src/api/endpoints.ts` — Added portfolioApi (14 functions), referenceApi.getLobs(), docsApi.getModuleManual()
- `src/App.tsx` — Replaced PlaceholderModule with PortfolioOverview
- `src/lib/routes.ts` — Added sub-route labels for /portfolio/intake and /portfolio/approvals

### New Dependencies
- `recharts` — charting library for bar, line, and donut charts

### New shadcn Components
- tabs, select, table, textarea

### Reusable Components Established (for D2–D5)
- **ExpandableTreeTable** — Generic recursive tree table with expand/collapse, depth-based indentation, row selection → Reused by D2 (Workbench), D4 (Simulator)
- **FilterBar** — Horizontal row of shadcn Select dropdowns with clear button → Reused by all modules
- **Skeleton** — Pulsing loading placeholder → Reused by all modules
- **ModuleGuideButton** — Fetches /api/docs/modules/{id}, renders in SidePanel → Reused by all modules
- **Chart wrappers** (BudgetByLob, ForecastTrajectory, RAGDonut) → Partially reused by D2, D4

### Key Patterns
- **Controlled Tabs with role-aware reset**: Uses `value` (not `defaultValue`) on shadcn Tabs with useEffect to reset to "dashboard" when switching to a role that doesn't have the current tab
- **Side panel action pattern**: Idle → select action mode → textarea for reason/comment → submit → result message → onActionComplete callback refreshes parent
- **Filter-driven data fetching**: Filter state in orchestrator, passed as query params to API, triggers re-fetch via useEffect

### Bugs Fixed During Verification
- SidePanel children div lacked padding → Added `className="p-4"` to children wrapper
- Module guide button used wrong module ID ("portfolio" vs "portfolio_overview") → Fixed to match fixture data
- Tab content disappeared on role switch → Changed from uncontrolled `defaultValue` to controlled `value` with role-aware reset useEffect

### Verification Results
- [x] Demo Scenario 2: Expand Truck Systems → Digital Braking Platform → ERP Integration Phase 2 → summary panel shows Red RAG, budget overrun, sparkline, "Open in Workbench" button
- [x] Demo Scenario 3: Intake Queue tab → Autonomous Braking Prototype → detail panel with Approve/Reject/Send Back
- [x] Demo Scenario 4: Approvals tab → 3 pending CRs → CR detail with changes table and action buttons
- [x] Demo Scenario 14: Guide button → Portfolio Overview Guide renders in side panel
- [x] Role restrictions: Controller sees all 3 tabs; Executive sees Dashboard only; Project Lead sees Dashboard + Intake Queue
- [x] Filter bar: LoB dropdown opens with 3 options, selecting "Truck Systems" filters tree to single row, Clear resets
- [x] Charts: Budget by LoB (bar), Forecast Trajectory (line), RAG Distribution (donut with center label "22 projects")
- [x] Loading states: Skeleton loaders while data fetches
- [x] Cross-module nav: "Open in Workbench" navigates to placeholder gracefully

## Phase D2 Details — Project Workbench

### New Files (20)
| Directory | Files |
|-----------|-------|
| frontend/src/components/ui/ | input.tsx (shadcn CLI) |
| frontend/src/components/charts/ | ProjectTrajectoryChart.tsx |
| frontend/src/components/shared/ | StatusBadge.tsx |
| frontend/src/modules/workbench/ | ProjectWorkbench.tsx, ProjectListPanel.tsx, ProjectWorkspace.tsx |
| frontend/src/modules/workbench/overview/ | OverviewTab.tsx, MetadataBar.tsx, ThreePointTable.tsx, CapexOpexDisplay.tsx, ResourceSummaryTable.tsx |
| frontend/src/modules/workbench/forecast/ | ForecastTab.tsx, ForecastGrid.tsx, ForecastWizard.tsx, useForecastCycle.ts, Phase1Retrospective.tsx, Phase2Suggestions.tsx, Phase3EditForecast.tsx, Phase4Review.tsx, Phase5Confirmation.tsx |
| frontend/src/modules/workbench/history/ | ChangeHistoryTab.tsx, CRHistoryList.tsx |

### Modified Files (4)
- `src/types/api.ts` — Added ~15 workbench interfaces (WorkbenchProjectListItem, ProjectOverview, ThreePointComparison, TrajectoryPoint, ForecastGridRow, RetrospectiveItem, ForecastCycleStartResponse, SuggestionItem, ForecastChange, ReviewGroup, SubmittedCR, CRHistoryItem, etc.)
- `src/api/endpoints.ts` — Added workbenchApi (11 functions: getProjects, getOverview, getForecast, startCycle, acknowledgeRetrospective, getSuggestions, saveEdits, getReview, submitCycle, getChangeRequests, getChangeRequestDetail)
- `src/App.tsx` — Replaced PlaceholderModule with ProjectWorkbench for /workbench/* route
- `src/modules/portfolio/dashboard/ProjectSummaryPanel.tsx` — Changed "Open in Workbench" to navigate(`/workbench?project=${data.id}`) for cross-module navigation
- `backend/seed/seed.sql` — Updated system_suggestions pre_filled_changes_json to use per-cell array format

### New shadcn Components
- input (for editable forecast cells in Phase 3)

### New Shared Components (for D3–D5)
- **ProjectTrajectoryChart** — 3-series (baseline dashed, forecast solid, actuals solid) Recharts LineChart → Reused by D4 (scenario comparison)
- **StatusBadge** — Color-coded snake_case-to-readable badge (pending=amber, approved=green, rejected=red, sent_back=slate) → Reused by D3, D4

### Architecture: Master-Detail Layout
- **Left panel**: Collapsible project list (~280px) with RAG dots, type badges, status badges, role-filtered
- **Right panel**: 3-tab workspace (Overview, Forecast & Planning, Change History) for selected project
- **URL pre-selection**: `?project=proj-erp2` query param auto-selects project on mount

### Key Patterns
- **useReducer state machine**: `useForecastCycle.ts` manages 5-phase wizard state with typed actions (START_CYCLE, ACKNOWLEDGE_RETRO, SET_SUGGESTIONS, UPDATE_CELL, SET_REVIEW_GROUPS, SUBMIT_SUCCESS, GO_BACK)
- **useRef guard**: Prevents React Strict Mode double-invocation of startCycle() in ForecastWizard
- **Name mapping**: ForecastTab fetches forecast grid to build sub_category→display_name lookup, passed through to Phase1Retrospective
- **Suggestion pre-fills**: Applied suggestion changes populate editable grid cells with blue highlighting; manual edits show yellow

### Bugs Fixed During Verification
- Phase 1 Retrospective showed raw IDs (`role-sr-dev`) instead of display names → Added nameMap prop chain from ForecastTab → ForecastWizard → Phase1Retrospective
- React Strict Mode caused double startCycle() call, corrupting backend in-memory cycle state → Added useRef guard in ForecastWizard
- Suggestion pre_filled_changes_json in seed data used compact metadata format instead of per-cell arrays → Updated seed SQL to use `[{category, sub_category, month, old_value, new_value}]` format

### Verification Results
- [x] Demo Scenario 5: Full 5-phase forecast wizard (Phase 1: retrospective with flagged items → Phase 2: 2 suggestions applied → Phase 3: 6 blue pre-filled cells → Phase 4: review with justification → Phase 5: CR-26 created)
- [x] Demo Scenario 6: Change History tab with 10+ CRs, category/status filters, sparkles icon for system-suggested CRs
- [x] Role-based views: Controller sees all projects, no wizard button; PL sees 4 filtered projects + wizard button; all roles see all 3 tabs
- [x] Cross-module navigation: Portfolio → expand tree → click ERP Integration Phase 2 → "Open in Workbench" → navigates to /workbench?project=proj-erp2 with project auto-selected
- [x] Overview tab: MetadataBar (name, RAG, status, LoB, PL), ThreePointTable (baseline/forecast/actuals/variance), ProjectTrajectoryChart (3-line), CapEx badge, ResourceSummaryTable
- [x] Loading states: Skeleton loaders on all data fetches
- [x] Phase stepper: Horizontal 5-step indicator with checkmarks for completed steps, blue ring for current

## Phase D3 Details — Capacity Management

### New Files (18)
| Directory | Files |
|-----------|-------|
| frontend/src/modules/capacity/ | CapacityManagement.tsx |
| frontend/src/modules/capacity/myteam/ | MyTeamTab.tsx, TeamHeatmap.tsx, TeamSummaryBar.tsx |
| frontend/src/modules/capacity/org/ | OrgOverviewTab.tsx, OrgHeatmap.tsx, OrgSummaryBar.tsx |
| frontend/src/modules/capacity/requests/ | RequestManagement.tsx, RequestListPanel.tsx, RequestDetail.tsx, RequestActionBar.tsx, AvailabilityContext.tsx, AssignmentPreview.tsx |
| frontend/src/modules/capacity/shared/ | HeatmapGrid.tsx, UtilizationCell.tsx, SummaryCard.tsx |
| frontend/src/modules/capacity/detail/ | PersonDetailDrawer.tsx, OrgDetailDrawer.tsx |

### Modified Files (3)
- `src/types/api.ts` — Added ~15 capacity interfaces (CapacityContext, TeamSummary, UtilizationCell, RoleHeatmapRow, PersonHeatmapRow, PersonDetail, CapacityRequestItem, AssignmentPreview, OrgSummary, OrgHeatmapRow, OrgDetailItem, etc.)
- `src/api/endpoints.ts` — Added capacityApi (14 functions: getContext, getTeamSummary, getTeamHeatmap, getPersonDetail, getRequests, getRequestDetail, getAssignmentPreview, confirmRequest, partiallyFulfill, counterPropose, declineRequest, getOrgSummary, getOrgHeatmap, getOrgHeatmapDetail)
- `src/App.tsx` — Replaced PlaceholderModule with CapacityManagement for /capacity/* route

### Key Architecture
- **CSS Grid Heatmap**: Generic `HeatmapGrid` with expandable tree rows, month columns, color-coded `UtilizationCell` (blue <70%, green 70-90%, amber 90-100%, red >100%)
- **Request Management**: Master-detail layout with collapsible request list, 4-action state machine (Confirm/Partial/Counter/Decline)
- **Availability Context**: For resource requests shows team heatmap with person selection + assignment preview; for external costs shows info box
- **Role-based views**: Controller sees CC selector + both tabs; CC Owner sees own CC + both tabs + requests; Executive sees Org Overview only
- **Org Overview**: Pivot selector (Cost Center/Role/LoB) with aggregated heatmap

### Reusable Components (for D4–D5)
- **HeatmapGrid** — Generic expandable tree heatmap with CSS grid → D4 capacity impact visualization
- **UtilizationCell** — Color-coded utilization percentage badge → D4
- **SummaryCard** — Icon + label + value KPI card → general use

### Verification Results
- [x] Controller (Anna Meier): My Team tab with CC selector, all CCs visible, Org Overview tab with heatmap
- [x] CC Owner (Thomas Brenner): My Team tab with own CC, Resource Requests button with visual emphasis (no badge counter per spec), request management master-detail
- [x] My Team: Summary cards (headcount 8, utilization 80%, over-allocated 0, pending requests 4), heatmap with expandable role groups
- [x] Heatmap: Color-coded utilization cells, person rows nested under role groups (Business Analyst, Developer, Project Manager, Solution Architect)
- [x] Resource Requests: 4 pending requests grouped by monthly cycle (e.g., "March 2026 Cycle"), left panel with priority badges (low/medium/high), right panel with request detail + availability context + action buttons
- [x] Org Overview: 4 KPI cards (headcount 29, utilization 77.2%, over-allocated CCs 0, pending controller approvals 3), heatmap by Cost Center with 6 rows
- [x] Cross-module nav: Project links in request detail navigate to /workbench?project={id}
- [x] Zero console errors, all API calls succeeding

### Bugs Fixed During Session
- `RequestManagement.tsx` was truncated mid-write from previous session context exhaustion (line 78, unterminated string) → Reconstructed complete component from sub-component interface analysis
- Org Summary missing `pending_controller_approval_count` field → Added to backend schema, endpoint (query CRs with status `pending_controller_approval`), frontend type, and UI (4th KPI card)
- Resource Requests button had badge counter (spec says "no badge counter") → Removed badge, kept blue accent color shift for visual emphasis
- Request queue grouped only by status → Added monthly cycle grouping within each status section (e.g., "March 2026 Cycle")
- Backend org summary query used wrong CR status string `pending_controller` → Fixed to `pending_controller_approval`

## Phase D4a Details — What-If Simulator (Scenario Manager + Workspace Core)

### New Files (13)
| Directory | Files |
|-----------|-------|
| frontend/src/components/ui/ | dialog.tsx (shadcn CLI) |
| frontend/src/modules/simulator/ | WhatIfSimulator.tsx, useScenarioState.ts |
| frontend/src/modules/simulator/workspace/ | ScenarioWorkspace.tsx, ActionPanel.tsx, AddActionForm.tsx, ActionItem.tsx, ImpactNarrative.tsx, KPIComparisonStrip.tsx, ScenarioPortfolioTree.tsx |
| frontend/src/modules/simulator/manager/ | ScenarioManager.tsx, ScenarioTable.tsx, CreateScenarioModal.tsx |

### Modified Files (3)
- `src/types/api.ts` — Added ~120 lines of scenario types (D4a + D4b types pre-defined: ScenarioListItem, ScenarioAction, ScenarioDetail, AdvisorPath, ComparisonResponse, DrillDownResponse, etc.)
- `src/api/endpoints.ts` — Added scenariosApi (14 functions: list, create, remove, publish, unpublish, getDetail, updateMetadata, applyAction, removeAction, reorderActions + 4 D4b stubs)
- `src/App.tsx` — Replaced PlaceholderModule with WhatIfSimulator for /simulator/* route

### New shadcn Components
- dialog (for CreateScenarioModal)

### Key Architecture

**Orchestrator (WhatIfSimulator.tsx)**:
- 3-phase state: `'manager' | { view: 'workspace', scenarioId } | 'comparison'`
- Role gating: Controller + Executive only; PL/CC Owner see ShieldAlert no-access card
- Resets to manager phase on role switch

**Scenario Manager (ScenarioManager.tsx)**:
- Fetches `scenariosApi.list()` → two ScenarioTable instances ("My Scenarios" + "Published Scenarios")
- Handles CRUD: create (with optional clone_from), publish, unpublish, delete
- "Compare Scenarios" button disabled (D4b placeholder)

**Scenario Workspace (ScenarioWorkspace.tsx)**:
- Split layout: ActionPanel (380px left) + Impact Dashboard (flex-1 right)
- Single source of truth via `useScenarioState(scenarioId)` hook
- AI Advisor toggle button disabled with tooltip (D4b slot)

**useScenarioState hook**:
- useReducer state machine (following useForecastCycle pattern)
- Server-authoritative: every apply/remove returns full ScenarioDetail, stored wholesale
- Auto-loads via useEffect with loadedRef guard

**AddActionForm (config-driven)**:
- Two sections: Project Actions (5 types) + Portfolio Rules (2 types)
- Config arrays define each type: `{ scope, action_type, label, requires_project, parameters[] }`
- Dynamic rendering: number → Input, select → Select
- LoB options fetched from referenceApi

**ActionItem**:
- Handles BOTH seed-data types (defer_project, adjust_external_cost, increase_budget, apply_pct_cut) AND engine types (reduce_budget, remove_project, delay_project, cut_consulting, across_the_board_cut, reduce_lob)
- `formatDelta()` handles budget_delta, total_budget_delta, budget_freed (negated for savings display)

### D4b Integration Points (pre-wired)
1. **AI Advisor panel**: ScenarioWorkspace has disabled toggle button → D4b adds AIAdvisorPanel and enables it
2. **Comparison View**: WhatIfSimulator has 'comparison' phase → D4b replaces placeholder with ComparisonView
3. **Drill-Down drawer**: ScenarioPortfolioTree row clicks are no-ops → D4b adds onRowClick → DrillDownDrawer
4. **All types + API functions**: Already defined in D4a → D4b only imports

### Persona → Person Mapping (scenario ownership)
- `persona-controller` → `p-meier` (Anna Meier): owns scenarios 1 (Budget Pressure) & 2 (Rail Digitalization)
- `persona-exec` → `p-weber` (Dr. Klaus Weber): owns scenario 3 (Worst Case)

### Bugs Fixed During Session
- `budget_freed` deltas displayed as positive/red (increase) instead of negative/green (savings) → Negated budget_freed in formatDelta: `delta = -Math.abs(Number(impact.budget_freed))`
- Delta column showed "€-200K" (euro before minus) instead of "-€200K" → Extracted sign separately: `${sign}€${formatted}`
- Pre-seeded scenario snapshots lost when actions added/removed (engine recalculates from scratch, doesn't understand seed action types like defer_project) → This is expected backend behavior; restored by deleting SQLite DB and restarting

### Verification Results
- [x] Controller (Anna Meier): Manager shows 2 "My Scenarios" + 1 "Published" (by Weber)
- [x] Executive (Dr. Klaus Weber): Manager shows 1 "My Scenario" + 1 "Published" (by Meier) — verified via API
- [x] PL (Priya Sharma): 403 Forbidden — verified via API, frontend shows no-access card
- [x] CC Owner (Thomas Brenner): 403 Forbidden — verified via API, frontend shows no-access card
- [x] Workspace: Scenario 1 shows 5 actions with correct green deltas, KPI strip (€4.5M→€4.3M, -6.5%), narrative headline, portfolio tree with Changed badges
- [x] Portfolio tree: Delta column shows correct format (-€200K, -€63K, -€17K, -€18K in green)
- [x] RAG distribution: Colored dots (green/amber/red) with "changed" indicator on affected projects
- [x] Action apply/remove: Backend recalculation engine works for new scenarios (tested remove_project)
- [x] Scenario CRUD: Create, delete, publish/unpublish all working via API
- [x] AddAction form: Config-driven tabs (Project Actions / Portfolio Rules), action type dropdown, project selector
- [x] Zero console errors, all API calls succeeding
- [x] Guide button: moduleId="whatif_simulator" renders in side panel

### Phase D4b Details

**New Files (6):**
- `frontend/src/modules/simulator/advisor/PathCard.tsx` (~90 LOC) — Solution path card with headline numbers, trade-offs, Apply button
- `frontend/src/modules/simulator/advisor/AIAdvisorPanel.tsx` (~150 LOC) — 370px indigo panel: goal input, loading animation (cycling text), path cards, narrative summary
- `frontend/src/modules/simulator/drilldown/DrillDownContent.tsx` (~120 LOC) — BottomDrawer content: budget comparison grid + RAG dot comparison
- `frontend/src/modules/simulator/comparison/ScenarioSelector.tsx` (~100 LOC) — Checkbox list (max 3), Compare button with count
- `frontend/src/modules/simulator/comparison/ComparisonTable.tsx` (~110 LOC) — Dynamic-column table: Current State + scenario columns, budget/delta/RAG per project
- `frontend/src/modules/simulator/comparison/ComparisonView.tsx` (~150 LOC) — Two-phase (select → results) with KPI summary cards + ComparisonTable

**Modified Files (6):**
- `backend/routers/scenarios.py` — Fixed 3 field name bugs (goal_display, constituent_actions)
- `frontend/src/modules/simulator/useScenarioState.ts` — Added advisorLoading/advisorNarrative state, advisorQuery/advisorApply callbacks
- `frontend/src/modules/simulator/workspace/ScenarioWorkspace.tsx` — Enabled AI Advisor toggle, added AIAdvisorPanel, added drill-down via BottomDrawer
- `frontend/src/modules/simulator/workspace/ScenarioPortfolioTree.tsx` — Added onRowClick prop, threaded to ExpandableTreeTable
- `frontend/src/modules/simulator/manager/ScenarioManager.tsx` — Enabled Compare button (removed disabled Tooltip wrapper)
- `frontend/src/modules/simulator/WhatIfSimulator.tsx` — Replaced comparison placeholder with ComparisonView

**New shadcn components:** checkbox

**AI Advisor Flow:**
1. Toggle "AI Advisor" button → 370px indigo panel slides in from right
2. Type goal (e.g., "Find €2M in savings") → "Analyze Portfolio" button
3. Loading: pulsing indigo dot + cycling text (3 phases)
4. Results: 3 PathCards (Conservative/Moderate/Aggressive) with headline numbers
5. "Apply to Scenario" → actions created with group_label, dashboard recalculates, narrative shown

**Comparison View Flow:**
1. "Compare Scenarios" from Manager → ScenarioSelector with checkboxes (max 3)
2. "Compare" → API call → KPI summary cards per column + full project comparison table
3. Current State pinned as first column, scenario columns show deltas (green savings / red increases)

**Drill-Down Flow:**
1. Click project row in ScenarioPortfolioTree → BottomDrawer opens
2. Shows original budget, scenario budget, delta (color-coded), original RAG, scenario RAG

### Bugs Fixed During D4b
- Backend `goal.get("goal_name")` → `goal.get("goal_display")` (fixture uses `goal_display`)
- Backend `path.get("actions")` → `path.get("constituent_actions")` (fixture uses `constituent_actions`, 2 occurrences)

### D4b Verification Results
- [x] AI Advisor: Goal input → 3 paths returned → Apply Conservative → 5 actions created with group_label, dashboard recalculates
- [x] AI Advisor narrative: Summary text displayed after apply
- [x] Drill-Down: Project row click → BottomDrawer opens with budget/RAG detail
- [x] Comparison: Select 2 scenarios → Current State + 2 columns → 23 projects with correct deltas
- [x] Comparison KPI cards: Total budget per column, delta vs baseline, RAG distribution dots
- [x] Executive persona: Correct scenarios visible, all flows work
- [x] PL / CC Owner: Still see no-access card (unchanged)
- [x] API verification: advisor query returns 3 paths, advisor apply creates actions + narrative
- [x] Zero console errors throughout all testing
- [x] Demo database reset to clean state after verification

## Phase D5 Details — Administration

### New Files (12)
| Directory | Files |
|-----------|-------|
| frontend/src/modules/admin/ | Administration.tsx, EntitySelector.tsx |
| frontend/src/modules/admin/entities/ | EntityFormDialog.tsx, CostCentersPanel.tsx, CompetenceCentersPanel.tsx, LoBsPanel.tsx, LocationsPanel.tsx, PeoplePanel.tsx, RateTablePanel.tsx |
| frontend/src/modules/admin/parameters/ | PlanningParameters.tsx |
| frontend/src/modules/admin/audit/ | AuditLogPanel.tsx |

### Modified Files (4)
- `src/types/api.ts` — Added ~90 lines: AdminContext, RefCostCenter, RefCompetenceCenterCC, RefCompetenceCenter, RefLocation, RefRole, RefPerson, AdminRateEntry, AdminParameter, AuditLogEntry
- `src/api/endpoints.ts` — Added adminApi (20 functions), extended referenceApi (5 new functions: getCostCenters, getCompetenceCenters, getLocations, getRoles, getPeople)
- `src/App.tsx` — Replaced PlaceholderModule with Administration for /admin/* route
- `backend/routers/reference.py` — Added GET /api/reference/people endpoint (~30 lines)
- `backend/schemas/reference.py` — Added PersonResponse Pydantic model

### Key Architecture

**Layout**: Header (h1 + Reset Demo + Guide) → 5 SummaryCards → EntitySelector sidebar (220px) + Panel content

**Entity Selector**: Vertical nav with 8 items in 2 groups:
- ENTITIES: Cost Centers, Competence Centers, Lines of Business, Locations, People, Rate Tables
- SYSTEM: Planning Parameters, Audit Log

**EntityFormDialog**: Config-driven dialog form for create/edit across all entity types. Field definitions per type (text, textarea, select) with required validation.

**Rate Tables**: Inline editing (not Dialog) with batch save. Changed rows highlighted amber. Save Changes / Discard buttons with success feedback.

**Planning Parameters**: Grouped Card form (Fiscal, Planning, Thresholds, Limits) with per-group Save Changes and Reset to Defaults. Edit controls: month Select, integer Input, percentage Input.

**Audit Log**: Filterable table with entity type dropdown. Color-coded action badges (create=green, update=blue, deactivate=slate).

**Demo Reset**: Red button in header → confirmation Dialog → adminApi.resetDemo() → window.location.reload()

### Backend Addition
- GET /api/reference/people: Returns all people with role_name, cost_center_name, utilization_pct (calculated from allocations for 2026-03), is_active flag

### Patterns Reused
- Role-gating: ShieldAlert card (from WhatIfSimulator.tsx) — controller only
- SummaryCard component (from capacity module)
- ModuleGuideButton (moduleId="administration")
- Skeleton loading states
- Dialog confirmation for destructive actions (deactivate, demo reset)

### Verification Results
- [x] Non-controller roles → 403 Forbidden (verified via API for executive persona)
- [x] Controller → loads with correct summary counts (6 CCs, 32 people, 3 LoBs, 3 locations, 3 competence centers)
- [x] All 8 sections navigate via entity selector
- [x] Demo Scenario #16: Add new cost center "SHG Data Analytics" (Munich, App Dev) → appears in table, count updates 6→7
- [x] Demo Scenario #17: Update Senior Developer rate from €95→€105 → "1 rate(s) updated successfully", previous rate €95 preserved with date 2026-01-01
- [x] Audit log: Shows create action for "SHG Data Analytics" by Anna Meier with correct timestamp
- [x] Demo Reset: Confirmation dialog → resets all data → count returns to 6, all changes reverted
- [x] All entity panels render correctly: Cost Centers (7 cols), Competence Centers (5 cols), LoBs (5 cols), Locations (4 cols), People (6 cols), Rate Tables (6 cols inline-editable)
- [x] Planning Parameters: Fiscal Settings group with month selector, default values shown
- [x] Zero console errors throughout testing

## Phase E Details — Documentation + Polish + Verification

### New Files (0)
No new files created. All changes were modifications to existing files.

### Modified Files (4)
- `frontend/src/types/api.ts` — Added FAQStep, FAQSummary, FAQDetail interfaces (~15 lines)
- `frontend/src/api/endpoints.ts` — Added docsApi.getFAQs() and docsApi.getFAQDetail() functions, imported new types
- `frontend/src/components/layout/HelpButton.tsx` — Replaced 33-line stub with full FAQ panel (~120 lines): role-filtered FAQ list, step-by-step detail view, target_module deep-linking
- `frontend/src/modules/launchpad/NotificationsList.tsx` — Fixed deep-link routing: workbench links use `?project=` query params instead of path segments
- `frontend/src/modules/portfolio/PortfolioOverview.tsx` — Fixed tab URL sync race condition: don't reset tab while role context is loading, sync tab from URL on location change

### Key Implementation Details

**FAQ Panel (HelpButton.tsx)**:
- FAQPanelContent manages list/detail state via useState
- List view: fetches all FAQs, filters by `context.role` matching `applicable_roles`
- Detail view: numbered steps with blue circle badges, "Back to FAQs" navigation
- Steps with `target_module` get clickable link using MODULE_ROUTES + useNavigate
- Panel closes on navigation to maintain UX flow

**Notification Deep-Link Fix**:
- Old: `route + "/" + entity_id` → produced invalid paths like `/workbench/proj-erp2`
- New: module-aware routing — workbench uses `?project=` query param, others navigate to module root

**Portfolio Tab Sync Fix**:
- Race condition: useEffect reset tab to "dashboard" before role context loaded (showIntake was false when context=null)
- Fix: guard with `if (!role) return` and add location.pathname sync effect

### Bugs Found & Fixed During Verification
1. **Portfolio tab URL sync**: Navigating to `/portfolio/intake` showed Dashboard tab due to race condition in role-context-dependent useEffect → Fixed with null guard and pathname sync
2. **Notification deep links**: `/workbench/proj-erp2` was an invalid route → Fixed to use `?project=` query params

### Demo Walkthrough Results (17 Scenarios)
- [x] Scenario 1: 4 roles switch correctly, correct landing pages and module access
- [x] Scenario 2: Portfolio tree: Truck Systems → Digital Braking Platform → ERP Phase 2 → Red RAG, budget snapshot, sparkline
- [x] Scenario 3: Intake Queue: Autonomous Braking Prototype → detail panel with Approve/Reject/Send Back
- [x] Scenario 4: Approvals: 3 pending CRs (2 ERP, 1 Sensor) → detail panel
- [x] Scenario 5: Forecast wizard: 5-phase flow (verified D2, API operational)
- [x] Scenario 6: Change History: 10 CRs with category/status filters, expandable cards
- [x] Scenario 7: Team heatmap: Lena Fischer at 105% (Mar-May), Markus Wolf at 48% (Apr+), color coding correct
- [x] Scenario 8: Resource Requests: 4 pending, master-detail, assignment preview, action buttons
- [x] Scenario 9: Org Overview: 29 headcount, 77.2% utilization, heatmap by Cost Center with 6 rows
- [x] Scenario 10: What-If workspace: Budget Pressure scenario, 5 actions, KPI strip (€4.5M→€4.3M), portfolio impact
- [x] Scenario 11: New scenario creation (verified D4a, API operational)
- [x] Scenario 12: Comparison: POST /compare returns correct multi-column data with Current State
- [x] Scenario 13: AI Advisor: 3 paths (Conservative/Moderate/Aggressive) for "Find 2M in savings"
- [x] Scenario 14: Module Guide: renders in side panel with structured sections
- [x] Scenario 15: FAQ: role-filtered list (8 for Controller, 3 for PL), step-by-step detail with deep links
- [x] Scenario 16: Add cost center via API (SHG Data Analytics created successfully)
- [x] Scenario 17: Rate table: 12 entries accessible via API
- [x] Zero console errors throughout entire walkthrough
- [x] Demo data reset to clean state after verification

## Deviations from Spec
- Repository named `vision-demo-prototype` instead of `cpc-demo` (user preference)
- Phase D split into 5 sessions (D1–D5) instead of a single phase — one session per module for better focus and context management

## v2 Session 1 — Small Tweaks

Branch: `v2/session-1-small-tweaks` (7 commits)

### Completed Items
- [x] **0.1 — CPC → CRETA Rename**: All user-visible strings (browser tab, TopBar, Swagger, start.sh), infrastructure (DB filename cpc_demo.db → creta_demo.db), and 7 documentation files updated. Old database must be deleted on first run.
- [x] **1.2 — Role Switch → Launchpad**: RoleSwitcher.tsx always navigates to `/` instead of role's default module. Removed unused MODULE_ROUTES import.
- [x] **1.3 — Remove KPI Strip from Launchpad**: Deleted KPIStrip.tsx, removed imports/state/render from Launchpad.tsx, removed "Quick Metrics Strip" section from launchpad.json fixture. Portfolio Dashboard KPIs unaffected.
- [x] **6.4 — Markdown Bold Rendering**: New `renderMarkdownBold.tsx` utility splits on `**...**` and returns `<strong>` React elements. Applied in ModuleGuideButton (section bodies) and HelpButton (FAQ step instructions).
- [x] **6.5 — European Currency Formatting**: Rewrote `formatters.ts` with 4 functions: `formatCurrency` (€1,2M style), `formatCurrencyDelta` (+/- prefix), `formatCurrencyDetailed` (€14.400,00 via Intl), `formatPercent` (comma decimal). Deduplicated 7 local copies in simulator module. Fixed percentage decimals to use comma.
- [x] **1.1 — Notification Deep-Links**: Expanded NotificationsList `handleClick` with module-specific routing (portfolio → `/portfolio/intake?project=`, capacity → `?person=`). IntakeTab reads `?project=` param and auto-opens detail panel with useRef guard.
- [x] **6.3 & 6.1 — Investigation Documentation**: Added investigation comments to ForecastTrajectoryChart.tsx (monthly totals, not cumulative; missing baseline/actuals series) and workbench.py (non-resource CRs stuck at pending_cc_confirmation). Both fixes deferred to Session 2.

### Verification Results (all pass)
- [x] Browser tab says "CRETA", TopBar shows "CRETA", Swagger says "CRETA Demo API"
- [x] Role switch always lands on Launchpad (tested from /simulator)
- [x] Launchpad: notifications + module tiles only (no KPI strip)
- [x] Guide panel: **Blue**, **Green**, **Amber**, **Red** render as bold in Capacity Management guide
- [x] Euro format: `€9,9M`, `€4,5M`, `€1,2M`, `-6,5%`, `+1,2%` throughout Portfolio + Simulator
- [x] Notification deep-link: "1 new project awaiting review" → Intake tab with Autonomous Braking Prototype detail panel
- [x] Zero console errors across all modules

## v2 Session 2 — Portfolio Overview Improvements

Branch: `v2/session-2-portfolio` (1 commit, 18 files changed, +998/-69)

### Completed Items
- [x] **2.2.2 — CR Routing Bug Fix**: Non-resource CRs (external_cost, budget, timeline) now skip CC confirmation and go straight to `pending_controller_approval`. Resource CRs still route through `pending_cc_confirmation`. Fixed in `backend/routers/workbench.py`.
- [x] **2.1.2 — Forecast Trajectory Chart Fix**: Rewrote backend to compute 3 cumulative series (baseline, forecast, actuals). Actuals = null for future months. Frontend chart rewritten with 3 lines (baseline dashed gray, forecast solid blue, actuals solid dark), legend, and CartesianGrid. Backend: `portfolio.py`. Frontend: `ForecastTrajectoryChart.tsx`, `api.ts`.
- [x] **2.1.3 — Run/Change Ratio with Percentages**: Backend `compute_portfolio_kpis()` now returns `run_total`, `change_total`, `run_pct`, `change_pct`. KPI card shows two lines: "Run: €2,1M (17%)" / "Change: €9,9M (83%)". Backend: `portfolio_service.py`, `portfolio.py`. Frontend: `PortfolioKPIRow.tsx`, `api.ts`.
- [x] **2.1.4 — Dynamic KPI Filtering**: KPIs now update when LoB/Status/RAG/Type filters are applied. Backend `compute_portfolio_kpis()` accepts `filters` dict, builds filtered project ID list, uses `Project.id.in_(project_ids)` on all financial queries. Frontend passes same filter params to both tree and KPI endpoints. Backend: `portfolio_service.py`, `portfolio.py`. Frontend: `endpoints.ts`, `DashboardTab.tsx`.
- [x] **2.1.1 — Interactive RAG Doughnut**: Added Recharts Tooltip (RAG label, count, percentage), click-to-filter (toggles RAG filter), opacity dimming for non-active segments, cursor pointer. Clicking green segment filters dashboard to green-RAG projects only, clicking again clears. Frontend: `RAGDonutChart.tsx`, `DashboardCharts.tsx`, `DashboardTab.tsx`.
- [x] **2.2.1 — Approvals Detail Workspace**: New full-width CRDetailWorkspace with: back button, header (project + CR summary + badges), change details table (field/month/old/proposed/delta with color coding), justification card, impact summary (total delta + category), CC owner confirmation section, action buttons (Approve/Reject/Send Back). Two-level pattern: click row → side panel → "Open Full Detail" → workspace. Double-click row goes directly to workspace. Frontend: NEW `CRDetailWorkspace.tsx`, modified `ApprovalsTab.tsx`, `CRDetailPanel.tsx`, `ApprovalsTable.tsx`.
- [x] **2.3 — Intake Detail Workspace**: Extended backend intake detail endpoint with resource_plan (internal forecast by role, monthly hours/amounts, totals), external_cost_plan (by cost type, monthly amounts, totals), budget_summary (internal/external/grand total, capex_opex), pl_name. New full-width IntakeDetailWorkspace with same two-level pattern. Backend: `portfolio.py`. Frontend: NEW `IntakeDetailWorkspace.tsx`, modified `IntakeTab.tsx`, `IntakeDetailPanel.tsx`, `IntakeTable.tsx`, `api.ts`.

### Files Changed
- **Backend (3 modified)**: `routers/workbench.py`, `routers/portfolio.py`, `services/portfolio_service.py`
- **Frontend (2 new, 14 modified)**: NEW `CRDetailWorkspace.tsx`, NEW `IntakeDetailWorkspace.tsx`, + 14 modified files (types, API, charts, dashboard, approvals, intake)

### Verification Results
- [x] Dashboard KPIs: Total Budget €9,9M, YTD €7,0M, Forecast €11,4M, Variance +1,2%, CapEx/OpEx 59%/41%, Run/Change with amounts and percentages
- [x] Dynamic KPI filtering: RAG=Green → KPIs update (€9,9M→€6,5M, variance 0,0%, CapEx/OpEx 45%/55%)
- [x] Forecast Trajectory: 3 cumulative lines with legend (Actuals, Baseline, Forecast)
- [x] RAG Doughnut: 22 projects, green/amber/red segments
- [x] Approvals tab: 3 CRs visible (CR routing fix confirmed — non-resource CRs now appear)
- [x] CR side panel: Shows detail, "Open Full Detail" button works
- [x] CRDetailWorkspace: Full change table, justification, impact summary, CC owner, action buttons
- [x] Intake Queue: Autonomous Braking Prototype visible
- [x] Intake side panel: Shows detail, "Open Full Detail" button works
- [x] IntakeDetailWorkspace: Budget summary, "No resource or cost plan data" message (correct for pending project), action buttons
- [x] Zero console errors throughout testing

### Known Issues Resolved
- **CR Routing Bug (6.1)**: FIXED — non-resource CRs now route correctly
- **Forecast Chart (6.3)**: FIXED — cumulative 3-series chart working

## v2 Session 3 — Project Workbench Improvements

Branch: `v2/session-3-workbench` (8 commits)

### Completed Items
- [x] **3.5/6.2 — Confirmed CRs in Seed Data**: Audited all 16 approved CRs, fixed 8 that weren't reflected in forecast rows. Updated forecast amounts/hours for CRs 3, 11, 12, 14, 16, 19, 24, 25. Added missing ext-training row for CR 19.
- [x] **3.2 — External Cost Status Detail**: Added `ext_status`, `po_number`, `vendor` columns to Forecast model. Updated all 1511 forecast rows with procurement statuses (planned/ordered/goods_received/invoiced) based on month vs demo date. Frontend: ExternalCostStatusBadge component, status summary bar, status filter dropdown, vendor/PO tooltips.
- [x] **3.1 — Actuals Line Fix**: Backend returns null instead of 0 for months without actuals data. Frontend chart uses `connectNulls={false}` so actuals line stops at Jan 2026.
- [x] **3.3 — Collapsible Yearly View**: New `useCollapsibleYears` hook groups months by year. Current year (2026) expanded by default, other years collapsed into summary columns with yearly totals. Chevron toggle to expand/collapse. Applied to ForecastGrid.
- [x] **3.4 — Internal Resources Show Euro Values**: Backend looks up hourly rates from rate_table and includes in forecast response. Frontend shows EUR equivalent below hours in forecast grid cells (formatCurrencyDetailed for months, formatCurrency for year summaries).
- [x] **3.6 — Monthly Review Formatting**: Phase4Review formats values by group type (hours + suffix for resources, full EUR for external costs). Phase3EditForecast shows EUR equivalent below editable hours inputs.
- [x] **3.6.1 — Future-Only Editing + Collapsed History**: Phase3EditForecast uses useCollapsibleYears hook. Past months (before 2026-02) are read-only with grey background. Older years collapse into summary columns.

### New Files
- `frontend/src/hooks/useCollapsibleYears.ts` — Reusable hook for year-based column grouping
- `frontend/src/modules/workbench/forecast/ExternalCostStatusBadge.tsx` — Color-coded procurement status badge

### Files Changed
- **Backend (3 modified)**: `models/financial.py`, `routers/workbench.py`, `seed/seed.sql`
- **Frontend (4 modified)**: `types/api.ts`, `ForecastGrid.tsx`, `Phase3EditForecast.tsx`, `Phase4Review.tsx`, `ProjectTrajectoryChart.tsx`

## v2 Session 4 — What-If Simulator Enhancements

Branch: `v2/session-4-whatif`

### Completed Items
- [x] **4.3 — Fix Delay/Accelerate Timeline Modeling**: Replaced no-op stub with real engine logic. Delay queries monthly forecasts, sums first N future months as "freed" budget, reduces adjusted_budget, extends end date. Accelerate calculates 5% monthly premium per compressed month, shortens end date.
- [x] **4.1.1 — Pause Project Action**: New project-scope action. Queries forecast from start_month onward and subtracts total from adjusted_budget.
- [x] **4.1.2 — Change Resource Allocation Action**: New project-scope action. Looks up hourly rate from RateTable for role, calculates delta = hours × rate × months. Supports add/remove/modify modes.
- [x] **4.1.3 — Cut by Type Portfolio Rule**: New portfolio-scope action. Filters working state by is_service flag based on target_type (project/service/all), applies percentage reduction.
- [x] **4.1.4 — Freeze New Starts Portfolio Rule**: New portfolio-scope action. Zeros out adjusted_budget for projects with start date after cutoff_month.
- [x] **4.1.5 — Cap Cost Category Portfolio Rule**: New portfolio-scope action. Queries external costs by sub_category, applies proportional cap or percentage-based reduction. Supports both absolute cap and percentage variant.
- [x] **4.2 — Rate Escalation Action**: New portfolio-scope action with multi-select scope selector. Finds matching Person IDs by scope type (role/cost_center/location), queries Allocations from effective_month, calculates cost increase using average hourly rate.
- [x] **Engine: Per-action impact delta computation**: Engine now computes budget_delta for each action by snapshotting total budget before/after. Pre-seeded scenarios retain their rich impact_delta fields.
- [x] **Engine: Action type aliases**: Added _ACTION_ALIASES map to normalize advisor fixture names (defer_project→delay_project, change_resources→change_allocation, etc.).
- [x] **Advisor apply fix**: Router now falls back to rule_type when action_type missing. Fixed goals.json rule_type→action_type for 2 portfolio-scope entries.
- [x] **Frontend: AddActionForm extended**: Added text and multi-select parameter types, 2 new project actions (pause, change_allocation), 4 new portfolio actions (cut_by_type, freeze_new_starts, cap_cost_category, rate_escalation). Dynamic reference data fetching, conditional options for rate escalation scope_values.
- [x] **Frontend: ActionItem extended**: Added icons (Pause, Users, Filter, Snowflake, ShieldAlert, TrendingUp) and descriptions for all new action types.
- [x] **Frontend: getCostTypes API**: Added getCostTypes() to referenceApi for cap_cost_category form.

### New Capabilities
- What-If Simulator now supports **13 action types** (was 7): adjust_budget, remove_project, delay_project, accelerate_project, cut_consulting, pause_project, change_allocation, across_the_board_cut, reduce_lob, cut_by_type, freeze_new_starts, cap_cost_category, rate_escalation
- Multi-select parameter type for Rate Escalation scope values
- Conditional form options (scope_values populates based on scope_type selection)
- Per-action budget delta computation for engine-calculated actions

### Files Changed
- **Backend (3 modified)**: `services/scenario_engine.py` (full rewrite), `routers/scenarios.py` (1-line fix), `seed/fixtures/advisor/goals.json` (rule_type→action_type)
- **Frontend (3 modified)**: `api/endpoints.ts` (getCostTypes), `modules/simulator/workspace/AddActionForm.tsx` (full rewrite), `modules/simulator/workspace/ActionItem.tsx` (new icons + descriptions)

## v2 Session 5A — Reporting Module Backend + First 3 Reports

Branch: `v2/session-5-reporting`

### Completed Items (Backend)
- [x] **5.1 — Reporting Models**: Created `SavedView` and `ReportSchedule` SQLAlchemy models with JSON config column
- [x] **5.2 — Seed Data**: Added reporting seed data to seed.sql (no pre-seeded saved views — created at runtime)
- [x] **5.3.1 — Programme Rollup API**: `GET /api/reports/programme-rollup` with LoB/status/RAG/type filters, KPIs, chart_data, grouped rows
- [x] **5.3.2 — CC Financial Summary API**: `GET /api/reports/cc-financial-summary` with cost_center/type filters, KPIs, pie/trend chart data
- [x] **5.3.3 — Vendor Spend API**: `GET /api/reports/vendor-spend` with vendor/lob/status filters, KPIs, bar chart data, drill-down endpoint
- [x] **5.3.4 — Forecast Accuracy API**: `GET /api/reports/forecast-accuracy` with lob/type/horizon filters, accuracy KPIs, scatter chart data
- [x] **5.3.5 — Year-over-Year API**: `GET /api/reports/year-over-year` with lob/cost_type filters, YTD comparison KPIs, monthly + cumulative chart data
- [x] **5.5 — Excel Export**: `GET /api/reports/{report_id}/export` returns XLSX via openpyxl with styled headers, formatted data, auto-column widths
- [x] **5.6 — Saved Views CRUD API**: Full CRUD for saved views (`GET/POST /api/reports/saved-views`, `PUT/DELETE /api/reports/saved-views/{id}`)

### Completed Items (Frontend — Session 5A)
- [x] **Reporting Shell**: Route `/reporting` with `ReportLibrary` (5 report cards) and `ReportViewerWrapper` (dynamic report loader)
- [x] **ReportViewer**: Reusable report shell with back link, title, toolbar (Customize/Save View/Export), FilterBar, KPI row, Chart/Table toggle
- [x] **Programme Rollup Report**: Full report with LoB grouping, RAG badges, 5 KPIs, stacked bar chart
- [x] **CC Financial Summary Report**: Full report with cost center filter (auto-set for CC Owner role), pie + trend charts
- [x] **Vendor Spend Report**: Full report with expandable vendor drill-down, procurement status badges, bar chart

## v2 Session 5B — Reporting Module Completion

Branch: `v2/session-5-reporting` (continued)

### Completed Items
- [x] **5.3.4 — Forecast Accuracy Report (frontend)**: Table with project/LoB/forecast/actual/variance columns, scatter plot chart (ComposedChart with Scatter grouped by LoB + Line for diagonal perfect-accuracy reference), rating badges (green/amber/red), configurable columns + sort
- [x] **5.3.5 — Year-over-Year Report (frontend)**: Dual-series line chart with Cumulative/Monthly toggle, 7-column table with delta coloring, FY comparison KPIs, configurable columns + sort
- [x] **5.4 — Report Configurator**: Right-side Sheet drawer with column visibility checkboxes and sort order dropdowns. Available on Forecast Accuracy and YoY reports (reports with flat tables)
- [x] **5.5 — Excel Export (frontend)**: Export button on all 5 reports. Uses fetch() with X-Current-User header, blob download with Content-Disposition filename extraction
- [x] **5.6 — Saved Views (frontend)**: Save View dialog on all 5 reports. SavedViewCard in library with click-to-navigate, rename dialog, delete. Reports load saved config from `?view=ID` query param
- [x] **Bug fixes**: Fixed React Rules of Hooks violation (useMemo after early return), fixed Radix UI SelectItem empty-value crash in ReportConfigurator

### New Files Created (Session 5B)
| File | Purpose |
|------|---------|
| `components/ui/sheet.tsx` | shadcn Sheet (CLI install) |
| `reports/ForecastAccuracyReport.tsx` | Forecast accuracy report with configurable columns |
| `reports/ForecastAccuracyChart.tsx` | Scatter plot chart (ComposedChart) |
| `reports/YoYReport.tsx` | Year-over-year report with configurable columns |
| `reports/YoYChart.tsx` | Dual-series line chart |
| `viewer/ReportConfigurator.tsx` | Right-side Sheet drawer for column/sort config |

### Files Modified (Session 5B)
| File | Changes |
|------|---------|
| `viewer/ReportViewer.tsx` | Added reportId, export handler, configurator + save view props |
| `viewer/ReportViewerWrapper.tsx` | Added ForecastAccuracy + YoY report routing |
| `library/ReportLibrary.tsx` | Fetch + display saved views with rename/delete |
| `library/SavedViewCard.tsx` | Saved view card with navigation + menu |
| `viewer/SaveViewDialog.tsx` | Save view name dialog |
| `reports/ProgrammeRollupReport.tsx` | Added reportId, onSaveView, saved view loading |
| `reports/CCFinancialReport.tsx` | Added reportId, onSaveView, saved view loading |
| `reports/VendorSpendReport.tsx` | Added reportId, onSaveView, saved view loading |

### Reporting Module Summary
- **5 standard reports**: Programme Rollup, CC Financial Summary, Vendor Spend, Forecast Accuracy, Year-over-Year
- **12 backend endpoints**: 5 report data + 1 drill-down + 1 export + 5 saved view CRUD
- **Toolbar features**: Customize (column visibility + sort), Save View, Excel Export
- **Saved views**: Full CRUD with library display, click-to-load, rename, delete

## Known Issues
None currently tracked.
