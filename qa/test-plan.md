# CRETA Demo App — End-to-End Regression Test Plan

This is the **living test plan** for the CRETA application. It provides step-by-step instructions for a complete regression test covering all modules, personas, interactive features, data integrity checks, and cross-module integration. This document should be updated after every version to reflect new features, changed behavior, and retired scenarios.

**Total scenarios:** ~138 across 10 test suites
**Tester:** Claude Code using preview tools (not human testers)
**Execution rule:** No code fixes during testing — document issues only
**Location:** All QA artifacts live in the `qa/` directory

---

## 1. Introduction

### Scope
- **Demo date:** March 2026
- **Currency:** EUR with European formatting (dot thousands, comma decimals)
- **Language:** English
- **Modules covered:** Launchpad, Portfolio Overview, Project Workbench, Capacity Management, What-If Simulator, Reporting, Administration

### Maintenance
This test plan is the single source of truth for regression testing. After each version/session cycle:
1. Add scenarios for any new features
2. Update existing scenarios if behavior changed
3. Remove scenarios for deprecated/removed features
4. Update the Seed Data Reference if entity counts changed
5. Update the Known Issues Register (promote fixed issues, add new ones)

---

## 2. Environment & Prerequisites

### URLs
- **Backend:** `http://localhost:8000` (Swagger at `/docs`)
- **Frontend:** `http://localhost:5173`

### Starting Servers
```bash
# Backend (run in background)
cd backend && source .venv/bin/activate && python main.py &

# Frontend (use preview_start with "frontend" config from .claude/launch.json)
preview_start name="frontend"
```

### Reset Demo Data
```bash
curl -X POST http://localhost:8000/api/admin/reset-demo
```
Run this before each testing session to ensure clean state.

### Preview Tools Reference
| Tool | Purpose |
|------|---------|
| `preview_snapshot` | Read accessibility tree (text, structure, element UIDs) |
| `preview_screenshot` | Capture visual state (JPEG) |
| `preview_inspect` | Check CSS values on specific selectors |
| `preview_click` | Click elements by CSS selector |
| `preview_fill` | Fill form inputs by CSS selector |
| `preview_eval` | Execute JS (navigation, debugging) |
| `preview_console_logs` | Check for console errors |
| `preview_network` | Check for failed API requests |

---

## 3. Execution Rules

### Testing Only — No Code Fixes
- **Do not edit any source files** during a testing session
- **Do not fix bugs** as you find them — document them in the bug report
- **Do not modify seed data** or database during testing (except via demo reset)
- Code corrections happen in separate fix sessions after all testing is complete

### Bug Report Protocol
- Maintain `qa/bug-report.md` as a companion document during testing
- Create it at the start of Session A if it doesn't exist
- Append issues in real-time as they're discovered
- See Section 12 (Bug Report Template) for the required format

### Screenshot Protocol
- Take `preview_screenshot` at key verification points
- Take screenshots when an issue is found (evidence for the bug report)
- Reference screenshot descriptions in bug report entries

---

## 4. Personas & Access Matrix

| Persona | Storage ID | Role | Greeting |
|---------|-----------|------|----------|
| Anna Meier | `persona-controller` | Controller | "Hello, Anna" |
| Thomas Brenner | `persona-cc-owner` | CC Owner | "Hello, Thomas" |
| Priya Sharma | `persona-project-lead` | Project Lead | "Hello, Priya" |
| Thomas Becker | `persona-executive` | Executive | "Hello, Thomas" |

### Module Access by Role

| Module | Controller | CC Owner | Project Lead | Executive |
|--------|-----------|----------|-------------|-----------|
| Launchpad | Full | Full | Full | Full |
| Portfolio — Dashboard | Full | Dashboard only | Dashboard + Intake | Dashboard only |
| Portfolio — Intake Queue | Full | No | Submit/Resubmit | No |
| Portfolio — CR Approvals | Full | No | No | No |
| Project Workbench | Full | Full | Full (own projects) | Read-only |
| Capacity Management | Full (CC selector) | Full (own CC) | No access | Read-only |
| What-If Simulator | Full | No access | No access | Read-only |
| Reporting | Full | Full | Full | Full |
| Administration | Full | No access | No access | No access |

---

## 5. Seed Data Reference

| Entity | Count | Notes |
|--------|-------|-------|
| Projects | 32 | Across 4 LoBs (TBS ~9, RVS ~8, CIT ~8, DND ~7) |
| Active People | ~52 | Full role/location/cost centre assignments |
| Lines of Business | 4 | Truck & Bus Systems, Rail Vehicle Systems, Commercial IT, Digital & Data |
| Cost Centres | 10 | Across 3 locations (Munich, Budapest, Pune) |
| Competence Centers | Multiple | With blended rates |
| Change Requests | ~14+ | With traceable before/after values |
| Pre-built Scenarios | 3 | 2 published, 1 private |
| Data Range | 2021-06 to 2029-06 | 9 fiscal years |

### Key Demo Projects (reference in test steps)
- **SAP S/4HANA Migration** — Active, long-running (2022-01 to 2026-06), good for historical data checks
- **ERP Integration Phase 2** — Active, Red RAG, has CRs, good for variance/CR testing
- **Autonomous Braking Prototype** — Pending Approval, good for intake testing
- **Connected Vehicle Platform** — Future start (2026-07), good for future forecast testing
- **Data Center Consolidation** — Completed project, good for historical/completed state testing
- **Legacy System Decommission** — Completed, good for three-point comparison

---

## 6. Test Execution Protocol

### Session Grouping

| Session | Suites | Focus | Est. Duration |
|---------|--------|-------|---------------|
| A | 1 + 2 + 3 | Global Shell + Portfolio Overview | ~2 hours |
| B | 4 + 5 + 6 | Workbench + Forecast + Capacity | ~2.5 hours |
| C | 7 + 8 | Simulator + Reporting | ~1.75 hours |
| D | 9 + 10 | Administration + Cross-Module | ~1.5 hours |

### Execution Order
1. Suite 1 must run first (validates app loads, role switching works)
2. Suites 2-9 can run in any order after Suite 1
3. Suite 10 should run last (final integration pass)
4. Suite 9's Reset Demo scenario (ADM-18) must be the last scenario in Suite 9
5. Each session starts with `curl -X POST http://localhost:8000/api/admin/reset-demo`

### State Dependencies
- Suites 3 and 10 contain stateful workflows (approve/reject/send-back) — requires fresh demo data
- Suite 9 creates/edits admin entities — run before Suite 10 or after a reset
- If re-running a single suite, reset demo data first unless noted otherwise

---

## 7. Bug Report Protocol

### Document: `qa/bug-report.md`

Create at the start of Session A with this header:

```markdown
# CRETA Demo App — E2E Bug Report
**Date started:** [date]
**Tester:** Claude Code (automated via preview tooling)
**Environment:** macOS, Chromium (preview tools, desktop viewport), Backend port 8000, Frontend port 5173

## Summary
| Suite | Scenarios | Pass | Fail | Partial | Notes |
|-------|-----------|------|------|---------|-------|

## Issues
(appended in real-time during testing)
```

### Issue Entry Format
```markdown
### [ID]: [Short description] ([Severity])
- **Category:** Functional Bug | UI/Cosmetic | Data Issue | Spec Gap
- **Suite/Scenario:** Suite X / XX-NN
- **Persona:** [name]
- **Steps:** [numbered steps to reproduce]
- **Expected:** [what should happen]
- **Actual:** [what actually happened]
- **Console Errors:** [if any]
- **Known Issue?:** Yes (ref: [ID from Known Issues Register]) | No
```

### ID Prefixes
- `BUG-NNN` — Functional bugs
- `UI-NNN` — UI/cosmetic issues
- `DATA-NNN` — Data issues
- `SPEC-NNN` — Spec gaps (missing features)

### Severity Levels
- **P0 (Blocker):** Crashes, blank pages, completely broken workflows
- **P1 (Major):** Key feature doesn't work, wrong data displayed
- **P2 (Minor):** Feature works but with issues, formatting problems
- **P3 (Cosmetic):** Visual polish, label inconsistencies, alignment issues

---

# TEST SUITES

---

# SUITE 1 — Global Shell & Launchpad

**Session:** A | **Est. time:** 30 min | **Default persona:** Anna Meier (Controller)

---

### GLB-01: App Loads and CRETA Branding
**Goal:** Verify the app loads correctly with CRETA branding throughout.
**Persona:** Anna Meier (Controller)

1. Navigate to `http://localhost:5173`
2. `preview_snapshot` — verify page loads without blank screen
3. Verify the top bar shows "CRETA" text/logo (not "CPC")
4. Verify the browser page title contains "CRETA"
5. `preview_snapshot` — verify breadcrumb root says "CRETA"
6. `preview_console_logs` — verify zero console errors on initial load

**Verify:**
- [ ] App loads without errors
- [ ] "CRETA" branding in top bar
- [ ] "CRETA" in breadcrumb
- [ ] No "CPC" text anywhere visible

---

### GLB-02: Role Switcher — All 4 Personas
**Goal:** Verify role switching works for all personas and UI updates correctly.
**Persona:** Start as Anna Meier

1. `preview_snapshot` — verify Launchpad shows "Hello, Anna" and "Controller" role badge
2. Click the role switcher dropdown in the top bar
3. `preview_snapshot` — verify dropdown shows all 4 personas
4. Select **Thomas Brenner** (CC Owner)
5. `preview_snapshot` — verify greeting changes to "Hello, Thomas" and role badge shows "CC Owner"
6. Select **Priya Sharma** (Project Lead)
7. `preview_snapshot` — verify "Hello, Priya" and "Project Lead" badge
8. Select **Thomas Becker** (Executive)
9. `preview_snapshot` — verify "Hello, Thomas" and "Executive" badge
10. Select **Anna Meier** to return to Controller

**Verify:**
- [ ] All 4 personas selectable
- [ ] Greeting name updates per persona
- [ ] Role badge updates per persona
- [ ] Launchpad content refreshes on switch

---

### GLB-03: Launchpad — Module Tiles (Controller)
**Goal:** Verify Controller sees all module tiles with correct layout.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — verify Launchpad is displayed
2. Verify module tiles are in a 2-column grid layout
3. Count visible module tiles — Controller should see 7 modules: Portfolio Overview, Project Workbench, Capacity Management, What-If Simulator, Reporting, Administration, Documentation
4. Verify the primary module tile (Portfolio Overview) has a distinctive border/styling
5. Verify each tile shows a module name, description, and contextual metric
6. Verify no "Submit New Project" tile visible for Controller

**Verify:**
- [ ] 7 module tiles visible
- [ ] 2-column grid layout
- [ ] Primary module has special styling
- [ ] No "Submit New Project" tile

---

### GLB-04: Launchpad — Module Tiles (Project Lead)
**Goal:** Verify Project Lead sees appropriate tiles including "Submit New Project".
**Persona:** Priya Sharma (Project Lead)

1. Switch to Priya Sharma via role switcher
2. `preview_snapshot` — count module tiles
3. Verify PL sees: Portfolio Overview, Project Workbench, Reporting (and possibly others per role config)
4. Verify PL does NOT see: Administration, What-If Simulator
5. Verify a "Submit New Project" dashed tile is visible
6. Verify Capacity Management is NOT visible for PL

**Verify:**
- [ ] Correct module tiles for PL role
- [ ] "Submit New Project" tile present
- [ ] Admin and Simulator tiles hidden
- [ ] Capacity Management hidden

---

### GLB-05: Launchpad — Pending Actions Panel
**Goal:** Verify the pending actions panel shows role-appropriate actions.
**Persona:** Anna Meier (Controller)

1. Switch to Anna Meier
2. `preview_snapshot` — verify the right-side pending actions panel is visible
3. Verify it shows a list of pending action items with descriptions
4. Verify each item has an urgency indicator (red bar for urgent, gray for normal)
5. Verify a badge count is shown (note: badge may count only urgent items — known issue)
6. Click a pending action item
7. `preview_snapshot` — verify navigation to the correct module/screen (deep-link)

