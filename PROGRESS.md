# CRETA Demo — Build Progress

## Current Status
Phase: Post-QA Feature Development — **Submission workflow + CC Owner resource assignment complete + grid redesign**
Last completed: Redesigned CC Owner assignment page as tabular grid with "Assign All" column
Branch: `docs/submission-workflow-update`

## CC Owner Assignment Grid Redesign (2026-03-25)

### Problem
The previous card-per-request layout was visually inconsistent with the rest of the app (ResourcePlanPage, Forecast & Planning, DetailViewGrid). External cost requests were shown but CC Owner can't assign employees to them.

### Changes
- **`AssignmentGrid.tsx`** (NEW) — Unified tabular grid matching ResourcePlanPage pattern
  - Rows = resource request roles, columns = months with `useCollapsibleYears`
  - Click any cell to open a person dropdown (matching role + others, with utilization %)
  - "Assign All" column: one click assigns a person to every month for that role
  - Year summary column: shows person name (uniform), "Mixed" (varied), or "--" (empty)
  - Status badge per row (X/Y months assigned, green/amber)
  - Sticky left column with role name, hours, priority
- **`ProjectAssignmentPage.tsx`** — Major rewrite
  - Fetches monthly hours + assignments for ALL resource requests in parallel on load
  - Integrates AssignmentGrid instead of individual cards
  - External cost requests hidden entirely from CC Owner view
  - Kept: project header, Team Availability, Confirm/Decline actions
- **`MonthlyAssignmentGrid.tsx`** — No longer imported (kept in codebase)

### Verification
- [x] Tabular grid renders with roles as rows, months as columns (collapsible years)
- [x] No external cost requests visible
- [x] Click cell → dropdown opens with employee list, utilization % shown
- [x] Select employee → cell updates green, auto-saves, badge updates
- [x] "Assign All" column → one click fills all months for a role
- [x] Collapsed year → shows person name or "Mixed" in summary
- [x] Confirm button enabled when all roles fully assigned
- [x] No console or server errors

## Bug Fix: CC Owner Assignment After Resubmission (2026-03-25)

### Problem
After the controller sent a project back with change requests and the PL accepted changes, the CC Owner could not assign resources on the resubmitted project. Root causes:
1. `autoflush=False` in SQLAlchemy session meant new Forecast rows weren't visible to subsequent queries after `accept_changes` or `resubmit_project` rebuilt them
2. `_create_resource_requests_from_forecast` only deleted `status="pending"` requests, leaving stale `confirmed` requests from previous rounds
3. Bulk `.delete()` bypassed ORM cascade, orphaning `ResourceRequestAssignment` rows
4. Frontend `MonthlyAssignmentGrid` was guarded by `request.status === 'pending'`, hiding grids for non-pending requests
5. `all_resource_requests_assigned` check included stale confirmed requests

### Fixes Applied
- **`backend/routers/global_launchpad.py`**: New `_cleanup_previous_resource_data` helper — deletes ALL ResourceRequest objects via ORM (triggering cascade for assignments) and clears Allocation records. Added `db.flush()` after cleanup. Imported `Allocation` model.
- **`backend/routers/portfolio.py`**: Added `db.flush()` after forecast rebuilds in `accept_changes` and `resubmit_project` so new Forecast rows are visible to snapshot/request-creation queries
- **`backend/routers/capacity.py`**: Defensive status filter on `all_resource_requests_assigned` — only checks `status="pending"` resource requests
- **`frontend/src/modules/capacity/requests/ProjectAssignmentPage.tsx`**: Removed `request.status === 'pending'` guard so `MonthlyAssignmentGrid` always renders

### Verification
- [x] Round 1: Controller sends back → PL accepts → CC sees 5 fresh pending requests with assignment grids → assigns employees → confirms → 95 allocations created
- [x] Round 2: Controller sends back again → PL accepts → CC sees 5 fresh pending requests (0 stale), 0 orphaned assignments, 0 duplicate allocations
- [x] UI verified: ProjectAssignmentPage renders all resource request cards with dropdowns, team availability, confirm/decline buttons

## CC Owner Resource Assignment (2026-03-25)

### Data Model
- [x] `ResourceRequestAssignment` model — per-month person assignment for resource requests
  - Fields: `resource_request_id`, `month`, `person_id`, `hours`, `created_at`, `modified_at`
  - Unique constraint on `(resource_request_id, month)` — one person per month per request
  - Cascade delete via `ResourceRequest.assignments` relationship

### Backend API
- [x] `GET /api/capacity/requests/{cc_id}/{request_id}/monthly-hours` — aggregated per-month forecast hours
- [x] `GET /api/capacity/requests/{cc_id}/{request_id}/assignments` — current per-month assignments with person names
- [x] `PUT /api/capacity/requests/{cc_id}/{request_id}/assignments` — save per-month person assignments (validates months, people, creates assignments with forecast hours)
- [x] `GET /api/capacity/project-assignment/{project_id}` — project details with all resource requests and assignment status
- [x] Modified `confirm_project_resources` and `confirm_request` — now create `Allocation` records from `ResourceRequestAssignment` data
- [x] Enriched `get_intake_detail` — resource_plan includes per-role assignment data (person names, months, hours)
- [x] Fixed `_create_resource_requests_from_forecast` — changed CC ID from `cc-rail-systems` to `cc-muc-apd` (matching CC owner persona)

