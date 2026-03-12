# CRETA Demo App — End-to-End Regression Test Plan

This document provides step-by-step instructions for a **full visual browser walkthrough** of the entire CRETA application. It covers all modules, features, and cross-cutting concerns — including all v2 enhancements. Give this to a fresh Claude Code session to execute as a comprehensive regression test.

**Total scenarios:** 33 + cross-cutting checks
**Estimated time:** ~90 minutes for full walkthrough

---

## Prerequisites

### 1. Reset Demo Data
```bash
curl -X POST http://localhost:8000/api/admin/reset-demo
```

### 2. Start Servers
- **Backend:** `cd backend && source .venv/bin/activate && python main.py` (port 8000)
- **Frontend:** `cd frontend && npm run dev` (port 5173, bound to 127.0.0.1)

Use `preview_start` for the frontend (there should be a `.claude/launch.json` config named `"frontend"`). Start the backend via Bash in the background.

### 3. Open the App
Navigate to `http://localhost:5173` in the preview browser. The default role is **Controller (Anna Meier)**.

---

## Personas (role switcher in top-right dropdown)

| Persona | Role | Key Access |
|---------|------|------------|
| Anna Meier | Controller | All modules — full access |
| Thomas Brenner | CC Owner | Capacity Management + limited portfolio |
| Priya Sharma | Project Lead | Workbench + intake submission |
| Dr. Klaus Weber | Executive | Portfolio + Simulator (read-only) |

---

# PART 1 — LAUNCHPAD & GLOBAL

### Scenario 1: CRETA Branding
**Goal:** Verify all user-facing "CPC" references are replaced with "CRETA".

1. Check the **browser tab title** — should say "CRETA"
2. Check the **top bar logo/text** — should say "CRETA"
3. Check the **breadcrumb root** — should say "CRETA"
4. Open a module guide (book icon) — content should reference "CRETA"
5. Open the FAQ panel (? icon) — FAQ answers should reference "CRETA"

**Verify:** No instance of "CPC" or "Controlling & Planning Centre" appears anywhere in the UI.

---

### Scenario 2: Role Switching — Always Lands on Launchpad
**Goal:** Verify all 4 personas load the Launchpad on switch.

1. Start as Anna Meier (Controller) — navigate to Portfolio Overview
2. Click role dropdown → switch to **Thomas Brenner** (CC Owner)
   - Should land on **Launchpad** (NOT directly on Capacity Management)
   - Verify Launchpad shows role-appropriate module tiles and notifications
3. Switch to **Priya Sharma** (Project Lead)
   - Should land on **Launchpad**
   - Verify "Submit New Project" button is visible
4. Switch to **Dr. Klaus Weber** (Executive)
   - Should land on **Launchpad**
   - Verify read-only module access (no Administration tile)
5. Switch back to **Anna Meier**
   - Should land on **Launchpad**

**Verify:** Every role switch navigates to Launchpad. Each role sees different notifications and module tiles. No KPI cards on Launchpad.

---

### Scenario 3: Notification Deep-Linking
**Goal:** Verify notifications navigate to the specific entity.

1. As Anna Meier, check Launchpad notifications
2. Click a notification that references a specific project
3. Verify you land in the correct module with that **specific project pre-selected** (not just the module)
4. Return to Launchpad
5. Click a notification referencing a CR or intake item
6. Verify you land on the correct **Portfolio tab** (Approvals or Intake) with the item selected

**Verify:** Deep-links navigate to both the module AND the specific entity.

---

### Scenario 4: Module Guide
**Role:** Any
**Module:** Any module

1. On any module page, click the **guide/book icon button** (near the page title)
2. Verify side panel (380px, content shrinks main area) opens with module manual
3. Content should include sections relevant to the current module, **referencing CRETA** (not CPC)
4. Bold text should render properly (no raw `**text**` markdown)
5. Close the panel — verify content area restores

**Verify:** Guide loads correct content, markdown renders, panel opens/closes cleanly.