**Verify:**
- [ ] Pending actions panel visible on right side
- [ ] Action items listed with urgency indicators
- [ ] Badge count visible
- [ ] Deep-link navigation works on click

---

### GLB-06: Launchpad — Pending Actions (Other Roles)
**Goal:** Verify pending actions differ by role.
**Persona:** Cycle through all 4

1. As Anna Meier — note the pending action items and count
2. Switch to Thomas Brenner — verify different set of pending actions (capacity-related)
3. Switch to Priya Sharma — verify PL-specific actions (e.g., forecast overdue, CR status notifications)
4. Switch to Thomas Becker — verify Executive actions (if any; may show fewer/no urgent items)

**Verify:**
- [ ] Each role sees different pending actions
- [ ] Actions are contextually appropriate per role

---

### GLB-07: Module Navigation — Click Each Tile
**Goal:** Verify clicking each module tile navigates to the correct route.
**Persona:** Anna Meier (Controller)

1. From Launchpad, click **Portfolio Overview** tile
2. `preview_snapshot` — verify navigated to `/portfolio`, Portfolio module loads
3. Click CRETA breadcrumb to return to Launchpad
4. Click **Project Workbench** tile — verify `/workbench`
5. Return to Launchpad, click **Capacity Management** — verify `/capacity`
6. Return, click **What-If Simulator** — verify `/simulator`
7. Return, click **Reporting** — verify `/reporting`
8. Return, click **Administration** — verify `/admin`
9. For each module, verify the breadcrumb shows "CRETA / [Module Name]"

**Verify:**
- [ ] All 6 module tiles navigate to correct routes
- [ ] Breadcrumb updates correctly per module
- [ ] CRETA breadcrumb link returns to Launchpad

---

### GLB-08: Module Guide Button
**Goal:** Verify the module guide (info/book icon) loads documentation content.
**Persona:** Anna Meier (Controller)

1. Navigate to Portfolio Overview
2. Find and click the module guide button (book/info icon)
3. `preview_snapshot` — verify a guide panel opens with documentation content
4. Verify the content references "CRETA" (not "CPC")
5. Close the guide panel
6. Navigate to Project Workbench, repeat — click guide button, verify content loads

**Verify:**
- [ ] Guide button visible on module pages
- [ ] Clicking it opens a panel with module documentation
- [ ] Content loads from API (not empty/error)
- [ ] Content references "CRETA"

---

### GLB-09: FAQ / Help Panel
**Goal:** Verify the FAQ/help functionality works.
**Persona:** Anna Meier (Controller)

1. Find and click the help button (? icon) in the top bar
2. `preview_snapshot` — verify FAQ panel opens with a list of FAQ entries
3. Click an FAQ entry to expand it
4. Verify the answer content loads (not empty)
5. Close the FAQ panel

**Verify:**
- [ ] Help button accessible in top bar
- [ ] FAQ panel opens with entries
- [ ] Entries expandable with answer content
- [ ] Panel closeable

---

### GLB-10: Breadcrumb Navigation
**Goal:** Verify breadcrumbs work for navigation context.
**Persona:** Anna Meier (Controller)

1. Navigate to Portfolio Overview — verify breadcrumb: "CRETA / Portfolio Overview"
2. Navigate to Reporting, then open a report — verify breadcrumb adds report name
3. Click "CRETA" in breadcrumb — verify returns to Launchpad
4. Navigate to Capacity Management — verify breadcrumb: "CRETA / Capacity Management"

**Verify:**
- [ ] Breadcrumb shows current module name
- [ ] Breadcrumb shows sub-navigation where applicable
- [ ] CRETA link in breadcrumb returns to Launchpad

---

### GLB-11: URL Deep Linking
**Goal:** Verify direct URL navigation works correctly.
**Persona:** Anna Meier (Controller)

1. `preview_eval` — navigate directly to `http://localhost:5173/workbench`
2. `preview_snapshot` — verify Project Workbench loads (not a blank page or error)
3. `preview_eval` — navigate to `http://localhost:5173/portfolio`
4. `preview_snapshot` — verify Portfolio Overview loads
5. `preview_eval` — navigate to `http://localhost:5173/admin`
6. `preview_snapshot` — verify Administration loads

**Verify:**
- [ ] Direct URL navigation works for all module routes
- [ ] No blank pages or routing errors
- [ ] Correct module content loads

---

### GLB-12: No Emoji Anywhere
**Goal:** Verify the UI uses only text and Lucide icons, no emoji characters.
**Persona:** Anna Meier (Controller)

1. On Launchpad, `preview_snapshot` — scan all visible text for emoji characters
2. Navigate through Portfolio, Workbench, Capacity — scan each for emojis
3. Check pending actions panel, module tiles, KPI cards for emoji usage

**Verify:**
- [ ] No emoji characters found in any UI text
- [ ] Icons are Lucide SVG icons (not emoji)

---

# SUITE 2 — Portfolio Overview: Dashboard

**Session:** A | **Est. time:** 45 min | **Default persona:** Anna Meier (Controller)

---

### PO-01: Dashboard Tab Loads
**Goal:** Verify the Portfolio Dashboard tab loads with all sections.
**Persona:** Anna Meier (Controller)

1. Navigate to `/portfolio`
2. `preview_snapshot` — verify Dashboard tab is active by default
3. Verify the page contains: KPI tiles row, filter bar, portfolio tree table, charts section

**Verify:**
- [ ] Dashboard tab active by default
- [ ] KPI tiles visible
- [ ] Filter bar visible
- [ ] Portfolio tree table visible
- [ ] Charts section visible

---

### PO-02: KPI Tiles — Layout and CY Scope
**Goal:** Verify 6 KPI tiles in a single row, scoped to FY 2026.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — examine the KPI tiles section
2. Verify there are 6 KPI tile cards in a single horizontal row (not 2 rows)
3. Verify tiles show metrics like: Baseline, Current Forecast, YTD Actuals, Variance, Active Projects, Pending CRs (labels may vary)
4. Verify a "FY 2026" label or scope indicator is visible
5. `preview_inspect` with a KPI tile selector — verify card-like styling (square shape)

**Verify:**
- [ ] 6 KPI tiles in single row
- [ ] Tiles show CY-scoped values (FY 2026)
- [ ] EUR values use European formatting (dot thousands, comma decimals)
- [ ] Compact notation for large values (e.g., "21,3M" or "21.300K")

---

### PO-03: Lifetime Summary Row
**Goal:** Verify the Lifetime summary row appears below/alongside CY KPIs.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — look for a "Lifetime" summary row or section near the KPI tiles
2. Verify it shows lifetime baseline, forecast, actuals totals
3. Verify active project count is present

**Verify:**
- [ ] Lifetime summary visible
- [ ] Lifetime totals differ from CY totals (larger values)
- [ ] Active project count shown

---

### PO-04: Filter Bar
**Goal:** Verify filter dropdowns work and affect displayed data.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — identify the filter bar with Select dropdowns
2. Verify available filters include grouping entity (e.g., LoB), Status, RAG, Type
3. Click a filter (e.g., Status) and select "Active"
4. `preview_snapshot` — verify the portfolio tree and KPIs update to show only active projects
5. Click "Clear" button to reset filters
6. `preview_snapshot` — verify all data returns to unfiltered state

**Verify:**
- [ ] Filter dropdowns are functional
- [ ] Selecting a filter updates tree table and KPIs
- [ ] Clear button resets all filters
- [ ] At least 4 filter dimensions available

---

### PO-05: Portfolio Tree Table — Structure
**Goal:** Verify the hierarchical tree table with CY/PY column clusters.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — examine the portfolio tree table
2. Verify column cluster headers: "CY 2026" group and "Prior Years" (or similar PY) group
3. Verify LoB grouping rows are visible (e.g., "Truck & Bus Systems")
4. Verify project rows are nested under LoB groups
5. Count total visible projects when all groups are expanded — should be ~32

**Verify:**
- [ ] CY/PY column cluster headers present
- [ ] LoB grouping rows visible
- [ ] Projects nested under LoBs
- [ ] ~32 projects total when expanded

---

### PO-06: Portfolio Tree — Expand/Collapse
**Goal:** Verify tree expand/collapse behavior.
**Persona:** Anna Meier (Controller)

1. Find a collapsed LoB group row (has chevron icon)
2. Click the chevron to expand it
3. `preview_snapshot` — verify project rows appear underneath with indentation
4. Click the chevron again to collapse
5. `preview_snapshot` — verify project rows are hidden
6. Verify collapsed row shows summary values (aggregated totals)

**Verify:**
- [ ] Expand/collapse chevrons work
- [ ] Projects appear with proper indentation when expanded
- [ ] Collapsed rows show summary/aggregated values

---

### PO-07: Portfolio Tree — Project Row Click
**Goal:** Verify clicking a project row opens a side panel with project summary.
**Persona:** Anna Meier (Controller)

1. Expand a LoB group and click a project row (e.g., "SAP S/4HANA Migration")
2. `preview_snapshot` — verify a side panel opens on the right
3. Verify the side panel shows project metadata: name, status, LoB, PM, timeline, budget summary
4. Verify EUR values in the panel use European formatting

**Verify:**
- [ ] Side panel opens on project row click
- [ ] Panel shows project name, status, and metadata
- [ ] EUR formatting correct in panel

---

### PO-08: Side Panel — "Open in Workbench" Link
**Goal:** Verify the cross-module navigation link from portfolio to workbench.
**Persona:** Anna Meier (Controller)

1. With a project side panel open, find the "Open in Workbench" link/button
2. Click it
3. `preview_snapshot` — verify navigation to `/workbench` with the correct project selected
4. Verify the side panel closes after navigation

**Verify:**
- [ ] "Open in Workbench" link present in side panel
- [ ] Clicking navigates to workbench with correct project
- [ ] Side panel closes

---

### PO-09: Forecast by LoB Chart
**Goal:** Verify the "Forecast by Line of Business" grouped bar chart.
**Persona:** Anna Meier (Controller)

1. Navigate back to `/portfolio` Dashboard
2. `preview_snapshot` — find the "Forecast by Line of Business" chart section
3. Verify it's a grouped bar chart with Forecast + Baseline bars per LoB
4. Verify the chart is CY-scoped (values should match FY 2026 context)
5. Verify legend is visible showing "Forecast" and "Baseline" labels

**Verify:**
- [ ] Grouped bar chart present
- [ ] Shows Forecast and Baseline bars per LoB
- [ ] Legend visible with labels
- [ ] CY-scoped data

---

### PO-10: Forecast Trajectory Chart
**Goal:** Verify the trajectory/line chart with TODAY marker.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — find the Forecast Trajectory chart
2. Verify it's a line chart showing cumulative trajectory over time
3. Verify a "TODAY" marker or label is visible at the March 2026 position
4. Verify historical data points are shown (actuals line) and future projections (forecast line)

**Verify:**
- [ ] Line chart renders
- [ ] "TODAY" marker visible at March 2026
- [ ] Historical actuals and future forecast lines distinguishable

---

### PO-11: RAG Distribution Donut
**Goal:** Verify the RAG status donut chart.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — find the RAG Distribution donut chart
2. Verify it shows Red, Amber, Green segments
3. Verify project counts are shown (in legend or center text)
4. Verify the total adds up to ~31-32 projects

**Verify:**
- [ ] Donut chart renders with R/A/G segments
- [ ] Project counts visible
- [ ] Total count reasonable (~31-32)

---

### PO-12: Dashboard — Role Variations
**Goal:** Verify Dashboard content adapts per role.
**Persona:** Cycle through roles

1. As Anna Meier — note Dashboard fully loaded with all sections
2. Switch to Thomas Brenner (CC Owner) — verify Dashboard tab visible, verify no Intake or Approvals tabs
3. Switch to Thomas Becker (Executive) — verify Dashboard only, no action-oriented tabs
4. Switch to Priya Sharma (PL) — verify Dashboard + Intake tabs visible