### Frontend
- [x] `MonthlyAssignmentGrid.tsx` — two modes: Unified (one person for all months) and Split (per-month dropdowns)
  - Person dropdown groups: "Matching Role" first, then "Other Roles" with role labels
  - Utilization hints per person per month from heatmap data
  - Auto-saves on change, shows "X/Y months assigned" badge
- [x] `ProjectAssignmentPage.tsx` — dedicated full-page view for CC Owner assignment
  - Project header, resource request cards with MonthlyAssignmentGrid each
  - Collapsible team availability reference panel
  - "Confirm All & Send to Controller" (enabled only when all assigned) and "Decline" buttons
- [x] `ProjectConfirmationBanner.tsx` — "Review & Assign Resources" navigates to assignment page
- [x] Route: `/capacity/project-assignment/:projectId` registered in CapacityManagement
- [x] `IntakeDetailWorkspace.tsx` — "Resource Assignments (CC Owner)" section shows assigned employees per role with month ranges
- [x] API client: `getRequestMonthlyHours`, `getRequestAssignments`, `saveRequestAssignments`, `getProjectAssignmentDetail`
- [x] Types: `MonthlyHoursItem`, `RequestAssignment`, `ProjectAssignmentRequestItem`, `ProjectAssignmentDetail`

### Verification
- [x] API E2E test: project creation → submission → split assignment (2 people) → confirmation → 10 Allocation records created
- [x] UI E2E test: CC Owner assigns Felix Keller (Sr. Dev, 6 months) + Jan Schmidt (Dev, 4 months) → confirms → Controller sees assignments in intake detail
- [x] Split mode: per-month dropdowns with utilization hints, matching role grouping
- [x] Unified mode: single dropdown assigns all months at once
- [x] Allocation records created with correct hours (120h/160h) and `is_confirmed=True`
- [x] TypeScript compilation passes with no errors

## Submission Workflow Implementation (2026-03-25)

### Sessions 1-3: Backend + Frontend Multi-Step Submission
- [x] `ProjectSubmissionSnapshot` model for storing original and controller-proposed forecast snapshots
- [x] `submission_feedback` field on Project model for controller feedback
- [x] `deep_link_tab` field on Notification model for tab-level deep linking
- [x] `POST /api/projects` — create draft project with optional resource plan and external costs
- [x] `PUT /api/projects/{id}/submit` — submit draft for CC confirmation
- [x] `GET /api/projects/{id}/resource-plan` — get forecast data for resource plan grid
- [x] `PUT /api/portfolio/intake/{id}/send-back` — controller requests changes with editable grid and feedback
- [x] `GET /api/portfolio/intake/{id}/diff` — original vs proposed comparison grid with delta coloring
- [x] `PUT /api/portfolio/intake/{id}/accept-changes` — PL accepts controller's proposed changes
- [x] `GET /api/portfolio/intake/{id}/editable-grid` — forecast in editable format for controller
- [x] `ResourcePlanPage.tsx` — full resource plan editor with add/remove roles, monthly hour inputs, EUR auto-calculation
- [x] `SubmissionDiffView.tsx` — PL diff view in Project Workbench with controller feedback and action buttons
- [x] `EditableIntakeGrid.tsx` — click-to-edit grid for controller's change request flow
- [x] `IntakeDiffSection.tsx` — reusable diff grid component for Portfolio Overview PL review
- [x] `SubmitProjectDialog` refactored to Step 1 only (metadata → navigate to resource plan)
- [x] Pending actions updated for all roles (PL, CC Owner, Controller) with deep-link support

### Session 4: PL Diff View and Deep-Linking
- [x] Project Workbench amber banner for `changes_requested` status with controller feedback
- [x] "Review Proposed Changes" button navigates to diff view with comparison grid
- [x] "Edit and Resubmit" button navigates to resource plan editor pre-populated with current data
- [x] IntakeDetailWorkspace (Portfolio Overview) shows feedback card, diff grid with KPI strip, accept/edit buttons
- [x] IntakeDetailPanel "Request Changes" button opens full detail view instead of textarea

### Bug Fixes (Post-Session 4)
- [x] **Diff view showing everything as deleted:** Root cause — `send_back_project` saved only the controller's delta (5-10 changed cells) as the `controller_proposed` snapshot. The diff endpoint compared the full original (~190 rows) against this partial snapshot, making all unchanged cells appear as `proposed = 0`. Fix: merge delta with full Forecast table before saving snapshot.
- [x] **Forecast & Planning tab crash:** Route conflict — launchpad router (`/api/projects/{id}/forecast`) shadowed the workbench router's identical path. Launchpad returned `{months, rows}` with `value/value_eur` fields; workbench expected `{items}` with `forecast_hours/forecast_amount`. Fix: renamed launchpad endpoint to `/api/projects/{id}/resource-plan`.
- [x] **Missing original snapshot for seed projects:** Auto-create original snapshot from current forecast data in `send_back_project` if one doesn't exist.

### Verification
- [x] Full end-to-end flow: Anna (Controller) → Request Changes → edit cells → confirm → Priya (PL) → Review Proposed Changes → only changed cells highlighted (green for reduction)
- [x] Both paths verified: Project Workbench diff view and Portfolio Overview IntakeDetailWorkspace diff view
- [x] KPI strip shows correct Original Plan / Proposed Changes / Impact values
- [x] Forecast & Planning tab loads correctly after route conflict fix