---

### Scenario 5: FAQ Help Panel
**Role:** Controller (Anna Meier), then Project Lead (Priya Sharma)

1. As Controller, click the **"?"** button in the top bar
2. Side panel opens with FAQ list
3. Verify ~7-8 FAQs visible (filtered for controller role)
4. Click an FAQ — verify detail view with:
   - "Back to FAQs" link
   - Question + summary
   - Numbered steps with blue circles
   - Steps with `target_module` have clickable "Open [Module]" links
5. Click "Back to FAQs" — returns to list
6. Switch to **Priya Sharma** and reopen FAQ
7. Verify fewer FAQs (~3, filtered for project_lead role)

**Verify:** Role filtering works, detail view renders steps, deep-link buttons navigate correctly.

---

# PART 2 — PORTFOLIO OVERVIEW

### Scenario 6: Portfolio Dashboard — KPIs & Filtering
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Dashboard

1. Navigate to Portfolio Overview
2. Verify **KPI cards** at top: total budget, YTD actuals, forecast, variance, CapEx/OpEx, Run/Change split
3. Verify **Run/Change** shows both absolute values AND percentages (e.g., `Run: €X.XM (62%) | Change: €X.XM (38%)`)
4. Note the KPI values with no filters active
5. Apply a **LoB filter** (e.g., "Truck Systems")
6. Verify ALL KPI cards **recalculate** to reflect only Truck Systems projects
7. Apply a **RAG filter** on top → verify further narrowing
8. Clear all filters → verify KPIs return to portfolio-wide totals

**Verify:** KPIs are dynamic, Run/Change has percentages, filtering updates everything.

---

### Scenario 7: Portfolio Dashboard — Charts & RAG Doughnut
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Dashboard

1. View the **RAG Doughnut Chart**
2. Hover over a segment → verify tooltip shows: color label, count, percentage
3. **Click** the Red segment → verify the portfolio tree filters to Red-only projects and KPIs recalculate
4. Click Red again → verify filter clears
5. View the **Forecast Trajectory Chart**:
   - 3 series: Baseline, Current Forecast, Actuals
   - Actuals line stops at Feb 2026 (no zero extension into future)
   - Baseline and Forecast extend into future
6. View the **Budget by LoB** chart (stacked bar)

**Verify:** RAG doughnut interactive (hover + click-to-filter), trajectory has 3 correct series, actuals terminate properly.

---

### Scenario 8: Portfolio Tree Browsing
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Dashboard

1. In the portfolio tree table, expand **Truck Systems** LoB (click chevron)
2. Expand **Digital Braking Platform** program
3. Click on **ERP Integration Phase 2** project row
4. Verify right-side summary panel opens with:
   - RAG indicator
   - Budget snapshot (baseline vs forecast vs actuals)
   - Timeline info
   - Forecast sparkline
   - Last CR summary
5. Close the panel, collapse the tree

**Verify:** Tree expands/collapses smoothly, indentation correct, RAG colors show, summary panel has all data.

---

### Scenario 9: Intake Queue — Two-Level Detail
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Intake Queue tab

1. Click the **Intake Queue** tab
2. Verify the tab loads cleanly (no flash of Dashboard tab)
3. Click a pending project (e.g., **Autonomous Braking Prototype**)
4. **Level 1 — Side panel:** Verify quick preview with project name, LoB, PL, budget, dates, type, and "Open Full Detail" button
5. Click **"Open Full Detail"**
6. **Level 2 — Full workspace:** Verify:
   - Breadcrumb: "CRETA > Portfolio Overview > Intake > [Project Name]"
   - Resource plan table (roles × months with planned hours)
   - External cost plan (categories × months)
   - Budget summary (internal + external totals, CapEx/OpEx)
   - Action buttons: Approve / Reject / Send Back
7. Click **Approve**
8. Verify status updates and you return to the intake list

