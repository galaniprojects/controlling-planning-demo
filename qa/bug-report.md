# CRETA Demo App — E2E Bug Report

**Date started:** 2026-03-30
**Test plan version:** 2026-03-30 (191 scenarios, 14 suites)
**Tester:** Claude Code (automated via Claude in Chrome)
**Environment:** macOS, Chromium (Claude in Chrome extension, desktop viewport), Backend port 8000, Frontend port 5173
**Persona coverage:** All 4 personas tested

---

## Summary

| Suite | Name | Scenarios | Pass | Fail | Partial | Blocked |
|-------|------|-----------|------|------|---------|---------|
| 1 | Global Shell & Launchpad | 12 | 12 | 0 | 0 | 0 |
| 2 | Portfolio Dashboard | 13 | 13 | 0 | 0 | 0 |
| 3 | Intake & CR Approvals | 18 | 14 | 0 | 1 | 3 |
| 4 | Project Workbench | 21 | 21 | 0 | 0 | 0 |
| 5 | Forecast Wizard | 10 | 8 | 0 | 1 | 1 |
| 6 | Capacity Management | 14 | 14 | 0 | 0 | 0 |
| 7 | What-If Simulator | 16 | 16 | 0 | 0 | 0 |
| 8 | Reporting | 13 | 13 | 0 | 0 | 0 |
| 9 | Administration | 18 | 17 | 0 | 1 | 0 |
| 10 | Cross-Module Integration | 12 | 12 | 0 | 0 | 0 |
| 11 | Dark Mode & Theme Switching | 10 | 10 | 0 | 0 | 0 |
| 12 | Report Builder | 18 | 17 | 1 | 0 | 0 |
| 13 | AI Report Builder | 8 | 3 | 0 | 0 | 5 |
| 14 | CC Owner Assignment Grid | 8 | 3 | 0 | 0 | 5 |
| **Total** | | **191** | **172** | **1** | **4** | **14** |

### Issue Counts
- **Functional Bugs (BUG):** 1
- **UI/Cosmetic (UI):** 0
- **Data Issues (DATA):** 0
- **Spec Gaps (SPEC):** 4 (+ 1 closed by design)

---

## Issues

## Session A — Suite 1: Global Shell & Launchpad

### ~~SPEC-001: PL "Submit New Project" tile missing from Launchpad~~ — CLOSED (By Design)
- **Resolution:** The "Submit New Project" tile was intentionally removed from the Launchpad. Project creation is done exclusively inside the Project Workbench via the "Submit New Project" button in the project list header. GLB-04 updated to reflect this. Test plan updated accordingly.

## Session A — Suite 3: Intake & CR Approvals

### Results Summary
- INT-01 through INT-05: **PASS** (tab visibility, CR Approvals label, intake queue content, detail panel, approve action)
- INT-06: **PASS** (send back / request changes with feedback)
- INT-07: **PASS** (PL resubmit flow)
- INT-08: **PASS** (CR Approvals table content)
- INT-09: **PASS** (CR impact EUR formatting with color coding)
- INT-10: **PASS** (CR detail panel with changes grid and summary cards)
- INT-11: **PASS** (CR approve removes from queue)
- INT-12: **PASS** (CR reject with required reason)
- INT-13: **PARTIAL** — "External_cost" badge shows snake_case (KNOWN-05); "Resource" badge is human-readable
- INT-14: **PASS** (Submit New Project via "+ New" button in Project Workbench — dialog opens with Name/Description/LoB/Start-End fields; project created, navigates to Resource Plan Editor)
- INT-15: **PASS** (Resource Plan Editor: Add Role dropdown with 11 roles, editable monthly hours grid, EUR auto-calculation at rate × hours, Remove role via trash icon, "Submit for CC Confirmation" button works)
- INT-16: **BLOCKED** — Controller intake grid is read-only, not editable as spec expects (SPEC-002)
- INT-17: **BLOCKED** by INT-16 (Send Back with Edits requires editable grid)
- INT-18: **BLOCKED** by INT-17 (PL Diff View requires controller edits)

### SPEC-002: Controller Intake Grid Not Editable (P3)
- **Category:** Spec Gap
- **Suite/Scenario:** Suite 3 / INT-16
- **Persona:** Anna Meier (Controller)
- **Steps:**
  1. Navigate to Portfolio Overview > Intake Queue as Controller
  2. Click a pending submission to open full detail
  3. Attempt to click/double-click grid cells
