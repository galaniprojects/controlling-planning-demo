# CRETA v2 — Feature Test Plan

This document covers **only the new and changed functionality** introduced in the v2 upgrade. Use this to validate that all v2 features work correctly after the upgrade. For a full regression test of the entire application, see `E2E_TEST_PLAN.md`.

---

## Prerequisites

### 1. Reset Demo Data
```bash
curl -X POST http://localhost:8000/api/admin/reset-demo
```

### 2. Start Servers
- **Backend:** `cd backend && source .venv/bin/activate && python main.py` (port 8000)
- **Frontend:** `cd frontend && npm run dev` (port 5173, bound to 127.0.0.1)

Use `preview_start` for the frontend (config name `"frontend"` in `.claude/launch.json`). Start the backend via Bash in the background.

### 3. Open the App
Navigate to `http://localhost:5173`. Default role is **Controller (Anna Meier)**.

---

## V2-1: Global — CRETA Rename

**Goal:** Verify all user-facing "CPC" references are replaced with "CRETA".

1. Check the browser tab title — should say "CRETA" (not "CPC")
2. Check the top bar logo/text — should say "CRETA"
3. Check the breadcrumb root — should say "CRETA"
4. Open a module guide (book icon) — content should reference "CRETA", not "CPC"
5. Open the FAQ panel (? icon) — content should reference "CRETA"
6. Hit the reset endpoint and check the response message references "CRETA"

**Verify:** No instance of "CPC" or "Controlling & Planning Centre" appears anywhere in the UI.

---

## V2-2: Launchpad — Role Switch Lands on Launchpad

**Goal:** Verify role switch always returns to the Launchpad.

1. Navigate to **Portfolio Overview** (or any non-Launchpad module)
2. Switch role to **Thomas Brenner** (CC Owner)
3. Verify you land on the **Launchpad**, NOT directly on Capacity Management
4. From Launchpad, click into Capacity Management
5. Switch to **Priya Sharma** (Project Lead)
6. Verify you land on the **Launchpad** again
7. Switch to **Dr. Klaus Weber** (Executive) — verify Launchpad
8. Switch back to **Anna Meier** — verify Launchpad

**Verify:** Every role switch navigates to Launchpad regardless of current module.

---

## V2-3: Launchpad — No KPI Strip

**Goal:** Verify the Launchpad shows only module tiles, notifications, and submit button.

1. As Anna Meier, navigate to the Launchpad
2. Verify there are **no KPI summary cards** (no budget, actuals, forecast totals)
3. Verify module tiles are present (role-filtered)
4. Verify notifications panel is present
5. Switch to Priya Sharma — verify no KPIs, "Submit New Project" button visible

**Verify:** Launchpad is clean — navigation + alerts only, no analytics.

---

## V2-4: Launchpad — Notification Deep-Linking

**Goal:** Verify notification clicks navigate to the specific entity, not just the module.

1. As Anna Meier, check the Launchpad notifications
2. Click a notification that references a specific project (e.g., a workbench notification)
3. Verify you land in the **Project Workbench** with that specific project pre-selected in the left panel
4. Go back to Launchpad
5. Click a notification referencing a CR or intake item
6. Verify you land on the **correct Portfolio Overview tab** (Approvals or Intake) with the relevant item highlighted or selected

**Verify:** Deep-links navigate to both the module AND the specific entity.

---

## V2-5: Portfolio Dashboard — Interactive RAG Doughnut

**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Dashboard

1. Navigate to Portfolio Overview Dashboard
2. Hover over a RAG doughnut segment (e.g., Green)
3. Verify tooltip shows: color label, project count, and percentage
4. Click the **Red** segment
5. Verify the portfolio tree below filters to show only Red-status projects
6. Verify KPI cards recalculate to reflect only the filtered subset
7. Click the Red segment again (or a clear action)
8. Verify the filter clears and all projects/KPIs restore

**Verify:** Hover tooltips work, click filters the view, second click clears, KPIs update dynamically.

---

## V2-6: Portfolio Dashboard — Forecast Trajectory Chart

**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Dashboard

1. View the Forecast Trajectory chart in the dashboard charts area
2. Verify it shows **3 cumulative series**: Baseline, Current Forecast, Actuals
3. Verify the Actuals line **stops at the current month** (Feb 2026) — no zero extension into future
4. Verify Baseline and Forecast lines extend into future months
5. Hover over data points — tooltips should show the series name and value

**Verify:** Three distinct series, actuals terminate correctly, values are meaningful and match KPI totals.