**Verify:** Two-level detail pattern works, resource/cost plans visible, approve action succeeds.

---

### Scenario 10: Approvals — Two-Level Detail & Actions
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Approvals tab

1. Click the **Approvals** tab
2. Verify pending CRs are listed
3. Click a pending CR
4. **Level 1 — Side panel:** Verify CR title, project, requester, date, budget delta, and "Open Full Detail" button
5. Click **"Open Full Detail"**
6. **Level 2 — Full workspace:** Verify:
   - Breadcrumb: "CRETA > Portfolio Overview > Approvals > [CR Title]"
   - Before/After comparison table with baseline, forecast, proposed values, color-coded deltas
   - Justification section
   - Impact summary
   - Action buttons: Approve / Reject / Send Back
7. Click **Approve** (or Reject)
8. Verify CR status updates and you return to the list

**Verify:** Two-level pattern, comparison table with deltas, approval action works.

---

# PART 3 — PROJECT WORKBENCH

### Scenario 11: Project Selection & Overview
**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench

1. Switch to **Priya Sharma** — should land on Launchpad
2. Navigate to Project Workbench
3. Verify left panel shows project list with RAG dots
4. Select **ERP Integration Phase 2**
5. Go to the **Overview** tab
6. Verify: project metadata (name, RAG, status, LoB, PL)
7. Verify **3-point comparison** table: Baseline vs Current Forecast vs Actuals
   - Baseline ≠ Current Forecast (reflecting confirmed CRs)
8. Verify **project trajectory chart** with actuals line **stopping at last data month** (no zero extension)
9. Verify CapEx/OpEx breakdown and resource summary

**Verify:** Overview loads, 3-point comparison shows CR impact, trajectory chart correct.

---

### Scenario 12: Forecast Grid — Collapsible Years & External Costs
**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench → Forecast & Planning

1. Select a multi-year project
2. Go to **Forecast & Planning** tab
3. Verify the forecast grid:
   - **2026 (current year)** months are expanded
   - **Other years** are collapsed into summary columns
   - Click expand chevron on a collapsed year → months appear
   - Click again → collapses back
4. Verify **sticky row labels** when scrolling horizontally
5. Verify **internal resource rows** show **hours + EUR** (e.g., "120 hrs / €14.400,00")
6. Verify **external cost rows** have:
   - **Status column** with color-coded procurement badges (Planned/Ordered/GR/Invoiced/Accrual/Open)
   - **PO Number** and **Vendor** columns for relevant rows
7. Verify **European number formatting**: dot for thousands, comma for decimals

**Verify:** Collapsible years, sticky headers, dual hours/EUR display, procurement badges, European formatting.

---

### Scenario 13: Monthly Forecast Wizard (5 Phases)
**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench → Forecast & Planning

1. Select **ERP Integration Phase 2**
2. Click **"Start Monthly Review"**
3. **Phase 1 — Retrospective:**
   - Review actuals vs forecast variance table
   - Verify hours and EUR values are both shown, European format
   - Check "significant" flags on large variances
   - Click Next
4. **Phase 2 — System Suggestions:**
   - Review AI-generated suggestions (observation + recommendation + impact)
   - Accept or skip suggestions
5. **Phase 3 — Manual Adjustments:**
   - Verify **past month cells are read-only** (greyed out)
   - Verify **current month and future months** are editable
   - Verify only recent ~4 past months visible; older months collapsed
   - Edit a future month value — verify the change highlights
6. **Phase 4 — Review & Justify:**
   - Verify grouped changes summary
   - Add justification text for each group
7. **Phase 5 — Submit:**
   - Review final summary
   - Click Submit
   - Verify CRs are created

**Verify:** All 5 phases transition, past-month read-only, suggestions pre-fill, submit creates CRs.

---

### Scenario 14: CR Routing — End to End
**Role:** Project Lead → Controller