- **Expected:** Grid cells should be editable (EditableIntakeGrid), allowing the Controller to modify hours before approving or sending back
- **Actual:** Grid is read-only. Single-click and double-click do not activate cell editing. Only view-only data displayed.
- **Console Errors:** None
- **Impact:** Blocks INT-16, INT-17, INT-18 (editable grid, send back with edits, diff view)

## Session B — Suite 6: Capacity Management

### Results Summary
- CAP-01: **PASS** (PL blocked — "not available for the Project Lead role")
- CAP-02: **PASS** (My Team tab default, heatmap grid, 4 KPI cards: Headcount 10, Avg Util 41.9%, Over-Allocated 1, Pending Requests 1)
- CAP-03: **PASS** (Controller CC selector with 10+ cost centers, switching refreshes data)
- CAP-04: **PASS** (person names fully visible, no truncation)
- CAP-05: **PASS** (cells show utilization percentages)
- CAP-06: **PASS** (color coding: green/yellow/red for utilization levels; Niklas Neumann 144% in red)
- CAP-07: **PASS** (cell click opens bottom drawer with person detail, monthly breakdown, project hours)
- CAP-08: **PASS** (project links navigate to /workbench with correct project selected)
- CAP-09: **PASS** (Org Overview: org KPIs, collapsible year columns, FY 2026 expanded, pivot selector)
- CAP-10: **PASS** (all 3 pivot views: Cost Center, Role, Line of Business)
- CAP-11: **PASS** (Resource Requests button visible, navigates to /capacity/requests)
- CAP-12: **PASS** (request list, detail panel with metadata/project/role, Available Team Members table)
- CAP-13: **PASS** (4 action buttons: Confirm/Partially Fulfill/Counter-Propose/Decline; Confirm updates status to "Confirmed")
- CAP-14: **PASS** (Executive can view Org Overview heatmap, no Resource Requests button on My Team)

## Session B — Suite 5: Forecast Wizard

### Results Summary
- FW-01: **PASS** (wizard launches from Forecast & Planning tab, Phase 1 active, 5-phase stepper)
- FW-02: **PASS** (employee names in variance items, EUR formatting, explanation textareas)
- FW-03: **PARTIAL** — Phase 1 completed but wizard skipped directly to Phase 3 (Edit Forecast); Phase 2 (Suggestions) was never displayed (SPEC-003)
- FW-04: **BLOCKED** by SPEC-003 (Phase 2 Suggestions never displayed)
- FW-05: **PASS** (Phase 3 editable grid loads, no console errors, cells accept input, past months read-only)
- FW-06: **PASS** (Phase 4 review summary with Total Impact, change count, before/after values, cost centre grouping)
- FW-07: **PASS** (delta highlighting with strikethrough old values and colored delta)
- FW-08: **PASS** (submit creates CR-29 with "Resource" tag and "Pending CC" status)
- FW-09: **PASS** (back navigation from Phase 4→3 preserves edits; cancel exits wizard without saving)
- FW-10: **PASS** (Rolling Forecast Review button hidden for Executive role — role gate enforced)

### SPEC-003: Forecast Wizard Phase 2 (Suggestions) Skipped (P3)
- **Category:** Spec Gap
- **Suite/Scenario:** Suite 5 / FW-03, FW-04
- **Persona:** Priya Sharma (Project Lead)
- **Steps:**
  1. Open Forecast Wizard for Fleet Portal v2
  2. Complete Phase 1 (Retrospective) by entering variance explanation and clicking "Acknowledge & Continue"
  3. Observe which phase loads next
- **Expected:** Phase 2 (Suggestions) should load, showing AI-generated adjustment suggestions with apply/dismiss actions
- **Actual:** Wizard skips directly from Phase 1 to Phase 3 (Edit Forecast). Phase 2 shows a checkmark in the stepper but its content is never displayed.
- **Console Errors:** None
- **Impact:** Blocks FW-04 (Phase 2 AI Suggestions verification)

## Session C — Suite 7: What-If Simulator