---

## V2-7: Portfolio Dashboard — Run/Change Ratio with Percentages

**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Dashboard

1. Find the Run/Change KPI card
2. Verify it shows **both** absolute euro values AND percentage split
3. Expected format: `Run: €X.XM (XX%) | Change: €X.XM (XX%)`
4. Verify percentages add up to 100%

**Verify:** Both absolute and percentage values are displayed.

---

## V2-8: Portfolio Dashboard — Dynamic KPI Filtering

**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Dashboard

1. Note the KPI card values with no filters active (portfolio-wide totals)
2. Apply a **LoB filter** (e.g., select "Truck Systems")
3. Verify ALL KPI cards recalculate — total budget, actuals, forecast, variance, project count should all decrease to reflect only Truck Systems projects
4. Apply an additional **RAG filter** (e.g., "Red")
5. Verify KPIs further narrow to only Red projects in Truck Systems
6. Clear all filters
7. Verify KPIs return to portfolio-wide totals

**Verify:** KPIs are fully dynamic — they respond to every filter combination.

---

## V2-9: Portfolio Approvals — Two-Level Detail

**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Approvals tab

1. Click the **Approvals** tab
2. Click a pending CR in the list
3. **Level 1 — Side panel preview:** Verify it shows CR title, requesting project, requester, date, budget impact delta, and an "Open Full Detail" button
4. Click **"Open Full Detail"**
5. **Level 2 — Full workspace:** Verify:
   - Breadcrumb updates to "CRETA > Portfolio Overview > Approvals > [CR Title]"
   - Header with CR title, status badge, project, requester, date
   - Before/After comparison table with baseline, current forecast, proposed values, and color-coded deltas
   - Justification section
   - Impact summary (budget delta, RAG effect)
   - Action buttons: Approve / Reject / Send Back
6. Click **"Back to Approvals"** (or breadcrumb)
7. Verify you return to the approvals list

**Verify:** Two-level pattern works — preview in panel, full detail in workspace, back navigation.

---

## V2-10: Portfolio Approvals — CR Routing

**Role:** Project Lead (Priya Sharma), then Controller (Anna Meier)

1. Switch to **Priya Sharma**
2. Open Project Workbench, select a project, go to Forecast & Planning
3. Start and complete the Monthly Review wizard (Phase 1-5), creating at least one CR
4. Switch to **Anna Meier** (Controller)
5. Go to Portfolio Overview → Approvals tab
6. Verify the CR created by Priya appears in the pending approvals list
7. Verify non-resource CRs (e.g., external cost changes) route directly to the controller (skip CC Owner)

**Verify:** CRs created through the wizard are properly persisted and appear in the correct approver's queue.

---

## V2-11: Portfolio Intake — Two-Level Detail

**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview → Intake Queue tab

1. Click the **Intake Queue** tab
2. Click a pending project
3. **Level 1 — Side panel:** Verify quick preview shows project name, LoB, PL, budget estimate, dates, type, and "Open Full Detail" button
4. Click **"Open Full Detail"**
5. **Level 2 — Full workspace:** Verify:
   - Breadcrumb: "CRETA > Portfolio Overview > Intake > [Project Name]"
   - Resource plan table (roles × months with hours)
   - External cost plan (categories × months)
   - Budget summary (internal + external totals, CapEx/OpEx)
   - Action buttons: Approve / Reject / Send Back
6. Navigate back to the intake list

**Verify:** Full detail workspace shows resource plan, external cost plan, and budget breakdown.

---

## V2-12: Workbench — External Cost Procurement Statuses

**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench → Forecast & Planning tab

1. Select a project with external costs (e.g., **Predictive Maintenance PoC**)
2. Go to the **Forecast & Planning** tab
3. Find the external cost rows in the forecast grid
4. Verify each external cost line has a **Status column** with color-coded badges:
   - Planned (neutral)
   - Ordered/Obligo (blue/indigo)
   - Goods Received (amber)
   - Invoiced (green)
   - Accrual (purple)
   - Open (orange)
5. Verify **PO Number** and **Vendor** columns are visible for relevant rows
6. Verify a summary bar above the external costs shows aggregated amounts by status

**Verify:** Procurement lifecycle statuses display with color-coded badges, PO/vendor info is visible.

---

## V2-13: Workbench — Collapsible Yearly View

**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench → Forecast & Planning tab