**Verify:**
- [ ] All roles can see the Dashboard tab
- [ ] Tab availability matches access matrix
- [ ] Data loads correctly for each role

---

### PO-13: EUR Formatting Consistency
**Goal:** Spot-check European number formatting across the Dashboard.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — examine KPI tile values
2. Verify dot as thousands separator (e.g., "21.300" not "21,300")
3. Verify comma as decimal separator (e.g., "1,5%" not "1.5%")
4. Verify EUR symbol usage (either prefix or suffix, note which for consistency)
5. Check the tree table values — same formatting rules apply
6. Check chart axis labels / tooltips if accessible

**Verify:**
- [ ] Dot for thousands separator
- [ ] Comma for decimal separator
- [ ] Consistent EUR symbol placement
- [ ] No raw unformatted numbers visible

---

# SUITE 3 — Portfolio: Intake & CR Approvals

**Session:** A | **Est. time:** 45 min | **Default persona:** Anna Meier (Controller)

---

### INT-01: Tab Visibility by Role
**Goal:** Verify tab availability matches access matrix.
**Persona:** Cycle through all 4

1. As Anna Meier — navigate to `/portfolio`, verify tabs: Dashboard, Intake (or similar), CR Approvals
2. Switch to Thomas Brenner — verify only Dashboard tab (no Intake, no Approvals)
3. Switch to Priya Sharma — verify Dashboard + Intake tabs (no Approvals)
4. Switch to Thomas Becker — verify Dashboard only
5. Switch back to Anna Meier

**Verify:**
- [ ] Controller: Dashboard + Intake + CR Approvals
- [ ] CC Owner: Dashboard only
- [ ] Project Lead: Dashboard + Intake
- [ ] Executive: Dashboard only

---

### INT-02: CR Approvals Tab Label
**Goal:** Verify the tab is labeled "CR Approvals" (not "Approvals").
**Persona:** Anna Meier (Controller)

1. Navigate to `/portfolio`
2. `preview_snapshot` — examine tab labels
3. Verify the approvals tab reads "CR Approvals"

**Verify:**
- [ ] Tab label says "CR Approvals"

---

### INT-03: Intake Queue — Table Content
**Goal:** Verify the Intake Queue shows pending project submissions.
**Persona:** Anna Meier (Controller)

1. Click the Intake tab
2. `preview_snapshot` — verify a table of pending submissions is displayed
3. Verify table columns include: project name, submitter, submission date, status badge
4. Verify at least one item is present (e.g., "Autonomous Braking Prototype" if in pending state)

**Verify:**
- [ ] Intake table loads with rows
- [ ] Columns show relevant submission data
- [ ] Status badges visible

---

### INT-04: Intake Item Detail — Side Panel
**Goal:** Verify clicking an intake item opens a detail side panel.
**Persona:** Anna Meier (Controller)

1. Click an intake item row in the table
2. `preview_snapshot` — verify side panel opens on the right
3. Verify panel shows project details: name, description, submitter, resource plan
4. Verify internal resources show hours + EUR format (e.g., "120h / EUR 14.400")

**Verify:**
- [ ] Side panel opens on row click
- [ ] Project details displayed
- [ ] Internal resources show hours + EUR dual format

---

### INT-05: Intake — Approve Action
**Goal:** Verify a Controller can approve a pending submission.
**Persona:** Anna Meier (Controller)

1. With an intake item selected, find the "Approve" action button
2. Click Approve
3. `preview_snapshot` — verify the item status changes or item is removed from the pending queue
4. `preview_network` — verify the API call succeeded (no 4xx/5xx)

**Verify:**
- [ ] Approve button visible for Controller
- [ ] Clicking Approve triggers API call
- [ ] Item status updates or item removed from queue
- [ ] No API errors

---

### INT-06: Intake — Send Back Action
**Goal:** Verify the Send Back workflow with feedback text.
**Persona:** Anna Meier (Controller)

1. Select a pending intake item
2. Find the "Send Back" (or "Request Changes") button
3. Click it — verify a textarea appears for feedback
4. Enter feedback text: "Please revise the resource estimates"
5. Submit the send-back action
6. `preview_snapshot` — verify the item status changes to "Changes Requested" with amber badge
7. Verify the item remains in the queue (not removed)

**Verify:**
- [ ] Send Back button visible
- [ ] Textarea appears for feedback
- [ ] Status changes to "Changes Requested"
- [ ] Item stays in queue with amber badge

---

### INT-07: Send Back — Resubmit Flow
**Goal:** Verify a Project Lead can resubmit after changes were requested.
**Persona:** Priya Sharma (Project Lead)

1. Switch to Priya Sharma
2. Navigate to Portfolio Overview, click Intake tab
3. `preview_snapshot` — find the item with "Changes Requested" status
4. Click the item to open its detail
5. Find the "Resubmit" (or "Resubmit for Approval") button
6. Click it
7. `preview_snapshot` — verify status returns to "Pending Approval"
8. Switch back to Anna Meier — verify the item appears in the intake queue as pending

**Verify:**
- [ ] PL sees the changes_requested item
- [ ] Resubmit button available
- [ ] Status returns to pending_approval
- [ ] Controller sees resubmitted item

---

### INT-08: CR Approvals Tab — Table Content
**Goal:** Verify the CR Approvals tab shows pending change requests.
**Persona:** Anna Meier (Controller)

1. Switch to Anna Meier
2. Navigate to Portfolio Overview, click "CR Approvals" tab
3. `preview_snapshot` — verify a table of pending CRs is displayed
4. Verify table columns include: project name, CR description/category, impact, date

**Verify:**
- [ ] CR Approvals table loads
- [ ] Rows show pending CRs
- [ ] Key columns visible (project, description, impact)

---

### INT-09: CR Impact Display — EUR Formatting
**Goal:** Verify CR impact values use compact EUR format.
**Persona:** Anna Meier (Controller)

1. In the CR Approvals table, examine the impact column values
2. `preview_snapshot` — verify values show compact EUR format (e.g., "+2K EUR", "+1,5K EUR")
3. Verify green color for savings (negative impact), red for cost increases

**Verify:**
- [ ] Impact values in compact EUR format
- [ ] Color coding: green for savings, red for increases
- [ ] European decimal notation (comma)

---

### INT-10: CR Detail Modal
**Goal:** Verify the CR detail modal with pinned header and scrollable body.
**Persona:** Anna Meier (Controller)

1. Click a CR row to open the detail modal
2. `preview_snapshot` — verify a modal or expanded panel opens
3. Verify the modal has a pinned/sticky header section (CR title, project name)
4. Verify the body is scrollable independently
5. Verify a DetailViewGrid shows current values, proposed values, and delta
6. Verify no content overflow or clipping issues

**Verify:**
- [ ] CR detail modal opens
- [ ] Header is pinned (stays visible on scroll)
- [ ] Body scrolls independently
- [ ] Current/proposed/delta columns visible
- [ ] No overflow issues

---

### INT-11: CR Approve Action
**Goal:** Verify approving a CR removes it from the queue.
**Persona:** Anna Meier (Controller)

1. Open a CR detail
2. Find and click the "Approve" button
3. `preview_snapshot` — verify the CR is removed from the approvals list
4. `preview_network` — verify API call succeeded

**Verify:**
- [ ] Approve button works
- [ ] CR removed from queue after approval
- [ ] No API errors

---

### INT-12: CR Reject Action
**Goal:** Verify rejecting a CR with feedback.
**Persona:** Anna Meier (Controller)

1. Select another pending CR
2. Find and click the "Reject" button
3. Verify a textarea appears for rejection reason
4. Enter reason and submit
5. `preview_snapshot` — verify the CR is processed (removed or status changed)

**Verify:**
- [ ] Reject button works
- [ ] Textarea for rejection reason
- [ ] CR processed after rejection

---

### INT-13: CR Category Badge Formatting
**Goal:** Verify CR category badges are human-readable (not snake_case).
**Persona:** Anna Meier (Controller)

1. In CR Approvals table or detail view, examine category badges
2. `preview_snapshot` — check for snake_case like "External_cost" vs "External Cost"
3. Note whether badges use human-readable labels

**Verify:**
- [ ] Category badges use human-readable text (or note if snake_case — known issue)

---

# SUITE 4 — Project Workbench

**Session:** B | **Est. time:** 60 min | **Default persona:** Priya Sharma (Project Lead)

---

### WB-01: Workbench Loads — Master-Detail Layout
**Goal:** Verify the workbench loads with project list and workspace panels.
**Persona:** Priya Sharma (Project Lead)

1. Navigate to `/workbench`
2. `preview_snapshot` — verify master-detail layout: left panel (project list) + right panel (workspace)
3. Verify the project list shows projects available to this role
4. Verify a project is auto-selected (first in list)

**Verify:**
- [ ] Master-detail layout renders
- [ ] Project list panel on left
- [ ] Workspace panel on right
- [ ] A project is auto-selected

---

### WB-02: Project List — Role Scoping
**Goal:** Verify project list is scoped per role.
**Persona:** Priya Sharma, then Anna Meier

1. As Priya Sharma, count projects in the list (PL sees own projects — should be ~5)
2. Switch to Anna Meier (Controller)
3. Navigate to `/workbench` — count projects (Controller sees all — should be ~32)
4. Verify the count difference is consistent with role-based access

**Verify:**
- [ ] PL sees limited project set
- [ ] Controller sees all projects
- [ ] Counts are reasonable

---

### WB-03: Project List — Panel Collapse
**Goal:** Verify the project list panel can be collapsed.
**Persona:** Anna Meier (Controller)

1. Find the collapse toggle button on the project list panel
2. Click it
3. `preview_snapshot` — verify the list panel collapses to a narrow strip
4. Click the toggle again to re-expand
5. `preview_snapshot` — verify list returns to normal width

**Verify:**
- [ ] Collapse toggle visible
- [ ] Panel collapses to narrow strip
- [ ] Panel re-expands on second click

---

### WB-04: Overview Tab — Project Metadata
**Goal:** Verify the Overview tab shows correct project metadata.
**Persona:** Anna Meier (Controller)

1. Select "ERP Integration Phase 2" from the project list
2. Verify Overview tab is active by default
3. `preview_snapshot` — verify MetadataBar shows: project name, status badge, LoB name, project manager, timeline dates
4. Verify LoB shows the resolved display name (e.g., "Truck & Bus Systems") NOT the raw ID ("lob-tbs")

**Verify:**
- [ ] Overview tab active by default
- [ ] Project name displayed
- [ ] Status badge visible
- [ ] LoB shows display name (not raw ID)
- [ ] PM name and timeline dates shown

---

### WB-05: Overview Tab — Timeline Chart
**Goal:** Verify the timeline/trajectory chart renders with TODAY marker.
**Persona:** Anna Meier (Controller)

1. On the Overview tab for an active project, find the timeline chart
2. `preview_snapshot` — verify chart renders (not blank)
3. Look for a "TODAY" label or vertical line marker at March 2026
4. Verify the actuals line stops at approximately Feb/Mar 2026
5. Verify the forecast line extends beyond March 2026

**Verify:**
- [ ] Chart renders
- [ ] "TODAY" marker visible at March 2026
- [ ] Actuals line stops at demo date boundary
- [ ] Forecast extends into future

---

### WB-06: Overview Tab — Timeline Summary Strip
**Goal:** Verify the "FY 2026" timeline summary strip.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — look for an "FY 2026" label with separator near the timeline area
2. Verify it provides fiscal year context for the displayed data

**Verify:**
- [ ] "FY 2026" label visible
- [ ] Separator line present

---

### WB-07: Overview Tab — Monthly Timeline Table
**Goal:** Verify the monthly timeline table with collapsible years.
**Persona:** Anna Meier (Controller)