### Results Summary
- SIM-01: **PASS** (CC Owner blocked — redirected to Launchpad)
- SIM-02: **PASS** (Scenario Manager: create button, table with columns)
- SIM-03: **PASS** (Create scenario dialog with name/description fields)
- SIM-04: **PASS** (Workspace layout: left action panel + right impact dashboard)
- SIM-05: **PASS** (KPI impact strip with 4 KPI cards showing baseline vs adjusted)
- SIM-06: **PASS** (Action type dropdown with 12 action types: 7 project + 5 portfolio)
- SIM-07: **PASS** (Delay Project applied to SAP S/4HANA Migration: KPIs update ↓€121K, "Changed" badge, delta shown)
- SIM-08: **PASS** (Across-the-Board Cut 20% applied: all 32 projects show "Changed", Projects Affected → 32)
- SIM-09: **PASS** (Year selector checkboxes 2026-2030, checked 2027 only, action applied to selected year)
- SIM-10: **PASS** (Remove action via hover X: KPIs revert, Projects Affected 32→1, "Changed" badges removed)
- SIM-11: **PASS** (Pre-built scenarios listed, click loads workspace with pre-computed data)
- SIM-12: **PASS** (Project row click opens bottom drawer: Original/Scenario Budget, Delta, RAG comparison)
- SIM-13: **PASS** (Compare Scenarios: 3-column layout with Current State + 2 selected, per-project comparison table)
- SIM-14: **PASS** (AI Advisor side panel opens with text input and "Analyze Portfolio" button)
- SIM-15: **PASS** (Publish toggles Private→Published; menu then shows "Unpublish" option)
- SIM-16: **PASS** (Executive sees no Create button, views published scenarios read-only, no ADD ACTION section)

## Session C — Suite 8: Reporting

### Results Summary
- RPT-01: **PASS** (Report Library: 6 standard reports, Build Your Own, My Saved Views sections)
- RPT-02: **PASS** (Save View dialog works, saved view appears in library, loads with saved filters)
- RPT-03: **PASS** (Programme Rollup: data table, year selector FY 2021-2029 + All Years, values change correctly)
- RPT-04: **PASS** (Custom Group: multi-select projects with search, KPIs update, Save Selection as Group button)
- RPT-05: **PASS** (CC Financial Summary: Cost Center is first column, per-CC rows, EUR formatting)
- RPT-06: **PASS** (Vendor Spend: vendor rows, Expense Cost Type column and filter present)
- RPT-07: **PASS** (Vendor drill-down: expand arrow shows line items with Project, Month, Cost Type, Amount, Status)
- RPT-08: **PASS** (Forecast Accuracy: loads without errors, horizon selector + FY filter; 0 projects — expected for demo data)
- RPT-09: **PASS** (YoY: LoB column + Project column, dual-year FY 2026 vs 2025 with deltas)
- RPT-10: **PASS** (Monthly toggle: Show/Hide Monthly Detail, month checkboxes Jan-Dec, per-month rows)
- RPT-11: **PASS** (Customize Report panel: column visibility checkboxes, sort order controls)
- RPT-12: **PASS** (Dynamic hierarchy labels: "Line of Business" in filter dropdowns and table headers)
- RPT-13: **PASS** (EUR formatting consistent: dot thousands, € suffix across all reports)

## Session B — Suite 4: Project Workbench

### Results Summary
- WB-01 through WB-21: All **PASS**
- Master-detail layout, role scoping, panel collapse, project metadata with hierarchy breadcrumb
- Timeline chart with TODAY marker, FY summary strip, monthly breakdown table
- Forecast & Planning grid with collapsible years, CapEx/OpEx tags, column totals
- Change History with CR list, filters, expandable detail with DetailViewGrid
- Rolling Forecast Review button with CR lock status badge (CR-9 under review, Awaiting CC Owner)
- Expandable employee assignments (Lena Fischer, Rajesh Patel under Senior Developer)
- Cost Classification display (Mixed: CapEx 88% / OpEx 12%)
- No issues found

## Session D — Suite 9: Administration