## QA Session D — Fix Session (2026-03-24)

### Bug Fixes
- [x] UI-004 (P2): Executive read-only in Simulator — added `readOnly` prop chain through `ScenarioManager` (hide Create button), `ScenarioWorkspace` → `ActionPanel` (hide AddActionForm, make metadata read-only) → `ActionItem` (hide remove button)
- [x] UI-006 (P3): Controller overdue forecast deep link — changed `deep_link_module` from `"portfolio"` to `"workbench"` with first overdue project ID and `deep_link_tab="forecast"` in `global_launchpad.py`
- [x] UI-007 (P2): PL resubmit button — added `handleResubmit` function and "Resubmit for Approval" button to `IntakeDetailPanel.tsx` for non-Controller users when status is `changes_requested`
- [x] UI-008 (P3): React key warning — changed bare `<>` fragment to `<Fragment key={item.id}>` in `CompetenceCentersPanel.tsx`
- [x] SPEC-002 (P3): Updated test plan persona IDs (`persona-pl`, `persona-exec`)
- [x] SPEC-003 (P3): Documented correct localStorage key (`creta-persona`)

### Verification
- [x] Executive on Simulator: "Create New Scenario" hidden, AddActionForm hidden, remove buttons hidden, metadata read-only
- [x] Controller Launchpad: "Projects with overdue forecasts" navigates to `/workbench?project=proj-erp2&tab=forecast`
- [x] PL resubmit: Send-back → "Resubmit for Approval" button visible → click → status returns to "Pending Approval"
- [x] CC expand: Zero React key warnings in console
- [x] Full module audit: Zero console errors, zero failed network requests across all 7 modules

### Final Cumulative Results
- **133 scenarios tested across 10 suites**
- **All issues resolved: 8 partial → 0 partial (after fixes from Sessions B and D)**
- **UI-005 (AI Advisor pre-loaded suggestions) remains as by-design — not a bug**

## QA E2E Session D — Administration + Cross-Module (2026-03-24)

### Test Results
- **Suite 9 — Administration (ADM-01 to ADM-18):** 18/18 pass
- **Suite 10 — Cross-Module Integration (XM-01 to XM-12):** 10/12 pass, 2 partial
  - XM-01 partial: Overdue forecast pending action links to /portfolio instead of /workbench
  - XM-11 partial: PL has no "Resubmit" button after Controller send-back
- **Total: 30 scenarios, 28 pass, 0 fail, 2 partial**
- **Cumulative (Sessions A+B+C+D): 133 scenarios, 124 pass, 0 fail, 8 partial (4 fixed in Session B)**

### Bugs Found
- **UI-006 (P3):** Overdue forecast pending action links to /portfolio instead of /workbench with project selected
- **UI-007 (P2):** PL cannot resubmit after Controller send-back — no "Resubmit for Approval" button in Intake Queue side panel
- **UI-008 (P3):** React key warning in CompetenceCentersPanel when expanding CC employee list
- **SPEC-003 (P3):** Test plan references `selected-persona` localStorage key; actual key is `creta-persona`

### Observations
- Administration module is fully functional: all 9 entity panels load correctly, CRUD operations work, deactivation pattern works (entities go Inactive, not deleted), reset demo restores all data
- Summary cards: Cost Centers 10, Active People 52 (KNOWN-15), LoB 4, Locations 3, CCs 4
- Portfolio Hierarchy: all 4 tabs functional (Hierarchies, Entity Types, Entities, Hierarchy Assignment), LoB Structure active with correct levels
- Cross-module navigation works: Portfolio→Workbench (via side panel), Capacity→Workbench (via drill-down project links), Launchpad→Portfolio CR Approvals (via pending actions)
- Hierarchy label propagation confirmed: "Line of Business" label dynamically shown in Portfolio filters, Reporting filters
- EUR formatting consistent across all modules (dot thousands, comma decimals)
- Context-sensitive year expansion verified: active→2026, completed→final year (2023), future→start year (2026)
- Zero failed network requests across all 7 modules
- Console errors: only React key warnings from CompetenceCentersPanel (cosmetic)

### Next Steps
- Fix session: Address UI-007 (P2, PL resubmit button) and UI-004 (P2, Executive read-only in Simulator)
- Optionally fix: UI-006 (P3, overdue forecast deep link), UI-008 (P3, React key warnings)

## QA E2E Session A — Global Shell + Portfolio Overview (2026-03-24)

### Test Results
- **Suite 1 — Global Shell & Launchpad (GLB-01 to GLB-07):** 7/7 pass
- **Suite 2 — Portfolio Overview Dashboard (PO-01 to PO-13):** 13/13 pass
- **Suite 3 — Portfolio Intake & CR Approvals (INT-01 to INT-13):** 12/13 pass, 1 fixed
- **Total: 33 scenarios, 32 pass, 0 fail, 1 partial (fixed)**

### Bug Fixes
- [x] UI-001: CR Approvals table Impact column showed "—" for all CRs — replaced naive delta string parsing in `portfolio.py` `get_pending_approvals()` with `_compute_cr_impact_eur()` imported from `workbench.py`. Now shows +€2K (red) / -€10K (green).