1. Below the chart, find the monthly timeline table
2. `preview_snapshot` — verify rows for Baseline, Forecast, and Actuals
3. Verify year column headers are present with collapse/expand chevrons
4. Verify 2026 is expanded by default (context-sensitive: active project)
5. Verify other years (2024, 2025) are collapsed showing summary values
6. Click a collapsed year to expand — verify monthly columns appear
7. Click again to collapse — verify months hide and summary value shown

**Verify:**
- [ ] Monthly timeline table present below chart
- [ ] Baseline/Forecast/Actuals rows
- [ ] Collapsible year columns
- [ ] 2026 expanded by default for active projects
- [ ] Collapsed years show summary values

---

### WB-08: Overview Tab — Three-Point Estimates
**Goal:** Verify optimistic/most likely/pessimistic values display.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — find three-point comparison section on Overview tab
2. Verify it shows Baseline vs Current Forecast comparison (or optimistic/likely/pessimistic)
3. Verify the delta between Baseline and Current Forecast is visible

**Verify:**
- [ ] Three-point or baseline/forecast comparison visible
- [ ] Delta values shown
- [ ] EUR formatting correct

---

### WB-09: Overview Tab — Resource Summary
**Goal:** Verify the resource summary table shows team and costs.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — find the resource summary section
2. Verify it lists resources/roles with hours and EUR amounts
3. Verify internal resources show dual format (hours + EUR)

**Verify:**
- [ ] Resource summary table present
- [ ] Hours and EUR values shown
- [ ] Proper European formatting

---

### WB-10: Forecast & Planning Tab — Grid Loads
**Goal:** Verify the ForecastGrid renders with line items and monthly columns.
**Persona:** Anna Meier (Controller)

1. Click the "Forecast & Planning" tab
2. `preview_snapshot` — verify the ForecastGrid loads with rows and columns
3. Verify line item rows are visible (resource types, external cost categories)
4. Verify monthly columns are present with year grouping headers

**Verify:**
- [ ] Forecast & Planning tab loads
- [ ] ForecastGrid renders with line items
- [ ] Monthly columns visible
- [ ] Year grouping headers present

---

### WB-11: Forecast Grid — Auto-Sizing and Sticky Column
**Goal:** Verify the first column auto-sizes and stays fixed on horizontal scroll.
**Persona:** Anna Meier (Controller)

1. `preview_inspect` on the first column — verify it's not truncated (text readable)
2. If the grid is wider than viewport, scroll right
3. `preview_snapshot` — verify the first column (line item names) stays visible/fixed during scroll

**Verify:**
- [ ] First column text not truncated (auto-sized)
- [ ] First column stays fixed on horizontal scroll

---

### WB-12: Forecast Grid — Collapsible Years (Context-Sensitive)
**Goal:** Verify context-sensitive year expansion.
**Persona:** Anna Meier (Controller)

1. Select an **active** project (e.g., "ERP Integration Phase 2") — verify 2026 is expanded by default
2. Select a **completed** project (e.g., "Data Center Consolidation") — verify the final year of the project is expanded
3. Select a **future** project (e.g., "Connected Vehicle Platform", starts 2026-07) — verify the start year is expanded
4. For each: click a year header to toggle collapse/expand — verify it works

**Verify:**
- [ ] Active projects: 2026 expanded by default
- [ ] Completed projects: final year expanded
- [ ] Future projects: start year expanded
- [ ] Manual expand/collapse works

---

### WB-13: Forecast Grid — Column Totals
**Goal:** Verify column totals are displayed.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — examine the ForecastGrid for total/summary rows
2. Verify column totals are calculated (sum of line items per month)
3. Verify EUR formatting on totals

**Verify:**
- [ ] Column totals visible
- [ ] Totals correctly sum line items
- [ ] EUR formatting consistent

---

### WB-14: Forecast Grid — CapEx/OpEx Tags
**Goal:** Verify per-line-item CapEx/OpEx tags.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — examine line items in the forecast grid
2. Verify each line item has a CapEx or OpEx tag/badge
3. Note the casing used (CapEx vs CAPEX vs Capex)

**Verify:**
- [ ] CapEx/OpEx tags present on line items
- [ ] Tags are visible and readable

---

### WB-15: Change History Tab
**Goal:** Verify the Change History tab shows CR history.
**Persona:** Anna Meier (Controller)

1. Click the "Change History" tab
2. `preview_snapshot` — verify a list of CRs is displayed
3. Verify filter options for Category and Status
4. Click a CR to expand its detail
5. Verify the expanded detail shows a DetailViewGrid with field/old value/new value/delta
6. Verify CR impact value in EUR compact format

**Verify:**
- [ ] Change History tab loads with CR list
- [ ] Filters available (Category, Status)
- [ ] CR expand shows DetailViewGrid
- [ ] EUR formatting in detail view

---

### WB-16: Change History — CR Count
**Goal:** Verify the CR count matches expected seed data.
**Persona:** Anna Meier (Controller)

1. On Change History tab for a project with known CRs (e.g., "ERP Integration Phase 2")
2. Count the CRs listed
3. Verify the count is reasonable (project should have multiple CRs)

**Verify:**
- [ ] CR count is reasonable for the project
- [ ] All CR statuses represented (approved, rejected, pending)

---

### WB-17: "Rolling Forecast Review" Button
**Goal:** Verify the forecast review button is present and properly guarded.
**Persona:** Priya Sharma (Project Lead)

1. Switch to Priya Sharma
2. Navigate to `/workbench`, select a project
3. Go to Forecast & Planning tab
4. `preview_snapshot` — verify "Rolling Forecast Review" (or "Start Monthly Review") button is visible
5. Switch to Thomas Becker (Executive) — verify the button is hidden or disabled

**Verify:**
- [ ] Button visible for PL and Controller
- [ ] Button hidden/disabled for Executive
- [ ] Button label is correct

---

# SUITE 5 — Forecast Wizard

**Session:** B | **Est. time:** 40 min | **Default persona:** Priya Sharma (Project Lead)

**Prerequisite:** Demo data must be fresh (reset before this suite).

---

### FW-01: Start Forecast Wizard
**Goal:** Verify the wizard launches correctly from the Forecast & Planning tab.
**Persona:** Priya Sharma (Project Lead)

1. Navigate to `/workbench`, select "ERP Integration Phase 2"
2. Go to Forecast & Planning tab
3. Click the "Rolling Forecast Review" button (or similar label)
4. `preview_snapshot` — verify the wizard opens with Phase 1 (Retrospective) active
5. Verify a stepper/progress indicator shows 5 phases
6. Verify Phase 1 content loads (variance data, explanations)

**Verify:**
- [ ] Wizard opens on button click
- [ ] Phase 1 (Retrospective) displayed
- [ ] Stepper shows 5 phases
- [ ] Variance data loaded

---

### FW-02: Phase 1 — Variance Explanations with Employee Names
**Goal:** Verify Phase 1 shows variance explanations with named employees.
**Persona:** Priya Sharma (Project Lead)

1. In Phase 1, examine the variance explanation items
2. `preview_snapshot` — verify each line item includes an employee name (e.g., "Senior Developer -- Lena Fischer")
3. Verify variance values are displayed with EUR formatting
4. Verify text input areas for adding explanations

**Verify:**
- [ ] Employee names displayed in variance items
- [ ] EUR formatting on variance values
- [ ] Explanation text areas present

---

### FW-03: Phase 1 — Acknowledge and Proceed
**Goal:** Verify Phase 1 can be completed and advance to Phase 2.
**Persona:** Priya Sharma (Project Lead)

1. Fill in at least one variance explanation text
2. Click the "Next" or "Proceed" button to advance
3. `preview_snapshot` — verify Phase 2 (Suggestions) loads
4. Verify the stepper updates to show Phase 2 active

**Verify:**
- [ ] Can proceed from Phase 1 to Phase 2
- [ ] Phase 2 content loads
- [ ] Stepper updates

---

### FW-04: Phase 2 — AI Suggestions
**Goal:** Verify Phase 2 shows system-generated adjustment suggestions.
**Persona:** Priya Sharma (Project Lead)

1. In Phase 2, examine the suggestions list
2. `preview_snapshot` — verify suggestions are displayed with apply/dismiss actions
3. Verify each suggestion describes a proposed adjustment

**Verify:**
- [ ] Suggestions displayed
- [ ] Apply/dismiss actions available per suggestion

---

### FW-05: Phase 3 — Edit Forecast (BUG-4 Regression Check)
**Goal:** Verify Phase 3 loads without crashing (BUG-4 was duplicate key errors).
**Persona:** Priya Sharma (Project Lead)

1. Advance to Phase 3 (Edit Forecast)
2. `preview_snapshot` — verify the editable grid loads (NOT a blank/crashed page)
3. `preview_console_logs` — check for duplicate key errors or React crash messages
4. Verify line items are displayed with monthly values
5. Verify the grid is editable (cells accept input)

**Verify:**
- [ ] Phase 3 loads without crash
- [ ] No duplicate key console errors
- [ ] Editable grid with line items
- [ ] Monthly values displayed

---

### FW-06: Phase 4 — Review Summary
**Goal:** Verify Phase 4 shows a review summary of changes.
**Persona:** Priya Sharma (Project Lead)

1. Make at least one change in Phase 3, then advance to Phase 4
2. `preview_snapshot` — verify Phase 4 shows a summary of all changes
3. Verify before/after values are displayed
4. Verify cost center rollup or grouping of changes

**Verify:**
- [ ] Phase 4 loads with change summary
- [ ] Before/after values shown
- [ ] Changes grouped logically

---

### FW-07: Phase 5 — Confirmation
**Goal:** Verify Phase 5 confirms the forecast cycle submission.
**Persona:** Priya Sharma (Project Lead)

1. Advance to Phase 5
2. `preview_snapshot` — verify confirmation message and CR creation summary
3. Verify the wizard indicates completion

**Verify:**
- [ ] Phase 5 loads with confirmation
- [ ] CR creation confirmed
- [ ] Wizard indicates completion

---

### FW-08: Project Switch Guard
**Goal:** Verify switching projects during the wizard resets wizard state.
**Persona:** Priya Sharma (Project Lead)

1. Start the forecast wizard on one project (get to Phase 2 or later)
2. Click a different project in the project list panel
3. `preview_snapshot` — verify the wizard resets to read mode (Forecast & Planning tab without wizard)
4. Verify no stale state from the previous project's wizard

**Verify:**
- [ ] Switching projects exits the wizard
- [ ] No stale wizard state carries over
- [ ] Forecast & Planning tab shows normal grid view

---

### FW-09: Cancel/Back in Wizard
**Goal:** Verify Cancel or Back buttons return to read mode.
**Persona:** Priya Sharma (Project Lead)

1. Start the forecast wizard
2. Advance to Phase 2
3. Click "Back" — verify return to Phase 1
4. Click "Cancel" (or close the wizard)
5. `preview_snapshot` — verify return to the normal Forecast & Planning tab view

**Verify:**
- [ ] Back button navigates to previous phase
- [ ] Cancel exits wizard entirely
- [ ] Normal tab view restored after cancel

---

### FW-10: Wizard Role Gate
**Goal:** Verify read-only roles cannot start the wizard.
**Persona:** Thomas Becker (Executive)

1. Switch to Thomas Becker (Executive)
2. Navigate to `/workbench`, select a project
3. Go to Forecast & Planning tab
4. `preview_snapshot` — verify the "Rolling Forecast Review" button is not visible or is disabled

**Verify:**
- [ ] Wizard button hidden/disabled for Executive
- [ ] No way to trigger the wizard as read-only user

---

# SUITE 6 — Capacity Management

**Session:** B | **Est. time:** 45 min | **Default persona:** Thomas Brenner (CC Owner)

---

### CAP-01: Role Gate — Project Lead Blocked
**Goal:** Verify Project Leads cannot access Capacity Management.
**Persona:** Priya Sharma (Project Lead)

1. Switch to Priya Sharma
2. Navigate to `/capacity`
3. `preview_snapshot` — verify an access-restricted message or redirect (no capacity data shown)