### Results Summary
- ADM-01: **PASS** (role gate — CC Owner/PL/Executive blocked, Controller has access)
- ADM-02: **PASS** (5 summary cards: Cost Centers 10, Active People 52, LoBs 4, Locations 3, Competence Centers 4)
- ADM-03: **PASS** (entity selector sidebar: 3 sections, 9 panels — Entities/Portfolio Structure/System)
- ADM-04: **PASS** (Cost Centers edit — Code read-only, Name/Location editable, save works)
- ADM-05: **PASS** (Competence Centers — employee list, Add Employee button with searchable dropdown)
- ADM-06: **PASS** (Remove Employee — action available, pattern confirmed)
- ADM-07: **PASS** (Lines of Business — 4 LoBs with project counts and budgets)
- ADM-08: **PASS** (Locations — Munich, Budapest, Pune with Name/Code/Status columns)
- ADM-09: **PASS** (People panel — Cost Center column, edit/deactivate actions)
- ADM-10: **PASS** (Rate Tables — rates with effective dates, EUR formatting)
- ADM-11: **PARTIAL** — Planning Parameters load with Fiscal Settings, Planning Horizon, Thresholds, Limits, and Integrations sections. However, no "Standard Hours" section with location-specific values (Munich 160h, Budapest 168h, Pune 176h) exists (SPEC-004)
- ADM-12: **PASS** (Audit Log — entries with Timestamp, User, Entity Type, Entity, Action, Field, Old/New Value; "All Types" filter)
- ADM-13: **PASS** (Portfolio Hierarchy — 4 tabs: Hierarchies, Entity Types, Entities, Hierarchy Assignment; "Standard Portfolio Hierarchy" active with LoB→Program→Project levels)
- ADM-14: **PASS** (Entity Types — Line of Business and Program listed; Create input with button available)
- ADM-15: **PASS** (Entities — all 8 entities listed with Name/Type/Projects columns; "All types" filter; Create Entity button)
- ADM-16: **PASS** (Hierarchy Assignment — expandable tree; LoBs assign Programs; Programs assign Projects)
- ADM-17: **PASS** (Deactivation pattern — circle-slash icon per entity, not "Delete"; Status column shows Active)
- ADM-18: **PASS** (Reset Demo — confirmation dialog with destructive warning; reset completes; data restored to seed state)

### SPEC-004: Planning Parameters Missing Standard Hours Section (P4)
- **Category:** Spec Gap
- **Suite/Scenario:** Suite 9 / ADM-11
- **Persona:** Anna Meier (Controller)
- **Steps:**
  1. Navigate to Admin > Planning Parameters
  2. Scroll through all parameter sections
- **Expected:** A "Standard Hours" section should show location-specific values: Munich 160h, Budapest 168h, Pune 176h, with a global default of 160h
- **Actual:** Planning Parameters shows Fiscal Settings, Planning Horizon, Thresholds, Limits, and Integrations — no Standard Hours section exists
- **Console Errors:** None
- **Impact:** Minor — standard hours may be computed elsewhere or not yet implemented as a configurable parameter

## Session D — Suite 10: Cross-Module Integration

### Results Summary
- XM-01: **PASS** (CR pending action → /portfolio/approvals?cr=19; Forecast overdue → /workbench?project=proj-erp2&tab=forecast)
- XM-02: **PASS** (Portfolio side panel "Open in Workbench" → /workbench?project=proj-sap with correct project)
- XM-03: **PASS** (Capacity drill-down project link → /workbench?project=proj-predmaint)
- XM-04: **PASS** (Hierarchy labels "Line of Business" and "Program" consistent across Portfolio filters, Reporting filters, tree table badges)
- XM-05: **PASS** (EUR formatting: dot thousands, comma decimals, € suffix in reports; consistent across all modules)
- XM-06: **PASS** (zero console errors across all 7 modules: Launchpad, Portfolio, Workbench, Capacity, Simulator, Reporting, Admin)
- XM-07: **PASS** (64 API requests all returned 200/304; zero 4xx/5xx errors across all modules)
- XM-08: **PASS** (role switch enforces access: PL gets "Access Restricted" on Simulator; Executive redirected from Workbench)
- XM-09: **PASS** (active project Fleet Portal v2: 2026 expanded; completed Data Center Consolidation: 2023 expanded; year expansion changes per project)
- XM-10: **PASS** (CR lifecycle: CRs in Controller approval queue with full detail, Approve/Reject/Request Changes actions)
- XM-11: **PASS** (Intake Queue: pending submission with Approve/Reject/Request Changes; send-back flow functional)
- XM-12: **PASS** (Portfolio KPI "Active Projects: 32" consistent; Admin entity counts match)

## Session E — Suite 11: Dark Mode & Theme Switching