1. As Priya Sharma, the CRs created in Scenario 13 should now be routed
2. Switch to **Anna Meier** (Controller)
3. Go to Portfolio Overview → Approvals tab
4. Verify the CRs from Priya's submission **appear in the pending list**
5. Open one and verify the details match what was submitted

**Verify:** CRs created by PL appear in controller's approval queue.

---

### Scenario 15: Change History
**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench → Change History

1. Switch to Priya Sharma, select **ERP Integration Phase 2**
2. Click **Change History** tab
3. Verify CRs listed with various statuses (approved, pending, rejected)
4. Try filters (by status, category)
5. Click a CR to expand its details
6. Verify: changes with field_changed, old_value, new_value, delta
7. Verify **confirmed CRs** have "Approved" status and their deltas match the 3-point comparison

**Verify:** CR list populated, filters work, detail expansion shows change breakdown, data consistency.

---

# PART 4 — CAPACITY MANAGEMENT

### Scenario 16: Team Heatmap & Person Detail
**Role:** Cost Center Owner (Thomas Brenner)
**Module:** Capacity Management → My Team

1. Switch to **Thomas Brenner** — land on Launchpad, then navigate to Capacity Management
2. Verify **My Team** tab is active
3. Check team summary cards: headcount, avg utilization, over-allocated count
4. View the **heatmap grid** — verify color coding:
   - Blue cells (~48%) for under-utilized (e.g., Markus Wolf)
   - Green for normal utilization
   - Amber for high utilization
   - Red (>100%) for over-allocated (e.g., Lena Fischer)
5. Click on **Lena Fischer** row
6. Verify bottom drawer opens with:
   - Month-by-month allocation breakdown
   - Per-project hours allocation
   - Pending requests affecting her

**Verify:** Heatmap colors correct, person drill-down shows project breakdown.

---

### Scenario 17: Resource Request — Assignment Preview
**Role:** Cost Center Owner (Thomas Brenner)
**Module:** Capacity Management → Resource Requests

1. Navigate to **Resource Requests** tab
2. Verify pending requests listed (grouped by month)
3. Click a pending request to see details
4. Click **Confirm** (or other response action)
5. Verify **assignment preview**: available people with utilization projections
6. Select a person for assignment
7. Verify utilization impact preview (monthly projections, >100% warning if applicable)
8. Submit the response

**Verify:** Request list loads, detail works, assignment preview shows utilization impact.

---

### Scenario 18: Organization Overview
**Role:** Controller (Anna Meier)
**Module:** Capacity Management → Organization Overview

1. Switch to **Anna Meier**, navigate to Capacity Management
2. Click **Organization Overview** tab
3. Verify org summary cards (total headcount, avg utilization)
4. View the org-wide heatmap
5. Test **pivot dimensions**: by Cost Center, by Role, by LoB
6. Expand a row to see children
7. Click a row to open drill-down detail in bottom drawer

**Verify:** All 3 pivot views render, heatmap populated, drill-down works.

---

# PART 5 — WHAT-IF SIMULATOR

### Scenario 19: Open Pre-Built Scenario
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Navigate to What-If Simulator
2. Should see scenario list (My Scenarios + Published)
3. Click **"FY2026 Budget Pressure — Conservative"** (Published)
4. Verify workspace loads with:
   - Scenario name + Published badge
   - Description text
   - Applied actions list
   - Impact dashboard: Total Budget delta, RAG distribution, budget change %, projects affected
5. Scroll to Portfolio Impact table
6. Click a project row → verify bottom drawer drill-down

**Verify:** Pre-built scenario loads fully, impact metrics display, drill-down works.

---

### Scenario 20: Create Scenario — Delay & Accelerate
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Click **"Create New Scenario"**, enter name "Timeline Test"
2. Add a **Delay** action: select a project, delay by 3 months
3. Verify impact:
   - Budget **shifted forward** by 3 months
   - Project **end date extends** by 3 months
   - Empty months show zero
