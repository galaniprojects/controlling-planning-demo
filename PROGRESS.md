# CPC Demo — Build Progress

## Current Status
Phase: D2 (complete)
Last completed: Phase D2 — Project Workbench module
Next up: Phase D3 — Capacity Management

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
  - TopBar: CPC logo, route-aware breadcrumb, help button, role dropdown
  - Launchpad: role-filtered notifications, module tile grid, 5-KPI strip
  - SidePanel (content shrinks, 380px) and BottomDrawer (overlay, 40vh)
  - Routing: / + 5 module placeholder routes with /* for future nesting
  - Submit New Project button (PL-only, shell — form in Phase D)
- [ ] Phase D: Module UIs (split into 5 sessions)
  - [x] D1: Portfolio Overview — expandable tree, filter bar, charts, intake queue, approvals (Section 7.2)
  - [x] D2: Project Workbench — master-detail, 3-point comparison, trajectory chart, forecast wizard (Section 7.3)
  - [ ] D3: Capacity Management — CSS grid heatmap, utilization colors, bottom drawer, request mgmt (Section 7.4)
  - [ ] D4: What-If Simulator — scenario workspace, split layout, comparison view, AI Advisor (Section 7.5)
  - [ ] D5: Administration — entity selector, CRUD tables, detail panel, planning parameters (Section 7.6)
- [ ] Phase E: Documentation content + polish

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

## Deviations from Spec
- Repository named `vision-demo-prototype` instead of `cpc-demo` (user preference)
- Phase D split into 5 sessions (D1–D5) instead of a single phase — one session per module for better focus and context management

## Known Issues
- None