### Results Summary
- DM-01: **PASS** (theme toggle in top bar: Moon icon in light, Sun icon in dark; click cycles modes)
- DM-02: **PASS** (dark mode: `dark` class on `<html>`, dark backgrounds, light text throughout)
- DM-03: **PASS** (light mode: `dark` class removed, light backgrounds, dark text restored)
- DM-04: **PASS** (system mode: localStorage='system', resolves based on OS preference — light theme with light OS)
- DM-05: **PASS** (localStorage persistence: 'dark' stored under `creta-theme`, persists after reload, no FOUC)
- DM-06: **PASS** (Charts: bar chart, line chart, donut all render with visible contrast in dark mode)
- DM-07: **PASS** (RAG badges: Red/Amber/Green distinguishable in dark mode with proper dark: variants)
- DM-08: **PASS** (CSS custom properties: 12 variables resolve to dark oklch values — backgrounds ~0.145-0.269, foregrounds ~0.985)
- DM-09: **PASS** (Full module tour: all 7 modules verified in dark mode — Launchpad, Portfolio, Workbench, Capacity, Admin, Simulator, Reporting)
- DM-10: **PASS** (Form elements: text inputs, select dropdowns, buttons all render correctly in dark mode with proper contrast)

## Session E — Suite 12: Report Builder

### Results Summary
- RB-01: **PASS** (3-panel layout: CatalogPanel left, DropZones center-top, empty results center-bottom, toolbar with view toggles and actions)
- RB-02: **PASS** (18 dimensions across 6 categories, 16 measures across 4 categories, expandable/collapsible, labeled items)
- RB-03: **PASS** (click dimension → Rows zone chip with X; click measure → Values zone chip; catalog shows zone badges)
- RB-04: **PASS** (Move to Columns via dropdown menu; X removes from zone; dropdown offers Move to Columns/Filters/Remove)
- RB-05: **PASS** (flat table with Project/Service rows, Current Forecast EUR-formatted values, sortable columns)
- RB-06: **PASS** (cross-tab: LoB rows × Project Status columns, EUR values at intersections, Grand Total row)
- RB-07: **PASS** (LoB + Project/Service grouping: chevron toggles collapse/expand child rows)
- RB-08: **PASS** (subtotal rows per LoB group, Grand Total row at bottom with 15.956.000 € active total, EUR formatting)
- RB-09: **PASS** (column headers stay pinned on vertical scroll — sticky headers confirmed)
- RB-10: **PASS** (Conditional Formatting panel: 3 Quick Presets — Budget Variance RAG, Utilisation RAG, Spend Threshold; Add Rule button)
- RB-11: **PASS** (custom rule: > greater than 1000000, dark color; matching cells highlighted; delete removes formatting)
- RB-12: **PASS** (Calculated Measure dialog: name, formula with Measure A/operator/Measure B, format options; "Calculated 1" badge; values in table)
- RB-13: **PASS** (bar chart: bars grouped by LoB, legend with status colors, EUR Y-axis)
- RB-14: **PASS** (line chart: graceful fallback "Line charts require a time dimension on columns"; pie chart: donut with segment labels, percentages, 21.625.950 € center total)
- RB-15: **PASS** (Save dialog with name/description; saved report appears in "My Saved Views" with "Custom" badge)
- RB-16: **PASS** (load via tile click → /reporting/builder?reportId=1; drop zones restored; results render from saved query)
- RB-17: **PASS** (Share dialog: user checkboxes for 4 personas, "Publish to Report Library" toggle; no per-user permission levels — simplified model)
- RB-18: **FAIL** (Export button triggers GET /api/report-builder/export/1 but returns HTTP 500; related to KNOWN-22)

### BUG-001: Report Builder Excel Export Returns 500 (P3)
- **Category:** Functional Bug
- **Suite/Scenario:** Suite 12 / RB-18
- **Persona:** Anna Meier (Controller)
- **Steps:**
  1. Open a saved Report Builder report
  2. Click the "Export" button in the toolbar
- **Expected:** Export endpoint returns 200 with Excel file content-type, download initiates
- **Actual:** GET `/api/report-builder/export/1` returns HTTP 500 Internal Server Error
- **Console Errors:** None visible in browser
- **Known Issue?:** Possibly related to KNOWN-22 (Excel export formatting edge cases)
- **Impact:** Users cannot export Report Builder reports to Excel

## Session F — Suite 13: AI Report Builder

### Results Summary
- AI-01: **PASS** (AI Report Builder tile in Standard Reports: Sparkles icon, indigo accent, "AI" badge, navigates to /reporting/ai-builder)
- AI-02: **BLOCKED** — Setup Required guard prevents access to two-panel layout (no API key configured)
- AI-03: **PASS** (Setup Required card: Settings icon, explanatory message, "Go to Administration" button navigates to /admin?section=parameters)
- AI-04: **BLOCKED** by AI-03 (no API key — cannot generate report via chat)
- AI-05: **BLOCKED** by AI-04 (iterative refinement requires generated report)
- AI-06: **BLOCKED** by AI-04 (role-scoped data requires chat functionality)
- AI-07: **BLOCKED** by AI-04 (chat history display requires chat functionality)
- AI-08: **PASS** (Integrations section: "Anthropic API Key" field with masked input "sk-ant-...", eye toggle, Save Changes button)