**Verify:**
- [ ] PL cannot access Capacity Management
- [ ] Access-restricted message displayed (or module not in navigation)

---

### CAP-02: My Team Tab — Default View
**Goal:** Verify the My Team tab loads as default with heatmap.
**Persona:** Thomas Brenner (CC Owner)

1. Switch to Thomas Brenner
2. Navigate to `/capacity`
3. `preview_snapshot` — verify "My Team" tab is active by default
4. Verify the team heatmap grid renders (person rows x month columns)
5. Verify a summary bar/strip above the heatmap shows team KPIs (utilization %, headcount, etc.)

**Verify:**
- [ ] My Team tab active by default
- [ ] Heatmap grid renders with person rows and month columns
- [ ] Summary bar with team KPIs visible

---

### CAP-03: Controller — CC Selector
**Goal:** Verify Controller gets a cost center dropdown to select different teams.
**Persona:** Anna Meier (Controller)

1. Switch to Anna Meier
2. Navigate to `/capacity`
3. `preview_snapshot` — verify a "Select Cost Center" dropdown appears
4. Open the dropdown — verify multiple cost centers are listed
5. Select a different cost center
6. `preview_snapshot` — verify the heatmap data refreshes for the selected CC

**Verify:**
- [ ] CC selector dropdown visible for Controller
- [ ] Multiple cost centers listed
- [ ] Switching CC refreshes heatmap data

---

### CAP-04: Heatmap — First Column Auto-Sizing
**Goal:** Verify the first column (person names) auto-sizes without truncation.
**Persona:** Thomas Brenner (CC Owner)

1. `preview_snapshot` — examine the heatmap first column
2. Verify person names are fully visible (not truncated with ellipsis)
3. `preview_inspect` on the first column header — check width is appropriate

**Verify:**
- [ ] Person names fully visible
- [ ] No truncation on the first column

---

### CAP-05: Heatmap — Utilization Values
**Goal:** Verify heatmap cells show utilization data.
**Persona:** Thomas Brenner (CC Owner)

1. `preview_snapshot` — examine heatmap cell contents
2. Verify cells show utilization values (hours, percentages, or both)
3. Verify the format includes location-specific standard hours context

**Verify:**
- [ ] Cells show utilization data
- [ ] Values are formatted (not raw numbers)

---

### CAP-06: Heatmap — Color Coding
**Goal:** Verify color coding indicates utilization levels.
**Persona:** Thomas Brenner (CC Owner)

1. `preview_inspect` on several heatmap cells — check background-color CSS
2. Verify color variation exists (different colors for different utilization levels)
3. Expected: green for normal (~70-90%), amber for high (>90%), red for over-allocated (>100%)

**Verify:**
- [ ] Color coding present
- [ ] Variation between low/normal/high utilization (or note if missing — known issue)

---

### CAP-07: Heatmap Cell Drill-Down
**Goal:** Verify clicking a heatmap cell opens a bottom drawer with detail.
**Persona:** Thomas Brenner (CC Owner)

1. Click a heatmap cell
2. `preview_snapshot` — verify a bottom drawer opens
3. Verify the drawer shows: Allocated hours, Available hours, Delta (surplus/deficit)
4. Verify color coding on the delta (green for available, red for over-allocated)
5. Verify person-level detail is visible (names, per-person hours)

**Verify:**
- [ ] Bottom drawer opens on cell click
- [ ] Allocated/Available/Delta hours shown
- [ ] Color coding on delta values
- [ ] Person-level detail visible

---

### CAP-08: Drill-Down — Project Links
**Goal:** Verify project names in the drill-down drawer link to Workbench.
**Persona:** Thomas Brenner (CC Owner)

1. In the drill-down drawer, find project names
2. Verify they appear as clickable links
3. Click a project link
4. `preview_snapshot` — verify navigation to `/workbench` with the correct project selected

**Verify:**
- [ ] Project names are clickable
- [ ] Clicking navigates to Workbench with correct project

---

### CAP-09: Organization Overview Tab
**Goal:** Verify the Org Overview tab with collapsible year columns.
**Persona:** Thomas Brenner (CC Owner)

1. Click the "Organization Overview" tab
2. `preview_snapshot` — verify an organization-level heatmap loads
3. Verify a pivot selector dropdown is present (Cost Center / Role / LoB)
4. Verify year column headers with expand/collapse functionality
5. Verify 2026 is expanded, earlier years collapsed
6. Click a collapsed year — verify months expand
7. Verify collapsed year shows a per-year utilization summary percentage

**Verify:**
- [ ] Org Overview tab loads
- [ ] Pivot selector present (3 views)
- [ ] Collapsible year columns work
- [ ] 2026 expanded by default
- [ ] Collapsed years show summary percentage

---

### CAP-10: Org Overview — Pivot Views
**Goal:** Verify all 3 pivot views render correctly.
**Persona:** Thomas Brenner (CC Owner)

1. Verify default pivot is "Cost Center"
2. Switch pivot to "Role" — `preview_snapshot` — verify rows change to role types
3. Switch pivot to "LoB" (or "Line of Business") — `preview_snapshot` — verify rows change to LoBs
4. Switch back to "Cost Center"

**Verify:**
- [ ] All 3 pivot views selectable
- [ ] Each view shows appropriate dimension rows
- [ ] Data loads for each view

---

### CAP-11: Resource Requests Button
**Goal:** Verify the resource requests navigation is available.
**Persona:** Thomas Brenner (CC Owner)

1. On My Team tab, find the "Resource Requests" button (or link)
2. Verify it shows a count of pending requests (if any)
3. Click it
4. `preview_snapshot` — verify navigation to the resource requests page

**Verify:**
- [ ] Resource Requests button visible
- [ ] Pending count shown (if applicable)
- [ ] Clicking navigates to requests page

---

### CAP-12: Resource Requests — List and Detail
**Goal:** Verify the resource request management page.
**Persona:** Thomas Brenner (CC Owner)

1. On the resource requests page (`/capacity/requests`)
2. `preview_snapshot` — verify a request list panel on the left
3. Verify a request is auto-selected (first pending)
4. Verify the detail panel shows: request metadata, requesting project, required skills
5. Verify an assignment preview section shows utilization impact

**Verify:**
- [ ] Request list loads
- [ ] Request detail shows metadata and project link
- [ ] Assignment preview visible

---

### CAP-13: Resource Request — Actions
**Goal:** Verify request management actions work.
**Persona:** Thomas Brenner (CC Owner)

1. Select a pending request
2. Verify action buttons are visible: Approve/Assign, Decline, Counter-Propose (or similar)
3. Click an action (e.g., Confirm)
4. `preview_snapshot` — verify the request status updates
5. `preview_network` — verify no API errors

**Verify:**
- [ ] Action buttons visible
- [ ] Clicking an action updates the request status
- [ ] No API errors

---

### CAP-14: Executive Read-Only Access
**Goal:** Verify Executive can view capacity data but not manage requests.
**Persona:** Thomas Becker (Executive)

1. Switch to Thomas Becker
2. Navigate to `/capacity`
3. `preview_snapshot` — verify capacity data is visible (heatmap loads)
4. Verify the "Resource Requests" button is hidden or navigating to requests shows read-only view

**Verify:**
- [ ] Executive can view capacity data
- [ ] No request management actions available

---

# SUITE 7 — What-If Simulator

**Session:** C | **Est. time:** 55 min | **Default persona:** Anna Meier (Controller)

---

### SIM-01: Role Gate
**Goal:** Verify only Controller and Executive can access the Simulator.
**Persona:** Priya Sharma, Thomas Brenner

1. Switch to Priya Sharma — navigate to `/simulator`
2. `preview_snapshot` — verify "Access Restricted" message or redirect
3. Switch to Thomas Brenner — navigate to `/simulator`
4. `preview_snapshot` — verify access restricted for CC Owner
5. Switch to Anna Meier — navigate to `/simulator`
6. `preview_snapshot` — verify full Simulator loads

**Verify:**
- [ ] PL: access denied
- [ ] CC Owner: access denied
- [ ] Controller: full access
- [ ] Executive: should have read-only access (test in SIM-16)

---

### SIM-02: Scenario Manager — List View
**Goal:** Verify the scenario list loads with existing scenarios.
**Persona:** Anna Meier (Controller)

1. On `/simulator`, verify the Scenario Manager view loads
2. `preview_snapshot` — verify two sections: "My Scenarios" and "Published Scenarios"
3. Verify pre-built scenarios are listed with columns: name, author, headline impact, actions count
4. Verify at least 2-3 pre-built scenarios exist

**Verify:**
- [ ] Scenario Manager loads
- [ ] My Scenarios and Published Scenarios sections
- [ ] Pre-built scenarios listed
- [ ] Headline impact values shown for pre-built scenarios

---

### SIM-03: Create New Scenario
**Goal:** Verify creating a new scenario.
**Persona:** Anna Meier (Controller)

1. Click "Create Scenario" button
2. `preview_snapshot` — verify a dialog/modal appears
3. Enter name: "Test Scenario" and description: "Testing scenario creation"
4. Optionally select "Clone From" an existing scenario
5. Click Create
6. `preview_snapshot` — verify the new scenario appears in "My Scenarios"
7. `preview_network` — verify no API errors

**Verify:**
- [ ] Create dialog opens
- [ ] Can enter name and description
- [ ] Clone-from option available
- [ ] New scenario appears in list after creation

---

### SIM-04: Open Scenario Workspace
**Goal:** Verify the scenario workspace loads with all sections.
**Persona:** Anna Meier (Controller)

1. Click on a pre-built scenario to open it
2. `preview_snapshot` — verify workspace loads with:
   - Left panel: Action panel (scenario metadata, applied actions, add action form)
   - Center: Impact dashboard (KPI strip, portfolio tree)
3. Verify a "Back" button is visible to return to the scenario manager

**Verify:**
- [ ] Workspace loads with action panel and impact dashboard
- [ ] KPI comparison strip visible
- [ ] Portfolio tree visible
- [ ] Back button present

---

### SIM-05: KPI Comparison Strip
**Goal:** Verify the KPI strip shows baseline vs scenario comparison.
**Persona:** Anna Meier (Controller)

1. In the workspace, examine the KPI comparison strip
2. `preview_snapshot` — verify it shows Current FC, Scenario FC, and Delta values
3. Verify EUR formatting on all values

**Verify:**
- [ ] Current FC value shown
- [ ] Scenario FC value shown
- [ ] Delta value shown (positive or negative)
- [ ] EUR formatting correct

---

### SIM-06: Time Frame Breakdown
**Goal:** Verify per-year impact segments (CY + yearly + Overall).
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — find the time frame breakdown section
2. Verify segments for: CY (2026), 2027, 2028, 2029 (or similar), and Overall
3. Verify each segment shows FC, Scenario, and Delta values

**Verify:**
- [ ] Time frame breakdown visible
- [ ] CY and individual year segments present
- [ ] Overall segment present
- [ ] Each segment shows FC/Scenario/Delta

---

### SIM-07: Add Project-Level Action
**Goal:** Verify adding a project-level action type.
**Persona:** Anna Meier (Controller)

1. In the action panel, find the "Add Action" form
2. Select action type: "Delay Project"
3. Select a target project from the dropdown
4. Fill in parameters (e.g., delay months: 3)
5. Click "Apply"
6. `preview_snapshot` — verify the action appears in the applied actions list
7. Verify the KPI strip and portfolio tree update to reflect the impact

**Verify:**
- [ ] Action form shows project-level types
- [ ] Can select target project
- [ ] Action applies successfully
- [ ] KPIs update after applying
- [ ] Action listed in applied actions

---

### SIM-08: Add Portfolio-Level Action
**Goal:** Verify adding a portfolio-level action type.
**Persona:** Anna Meier (Controller)

1. In the action form, select action type: "Across-the-Board Cut"
2. Fill in parameters (e.g., cut percentage: 10%)
3. Click "Apply"
4. `preview_snapshot` — verify the action appears in the list
5. Verify KPIs show the impact of the cut