4. Remove the action
5. Add an **Accelerate** action: same project, accelerate by 2 months
6. Verify budget shifts backward, project ends sooner

**Verify:** Delay shifts budget forward + extends timeline. Accelerate reverses.

---

### Scenario 21: Scenario Actions — Project-Level
**Goal:** Test Pause, Change Resource Allocation, Adjust Budget, Remove Project.

1. Create a new scenario "Project Actions Test"
2. **Pause Project:** Select a project, set start month → verify all budget zeroed from that month, project shows "Paused"
3. Remove action. **Change Resource Allocation:** Select project, role, add/modify hours → verify euro impact using rates
4. Remove action. **Adjust Budget:** Increase/decrease a project budget → verify delta
5. Remove action. **Remove Project:** Zero out a project → verify total impact

**Verify:** Each project-level action produces correct budget impact.

---

### Scenario 22: Scenario Actions — Portfolio Rules
**Goal:** Test Cut by Type, Freeze New Starts, Cap Cost Category, Across-the-Board Cut, Cut Consulting, Reduce LoB, Rate Escalation.

1. Create a new scenario "Portfolio Rules Test"
2. **Cut by Type:** Select "Project", 15% reduction → verify matching projects reduced
3. Remove. **Freeze New Starts:** Set cutoff month → verify not-yet-started projects zeroed, running projects untouched
4. Remove. **Rate Escalation:** Scope = "Role", select "Senior Developer", 10% increase, effective April 2026 → verify increased costs for affected projects
5. Remove. Quick-test each remaining action (add, check impact, remove):
   - Across-the-Board Cut
   - Cut Consulting
   - Reduce LoB
   - Cap Cost Category

**Verify:** All portfolio rule actions work and produce visible impacts. Rate escalation correctly identifies affected allocations.

---

### Scenario 23: Compare Scenarios
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. From scenario list, click **"Compare Scenarios"**
2. "Current State" should be pinned
3. Select 2 additional scenarios (e.g., Conservative + Worst Case)
4. Click Compare
5. Verify comparison table:
   - Columns: Current State + selected scenarios
   - Rows: projects with budget and delta for each
   - RAG color changes highlighted

**Verify:** Comparison loads with correct columns, deltas, and RAG changes.

---

### Scenario 24: AI Advisor
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Open a scenario workspace (or create new)
2. Click **"AI Advisor"**
3. Indigo panel slides in from the right
4. Type: **"Find 2M in savings"** and submit
5. Verify 3 paths appear:
   - Path A — Conservative (~€2.1M)
   - Path B — Moderate (~€2.0M)
   - Path C — Aggressive (~€2.4M)
6. Each path shows: headline numbers, approach, trade-offs
7. Click **"Apply"** on one path
8. Verify actions are added to the scenario
9. Close AI Advisor panel

**Verify:** 3 paths generated, details displayed, Apply creates grouped actions.

---

# PART 6 — REPORTING MODULE

### Scenario 25: Report Library
**Role:** Controller (Anna Meier)
**Module:** Reporting

1. Navigate to Reporting from the Launchpad
2. Verify **Report Library** landing view:
   - **Standard Reports** section with 5 report cards
   - **My Saved Views** section (may be empty)
3. Each report card shows: name, description, icon
4. Verify all 5 reports present:
   - Programme / Multi-Project Rollup
   - Cost Center Financial Summary
   - Vendor Spend Analysis
   - Forecast Accuracy
   - Year-over-Year Comparison

**Verify:** Library layout correct, all 5 reports present.

---

### Scenario 26: Programme / Multi-Project Rollup
**Module:** Reporting → Programme Rollup

1. Open the report
2. Verify **filter bar** (LoB, project type, status, RAG, time period)
3. Verify **KPI row** (total baseline, forecast, actuals, variance)
4. Verify **table** with: Project Name, LoB, Status, Baseline, Forecast, Actuals, Remaining, Variance, Variance %, RAG
5. Verify default grouping by **LoB** with subtotal rows
6. Toggle to **Chart view** → verify stacked bar chart
7. Apply a filter → verify table and KPIs update