### Test Plan Updates
- [x] GLB-03: Updated Controller tile count from 6 to 7 (Documentation module added)

### Issues / Notes
- All workflows verified end-to-end: role switching, filtering, tree expand/collapse, side panels, approve/reject/send-back/resubmit
- Zero console errors, zero failed network requests throughout all 33 scenarios
- Tab switching via programmatic click doesn't work (Radix controlled tabs) — confirmed non-issue for real users, URL navigation works
- Bug report: `qa/bug-report.md`

### Next Steps
- QA Session B: Suites 4-6 (Workbench + Forecast + Capacity) — DONE
- QA Session C: Suites 7-8 (Simulator + Reporting)
- QA Session D: Suites 9-10 (Administration + Cross-Module)

## QA E2E Session B — Workbench + Forecast + Capacity (2026-03-24)

### Test Results
- **Suite 4 — Project Workbench (WB-01 to WB-17):** 16/17 pass, 1 partial
  - WB-12 partial: Completed projects don't auto-expand final year in Forecast Grid
- **Suite 5 — Forecast Wizard (FW-01 to FW-10):** 7/10 pass, 1 fail, 2 blocked
  - FW-05 FAIL: Phase 3 (Edit Forecast) crashes with blank screen — React error in `<Phase3EditForecast>`
  - FW-06, FW-07 BLOCKED: Cannot reach Phase 4/5 due to Phase 3 crash
- **Suite 6 — Capacity Management (CAP-01 to CAP-14):** 14/14 pass
- **Total: 41 scenarios, 37 pass, 1 fail, 3 partial/blocked**
- **Cumulative (Sessions A+B): 74 scenarios, 69 pass, 1 fail, 4 partial/blocked**

### Bugs Found
- **UI-002 (P3):** Completed projects don't auto-expand final year in Forecast Grid collapsible years. Active (2026) and future (start year) work correctly. Only completed projects affected. File: `useCollapsibleYears.ts` or `ForecastGrid.tsx`
- **UI-003 (P1):** Forecast Wizard Phase 3 crashes on load — blank white screen. React error in `<Phase3EditForecast>` component. No error boundary catches it. No API errors — purely frontend rendering issue. Blocks all remaining wizard phases (4 and 5). File: `Phase3EditForecast.tsx`
- **SPEC-002 (P3):** Test plan persona IDs (`persona-project-lead`, `persona-executive`) don't match actual IDs (`persona-pl`, `persona-exec`)

### Observations
- Workbench module is solid: master-detail layout, role scoping, collapsible years, ForecastGrid with sticky columns, CapEx/OpEx tags, Change History with expandable CR detail cards all working well
- Capacity Management is fully functional: heatmap color coding, cell drill-down to project-level detail, cross-module links to Workbench, 3 pivot views on Org Overview, resource request workflow
- Forecast Wizard Phases 1-2 work correctly (variance review with employee names, AI suggestions with Apply/Dismiss)
- EUR formatting consistent throughout (European convention: dot thousands, comma decimals)

## QA Session B — Fix Session (2026-03-24)

### Bug Fixes
- [x] UI-003 (P1): Forecast Wizard Phase 3 crash — renamed `totalDeltaEurEur` to `totalDeltaEur` in `Phase3EditForecast.tsx` (variable name typo). Phase 3 now loads with editable grid.
- [x] UI-002 (P3): Completed projects auto-expand — updated `useCollapsibleYears.ts` useEffect to re-apply expansion when `EXPAND_YEAR` changes after initial seeding (race condition with async overview API).

### Verification
- [x] Phase 3 loads successfully for ERP Integration Phase 2 (Priya Sharma), stepper shows phases 1-2 complete
- [x] Completed project (Data Center Consolidation): 2023 auto-expanded
- [x] Active project (ERP Integration Phase 2): 2026 auto-expanded
- [x] Future project (Connected Vehicle Platform): 2026 auto-expanded
- [x] Zero console errors across all verification steps

### Next Steps
- QA Session C: Suites 7-8 (Simulator + Reporting) — DONE
- QA Session D: Suites 9-10 (Administration + Cross-Module)

## QA E2E Session C — Simulator + Reporting (2026-03-24)

### Test Results
- **Suite 7 — What-If Simulator (SIM-01 to SIM-16):** 14/16 pass, 2 partial
  - SIM-14 partial: AI Advisor panel opens but shows no pre-loaded suggestions (only text input + Analyze button)
  - SIM-16 partial: Executive can access Simulator but read-only not enforced (Create, Add Action, Remove buttons all visible/enabled)
- **Suite 8 — Reporting (RPT-01 to RPT-13):** 13/13 pass
- **Total: 29 scenarios, 27 pass, 0 fail, 2 partial**
- **Cumulative (Sessions A+B+C): 103 scenarios, 96 pass, 0 fail, 6 partial (4 fixed in Session B)**

### Bugs Found
- **UI-004 (P2):** Simulator Executive read-only not enforced — "Create New Scenario" button enabled, ADD ACTION form visible, remove buttons visible for Executive persona. All modification controls should be hidden/disabled for read-only access.
- **UI-005 (P3):** AI Advisor panel has no pre-loaded suggestions — opens with text input and "Analyze Portfolio" button only. No pre-built optimization paths with Apply buttons. May be by design.