**Verify:**
- [ ] Portfolio-level action types available
- [ ] Can apply across-the-board cut
- [ ] Impact reflected in KPIs

---

### SIM-09: Year Selector for Actions
**Goal:** Verify multi-select year checkboxes for percentage-based actions.
**Persona:** Anna Meier (Controller)

1. Create a new scenario (or use existing)
2. Select a percentage-based action type (e.g., "Adjust Budget (%)" or "Across-the-Board Cut")
3. `preview_snapshot` — look for year selector checkboxes (2025-2030)
4. Verify checkboxes are multi-select
5. Select specific years (e.g., 2026, 2027)
6. Apply the action
7. Verify the impact is scoped to selected years

**Verify:**
- [ ] Year selector checkboxes visible for percentage actions
- [ ] Multi-select works
- [ ] Years range 2025-2030

---

### SIM-10: Remove Action
**Goal:** Verify removing an action reverts its impact.
**Persona:** Anna Meier (Controller)

1. With actions applied, note the current KPI values
2. Click the remove button (X) on an action in the list
3. `preview_snapshot` — verify the action is removed from the list
4. Verify KPI values revert (delta decreases)

**Verify:**
- [ ] Action removed from list
- [ ] KPIs update to reflect removal
- [ ] No errors

---

### SIM-11: Impact Narrative
**Goal:** Verify the AI-generated impact narrative updates.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — find the impact narrative section
2. Verify it contains text summarizing what changed and affected project count
3. Apply or remove an action
4. `preview_snapshot` — verify the narrative text updates

**Verify:**
- [ ] Impact narrative visible
- [ ] Text describes changes and affected project count
- [ ] Narrative updates after action changes

---

### SIM-12: Portfolio Impact Tree
**Goal:** Verify the scenario portfolio tree shows project-level impacts.
**Persona:** Anna Meier (Controller)

1. With actions applied, examine the portfolio tree in the workspace
2. `preview_snapshot` — verify project rows show budget impact highlighting
3. Click a project row
4. `preview_snapshot` — verify a drill-down drawer opens with project-specific impact detail

**Verify:**
- [ ] Portfolio tree shows impact per project
- [ ] Click opens drill-down drawer
- [ ] Drill-down shows detailed impact

---

### SIM-13: Scenario Comparison View
**Goal:** Verify comparing multiple scenarios side-by-side.
**Persona:** Anna Meier (Controller)

1. Return to Scenario Manager (click Back)
2. Find and click the "Compare Scenarios" button
3. `preview_snapshot` — verify a scenario selector appears
4. Select 2-3 scenarios for comparison
5. Confirm comparison
6. `preview_snapshot` — verify side-by-side comparison with:
   - Column summary cards per scenario (budget, delta, RAG counts)
   - Comparison table with per-project rows

**Verify:**
- [ ] Comparison view loads
- [ ] Multiple scenarios displayed side-by-side
- [ ] Budget deltas and RAG changes shown per scenario
- [ ] Per-project comparison rows

---

### SIM-14: AI Advisor Panel
**Goal:** Verify the AI Advisor panel functionality.
**Persona:** Anna Meier (Controller)

1. Open a scenario workspace
2. Click the "AI Advisor" toggle button
3. `preview_snapshot` — verify the AI Advisor panel appears (right side)
4. Verify it shows suggested optimization paths/recommendations
5. Verify "Apply" buttons are available on suggestions

**Verify:**
- [ ] AI Advisor panel opens
- [ ] Suggestions/recommendations displayed
- [ ] Apply buttons available

---

### SIM-15: Publish/Unpublish Scenario
**Goal:** Verify scenario publishing workflow.
**Persona:** Anna Meier (Controller)

1. In Scenario Manager, find a user-created scenario
2. Click "Publish" action
3. `preview_snapshot` — verify the scenario moves to "Published Scenarios" section
4. Click "Unpublish"
5. `preview_snapshot` — verify it returns to "My Scenarios"

**Verify:**
- [ ] Publish action works
- [ ] Scenario appears in Published section
- [ ] Unpublish returns it to My Scenarios

---

### SIM-16: Executive Read-Only
**Goal:** Verify Executive can view but not modify scenarios.
**Persona:** Thomas Becker (Executive)

1. Switch to Thomas Becker
2. Navigate to `/simulator`
3. `preview_snapshot` — verify the Simulator loads (not access denied)
4. Verify "Create Scenario" button is hidden or disabled
5. Open a published scenario
6. Verify action controls are hidden/disabled (cannot add/remove actions)

**Verify:**
- [ ] Executive can access Simulator
- [ ] Cannot create scenarios
- [ ] Cannot modify actions (view only)

---

# SUITE 8 — Reporting

**Session:** C | **Est. time:** 50 min | **Default persona:** Anna Meier (Controller)

---

### RPT-01: Report Library
**Goal:** Verify the report library shows all 5 reports.
**Persona:** Anna Meier (Controller)

1. Navigate to `/reporting`
2. `preview_snapshot` — verify 5 report cards in a grid:
   - Programme / Multi-Project Rollup
   - Cost Center Financial Summary
   - Vendor Spend Analysis
   - Forecast Accuracy
   - Year-over-Year Comparison
3. Verify a "My Saved Views" section exists (may be empty)

**Verify:**
- [ ] 5 report cards displayed
- [ ] Report names match expected list
- [ ] Saved Views section present

---

### RPT-02: Saved Views — CRUD
**Goal:** Verify saved views can be created, loaded, and deleted.
**Persona:** Anna Meier (Controller)

1. Open any report (e.g., Programme Rollup)
2. Configure some filters
3. Click "Save View"
4. `preview_snapshot` — verify a save dialog appears, enter a name
5. Save the view
6. Return to Report Library
7. `preview_snapshot` — verify the saved view appears in "My Saved Views"
8. Click the saved view — verify it loads the report with saved filters
9. Delete the saved view (if delete action is available)
10. `preview_snapshot` — verify it's removed

**Verify:**
- [ ] Save View dialog works
- [ ] Saved view appears in library
- [ ] Loading a saved view restores filters
- [ ] Delete works (if available)

---

### RPT-03: Programme Rollup — Basic View
**Goal:** Verify the Programme Rollup report loads with data.
**Persona:** Anna Meier (Controller)

1. Open "Programme / Multi-Project Rollup" report
2. `preview_snapshot` — verify the report content loads
3. Verify a data table with columns: project names, baseline, forecast, actuals, variance
4. Verify a year selector dropdown (FY 2021-2029 + All Years/Lifetime)
5. Select FY 2026 — verify data scopes to 2026
6. Select "All Years" / Lifetime — verify data shows full project lifetimes (larger values)

**Verify:**
- [ ] Report loads with data table
- [ ] Year selector present
- [ ] FY 2026 vs Lifetime shows different values
- [ ] EUR formatting correct

---

### RPT-04: Programme Rollup — Custom Project Groupings
**Goal:** Verify custom project grouping feature.
**Persona:** Anna Meier (Controller)

1. In Programme Rollup, find the "Custom Group" toggle or button
2. Activate it
3. `preview_snapshot` — verify a project multi-select interface appears
4. Select 3-4 specific projects
5. Verify the report table filters to show only selected projects
6. Click "Save Group" — enter a name
7. Verify the group is saved
8. Deselect projects, then "Load Group" — verify saved group restores selections
9. Delete the saved group

**Verify:**
- [ ] Custom group toggle/button works
- [ ] Multi-select for projects with search
- [ ] Report filters to selected projects
- [ ] Save/load/delete groups work

---

### RPT-05: Cost Center Financial Summary
**Goal:** Verify the CC Financial Summary report.
**Persona:** Anna Meier (Controller)

1. Navigate back to Report Library, open "Cost Center Financial Summary"
2. `preview_snapshot` — verify the report loads
3. Verify "Cost Center" is the **first column** in the table (not buried in the middle)
4. Verify per-CC rows with financial breakdowns
5. Verify EUR formatting (European: dot thousands, comma decimals)

**Verify:**
- [ ] Report loads with data
- [ ] Cost Center is the first column
- [ ] Per-CC rows with financial data
- [ ] EUR formatting correct

---

### RPT-06: Vendor Spend Analysis
**Goal:** Verify the Vendor Spend report with expense cost type filter.
**Persona:** Anna Meier (Controller)

1. Open "Vendor Spend Analysis" report
2. `preview_snapshot` — verify report loads with vendor rows
3. Verify an "Expense Cost Type" column is present in the table
4. Find the "Expense Cost Type" filter in the filter bar
5. Select a specific cost type (e.g., "Consulting")
6. `preview_snapshot` — verify the table filters to show only that cost type
7. Clear the filter

**Verify:**
- [ ] Report loads with vendor data
- [ ] Expense Cost Type column present
- [ ] Filter dropdown for Expense Cost Type works
- [ ] Filtering updates the table

---

### RPT-07: Vendor Spend — Drill-Down
**Goal:** Verify drilling down into a vendor's line items.
**Persona:** Anna Meier (Controller)

1. In Vendor Spend report, click a vendor row to drill down
2. `preview_snapshot` — verify line item detail loads
3. Verify individual line items with amounts, dates, project associations

**Verify:**
- [ ] Vendor drill-down works
- [ ] Line item details displayed

---

### RPT-08: Forecast Accuracy Report
**Goal:** Verify the Forecast Accuracy report loads.
**Persona:** Anna Meier (Controller)

1. Open "Forecast Accuracy" report
2. `preview_snapshot` — verify the report structure loads (may show limited data — known issue)
3. Verify filter options: horizon selector, fiscal year
4. Try different horizon values (e.g., 3-month, 6-month, 12-month)
5. `preview_snapshot` — note whether data populates or remains empty (document in bug report if empty)

**Verify:**
- [ ] Report loads without errors
- [ ] Horizon and fiscal year filters present
- [ ] Data populates (or note as known issue if empty)

---

### RPT-09: Year-over-Year Comparison — Basic View
**Goal:** Verify the YoY report with LoB and Project columns.
**Persona:** Anna Meier (Controller)

1. Open "Year-over-Year Comparison" report
2. `preview_snapshot` — verify the report loads
3. Verify the table includes: **LoB column** and **Project column**
4. Verify dual-year data is shown (e.g., FY 2025 vs FY 2026)
5. Verify delta/variance column between years

**Verify:**
- [ ] Report loads
- [ ] LoB column present
- [ ] Project column present
- [ ] Dual-year comparison with deltas

---

### RPT-10: YoY — Monthly Toggle
**Goal:** Verify the month column toggle feature.
**Persona:** Anna Meier (Controller)

1. In YoY report, find the "Show Monthly Detail" toggle (or similar)
2. Click it
3. `preview_snapshot` — verify the table expands to show monthly rows/columns
4. Verify month filter checkboxes appear (Jan-Dec)
5. Verify per-project-per-month rows are visible
6. Toggle back to annual mode
7. `preview_snapshot` — verify monthly detail collapses

**Verify:**
- [ ] Monthly toggle works
- [ ] Monthly columns/rows appear
- [ ] Month filter checkboxes present
- [ ] Can toggle back to annual view

---

### RPT-11: Report Configurator — Column Toggle
**Goal:** Verify column visibility can be toggled in reports.
**Persona:** Anna Meier (Controller)

1. Open any report (e.g., Programme Rollup)
2. Find the column configurator/toggle control
3. Hide a column
4. `preview_snapshot` — verify the column disappears from the table
5. Show it again — verify it reappears

**Verify:**
- [ ] Column toggle control available
- [ ] Hiding a column removes it from table
- [ ] Showing it restores it

---

### RPT-12: Dynamic Hierarchy Labels
**Goal:** Verify filter labels use the active hierarchy's naming.
**Persona:** Anna Meier (Controller)

1. In any report, examine filter dropdown labels
2. `preview_snapshot` — verify labels reference the active hierarchy name (e.g., "Line of Business" or custom hierarchy name)
3. Check chart titles for hierarchy references