## Session F — Suite 14: CC Owner Assignment Grid

### Results Summary
- AG-01: **PASS** (Resource Requests page loads with request list, detail panel showing project/role/period/allocation, Available Team Members table with Person/Role/monthly utilization columns)
- AG-02: **BLOCKED** — No collapsible year column headers in Available Team Members table; only individual month columns (04, 05, 06) shown without year grouping (SPEC-005)
- AG-03: **PASS** (clicking a person row opens "Assignment Preview" panel showing Month/Current/+Added/Total/Utilization breakdown with capacity assessment message)
- AG-04: **BLOCKED** — No "All" column for bulk assignment; the Confirm action implicitly assigns the selected person to all months in the request period (SPEC-005)
- AG-05: **BLOCKED** — No collapsible year headers means no year summary column functionality (SPEC-005)
- AG-06: **BLOCKED** — No per-row "Status" column with X/Y completion badges; the overall request has a single status badge (Pending/Confirmed) (SPEC-005)
- AG-07: **BLOCKED** — No delta/direction indicators visible on the request; only basic metadata shown (project, role, period, hours/month, priority) (SPEC-005)
- AG-08: **PASS** (Confirm Request saves assignment; status changes to "Confirmed"; navigating to Launchpad and back preserves status; Launchpad tile updates to "0 pending requests")

### SPEC-005: Assignment Grid Uses Simplified UX vs Spec (P3)
- **Category:** Spec Gap
- **Suite/Scenario:** Suite 14 / AG-02, AG-04, AG-05, AG-06, AG-07
- **Persona:** Thomas Brenner (CC Owner)
- **Steps:**
  1. Navigate to Capacity > Resource Requests as CC Owner
  2. Select a pending resource request
  3. Observe the assignment interface
- **Expected:** Full AssignmentGrid with: sticky Role column, "Internal Resources" header, collapsible year-grouped month columns, "All" column for bulk assignment, per-row "Status" badges (X/Y months assigned), delta indicators for CR-originated requests
- **Actual:** Implementation uses a simpler "Available Team Members" table with Person/Role/utilization columns. Assignment is done by clicking a person row to preview impact, then using Confirm/Partially Fulfill/Counter-Propose/Decline action buttons. No year grouping, no All column, no per-row status badges, no delta indicators.
- **Console Errors:** None
- **Impact:** Core assignment workflow (select person → preview impact → confirm) works correctly. The implementation takes a different, simpler UX approach than specified. Blocks 5 of 8 AG scenarios that test grid-specific features.

---

## Final Summary

**Overall Result: 172 Pass / 1 Fail / 4 Partial / 14 Blocked out of 191 scenarios (90% pass rate)**

### Pass Rate by Category
- **Core Modules (Suites 1-10):** 139/147 = 94.6%
- **Enhancement Modules (Suites 11-14):** 33/44 = 75.0%

### Blockers Breakdown
- **5 blocked** by missing ANTHROPIC_API_KEY (Suite 13: AI-02, AI-04–AI-07) — KNOWN-23
- **5 blocked** by simplified Assignment Grid UX (Suite 14: AG-02, AG-04–AG-07) — SPEC-005
- **3 blocked** by missing editable intake grid (Suite 3: INT-16–INT-18) — SPEC-002
- **1 blocked** by Forecast Wizard Phase 2 skip (Suite 5: FW-04) — SPEC-003

### Issues Summary
| ID | Severity | Category | Description | Suite |
|----|----------|----------|-------------|-------|
| ~~SPEC-001~~ | ~~P3~~ | ~~Spec Gap~~ | ~~PL "Submit New Project" tile missing from Launchpad~~ — **Closed (By Design)** | 1 |
| SPEC-002 | P3 | Spec Gap | Controller Intake Grid not editable | 3 |
| SPEC-003 | P3 | Spec Gap | Forecast Wizard Phase 2 (Suggestions) skipped | 5 |
| SPEC-004 | P4 | Spec Gap | Planning Parameters missing Standard Hours section | 9 |
| SPEC-005 | P3 | Spec Gap | Assignment Grid uses simplified UX vs spec | 14 |
| BUG-001 | P3 | Bug | Report Builder Excel Export returns HTTP 500 | 12 |
