# CPC Demo — Build Progress

## Current Status
Phase: C (complete)
Last completed: Phase C — Frontend shell (commit: 222172d)
Next up: Phase D — Module UIs (Portfolio Overview first, then Workbench, Capacity, Simulator, Admin)

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
- [ ] Phase D: Module UIs
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

## Deviations from Spec
- Repository named `vision-demo-prototype` instead of `cpc-demo` (user preference)

## Known Issues
- None