**Verify:**
- [ ] Filter labels use hierarchy-aware naming
- [ ] Chart titles reference hierarchy if applicable

---

### RPT-13: Report — EUR Formatting
**Goal:** Spot-check EUR formatting across all reports.
**Persona:** Anna Meier (Controller)

1. Open Programme Rollup — check table values for EUR formatting
2. Open CC Financial — check values
3. Open Vendor Spend — check values
4. Note whether EUR symbol is prefix (EUR 1.234) or suffix (1.234 EUR) — check for consistency

**Verify:**
- [ ] European formatting in all report tables (dot thousands, comma decimals)
- [ ] Consistent EUR symbol placement (or note inconsistency)

---

# SUITE 9 — Administration

**Session:** D | **Est. time:** 55 min | **Default persona:** Anna Meier (Controller)

---

### ADM-01: Role Gate
**Goal:** Verify only Controllers can access Administration.
**Persona:** Thomas Brenner, Priya Sharma, Thomas Becker

1. Switch to Thomas Brenner — navigate to `/admin`
2. `preview_snapshot` — verify "Access Restricted" message
3. Switch to Priya Sharma — navigate to `/admin`
4. `preview_snapshot` — verify access restricted
5. Switch to Thomas Becker — navigate to `/admin`
6. `preview_snapshot` — verify access restricted
7. Switch to Anna Meier — navigate to `/admin`
8. `preview_snapshot` — verify Administration loads

**Verify:**
- [ ] CC Owner: access denied
- [ ] PL: access denied
- [ ] Executive: access denied
- [ ] Controller: full access

---

### ADM-02: Admin Landing — Summary Cards
**Goal:** Verify the summary cards show correct entity counts.
**Persona:** Anna Meier (Controller)

1. On `/admin`, verify 5 summary cards at the top
2. `preview_snapshot` — verify cards for: Cost Centers, Active People, Lines of Business, Locations, Competence Centers
3. Note the counts displayed (e.g., ~10 CCs, ~52 people, 4 LoBs, etc.)

**Verify:**
- [ ] 5 summary cards visible
- [ ] Counts are reasonable and non-zero
- [ ] Card labels are correct

---

### ADM-03: Entity Selector Sidebar
**Goal:** Verify the left sidebar with entity panel navigation.
**Persona:** Anna Meier (Controller)

1. `preview_snapshot` — verify a left sidebar/selector with 3 sections:
   - **Entities:** Cost Centers, Competence Centers, Lines of Business, Locations, People, Rate Tables
   - **Portfolio Structure:** Portfolio Hierarchy
   - **System:** Planning Parameters, Audit Log
2. Click each panel name — verify the right-side content updates

**Verify:**
- [ ] 3 sections in entity selector
- [ ] 9 total panels listed
- [ ] Clicking each loads corresponding content

---

### ADM-04: Cost Centers Panel — View and Edit
**Goal:** Verify Cost Centers CRUD operations.
**Persona:** Anna Meier (Controller)

1. Select "Cost Centers" in the sidebar
2. `preview_snapshot` — verify a table of cost centers with columns: Name, Code, Manager, Status
3. Click "Edit" on a cost center
4. `preview_snapshot` — verify edit form opens
5. Verify the **Code field is read-only** (cannot be changed)
6. Verify Name and Location fields are editable
7. Make a change and save
8. `preview_snapshot` — verify the update is reflected in the table

**Verify:**
- [ ] Cost center table loads
- [ ] Edit form opens
- [ ] Code field is read-only
- [ ] Name/Location are editable
- [ ] Save updates the table

---

### ADM-05: Competence Centers — Employee Assignment
**Goal:** Verify viewing and managing employees in a competence center.
**Persona:** Anna Meier (Controller)

1. Select "Competence Centers" in the sidebar
2. `preview_snapshot` — verify competence center table
3. Expand or click a competence center row to see its detail
4. `preview_snapshot` — verify a list of assigned employees is shown
5. Find an "Add Employee" button/dialog
6. Click it — verify a searchable employee dropdown appears
7. Verify a reassignment warning is shown if the employee is already in another CC

**Verify:**
- [ ] CC table loads
- [ ] Expanding shows assigned employees
- [ ] Add Employee dialog with searchable dropdown
- [ ] Reassignment warning present

---

### ADM-06: Competence Centers — Remove Employee
**Goal:** Verify removing an employee from a competence center.
**Persona:** Anna Meier (Controller)

1. In a competence center's employee list, find a remove action
2. Click it
3. `preview_snapshot` — verify the employee is removed from the list
4. `preview_network` — verify no API errors

**Verify:**
- [ ] Remove action available
- [ ] Employee removed from list
- [ ] No API errors

---

### ADM-07: Lines of Business — Project Assignment
**Goal:** Verify LoB panel with project listing and assignment.
**Persona:** Anna Meier (Controller)

1. Select "Lines of Business" in the sidebar
2. `preview_snapshot` — verify LoB table
3. Expand or click a LoB row to see its detail
4. Verify assigned projects are listed with status badges and budgets
5. Find an "Assign Project" dialog
6. Open it — verify project dropdown with reassignment warning

**Verify:**
- [ ] LoB table loads
- [ ] Expanding shows assigned projects
- [ ] Status badges and budgets visible
- [ ] Assign Project dialog available

---

### ADM-08: Locations Panel
**Goal:** Verify the Locations panel displays correctly.
**Persona:** Anna Meier (Controller)

1. Select "Locations" in the sidebar
2. `preview_snapshot` — verify locations table with Name, Code, Status columns
3. Verify locations include Munich, Budapest, Pune (from seed data)

**Verify:**
- [ ] Locations table loads
- [ ] Expected locations present

---

### ADM-09: People Panel
**Goal:** Verify People panel with CC dropdown.
**Persona:** Anna Meier (Controller)

1. Select "People" in the sidebar
2. `preview_snapshot` — verify people table with columns: Name, Email, Role, Cost Center, Status
3. Click "Edit" on a person
4. Verify the edit form includes a "Cost Center" dropdown
5. Verify the dropdown lists available cost centers

**Verify:**
- [ ] People table loads
- [ ] Cost Center column visible
- [ ] Edit form has CC dropdown
- [ ] Dropdown populated with cost centers

---

### ADM-10: Rate Tables Panel
**Goal:** Verify Rate Tables display with effective dates.
**Persona:** Anna Meier (Controller)

1. Select "Rate Tables" in the sidebar
2. `preview_snapshot` — verify rate table data loads
3. Verify entries show rates with effective dates
4. Verify EUR formatting on rate values

**Verify:**
- [ ] Rate table loads
- [ ] Effective dates visible
- [ ] EUR formatting correct

---

### ADM-11: Planning Parameters — Standard Hours
**Goal:** Verify planning parameters including location-aware standard hours.
**Persona:** Anna Meier (Controller)

1. Select "Planning Parameters" in the sidebar
2. `preview_snapshot` — verify parameters are displayed
3. Look for standard hours configuration
4. Verify location-specific values: Munich 160h, Budapest 168h, Pune 176h
5. Verify global default is visible (160h)

**Verify:**
- [ ] Planning parameters load
- [ ] Standard hours visible
- [ ] Location-specific overrides shown (160h, 168h, 176h)

---

### ADM-12: Audit Log
**Goal:** Verify the Audit Log shows change history.
**Persona:** Anna Meier (Controller)

1. Select "Audit Log" in the sidebar
2. `preview_snapshot` — verify log entries are displayed
3. Verify entries show: timestamp, user, action type, entity affected
4. Verify search/filter capability (if available)

**Verify:**
- [ ] Audit log loads with entries
- [ ] Entries show timestamp, user, action, entity
- [ ] Searchable/filterable

---

### ADM-13: Portfolio Hierarchy — 4 Tabs
**Goal:** Verify the Portfolio Hierarchy panel with its 4 tabs.
**Persona:** Anna Meier (Controller)

1. Select "Portfolio Hierarchy" in the sidebar
2. `preview_snapshot` — verify 4 tabs: Hierarchies, Entity Types, Entities, Hierarchy Assignment
3. Click "Hierarchies" tab — verify at least "LoB Structure" is listed and marked as active
4. Verify the active hierarchy shows its levels

**Verify:**
- [ ] 4 tabs present
- [ ] Hierarchies tab shows "LoB Structure" as active
- [ ] Levels displayed for active hierarchy

---

### ADM-14: Portfolio Hierarchy — Entity Types Tab
**Goal:** Verify entity types can be viewed and created.
**Persona:** Anna Meier (Controller)

1. Click "Entity Types" tab
2. `preview_snapshot` — verify existing entity types are listed
3. Click "Create" or "Add" button
4. Fill in a new entity type name
5. Save — verify it appears in the list

**Verify:**
- [ ] Entity types listed
- [ ] Create new entity type works
- [ ] New type appears in list

---

### ADM-15: Portfolio Hierarchy — Entities Tab
**Goal:** Verify entities can be created with pre-selected type.
**Persona:** Anna Meier (Controller)

1. Click "Entities" tab
2. `preview_snapshot` — verify existing entities listed
3. Click "Create" or "Add"
4. Verify the entity type is pre-selected based on context
5. Fill in entity details
6. Look for an "Add Another" button for batch creation

**Verify:**
- [ ] Entities listed
- [ ] Create form pre-selects type
- [ ] "Add Another" button present

---

### ADM-16: Portfolio Hierarchy — Assignment Tab
**Goal:** Verify hierarchy assignment (entities to children/projects).
**Persona:** Anna Meier (Controller)

1. Click "Hierarchy Assignment" tab
2. `preview_snapshot` — verify the assignment interface loads
3. Verify non-leaf entities can assign child entities (not projects)
4. Verify leaf-level entities can assign projects directly
5. Test assigning a project to a leaf entity

**Verify:**
- [ ] Assignment tab loads
- [ ] Non-leaf assigns children
- [ ] Leaf assigns projects
- [ ] Assignment operation works

---

### ADM-17: Deactivation Pattern
**Goal:** Verify entities use deactivation (not deletion).
**Persona:** Anna Meier (Controller)

1. Go to Cost Centers panel
2. Find a "Deactivate" action on a cost center
3. Click it — verify confirmation dialog
4. Confirm — verify the CC status changes to "Inactive" (not deleted from the table)
5. Verify inactive entities are still visible but marked

**Verify:**
- [ ] Deactivate action available (not "Delete")
- [ ] Confirmation dialog shown
- [ ] Entity marked as inactive (not removed)
- [ ] Inactive status visible

---

### ADM-18: Reset Demo
**Goal:** Verify the Reset Demo function restores all data. **RUN THIS LAST IN THE SUITE.**
**Persona:** Anna Meier (Controller)

1. Find the "Reset Demo" button in the admin header
2. Click it
3. `preview_snapshot` — verify a confirmation dialog appears (destructive action warning)
4. Confirm the reset
5. `preview_snapshot` — verify the app reloads/refreshes
6. Navigate to Portfolio Overview — verify project data is fresh (counts match seed data reference)
7. `preview_network` — verify no API errors during reset

**Verify:**
- [ ] Reset button visible
- [ ] Confirmation dialog shown
- [ ] Reset completes without errors
- [ ] Data restored to seed state

---

# SUITE 10 — Cross-Module Integration & Data Integrity

**Session:** D | **Est. time:** 40 min | **Default persona:** Anna Meier (Controller)

**Prerequisite:** Run after demo reset (or at end of Suite 9 after ADM-18 reset).

---

### XM-01: Pending Action Deep Links
**Goal:** Verify Launchpad pending actions navigate to correct destinations.
**Persona:** Anna Meier (Controller)

1. On Launchpad, click a pending action that references a CR approval
2. `preview_snapshot` — verify navigation to Portfolio Overview > CR Approvals with the correct CR highlighted/selected
3. Return to Launchpad
4. Click a pending action referencing a forecast review
5. `preview_snapshot` — verify navigation to Project Workbench with the correct project selected