1. Select a multi-year project
2. View the forecast grid
3. Verify **2026 (current year)** months are expanded (Jan–Dec visible)
4. Verify **2025 and earlier** are collapsed into single summary columns showing yearly totals
5. Click the **expand chevron** on a collapsed year (e.g., 2025)
6. Verify it expands to show all 12 months for that year
7. Click the chevron again — verify it collapses back to the yearly summary
8. Verify **row labels** (cost categories) are **sticky** — they remain visible when scrolling horizontally
9. Verify the **month/year headers** are also sticky during vertical scroll

**Verify:** Current year expanded, other years collapsed, expand/collapse toggles work, sticky headers.

---

## V2-14: Workbench — Internal Resources as Euros

**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench → Forecast & Planning tab

1. Select a project with internal resource allocations
2. View the internal resource rows in the forecast grid
3. Verify each cell shows **hours AND euro equivalent**:
   - Primary: hours (e.g., "120 hrs")
   - Secondary: euro value (e.g., "€14.400,00") in smaller/muted text
4. Verify **totals** sum both hours and euros independently
5. Verify euro values use **European formatting** (dot for thousands, comma for decimals)

**Verify:** Dual display of hours + EUR, proper European number formatting.

---

## V2-15: Workbench — Actuals Line Stops at Current Month

**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench → Overview tab

1. Select a project and go to the **Overview** tab
2. View the project trajectory chart
3. Verify the **Actuals line** ends at the last month with actual data (should be around Feb 2026)
4. Verify there are **no zero data points** extending into future months
5. Verify Baseline and Forecast lines continue into the future

**Verify:** Actuals series terminates cleanly at the last month with data.

---

## V2-16: Workbench — Confirmed CRs in Data

**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench → Overview tab + Change History tab

1. Select **Predictive Maintenance PoC** (or another project with confirmed CRs)
2. Go to **Overview** tab and check the 3-point comparison (Baseline vs Current Forecast vs Actuals)
3. Verify Baseline ≠ Current Forecast — the difference should reflect confirmed CR impacts
4. Go to **Change History** tab
5. Verify confirmed CRs are listed with "Approved" status
6. Expand a confirmed CR — verify the change details show field, old value, new value, delta
7. Cross-check: the budget delta from confirmed CRs should approximately match the Baseline-to-Forecast difference in the overview

**Verify:** Confirmed CRs are reflected in forecast tables, and the numbers are consistent.

---

## V2-17: Workbench — Monthly Review Formatting

**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench → Forecast & Planning → Start Monthly Review

1. Start the Monthly Review on a project
2. In **Phase 1 (Retrospective)**: verify hours and EUR values are both shown, European format
3. In **Phase 3 (Forecast Entry)**:
   - Verify **past month cells are read-only** (greyed out, not editable)
   - Verify **current month and future months** are editable
   - Verify only recent 4 past months are expanded; older months collapsed into yearly summaries
4. Edit a future month value — verify the change highlights
5. Complete the review through Phase 5

**Verify:** Hours + EUR display, past-month read-only, future-only editing, collapsed history.

---

## V2-18: Simulator — Delay/Accelerate Fix

**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Create a new scenario
2. Add a **Delay** action on a project (e.g., delay by 3 months)
3. Verify in the impact view:
   - Budget is **shifted forward** by 3 months (months that had spend now show zero, spend appears 3 months later)
   - Project **end date extends** by 3 months
   - Total budget stays roughly the same (just shifted)
4. Remove the action and add an **Accelerate** action (e.g., accelerate by 2 months)
5. Verify budget shifts backward, project ends sooner

**Verify:** Delay shifts budget forward + extends timeline. Accelerate does the reverse.

---

## V2-19: Simulator — Pause Project

**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Create or open a scenario
2. Add a **Pause Project** action
3. Select a project and a start month
4. Verify: all budget from the specified month onward is zeroed out
5. Check the project shows as "Paused" in the impact table

**Verify:** Pause zeros out budget from the specified month forward.

---

## V2-20: Simulator — Change Resource Allocation

**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Add a **Change Resource Allocation** action
2. Select a project, a role, action type (add/remove/modify), hours, and date range
3. Verify: the budget impact reflects the change in internal resource cost (hours × rate)
4. Check per-project impact in the comparison view

**Verify:** Resource allocation changes correctly compute euro impact using rates.

---

## V2-21: Simulator — Cut by Type

**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Add a **Cut by Type** action
2. Select target type: "Project" (or "Service" or "All")
3. Enter a reduction percentage (e.g., 15%)
4. Verify: all future-month budgets for matching projects are reduced by 15%
5. Check the total budget delta matches expectations