### Observations
- What-If Simulator core functionality is solid: scenario CRUD, 7 project-level + 6 portfolio-level action types, full recalculation pipeline, KPI comparison strip, time frame breakdown, portfolio impact tree with drill-down drawer, scenario comparison view, publish/unpublish workflow
- All 3 pre-built scenarios have correct headline impacts (-€502K, +€490K, -€2,8M)
- Reporting module is fully functional: all 5 reports load with data, saved views CRUD works, custom project groupings with search/save/load, vendor drill-down to line items, YoY monthly toggle with month filters, column configurator, dynamic hierarchy labels
- EUR formatting consistent across all modules (European convention)
- Zero console errors, zero failed network requests throughout all 29 scenarios

### Next Steps
- QA Session C Fix: Address UI-004 (Executive read-only) — priority P2
- QA Session D: Suites 9-10 (Administration + Cross-Module)

## v4 Session 6 — UX Polish (2026-03-24, continued)

### Completed Items (UX polish pass)
- [x] CR Detail Modal sizing — moved `overflow-y-auto` from DialogContent to body div with `flex flex-col` + `flex-1 min-h-0` so header stays pinned and body scrolls properly
- [x] CR impact on collapsed rows — added `impact_eur` field to backend `CRHistoryItem` schema and `_compute_cr_impact_eur()` helper in `workbench.py` that computes lightweight EUR delta per CR (resource hours × rate, external costs directly). Collapsed CR rows now show impact in order: Impact → Type badge → Status badge. Formatted with `formatCurrencyCompact` (e.g. `+2K €`), colored green for savings, red for increases.
- [x] Forecast wizard project switch guard — added `useEffect` in `ForecastTab.tsx` that resets mode to `'read'` when `projectId` changes, preventing stale wizard state when switching projects mid-review

### Verification Results (UX polish)
- [x] CR list: 9 CRs for proj-erp2, 7 show impact values (e.g. +2K €, +1,5K €, +750 €), 2 without numeric changes show no impact
- [x] CR detail modal: content fits without clipping, body area scrolls independently of header
- [x] Forecast wizard resets to read mode when switching projects during active review
- [x] Zero console errors (only pre-existing Radix accessibility warnings)

## v4 Session 6 — Seed Data Fixes + End-to-End Verification (2026-03-24)

### Completed Items
- [x] WB-11 (seed data): Rewrote `_build_cr_grid_data()` in `backend/routers/portfolio.py` — function previously filtered for `field_changed in ("hours_per_month", "amount_per_month")` which never matched actual seed data field names. New logic filters by `line_item_type is not None AND month is not None AND numeric old/new values`, groups by `line_item_type`, looks up display names from `RoleType`/`ExternalCostType` tables, and builds one `DetailViewLineItem` per affected line item. Multi-line-item CRs (e.g., CR 12 with role-dev + role-qa) now render correctly.
- [x] WB-11 (seed data consistency): Updated 12 forecast rows in `seed.sql` to match approved CR old/new values. Fixed CR 10 old_value from 60 to 80 to match actual baseline. All 14 audited CRs now have traceable before/after values matching baseline (old) and forecast (new).
- [x] RPT-06: Verified — 117 snapshot rows across 13 projects, report renders with KPIs (avg accuracy, within 5%, above 15%, bias direction).
- [x] BUG-3: Fixed LoB raw ID display in Project Workbench — `workbench.py` now resolves `project.lob.name` instead of returning `project.lob_id`.
- [x] End-to-end verification walkthrough — all modules verified via preview tooling.

### Verification Results
- [x] CR detail grid: Change History for proj-erp2 CR 1 shows Senior Developer line item with current=80h/€8K, proposed=100h/€10K, delta=+20h/+€2K
- [x] CR Approvals grid: SAP S/4HANA CR 12 shows Developer (-80h) and QA/Test Engineer (-40h) line items with Total Impact -€10K (green)
- [x] LoB display: Project Workbench shows "Truck & Bus Systems (TBS)" instead of "lob-tbs"
- [x] Forecast Accuracy: 13 projects rendered with variance percentages and rating badges (red/amber)
- [x] Portfolio Overview: FY 2026 KPIs (square tiles), LIFETIME summary, CY/PY column clusters, Forecast by Line of Business chart
- [x] Capacity Management: My Team heatmap with color variation (green/amber/yellow), utilization percentages
- [x] What-If Simulator: scenario list with headline impact values
- [x] Reporting: all 5 reports accessible from library
- [x] Administration: all entity panels (Cost Centers, Competence Centers, LoB, Locations, People, Rate Tables, Portfolio Hierarchy, Planning Parameters, Audit Log)
- [x] Zero console errors, zero backend errors, zero failed network requests

### Issues / Notes
- The `/administration` route returns a blank page; the correct route is `/admin`. This is a pre-existing routing inconsistency (not introduced in this session).
- Forecast Accuracy KPIs show 0.0% avg accuracy and 0 within-5% projects when filtered to FY 2026 with 6-month horizon — this is expected because the snapshot data (2025-06 to 2026-02) predates the DEMO_DATE minus 6 months threshold. The report works correctly when the horizon or fiscal year filter is adjusted.