**Verify:** Data loads, filters work, chart/table toggle, grouping correct.

---

### Scenario 27: Cost Center Financial Summary
**Module:** Reporting → CC Financial Summary

1. Open the report
2. Verify **KPIs**: total CC budget, actuals, internal cost, external cost, active projects
3. Verify **table**: Project, Internal Hours, Internal Cost, External Cost, Total, % of CC Budget, Status
4. Change **cost center filter** → verify data recalculates
5. Toggle to chart view → verify pie chart or trend line
6. Switch to **Thomas Brenner** → open report → verify auto-filters to his CC

**Verify:** CC-specific data, role-scoped defaults, chart options.

---

### Scenario 28: Vendor Spend Analysis
**Module:** Reporting → Vendor Spend

1. Open the report
2. Verify **table**: Vendor Name, Total Ordered, Total Invoiced, Total Open, Accruals, # Projects, # POs
3. Click a vendor row → verify **drill-down** to PO line items
4. Toggle to chart view → verify horizontal bar chart (top vendors)
5. Apply filters (vendor, LoB, status)

**Verify:** Vendor aggregation, drill-down to POs, chart, filters.

---

### Scenario 29: Forecast Accuracy
**Module:** Reporting → Forecast Accuracy

1. Open the report
2. Verify **forecast horizon** selector (3, 6, 12 months)
3. Verify **KPIs**: avg accuracy %, projects within 5%, projects >15%, bias indicator
4. Verify **table**: Project, LoB, Forecast, Actual, Variance, Variance %, Accuracy Rating (Green/Amber/Red)
5. Toggle to chart → verify **scatter plot** with diagonal reference line, LoB color coding
6. Change horizon → verify data recalculates

**Verify:** Horizon parameter, scatter plot with reference line, accuracy badges.

---

### Scenario 30: Year-over-Year Comparison
**Module:** Reporting → YoY Comparison

1. Open the report
2. Verify **line chart** with 2 series (FY2025, FY2026), cumulative spend
3. Toggle **Cumulative ↔ Monthly** → verify chart updates
4. Verify **table**: Month, FY2026 Spend, FY2025 Spend, Delta €, Delta %, Cumulative columns
5. Apply filters (LoB, cost type)

**Verify:** Dual-year chart, cumulative/monthly toggle, table deltas.

---

### Scenario 31: Report Configurator & Saved Views
**Module:** Reporting → any report

1. Open any report, click **"Customize"**
2. Verify **right-side drawer** with column visibility checkboxes and sort order
3. Toggle columns off → verify table updates
4. Change sort order → verify table re-sorts
5. Close configurator
6. Apply some filters + customization, then click **"Save View"**
7. Enter name "My Custom View" and save
8. Return to Report Library → verify saved view card in "My Saved Views"
9. Click the saved view → verify report opens with all settings restored
10. Use the card menu → **Rename** the view → verify
11. Use the card menu → **Delete** the view → verify removal

**Verify:** Configurator works, saved views save/load/rename/delete correctly.

---

### Scenario 32: Excel Export
**Module:** Reporting → any report

1. Open any report, apply some filters
2. Click **"Export"** (Export to Excel)
3. Verify download: `CRETA_[ReportName]_[YYYY-MM-DD].xlsx`
4. Open the file and verify:
   - Header row with column names
   - Data rows matching the filtered view
   - Summary/totals row
   - Metadata (report name, date, filters)
5. Repeat for a second report

**Verify:** Excel export with proper formatting, matching on-screen data.

---

# PART 7 — ADMINISTRATION

### Scenario 33: CRUD — Add Cost Center
**Role:** Controller (Anna Meier)
**Module:** Administration

1. Navigate to Administration
2. Click **"Cost Centers"** in the entity selector
3. Click **"Add Cost Center"** (or + button)
4. Fill form: Name "SHG Data Analytics", select location and competence center
5. Click Create
6. Verify new cost center appears in the table