**Verify:** Percentage reduction applied correctly to the selected type category.

---

## V2-22: Simulator — Freeze New Starts

**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Add a **Freeze New Starts** action
2. Set a cutoff month (e.g., March 2026)
3. Verify: projects that haven't started yet as of that month have their entire budget zeroed
4. Verify these projects show as "Frozen" in the impact table
5. Projects already in progress should be unaffected

**Verify:** Only not-yet-started projects are frozen; running projects are untouched.

---

## V2-23: Simulator — Rate Escalation

**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Add a **Rate Escalation** action
2. Select scope type: "Role" → select "Senior Developer"
3. Enter increase: 10%
4. Set effective from: April 2026
5. Verify: budget impact shows increased costs for all projects using Senior Developers from April onward
6. Try another scope: "Cost Center" or "Location"
7. Verify the impact changes to reflect the different scope

**Verify:** Rate escalation correctly identifies affected allocations and computes the euro impact.

---

## V2-24: Simulator — All Other Actions Work

**Goal:** Quick smoke test of all remaining action types.

1. Create a fresh scenario
2. Test each of the following actions (add, verify impact shows, remove):
   - **Cap Cost Category** — set a max spend for a cost type, verify proportional reduction
   - **Adjust Budget** — increase or decrease a project's budget
   - **Remove Project** — zero out entire project
   - **Across-the-Board Cut** — percentage cut on all projects
   - **Cut Consulting** — reduce external consulting spend
   - **Reduce LoB** — cut an entire LoB by percentage
3. After each, verify the KPI strip updates and the portfolio impact table reflects the change

**Verify:** All 13 action types work and produce visible budget impacts.

---

## V2-25: Reporting — Report Library

**Role:** Controller (Anna Meier)
**Module:** Reporting

1. Navigate to the **Reporting** module from Launchpad
2. Verify the Report Library landing view shows:
   - **Standard Reports** section with 5 report cards
   - **My Saved Views** section (may be empty initially)
3. Each report card shows: name, description, and icon
4. Verify all 5 standard reports are present:
   - Programme / Multi-Project Rollup
   - Cost Center Financial Summary
   - Vendor Spend Analysis
   - Forecast Accuracy
   - Year-over-Year Comparison

**Verify:** Library layout, all 5 reports present, card details visible.

---

## V2-26: Reporting — Programme Rollup

**Module:** Reporting → Programme / Multi-Project Rollup

1. Open the Programme Rollup report
2. Verify **filter bar** at top (LoB, project type, status, RAG, time period)
3. Verify **KPI summary row** with total baseline, forecast, actuals, variance
4. Verify **table** with columns: Project Name, LoB, Status, Baseline, Forecast, Actuals, Remaining, Variance, Variance %, RAG
5. Verify default grouping by **LoB** with subtotal rows
6. Toggle to **Chart view** — verify stacked bar chart appears
7. Apply a LoB filter — verify table and KPIs update
8. Click **Customize** — verify the configurator drawer opens

**Verify:** Data loads, filters work, chart/table toggle works, configurator accessible.

---

## V2-27: Reporting — Cost Center Financial Summary

**Module:** Reporting → Cost Center Financial Summary

1. Open the CC Financial Summary report
2. Verify **summary KPIs**: total budget for CC, total actuals, internal cost, external cost, active projects count
3. Verify **table** with: Project Name, Internal Hours, Internal Cost, External Cost, Total Cost, % of CC Budget, Status
4. Change the **cost center filter** — verify all data recalculates
5. Toggle to chart view — verify pie chart (budget distribution) or trend line
6. As **Thomas Brenner** (CC Owner): verify the report auto-filters to his cost center

**Verify:** CC-specific financial data, role-scoped defaults, chart options.

---

## V2-28: Reporting — Vendor Spend Analysis

**Module:** Reporting → Vendor Spend Analysis

1. Open the Vendor Spend report
2. Verify **table** with: Vendor Name, Total Ordered, Total Invoiced, Total Open, Total Accruals, # Projects, # POs
3. Click a **vendor row** to expand drill-down
4. Verify drill-down shows individual PO/cost line items across projects
5. Toggle to chart view — verify horizontal bar chart (top vendors by spend)
6. Apply filters (vendor, LoB, status)

**Verify:** Vendor aggregation, drill-down to POs, chart visualization, filters.

---

## V2-29: Reporting — Forecast Accuracy