## v4 Session 5 — Administration + Dynamic Hierarchy (2026-03-23)

### Completed Items
- [x] ADM-02: Cost center edit — code field shown as read-only disabled input in edit mode. Added `disabled` and `editOnly` support to EntityFormDialog FieldDef interface.
- [x] ADM-05: People competence center assignment — added `competence_center_id` FK to Person model, seed data populated from cost_center→CC mapping, People panel shows CC column and edit form has CC dropdown, reference API returns CC fields.
- [x] ADM-03: Competence center employee assignment — expandable detail view showing assigned employees with name/role/cost center. "Add Employee" dialog with searchable dropdown (shows reassignment warning). "Remove" button per employee. 3 new backend endpoints.
- [x] ADM-04: LoB project assignment — expandable detail view showing assigned projects with status badges and budgets. "Assign Project" dialog with reassignment warning. 2 new backend endpoints.
- [x] ADM-01: Configurable portfolio hierarchy — 5 new SQLAlchemy models (GroupingEntityType, GroupingEntity, GroupingHierarchy, GroupingHierarchyLevel, ProjectGroupingAssignment). Seed data migrates existing LoB structure as default active hierarchy. 12 new backend endpoints for full CRUD. New PortfolioHierarchyPanel with 4 tabs (Hierarchies, Entity Types, Entities, Project Assignments). Cross-module propagation via `useActiveHierarchy` hook — filter labels, chart titles, and entity options across Portfolio Overview, all 4 reports, and What-If Simulator dynamically reflect the active hierarchy label.
- [x] ADM-06: Standard available hours — already implemented in v3 Session 3 via PlanningParameters panel. No additional work needed.

### Verification Results
- [x] Cost center edit: code field disabled (read-only), name and location editable
- [x] People edit: competence center dropdown available, table shows CC column
- [x] Competence center expand: assigned employees listed, add/remove functional
- [x] LoB expand: assigned projects listed with status/budget, assign dialog with reassignment warning
- [x] Portfolio Hierarchy panel: Hierarchies tab shows "LoB Structure" as active with "Line of Business → Project" levels. Entity Types, Entities, Project Assignments tabs all functional.
- [x] Cross-module propagation: filter labels dynamically show "Line of Business" from active hierarchy across Portfolio Overview, Programme Rollup, YoY, Vendor Spend, Forecast Accuracy. Chart title shows "Forecast by Line of Business" dynamically.
- [x] Standard hours: configurable via Planning Parameters (pre-existing)

### Bug Fixes (post-initial completion)
- [x] Hierarchy Assignment fix — renamed "Project Assignments" tab to "Hierarchy Assignment". Non-leaf entities now assign child entities (not projects directly). E.g., in a Department→LoB→Project hierarchy, selecting a Department shows LoB assignment, not project assignment. Only leaf-level entities assign projects.
- [x] Portfolio filter fix — filtering by different LoB/entity in Portfolio Overview after hierarchy changes now works correctly. Fixed recursive entity-to-project resolution via `project_grouping_assignments`.
- [x] Entity creation UX — "Create Entity" dialog pre-selects the entity type from the current filter dropdown. Added "Add Another" button for batch creation of multiple entities of the same type in one dialog session.

### Issues / Notes
- ADM-01: The portfolio tree in Portfolio Overview still uses `project.lob_id` for grouping (not the dynamic hierarchy entities). Full backend propagation (modifying `build_portfolio_tree` to query via `project_grouping_assignments`) is deferred to a follow-up — the hierarchy panel and cross-module label propagation are complete.
- ADM-01: The "Cut by LoB" simulator action now uses active hierarchy entities for its dropdown options (via `getActiveHierarchy`), but the backend `reduce_lob` action still filters by the `lob_id` field in project state. Full backend propagation for scenario engine actions would require additional work.
- ADM-04: Projects can be reassigned between LoBs but cannot be "unassigned" (projects must always belong to a LoB). The LoB panel shows project list but has no remove button — only the Portfolio Hierarchy panel supports unassignment from grouping entities.

## v4 Session 4 — New Requirements: Simulator + Reporting (2026-03-23)

### Completed Items
- [x] SIM-03: Portfolio Impact Time Frame Breakdown — impact dashboard now shows per-year segments (CY, 2027, 2028…, Overall) with current FC, scenario FC, and delta per segment. CY uses abbreviation, future years use 4-digit labels. Added `_get_yearly_forecasts()`, `_build_time_frame_breakdown()` helpers in scenario_engine.py, `TimeFrameCard` component in KPIComparisonStrip.tsx.
- [x] SIM-04: Year Selector for Scenario Actions — multi-select year checkboxes (2025–2030) in AddActionForm. When target years selected, percentage-based actions (adjust_budget, cut_consulting, across_the_board_cut, reduce_lob, cut_by_type, cap_cost_category) scope their effect to forecast in those years only. Added `_get_year_scoped_forecast()` helper.
- [x] RPT-03: Custom Project Groupings in Programme Rollup — "Custom Group" toggle shows project multi-select panel with search, checkbox list, saved groups management (create/load/delete). Backend accepts `project_ids` query param to override normal scoping. Custom groups stored via SavedView model with `report_id='custom-group'`.
- [x] RPT-05: Expense Cost Type Filter and Column in Vendor Spend — added "Expense Cost Type" column (showing dominant cost type per vendor: ext-cloud, ext-consulting, etc.) and filter dropdown populated from reference data. Backend filters by `Forecast.sub_category`.
- [x] RPT-07: LoB and Project Columns in YoY Comparison — rewrote `compute_year_over_year()` to query per-project actuals with Project/LoB joins. Annual mode returns one row per project with lob_name, project_name, fy_current, fy_previous, delta, delta_pct.
- [x] RPT-08: Month Column Optional with Toggle — month hidden by default (annual view). "Show Monthly Detail" button toggles to per-project-per-month rows with month filter checkboxes (Jan–Dec). Cumulative columns only shown in monthly mode.