**Verify:** Create dialog works, form validates, entity appears.

---

### Scenario 34: Inline Editing — Rate Tables
**Role:** Controller (Anna Meier)
**Module:** Administration → Rate Tables

1. Click **"Rate Tables"** in the entity selector
2. Find **Senior Developer** role rates
3. Edit the hourly rate from €95 to €105
4. Verify the row highlights (amber unsaved indicator)
5. Click **Save**
6. Verify rate updates and highlight clears

**Verify:** Inline editing, change highlighting, save persists.

---

### Scenario 35: Other Admin Entities
**Role:** Controller (Anna Meier)
**Module:** Administration

1. Browse each entity type in the selector:
   - Cost Centers
   - Competence Centers
   - Lines of Business
   - Locations
   - People
   - Rate Tables
   - Planning Parameters
   - Audit Log
2. For each: verify the table loads with data, columns are populated
3. For Planning Parameters: verify the form loads with current values
4. For Audit Log: verify entries are listed with timestamps and filters

**Verify:** All 8 admin entity panels load correctly with data.

---

# CROSS-CUTTING CHECKS

Run these checks throughout the walkthrough:

### Formatting & Display
- [ ] **European currency formatting** — `€1,2M` (summary), `€14.400,00` (detail), dot=thousands, comma=decimals
- [ ] **Currency deltas** — explicit `+`/`-`: `+€200K`, `-€1,2M`
- [ ] **Percentages** — European decimal: `+1,2%`, `-6,5%`
- [ ] **No "CPC" anywhere** — all renamed to CRETA

### Layout & UX
- [ ] **Side panel** — 380px fixed width, main content shrinks (not overlaid)
- [ ] **Bottom drawer** — ~40vh height, semi-transparent overlay, closes via X or overlay click
- [ ] **Loading skeletons** — appear briefly on every data fetch
- [ ] **Hover states** — slate-50 bg on table rows, pointer cursor on clickable elements
- [ ] **Responsive breadcrumb** — top bar shows correct module name on each navigation
- [ ] **Role dropdown** — shows current user name and allows switching

### Data & Behavior
- [ ] **RAG colors** — Green (#22c55e), Amber (#f59e0b), Red (#ef4444) used consistently
- [ ] **Collapsible years** — 2026 expanded, other years collapsed in all planning tables
- [ ] **Procurement badges** — color-coded status on external cost rows
- [ ] **Hours + EUR** — dual display on internal resource allocations
- [ ] **Actuals terminate** — actuals line/data stops at last month with data, no zero extension
- [ ] **Confirmed CRs** — reflected in forecast tables (Baseline ≠ Forecast where CRs applied)
- [ ] **Role-based access** — each persona sees only their authorized modules and data scope

### Technical
- [ ] **Zero console errors** — check `preview_console_logs` after each scenario group
- [ ] **No 404/500 API calls** — check network for failed requests
- [ ] **HMR stability** — dev server stays responsive throughout

---

# POST-TEST CHECKLIST

1. Check for console errors one final time
2. Reset demo data:
   ```bash
   curl -X POST http://localhost:8000/api/admin/reset-demo
   ```
3. Take a final screenshot of the Launchpad as proof of clean state
4. Record any issues found in a bug report

---

## Troubleshooting

- **Backend not responding:** Check `http://localhost:8000/health`. Restart with `cd backend && source .venv/bin/activate && python main.py`
- **Frontend HMR stuck:** Stop and restart the dev server
- **Stale data after testing:** Reset with `POST /api/admin/reset-demo`
- **Scenario data lost after actions:** Expected — What-If engine recalculates. Reset DB by deleting `backend/creta_demo.db` and restarting backend.
- **Tab URL sync issue:** If portfolio tabs don't match URL, check `PortfolioOverview.tsx` pathname sync useEffect.