**Module:** Reporting → Forecast Accuracy

1. Open the Forecast Accuracy report
2. Verify **forecast horizon** selector (e.g., 3, 6, 12 months)
3. Verify **summary KPIs**: average accuracy %, projects within 5%, projects >15% variance, bias indicator
4. Verify **table** with: Project, LoB, Forecast value, Actual, Variance, Variance %, Accuracy Rating (Green/Amber/Red badges)
5. Toggle to chart view — verify **scatter plot** with:
   - X-axis: Forecast, Y-axis: Actual
   - Diagonal reference line (perfect accuracy)
   - Points color-coded by LoB
   - Points above line = under-forecast, below = over-forecast
6. Change the forecast horizon — verify data recalculates

**Verify:** Horizon parameter works, scatter plot with diagonal reference line, accuracy badges.

---

## V2-30: Reporting — Year-over-Year Comparison

**Module:** Reporting → Year-over-Year Comparison

1. Open the YoY report
2. Verify **chart** shows 2 line series (FY2025 and FY2026), X-axis = months, Y-axis = cumulative spend
3. Toggle between **Cumulative** and **Monthly** views — verify the chart updates
4. Verify **table** with: Month, FY2026 Spend, FY2025 Spend, Delta €, Delta %, Cumulative columns
5. Apply filters (LoB, cost type)

**Verify:** Dual-year line chart, cumulative/monthly toggle, table with deltas.

---

## V2-31: Reporting — Report Configurator

**Module:** Reporting → any report

1. Open any report and click **"Customize"**
2. Verify a **right-side drawer** opens with:
   - Column visibility checkboxes
   - Sort order selection (column + direction)
3. Toggle some columns off — verify the table updates (columns disappear)
4. Change sort order — verify the table re-sorts
5. Close the configurator

**Verify:** Column visibility and sort order customization work.

---

## V2-32: Reporting — Saved Views

**Module:** Reporting

1. Open a report, apply filters, and customize columns
2. Click **"Save View"**
3. Enter a name (e.g., "My Truck Systems Budget View") and save
4. Navigate back to the Report Library
5. Verify the saved view appears in the **"My Saved Views"** section as a card
6. Click the saved view card — verify the report opens with all saved filters/columns restored
7. Right-click or use the menu on the saved view card — verify **Rename** and **Delete** options
8. Rename the view — verify the name updates
9. Delete the view — verify it disappears from the library

**Verify:** Save, load, rename, and delete of custom report views.

---

## V2-33: Reporting — Excel Export

**Module:** Reporting → any report

1. Open any report and apply some filters
2. Click **"Export"** (or "Export to Excel")
3. Verify an `.xlsx` file downloads with naming: `CRETA_[ReportName]_[YYYY-MM-DD].xlsx`
4. Open the file and verify:
   - Header row with column names
   - Data rows matching the filtered view
   - Summary/totals row
   - Report metadata (name, date, filters)
5. Repeat for at least 2 different reports to confirm export works across reports

**Verify:** Excel export produces a properly formatted file matching the on-screen view.

---

## V2-34: European Currency Formatting

**Goal:** Spot-check consistent European formatting across the app.

1. Check Portfolio KPIs: abbreviated format like `€1,2M`, `€450K`
2. Check Workbench forecast grid: detailed format like `€14.400,00`
3. Check Reporting tables: detailed format with proper separators
4. Check Simulator impact KPIs: delta format like `+€200K`, `-€1,2M`
5. Check percentage formatting: `+1,2%`, `-6,5%` (comma as decimal separator)

**Verify:** European formatting (dot for thousands, comma for decimals) used consistently everywhere.

---

## Cross-Cutting v2 Checks

- [ ] **No "CPC" anywhere** — renamed to CRETA throughout
- [ ] **Role switch → Launchpad** — every switch lands on Launchpad
- [ ] **No Launchpad KPIs** — tiles + notifications only
- [ ] **European formatting** — €, dot thousands separator, comma decimal
- [ ] **Collapsible years** — 2026 expanded, other years collapsed in all planning tables
- [ ] **Procurement badges** — color-coded status in external cost rows
- [ ] **Hours + EUR** — dual display on internal resource allocations
- [ ] **Zero console errors** — check after each scenario

---

## After All v2 Tests

1. Check for console errors one final time
2. Reset demo data: `curl -X POST http://localhost:8000/api/admin/reset-demo`
3. Take a final screenshot of the Launchpad as proof of clean state