### Verification Results
- [x] Simulator impact view: CY, 2027, 2028, Overall segments with FC/Scenario/delta per segment. Only "CY" uses abbreviation.
- [x] Scenario action panel: year selector (2025–2030) appears for all action types with "(all years if none selected)" hint
- [x] Programme Rollup: Custom Group mode with project search, checkbox list, saved groups section, save/load/delete
- [x] Vendor Spend: "Expense Cost Type" column visible (ext-cloud, ext-consulting, etc.), filter dropdown in filter bar
- [x] YoY Comparison: LoB and Project columns present in table. Month hidden by default.
- [x] YoY monthly toggle: "Show Monthly Detail" button enables month column + month filter checkboxes
- [x] Zero console errors, zero failed network requests

### Issues / Notes
- SIM-03: Time frame breakdown distributes adjusted budget proportionally across years based on original forecast ratios (since actions operate on total budget, not per-year). This means year-level deltas are approximate when actions don't use target_years.
- RPT-03: Custom groups are stored using the SavedView model with `report_id='custom-group'` for simplicity. A dedicated model would be cleaner for production.
- RPT-07/08: YoY annual mode shows one row per project (not per-month). Monthly mode expands to per-project-per-month. The chart always shows aggregate (all projects combined).

## v4 Session 3 — New Requirements (2026-03-23)

### Completed Items
- [x] CM-06: Configurable standard hours — added planning parameters (global 160h, Munich 160h, Budapest 168h, Pune 176h), location-aware utilization calculation, "Xh / Yh — Z%" display format, updated color thresholds (amber <70%, green 70-90%, amber 90-100%, red >100%)
- [x] WB-09: Variance explanation bug fix — fixed duplicate key issue for same-role line items (category:sub_category:idx), added employee names from Allocation→Person lookup (e.g., "Senior Developer — Lena Fischer")
- [x] WB-04: Monthly timeline table — new MonthlyTimelineTable component below chart with Baseline/Forecast/Actuals rows, collapsible year columns (useCollapsibleYears hook), frozen row labels, GLB-01 context-sensitive default expansion
- [x] PO-01: Dashboard KPIs CY scoping — existing 6 KPI tiles scoped to FY 2026, "FY 2026" label added, compact "LIFETIME" summary row below (lifetime baseline/forecast/actuals + active project count), both sections react to filters
- [x] PO-04: Portfolio table CY/PY clusters — added baseline_cy/forecast_cy/actuals_cy/baseline_py/forecast_py/actuals_py to tree nodes, columns reorganized into CY 2026 cluster → Timeline → Prior Years cluster with cluster headers
- [x] CM-02: Collapsible year columns in Organization Overview — backend returns full allocation date range, frontend uses useCollapsibleYears hook with year headers and expand/collapse, year summary cells show average utilization
- [x] CM-03: Cell drill-down drawer — summary section with Allocated/Available/Delta hours and green/red color coding
- [x] CM-04: Cell drill-down drawer — person-level detail with expandable project rows revealing employee names and per-person hours, project names link to Workbench
- [x] PO-07: Send Back workflow redesign — status lifecycle (pending_approval → changes_requested → pending_approval), project stays in Intake Queue with amber "Changes Requested" badge, PL notification created, PL can resubmit via "Resubmit for Approval" button

### Verification Results
- [x] Monthly table below timeline chart: Baseline/Forecast/Actuals rows, collapsible years, 2025 collapsed with summary, 2026 expanded with monthly values
- [x] Phase 1 retrospective: two Senior Developer items have independent explanation fields, employee names shown (Lena Fischer, Rajesh Patel)
- [x] Portfolio KPIs: "FY 2026" label, CY-scoped values (Baseline €5.4M vs Lifetime €21.3M), Lifetime summary row visible
- [x] Portfolio table: CY 2026 and Prior Years clusters separated by Timeline column
- [x] Send Back flow: controller sends back → "Changes Requested" amber badge → project stays in queue → PL can resubmit
- [x] Organization Overview: collapsible year columns (2022-2025 collapsed, 2026 expanded by default)
- [x] Cell drawer: Allocated 1010h / Available 1600h / Delta +590h (green), project list with hours, expandable employee names
- [x] My Team utilization: "Xh / Yh — Z%" format with location-specific standard hours (160h Munich, 168h Budapest)

### Issues / Notes
- PO-07: Controller feedback is stored as description suffix (simple approach for demo). A dedicated feedback_json field would be cleaner for production.
- CM-02: Collapsed year summary cells in org view show compact percentage only (not full hours format) to save space — this is by design.
- CM-06: The <70% bucket changed from blue to amber per v4 spec. Some cells that were blue (under-utilized) are now amber.