**Verify:**
- [ ] CR-related actions navigate to Portfolio CR Approvals
- [ ] Forecast-related actions navigate to Workbench
- [ ] Correct entity is pre-selected after navigation

---

### XM-02: Portfolio to Workbench Navigation
**Goal:** Verify cross-module navigation from Portfolio to Workbench.
**Persona:** Anna Meier (Controller)

1. Navigate to Portfolio Overview
2. Click a project in the tree table — open side panel
3. Click "Open in Workbench"
4. `preview_snapshot` — verify navigation to `/workbench` with the correct project selected
5. Verify the workbench shows the Overview tab for that project

**Verify:**
- [ ] Portfolio -> Workbench navigation works
- [ ] Correct project selected in Workbench

---

### XM-03: Capacity Drill-Down to Workbench
**Goal:** Verify capacity drill-down links navigate to Workbench.
**Persona:** Thomas Brenner (CC Owner)

1. Switch to Thomas Brenner
2. Navigate to Capacity Management
3. Click a heatmap cell to open drill-down drawer
4. Find a project name in the drawer
5. Click the project name
6. `preview_snapshot` — verify navigation to Workbench with that project selected

**Verify:**
- [ ] Project link in drill-down is clickable
- [ ] Navigates to Workbench with correct project

---

### XM-04: Hierarchy Label Propagation
**Goal:** Verify the active hierarchy labels propagate across all modules.
**Persona:** Anna Meier (Controller)

1. Navigate to Admin > Portfolio Hierarchy
2. Note the active hierarchy name (e.g., "LoB Structure") and its entity type labels
3. Navigate to Portfolio Overview — check filter labels and chart titles
4. Navigate to Reporting — check filter labels on reports
5. Navigate to Simulator — check grouping labels
6. Verify all references use the hierarchy's terminology (not hardcoded "LoB")

**Verify:**
- [ ] Portfolio filters use hierarchy labels
- [ ] Report filters use hierarchy labels
- [ ] Simulator uses hierarchy labels
- [ ] Labels are consistent across modules

---

### XM-05: EUR Formatting Consistency Audit
**Goal:** Comprehensive spot-check of European number formatting.
**Persona:** Anna Meier (Controller)

1. Navigate through each module and check EUR values:
   - Launchpad: pending action descriptions
   - Portfolio: KPI tiles, tree table values
   - Workbench: Overview metadata, ForecastGrid cells
   - Capacity: heatmap values (if applicable)
   - Simulator: KPI strip, impact values
   - Reporting: table cells, KPI cards
   - Admin: rate table values
2. For each, verify: dot thousands separator, comma decimal separator
3. Note any inconsistencies (prefix EUR vs suffix EUR)

**Verify:**
- [ ] Consistent dot thousands separator
- [ ] Consistent comma decimal separator
- [ ] No raw unformatted numbers
- [ ] EUR symbol placement consistent (or inconsistencies documented)

---

### XM-06: Console Error Audit
**Goal:** Verify zero console errors across all module navigation.
**Persona:** Anna Meier (Controller)

1. `preview_console_logs` with level="error" — clear any existing errors
2. Navigate to Launchpad — check console
3. Navigate to Portfolio Overview, click through tabs — check console
4. Navigate to Workbench, select a project, click through tabs — check console
5. Navigate to Capacity Management, click through tabs — check console
6. Navigate to Simulator, open a scenario — check console
7. Navigate to Reporting, open each report — check console
8. Navigate to Administration, click through panels — check console
9. `preview_console_logs` with level="error" — verify no new errors

**Verify:**
- [ ] Zero error-level console messages across all modules
- [ ] Any warnings are benign (e.g., Radix UI deprecation warnings are acceptable)

---

### XM-07: Network Error Audit
**Goal:** Verify no failed API requests across all modules.
**Persona:** Anna Meier (Controller)

1. `preview_network` with filter="failed" — clear existing
2. Navigate through all 7 modules (same route as XM-06)
3. `preview_network` with filter="failed"
4. Verify no 4xx or 5xx responses

**Verify:**
- [ ] No 4xx responses (except known issues)
- [ ] No 5xx responses
- [ ] All API calls succeed

---

### XM-08: Role Switch Mid-Session
**Goal:** Verify switching roles while viewing a module updates access correctly.
**Persona:** Start as Anna Meier, cycle through

1. Navigate to What-If Simulator as Anna Meier — verify full access
2. Switch to Priya Sharma (PL) WITHOUT navigating away
3. `preview_snapshot` — verify the Simulator shows access-restricted message (PL has no access)
4. Navigate to Project Workbench — verify it loads correctly for PL
5. Switch to Thomas Becker (Executive) while on Workbench
6. Verify Workbench shows read-only mode (no edit capabilities)

**Verify:**
- [ ] Role switch updates current module's access immediately
- [ ] Access-restricted shown when role lacks permission
- [ ] Read-only mode enforced for Executive

---

### XM-09: Context-Sensitive Year Expansion (Cross-Project Verification)
**Goal:** Verify year expansion logic works correctly across different project types.
**Persona:** Anna Meier (Controller)

1. Navigate to Workbench, select an **active** project (e.g., "ERP Integration Phase 2")
2. Go to Forecast & Planning — verify 2026 is expanded
3. Select a **completed** project (e.g., "Data Center Consolidation")
4. Verify the final year of the project is expanded (not 2026)
5. Select a **future** project (e.g., "Connected Vehicle Platform")
6. Verify the start year is expanded

**Verify:**
- [ ] Active: 2026 expanded
- [ ] Completed: final year expanded
- [ ] Future: start year expanded
- [ ] Each switch correctly updates expansion state

---

### XM-10: End-to-End CR Lifecycle
**Goal:** Verify the full CR lifecycle from creation to approval.
**Persona:** Priya Sharma -> Anna Meier

1. As Priya Sharma, navigate to Workbench
2. Select a project and go to Forecast & Planning
3. Start the forecast wizard
4. Complete phases (as far as possible without crash)
5. If a CR is submitted in Phase 5, switch to Anna Meier
6. Navigate to Portfolio > CR Approvals
7. Find the new CR
8. Approve it
9. Navigate to Workbench — verify the forecast data reflects the approved change

**Verify:**
- [ ] CR created through wizard (or note if blocked by BUG-4)
- [ ] CR appears in Controller's approval queue
- [ ] Approval updates the forecast data

---

### XM-11: Send Back End-to-End Workflow
**Goal:** Verify the complete send-back cycle across roles.
**Persona:** Anna Meier -> Priya Sharma -> Anna Meier

1. As Anna Meier, navigate to Portfolio > Intake
2. Send back a pending submission with feedback
3. Switch to Priya Sharma
4. Navigate to Portfolio > Intake
5. Find the item with "Changes Requested" status
6. Click "Resubmit"
7. Switch to Anna Meier
8. Verify the item reappears as "Pending Approval"

**Verify:**
- [ ] Controller can send back submissions
- [ ] PL sees "Changes Requested" status
- [ ] PL can resubmit
- [ ] Controller sees resubmitted item as pending

---

### XM-12: Data Integrity — Project Counts
**Goal:** Verify data consistency across modules.
**Persona:** Anna Meier (Controller)

1. On Portfolio Dashboard — note total project count from KPI tile
2. On Portfolio tree — expand all groups, count total project rows
3. On Administration — note "Active Projects" or related count
4. Verify counts are consistent (allowing for pending/draft projects that may differ)

**Verify:**
- [ ] KPI tile count matches tree row count (or difference explained by pending projects)
- [ ] Admin counts consistent with portfolio data

---

# KNOWN ISSUES REGISTER

These issues were identified in previous testing rounds. If encountered during testing, reference the known issue ID rather than creating a new entry. Update this register after each fix session: remove fixed issues, add newly discovered ones.

| ID | Severity | Description | Module |
|----|----------|-------------|--------|
| KNOWN-01 | P2 | Pending Actions badge counts only urgent items, not total actions | Launchpad |
| KNOWN-02 | P3 | Role selection not persisted across page refresh (resets to Anna Meier) | Global |
| KNOWN-03 | P0 | Forecast Wizard Phase 3 may crash with duplicate key errors (BUG-4) | Workbench |
| KNOWN-04 | P1 | Submit New Project sends POST to wrong endpoint (404) (BUG-5) | Workbench |
| KNOWN-05 | P3 | CR category badge may show snake_case (e.g., "External_cost") | Portfolio |
| KNOWN-06 | P3 | CR changes table may show raw numbers without EUR formatting | Portfolio |
| KNOWN-07 | P3 | CapEx casing inconsistent (Capex/CAPEX/CapEx) across views | Multiple |
| KNOWN-08 | P3 | "Send Back" vs "Request Changes" label inconsistency | Portfolio |
| KNOWN-09 | P2 | Reporting table EUR format may use suffix (€) instead of prefix | Reporting |
| KNOWN-10 | P3 | Reporting breadcrumb may show URL slug instead of friendly name | Reporting |
| KNOWN-11 | P3 | AI Advisor panel may be partially off-viewport | Simulator |
| KNOWN-12 | P3 | Vendor Spend "Ordered" column shows all zeros | Reporting |
| KNOWN-13 | P3 | Scenario headline impact shows "--" for user-created scenarios | Simulator |
| KNOWN-14 | P3 | RAG donut may show 31 projects vs 32 in KPI tile (pending project excluded) | Portfolio |
| KNOWN-15 | P3 | Active People count may show 52 vs expected 50 | Admin |
| KNOWN-16 | P2 | Forecast Accuracy report may return empty data for some filter combinations | Reporting |
| KNOWN-17 | P2 | Lena Fischer may not appear in heatmap despite over-allocation | Capacity |
| KNOWN-18 | P3 | Heatmap color coding may lack variation (all same shade) | Capacity |
| KNOWN-19 | P3 | FAQ/Guide panels overlay content instead of shrinking main area | Global |
| KNOWN-20 | P3 | Launchpad "Submit New Project" tile navigates to Workbench instead of dialog | Launchpad |

---

# BUG REPORT TEMPLATE

Create `qa/bug-report.md` at session start with this template:

```markdown
# CRETA Demo App — E2E Bug Report

**Date started:** YYYY-MM-DD
**Test plan version:** [date of test plan used]
**Tester:** Claude Code (automated via preview tooling)
**Environment:** macOS, Chromium (preview tools, desktop viewport), Backend port 8000, Frontend port 5173
**Persona coverage:** All 4 personas tested

---

## Summary

| Suite | Name | Scenarios | Pass | Fail | Partial | Blocked |
|-------|------|-----------|------|------|---------|---------|
| 1 | Global Shell & Launchpad | 12 | | | | |
| 2 | Portfolio Dashboard | 13 | | | | |
| 3 | Intake & CR Approvals | 13 | | | | |
| 4 | Project Workbench | 17 | | | | |
| 5 | Forecast Wizard | 10 | | | | |
| 6 | Capacity Management | 14 | | | | |
| 7 | What-If Simulator | 16 | | | | |
| 8 | Reporting | 13 | | | | |
| 9 | Administration | 18 | | | | |
| 10 | Cross-Module Integration | 12 | | | | |
| **Total** | | **138** | | | | |

### Issue Counts
- **Functional Bugs (BUG):** 0
- **UI/Cosmetic (UI):** 0
- **Data Issues (DATA):** 0
- **Spec Gaps (SPEC):** 0

---

## Issues

(Append entries here as testing proceeds, using the format below)

### BUG-001: [Short description] (P0/P1/P2/P3)
- **Category:** Functional Bug
- **Suite/Scenario:** Suite X / XX-NN
- **Persona:** [name]
- **Steps:**
  1. [step]
  2. [step]
- **Expected:** [what should happen]
- **Actual:** [what actually happened]
- **Console Errors:** [if any, or "None"]
- **Known Issue?:** No (new) | Yes (ref: KNOWN-XX)
```

---

*End of E2E Test Plan*