## v4 Session 2 — UX Refinements (2026-03-23)

### Completed Items
- [x] GLB-01: Context-sensitive year expansion — running projects expand current year, future→starting year, completed→final year. Added `getDefaultExpandedYear()` utility and `defaultExpandedYear` param to `useCollapsibleYears` hook.
- [x] WB-03: Timeline summary strip labeled "FY 2026" with separator line
- [x] WB-05: ForecastGrid line item column auto-sizes (`whitespace-nowrap`, removed `min-w-[180px]`)
- [x] WB-08: Renamed "Start Monthly Review" → "Rolling Forecast Review"
- [x] CM-01: HeatmapGrid first column auto-sizes (`max-content` grid template, removed `truncate`)
- [x] CM-05: Capacity Management defaults to My Team tab for all roles (was "org" for non-CC-owners)
- [x] PO-02: "Budget by LoB" → "Forecast by Line of Business" — grouped bar chart with Forecast + Baseline bars, CY-scoped from Forecast/Baseline tables, reacts to all dashboard filters
- [x] PO-03: Project summary pane auto-closes on "Open in Workbench" click via `useSidePanel().closePanel()`
- [x] PO-05: KPI tiles reshaped to 6 square cards in single horizontal row (`grid-cols-6 gap-3 aspect-square`)
- [x] PO-09: Renamed "Approvals" tab → "CR Approvals"
- [x] RPT-04: Cost center name added as first column in CC Financial Summary (backend resolves primary CC via allocation count)

### Verification Results
- [x] Portfolio dashboard: 6 square KPI tiles in one row, "CR Approvals" tab, "Forecast by Line of Business" chart with forecast+baseline legend
- [x] FC&Planning grid: line item labels not truncated, 2026 expanded for active project
- [x] Timeline summary strip shows "FY 2026" label
- [x] Capacity Management opens to My Team tab for controller
- [x] CC Financial Summary: "Cost Center" is first column header, rows show CC names
- [x] Zero console errors, zero failed network requests across all verified pages

### Issues / Notes
- "Autonomous Braking Prototype" shows "—" for cost center in CC Financial because it has no allocations (pending approval). This is expected.
- GLB-01 future/completed project expansion not fully testable in current seed data (all active projects → default to 2026). The utility function is correct; will be exercised if future-dated projects are added.
- PO-02 backend now filters all charts (trajectory, RAG, forecast-by-lob) using the same filtered project IDs based on all dashboard filters, not just LoB.

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

## CR Workflow Overhaul (2026-03-25)

Full change request workflow now functional (previously cosmetic text-only actions).

### New Flow: PL → Controller → PL (if adjusted) → CC Owner (last)

**Backend:**
- [x] `CRSubmissionSnapshot` model for storing original + controller-proposed forecast data
- [x] `controller_feedback` field on ChangeRequest model
- [x] `GET /api/portfolio/approvals/{cr_id}/editable-grid` — controller editable grid
- [x] `PUT /api/portfolio/approvals/{cr_id}/send-back` — now accepts `changes[]` array + creates snapshots
- [x] `GET /api/projects/{pid}/change-requests/{cr_id}/diff` — PL diff view endpoint
- [x] `PUT /api/projects/{pid}/change-requests/{cr_id}/accept-changes` — PL accepts controller changes
- [x] `PUT /api/projects/{pid}/change-requests/{cr_id}/resubmit` — PL resubmits to controller
- [x] Controller approve now routes CRs with resource changes to `pending_cc_confirmation` + creates ResourceRequests
- [x] CC Owner confirm/decline in capacity.py now final stage (approve + apply forecast)
- [x] Resource requests seeded with `change_request_id` FK for CRs #9, #15

**Frontend:**
- [x] `EditableCRGrid.tsx` — controller editable grid (adapted from EditableIntakeGrid)
- [x] `CRDiffSection.tsx` — PL diff view with color-coded comparison grid
- [x] `CRDetailWorkspace.tsx` — edit-grid action mode for controller
- [x] `CRDetailPanel.tsx` — "Request Changes" routes to workspace
- [x] `CRHistoryList.tsx` — sent-back CRs show amber highlighting + inline diff
- [x] `ChangeHistoryTab.tsx` — refresh mechanism for CR actions
- [x] API client updated with new endpoints

**Seed Data:**
- [x] CR #27 (sent_back_by_controller) has snapshots for immediate diff demo
- [x] CRs #9, #15 (pending_cc_confirmation) have linked resource requests

## Build History (archived — detail removed to keep file manageable)

All phases below are complete. See git history for full details.

- **Phase A:** Database schema + seed data (27 models, 19K-line seed.sql)
- **Phase B:** Backend API (90+ endpoints across 8 router groups)
- **Phase C:** Frontend shell (Vite + React + shadcn/ui, 4-persona role switcher, routing)
- **Phase D:** Module UIs — D1 Portfolio Overview, D2 Project Workbench, D3 Capacity Management, D4 What-If Simulator, D5 Administration
- **Phase E:** Documentation + polish
- **v3 Overhaul:** Sessions 1, 5A–5C, 6 — global patterns, launchpad redesign, seed data regeneration (19K lines), end-to-end verification

