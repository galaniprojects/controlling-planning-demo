# CRETA Demo App — End-to-End Regression Test Plan (v3)

This document provides step-by-step instructions for a **full visual browser walkthrough** of the entire CRETA application. It covers all modules, features, data coverage, and cross-cutting concerns — reflecting the complete v3 overhaul (March 2026 demo date, new seed data, redesigned Launchpad, collapsible year columns, per-line-item CapEx/OpEx).

**Total scenarios:** 38 + data coverage checks + cross-cutting checks
**Estimated time:** ~120 minutes for full walkthrough

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
| Attila Biber | Executive | Portfolio + Simulator (read-only) |

---

## Seed Data Reference

| Entity | Count | Notes |
|--------|-------|-------|
| Projects | 32 | 4 per LoB (TBS 9, RVS 8, CIT 8, DND 7) |
| People | 50 | Full role/location/cost centre assignments |
| LoBs | 4 | TBS, RVS, CIT, DND |
| Cost Centres | 10 | Across 3 locations |
| Programmes | 4 | Digital Braking Platform, Rail Modernization, Infrastructure Optimization, Fleet Intelligence |
| Change Requests | 28 | 23 historical, 5 active at demo start |
| Pre-built Scenarios | 3 | 2 published, 1 private |
| Projects with Phase Data | 7 | 4 with full phases (4-5), 3 with partial (3) |
| Data range | 2021-06 to 2029-06 | 9 fiscal years |

---

# PART 0 — DATA COVERAGE VERIFICATION

### Scenario 0A: Historical Data Completeness
**Goal:** Verify every project has full historical data (baseline + forecast + actuals) for all elapsed months.

1. Open **Portfolio Overview** as Anna Meier
2. Expand the tree and click on **Data Center Consolidation** (completed project, 2021-06 to 2023-12)
3. Verify the project summary shows baseline, forecast, AND actuals data covering its full lifecycle
4. Navigate to **Project Workbench**, select **SAP S/4HANA Migration** (active, 2022-01 to 2026-06)
5. Go to **Forecast & Planning** tab
6. Expand all collapsed years (2022, 2023, 2024, 2025) by clicking year chevrons
7. Verify **every month** from 2022-01 through 2026-02 has all 3 data layers (baseline, forecast, actuals)
8. Verify 2026-03 (current month) has baseline and forecast, with partial actuals
9. Verify 2026-04 through 2026-06 have baseline and forecast only — no actuals

**Verify:** No gaps in historical data. Three-point comparison is valid for every elapsed month.

---

### Scenario 0B: Date Range Span (2021-2029)
**Goal:** Verify the application handles the full 9-year data range.

1. In Workbench, select **SAP S/4HANA Migration** — verify data starts in 2022
2. Check collapsible year columns: years 2022-2025 should be collapsed, 2026 expanded
3. Expand 2022 — verify months are populated
4. Go to **Reporting** > **Year-over-Year Comparison**
5. Verify FY2025 and FY2026 data is available for comparison
6. Go to **Reporting** > **Forecast Accuracy**
7. Verify accuracy can be calculated using historical actuals data
8. Open **Portfolio Overview** > **Dashboard** — verify trajectory chart shows historical data points reaching back to project start dates
9. Check a planned project like **Connected Vehicle Platform** (start: 2026-07, end: 2029-06) — verify it has forecast data extending to 2029

**Verify:** Data spans 2021-06 to 2029-06. Collapsible years work across the full range. Reports pull from full history.

---

### Scenario 0C: Actuals Cutoff Boundary
**Goal:** Verify the March 2026 demo date boundary is correctly enforced.

1. In Workbench, select **ERP Integration Phase 2** (active, red RAG)
2. Go to **Overview** tab — check the trajectory chart
3. Verify **actuals line stops at February 2026** (or shows partial March 2026 data) — does NOT extend into future months with zeros
4. Go to **Forecast & Planning** — verify:
   - Jan 2026 and Feb 2026 columns show actuals (elapsed months, tinted #fafafa background)
   - March 2026 may show partial actuals
   - April 2026 onwards shows forecast only (no actuals row data)
5. Switch to **Reporting** > **Programme Rollup** — verify YTD Actuals aggregate only through Feb/Mar 2026, not beyond

**Verify:** Actuals terminate at the demo date boundary. No zero-extension into future months.

---

### Scenario 0D: Three-Point Comparison Integrity
**Goal:** Verify Baseline vs Forecast vs Actuals tells a coherent story for projects with confirmed CRs.

1. Select **ERP Integration Phase 2** in Workbench > Overview
2. Verify the 3-point comparison: Baseline != Current Forecast (CRs have been applied)
3. Check that the delta between Baseline and Current Forecast matches the sum of approved CR impacts
4. Verify Actuals are <= Forecast for completed months (or have explained variances)
5. Select a **completed project** (e.g., Legacy System Decommission) — verify Baseline, Forecast, and Actuals are all present and Actuals == final spend

**Verify:** Three-point comparison is consistent, CR impacts flow through to forecast, completed projects have full actuals.

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

### Scenario 2: Launchpad — Three-Zone Layout
**Goal:** Verify the v3 Launchpad redesign with three-zone layout.

1. Start as Anna Meier (Controller) — should be on Launchpad
2. **Zone 1 (Header):** Verify:
   - CRETA acronym with bold blue first letters (C-R-E-T-A)
   - Personalized greeting: "Hello, Anna"
   - Role badge showing "Controller"
3. **Zone 2 (Module Tiles):** Verify:
   - 2-column grid of module tiles
   - Primary module (Portfolio Overview) has blue border
   - All 6 modules visible for Controller: Portfolio, Workbench, Capacity, Simulator, Reporting, Admin
   - No "Submit New Project" tile (Controller does not see it)
4. **Zone 3 (Pending Actions Panel):** Verify:
   - 280px panel on the right
   - Shows pending actions with urgency bars (red for urgent, gray for normal)
   - Controller sees: 2 CR pending approval + 1 project pending review + scenario published + forecast overdue info
5. No KPI cards on Launchpad (removed in v3)
6. No emoji anywhere on the page — text and Lucide icons only

**Verify:** Three-zone layout renders correctly. No KPI strip, no emojis.

---

### Scenario 3: Role Switching — Always Lands on Launchpad
**Goal:** Verify all 4 personas load the Launchpad on switch with role-appropriate content.

1. As Anna Meier, navigate to Portfolio Overview
2. Switch to **Thomas Brenner** (CC Owner)
   - Should land on **Launchpad** (NOT Capacity Management)
   - Module tiles: Portfolio, Workbench, Capacity, Reporting (no Admin, no Simulator)
   - Pending actions: 2 CR pending confirmation items (urgent)
3. Switch to **Priya Sharma** (Project Lead)
   - Should land on **Launchpad**
   - Module tiles: Portfolio, Workbench, Reporting (no Capacity, no Admin, no Simulator)
   - **"Submit New Project" tile** is visible (PL-only)
   - Pending actions: forecast overdue (urgent) + multiple CR decisions + CR feedback + project decision + forecast due
4. Switch to **Attila Biber** (Executive)
   - Should land on **Launchpad**
   - Module tiles: Portfolio, Simulator, Reporting (no Workbench, no Capacity, no Admin)
   - Pending actions: published scenario notifications
5. Switch back to **Anna Meier** — should land on Launchpad

**Verify:** Every role switch navigates to Launchpad. Each role sees different module tiles and pending actions.

---

### Scenario 4: Pending Action Deep-Linking (9 Action Types)
**Goal:** Verify each pending action type navigates to the correct destination.

**As Priya Sharma (Project Lead):**
1. Click **"Forecast Overdue"** action for ERP Integration Phase 2
   - Should navigate to Workbench with proj-erp2 selected
2. Click **"Forecast Due"** action for Sensor Data Pipeline
   - Should navigate to Workbench with proj-sensor selected
3. Click **"CR Feedback"** action (CR #27 sent back on proj-predmaint)
   - Should navigate to Workbench > Change History
4. Click **"CR Decision"** action (CR #28 approved on proj-fleet)
   - Should navigate to Workbench with proj-fleet context

**As Thomas Brenner (CC Owner):**
5. Click **"CR Pending Confirmation"** action (CR #9 for proj-erp2)
   - Should navigate to Capacity Management requests or relevant CR view

**As Anna Meier (Controller):**
6. Click **"CR Pending Approval"** action (CR #12 for proj-sap)
   - Should navigate to Portfolio Overview > Approvals tab
7. Click **"New Project Pending Review"** action (proj-autobrake)
   - Should navigate to Portfolio Overview > Intake tab

**As Attila Biber (Executive):**
8. Click **"Scenario Published"** action (Budget Pressure scenario)
   - Should navigate to What-If Simulator

**Verify:** All action types navigate to the correct module, tab, and entity.

---

### Scenario 5: Module Guide
**Role:** Any
**Module:** Any module

1. On any module page, click the **guide/book icon button** (near the page title)
2. Verify side panel (380px, content shrinks main area) opens with module manual
3. Content should include sections relevant to the current module, **referencing CRETA** (not CPC)
4. Bold text should render properly (no raw `**text**` markdown)
5. Close the panel — verify content area restores

**Verify:** Guide loads correct content, markdown renders, panel opens/closes cleanly.

---

### Scenario 6: FAQ Help Panel
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

### Scenario 7: Portfolio Dashboard — KPIs & Filtering
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview > Dashboard

1. Navigate to Portfolio Overview
2. Verify **KPI cards** at top: Baseline, Current Forecast, YTD Actuals, Plan Drift (amount + %)
3. Verify European number formatting on all KPI values (dot=thousands, comma=decimals)
4. Note the KPI values with no filters active
5. Apply a **LoB filter** (e.g., "Truck & Bus Systems")
6. Verify ALL KPI cards **recalculate** to reflect only TBS projects
7. Apply a **RAG filter** on top — verify further narrowing
8. Clear all filters — verify KPIs return to portfolio-wide totals

**Verify:** KPIs are dynamic, Plan Drift shows amount + percentage, filtering updates everything. European formatting.

---

### Scenario 8: Portfolio Dashboard — Charts & RAG Doughnut
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview > Dashboard

1. View the **RAG Doughnut Chart**
2. Hover over a segment — verify tooltip shows: color label, count, percentage
3. **Click** the Red segment — verify the portfolio tree filters to Red-only projects and KPIs recalculate
4. Click Red again — verify filter clears
5. View the **Forecast Trajectory Chart**:
   - 3 series: Baseline, Current Forecast, Actuals
   - Actuals line stops at Feb/Mar 2026 (no zero extension into future)
   - Baseline and Forecast extend into future
6. View the **Budget by LoB** chart (stacked bar)

**Verify:** RAG doughnut interactive (hover + click-to-filter), trajectory has 3 correct series, actuals terminate properly.

---

### Scenario 9: Portfolio Tree Browsing
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview > Dashboard

1. In the portfolio tree table, verify **32 projects** total across 4 LoBs
2. Expand **Truck & Bus Systems** LoB (click chevron)
3. Expand **Digital Braking Platform** program
4. Click on **ERP Integration Phase 2** project row
5. Verify right-side summary panel opens with:
   - RAG indicator (Red for this project)
   - Budget snapshot (baseline vs forecast vs actuals)
   - Timeline info
   - Forecast sparkline
   - Last CR summary
6. Close the panel, collapse the tree

**Verify:** Tree expands/collapses smoothly, 32 projects present, RAG colors show, summary panel has all data.

---

### Scenario 10: Intake Queue — Two-Level Detail
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview > Intake Queue tab

1. Click the **Intake Queue** tab
2. Verify the tab loads cleanly (no flash of Dashboard tab)
3. Click the pending project: **Autonomous Braking Prototype** (proj-autobrake)
4. **Level 1 — Side panel:** Verify quick preview with project name, LoB (TBS), PL (Priya Sharma), budget (approx. EUR 900K), dates (2026-06 to 2027-12), type (CapEx)
5. Click **"Open Full Detail"**
6. **Level 2 — Full workspace:** Verify:
   - Breadcrumb: "CRETA > Portfolio Overview > Intake > Autonomous Braking Prototype"
   - Resource plan table (roles x months with planned hours)
   - External cost plan (categories x months)
   - Budget summary (internal + external totals, CapEx/OpEx)
   - Action buttons: Approve / Reject / Send Back
7. Click **Approve**
8. Verify status updates and you return to the intake list

**Verify:** Two-level detail pattern works, resource/cost plans visible, approve action succeeds.

---

### Scenario 11: Approvals — Two-Level Detail & Actions
**Role:** Controller (Anna Meier)
**Module:** Portfolio Overview > Approvals tab

1. Click the **Approvals** tab
2. Verify pending CRs are listed (CR #12 for SAP S/4HANA Migration, CR #19 for IAM Overhaul)
3. Click **CR #19** (IAM Overhaul — external cost increase)
4. **Level 1 — Side panel:** Verify CR title, project (IAM Overhaul), requester (Andreas Frank), date, budget delta
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

### Scenario 12: Project Selection & Overview
**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench

1. Switch to **Priya Sharma** — should land on Launchpad
2. Navigate to Project Workbench
3. Verify left panel shows project list — only Priya's assigned projects:
   - ERP Integration Phase 2 (Red RAG)
   - Sensor Data Pipeline (Amber RAG)
   - Predictive Maintenance PoC (Amber RAG)
   - Fleet Portal v2 (Green RAG)
   - Autonomous Braking Prototype (pending)
4. Select **ERP Integration Phase 2**
5. Go to the **Overview** tab
6. Verify: project metadata (name, Red RAG, active status, TBS LoB, Priya Sharma PL)
7. Verify **3-point comparison** table: Baseline vs Current Forecast vs Actuals
   - Baseline != Current Forecast (reflecting confirmed CRs)
8. Verify **project trajectory chart** with actuals line **stopping at Feb 2026** (no zero extension)
9. Verify CapEx/OpEx breakdown and resource summary

**Verify:** PL sees only assigned projects (5). Overview loads, 3-point comparison shows CR impact, trajectory correct.

---

### Scenario 13: Forecast Grid — Collapsible Years & External Costs
**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench > Forecast & Planning

1. Select **ERP Integration Phase 2** (multi-year: 2024-07 to 2026-09)
2. Go to **Forecast & Planning** tab
3. Verify the forecast grid:
   - **2026 (current year)** months are expanded by default
   - **2024 and 2025** are collapsed into summary columns
   - Click expand chevron on 2025 — months appear with data
   - Click again — collapses back to yearly sum
4. Verify **year boundary borders**: heavier left border at January columns, bolded January labels
5. Verify **elapsed month tinting**: Jan 2026 and Feb 2026 have #fafafa background
6. Verify **internal resource rows** show **hours + EUR** (e.g., "120 hrs / EUR 14.400,00")
7. Verify **external cost rows** have:
   - **Status column** with color-coded procurement badges (Planned/Ordered/GR/Invoiced/Accrual/Open)
   - **PO Number** and **Vendor** columns for relevant rows
8. Verify **CapEx/OpEx tags** on individual line items (not just project-level)
9. Verify **monospace font** (IBM Plex Mono) on financial data cells
10. Verify **European number formatting**: dot for thousands, comma for decimals

**Verify:** Collapsible years with 2026 expanded, year boundaries, elapsed tinting, dual hours/EUR, procurement badges, per-line-item CapEx/OpEx, monospace font, European formatting.

---

### Scenario 14: Monthly Forecast Wizard (5 Phases)
**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench > Forecast & Planning

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
   - Edit a future month value — verify the change highlights
6. **Phase 4 — Review & Justify:**
   - Verify grouped changes summary
   - Add justification text for each group
7. **Phase 5 — Submit:**
   - Review final summary
   - Click Submit
   - Verify CRs are created (no emoji checkmarks — Lucide Check icons only)

**Verify:** All 5 phases transition, past-month read-only, suggestions pre-fill, submit creates CRs. No emojis.

---

### Scenario 15: CR Routing — End to End
**Role:** Project Lead > Controller

1. As Priya Sharma, the CRs created in Scenario 14 should now be routed
2. Switch to **Anna Meier** (Controller)
3. Go to Portfolio Overview > Approvals tab
4. Verify the CRs from Priya's submission **appear in the pending list**
5. Open one and verify the details match what was submitted

**Verify:** CRs created by PL appear in controller's approval queue.

---

### Scenario 16: Change History
**Role:** Project Lead (Priya Sharma)
**Module:** Project Workbench > Change History

1. Switch to Priya Sharma, select **ERP Integration Phase 2**
2. Click **Change History** tab
3. Verify CRs listed with various statuses (approved, pending, rejected, sent_back)
4. Verify this project has ~9 historical CRs
5. Try filters (by status, category)
6. Click a CR to expand its details
7. Verify: changes with field_changed, old_value, new_value, delta
8. Verify **confirmed CRs** have "Approved" status and their deltas match the 3-point comparison

**Verify:** CR list populated, filters work, detail expansion shows change breakdown, data consistency.

---

# PART 4 — CAPACITY MANAGEMENT

### Scenario 17: Team Heatmap & Person Detail
**Role:** Cost Center Owner (Thomas Brenner)
**Module:** Capacity Management > My Team

1. Switch to **Thomas Brenner** — land on Launchpad, then navigate to Capacity Management
2. Verify **My Team** tab is active, auto-populated with his cost centre (MUC / Application Development)
3. Check team summary cards: headcount, avg utilization, over-allocated count
4. View the **heatmap grid** (CSS grid, not Recharts) — verify color coding:
   - Blue cells for under-utilized
   - Green for normal utilization
   - Amber for high utilization
   - Red (>100%) for over-allocated — **Lena Fischer at 106%**
5. Click on **Lena Fischer** row
6. Verify bottom drawer opens with:
   - Month-by-month allocation breakdown
   - Per-project hours allocation
   - Pending requests affecting her

**Verify:** Heatmap colors correct, Lena Fischer shows over-allocation, person drill-down shows project breakdown.

---

### Scenario 18: Resource Request — Assignment Preview
**Role:** Cost Center Owner (Thomas Brenner)
**Module:** Capacity Management > Resource Requests

1. Navigate to **Resource Requests** tab
2. Verify pending requests listed
3. Click a pending request to see details
4. Click **Confirm** (or other response action: counter-propose, partial-fulfill, decline)
5. Verify **assignment preview**: available people with utilization projections
6. Select a person for assignment
7. Verify utilization impact preview (monthly projections, >100% warning if applicable)
8. Submit the response

**Verify:** Request list loads, detail works, assignment preview shows utilization impact.

---

### Scenario 19: Organization Overview
**Role:** Controller (Anna Meier)
**Module:** Capacity Management > Organization Overview

1. Switch to **Anna Meier**, navigate to Capacity Management
2. Click **Organization Overview** tab
3. Verify org summary cards (total headcount across 10 cost centres, avg utilization)
4. View the org-wide heatmap
5. Test **pivot dimensions**: by Cost Center, by Role, by LoB
6. Expand a row to see children
7. Click a row to open drill-down detail in bottom drawer

**Verify:** All 3 pivot views render, heatmap populated, drill-down works.

---

# PART 5 — WHAT-IF SIMULATOR

### Scenario 20: Open Pre-Built Scenario
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Navigate to What-If Simulator
2. Should see scenario list with:
   - **My Scenarios:** "Accelerate Digital & Data" (private)
   - **Published:** "Budget Pressure: 15% Reduction" + "Conservative: Freeze New Starts"
3. Click **"Budget Pressure: 15% Reduction"** (Published)
4. Verify workspace loads with:
   - Scenario name + Published badge
   - Description: "Targeted budget cuts to achieve 15% reduction..."
   - Applied actions list (4 actions: delay Connected Vehicle, cut consulting Sensor, remove AI/ML Lab, reduce Cloud Migration)
   - Impact dashboard: budget delta ~-EUR 502K, projects affected
5. Scroll to Portfolio Impact table
6. Click a project row — verify bottom drawer drill-down

**Verify:** Pre-built scenario loads with correct headline impact, actions listed, drill-down works.

---

### Scenario 21: Create Scenario — Delay & Accelerate
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

### Scenario 22: Scenario Actions — Project-Level
**Goal:** Test Pause, Change Resource Allocation, Adjust Budget, Remove Project.

1. Create a new scenario "Project Actions Test"
2. **Pause Project:** Select a project, set start month — verify all budget zeroed from that month, project shows "Paused"
3. Remove action. **Change Resource Allocation:** Select project, role, add/modify hours — verify euro impact using rates
4. Remove action. **Adjust Budget:** Increase/decrease a project budget — verify delta
5. Remove action. **Remove Project:** Zero out a project — verify total impact

**Verify:** Each project-level action produces correct budget impact.

---

### Scenario 23: Scenario Actions — Portfolio Rules
**Goal:** Test Cut by Type, Freeze New Starts, Cap Cost Category, Across-the-Board Cut, Cut Consulting, Reduce LoB, Rate Escalation.

1. Create a new scenario "Portfolio Rules Test"
2. **Cut by Type:** Select "Project", 15% reduction — verify matching projects reduced
3. Remove. **Freeze New Starts:** Set cutoff month — verify not-yet-started projects zeroed, running projects untouched
4. Remove. **Rate Escalation:** Scope = "Role", select "Senior Developer", 10% increase, effective April 2026 — verify increased costs for affected projects
5. Remove. Quick-test each remaining action (add, check impact, remove):
   - Across-the-Board Cut
   - Cut Consulting
   - Reduce LoB
   - Cap Cost Category

**Verify:** All portfolio rule actions work and produce visible impacts. Rate escalation correctly identifies affected allocations.

---

### Scenario 24: Compare Scenarios
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. From scenario list, click **"Compare Scenarios"**
2. "Current State" should be pinned
3. Select 2 additional scenarios (e.g., "Budget Pressure: 15% Reduction" + "Conservative: Freeze New Starts")
4. Click Compare
5. Verify comparison table:
   - Columns: Current State + selected scenarios
   - Rows: projects with budget and delta for each
   - RAG color changes highlighted

**Verify:** Comparison loads with correct columns, deltas, and RAG changes.

---

### Scenario 25: AI Advisor
**Role:** Controller (Anna Meier)
**Module:** What-If Simulator

1. Open a scenario workspace (or create new)
2. Click **"AI Advisor"**
3. Indigo panel slides in from the right
4. Type: **"Find 2M in savings"** and submit
5. Verify 3 paths appear:
   - Path A — Conservative
   - Path B — Moderate
   - Path C — Aggressive
6. Each path shows: headline numbers, approach, trade-offs
7. Click **"Apply"** on one path
8. Verify actions are added to the scenario
9. Close AI Advisor panel

**Verify:** 3 paths generated, details displayed, Apply creates grouped actions.

---

# PART 6 — REPORTING MODULE

### Scenario 26: Report Library
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

### Scenario 27: Programme / Multi-Project Rollup
**Module:** Reporting > Programme Rollup

1. Open the report
2. Verify **filter bar** (LoB, project type, status, RAG, time period)
3. Verify **KPI row** (total baseline, forecast, actuals, variance)
4. Verify **table** with: Project Name, LoB, Status, Baseline, Forecast, Actuals, Remaining, Variance, Variance %, RAG
5. Verify **collapsible year columns** in table if monthly data is shown (2026 expanded, others collapsed)
6. Verify default grouping by **LoB** with subtotal rows
7. Toggle to **Chart view** — verify stacked bar chart
8. Apply a filter — verify table and KPIs update

**Verify:** Data loads, collapsible years work in reports, filters work, chart/table toggle, grouping correct.

---

### Scenario 28: Cost Center Financial Summary
**Module:** Reporting > CC Financial Summary

1. Open the report
2. Verify **KPIs**: total CC budget, actuals, internal cost, external cost, active projects
3. Verify **table**: Project, Internal Hours, Internal Cost, External Cost, Total, % of CC Budget, Status
4. Change **cost center filter** — verify data recalculates
5. Toggle to chart view — verify pie chart or trend line
6. Switch to **Thomas Brenner** — open report — verify auto-filters to his CC (MUC / Application Development)

**Verify:** CC-specific data, role-scoped defaults, chart options.

---

### Scenario 29: Vendor Spend Analysis
**Module:** Reporting > Vendor Spend

1. Open the report
2. Verify **table**: Vendor Name, Total Ordered, Total Invoiced, Total Open, Accruals, # Projects, # POs
3. Click a vendor row — verify **drill-down** to PO line items
4. Toggle to chart view — verify horizontal bar chart (top vendors)
5. Apply filters (vendor, LoB, status)

**Verify:** Vendor aggregation, drill-down to POs, chart, filters.

---

### Scenario 30: Forecast Accuracy
**Module:** Reporting > Forecast Accuracy

1. Open the report
2. Verify **forecast horizon** selector (3, 6, 12 months)
3. Verify **KPIs**: avg accuracy %, projects within 5%, projects >15%, bias indicator
4. Verify **table**: Project, LoB, Forecast, Actual, Variance, Variance %, Accuracy Rating (Green/Amber/Red)
5. Toggle to chart — verify **scatter plot** with diagonal reference line, LoB color coding
6. Change horizon — verify data recalculates
7. Verify accuracy calculations use the **full historical data** (actuals from 2021-2026)

**Verify:** Horizon parameter, scatter plot with reference line, accuracy badges. Historical data drives calculations.

---

### Scenario 31: Year-over-Year Comparison
**Module:** Reporting > YoY Comparison

1. Open the report
2. Verify **line chart** with 2 series (FY2025, FY2026), cumulative spend
3. Toggle **Cumulative <> Monthly** — verify chart updates
4. Verify **table**: Month, FY2026 Spend, FY2025 Spend, Delta EUR, Delta %, Cumulative columns
5. Apply filters (LoB, cost type)
6. Verify FY2025 has **full 12 months of actuals** data (complete historical year)

**Verify:** Dual-year chart, cumulative/monthly toggle, table deltas. Full FY2025 historical data available.

---

### Scenario 32: Report Configurator & Saved Views
**Module:** Reporting > any report

1. Open any report, click **"Customize"**
2. Verify **right-side drawer** with column visibility checkboxes and sort order
3. Toggle columns off — verify table updates
4. Change sort order — verify table re-sorts
5. Close configurator
6. Apply some filters + customization, then click **"Save View"**
7. Enter name "My Custom View" and save
8. Return to Report Library — verify saved view card in "My Saved Views"
9. Click the saved view — verify report opens with all settings restored
10. Use the card menu — **Rename** the view — verify
11. Use the card menu — **Delete** the view — verify removal

**Verify:** Configurator works, saved views save/load/rename/delete correctly.

---

### Scenario 33: Excel Export
**Module:** Reporting > any report

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

### Scenario 34: CRUD — Add Cost Center
**Role:** Controller (Anna Meier)
**Module:** Administration

1. Navigate to Administration
2. Click **"Cost Centers"** in the entity selector
3. Verify 10 existing cost centres are listed
4. Click **"Add Cost Center"** (or + button)
5. Fill form: Name "SHG Data Analytics", select location and competence center
6. Click Create
7. Verify new cost center appears in the table

**Verify:** Create dialog works, form validates, entity appears.

---

### Scenario 35: Inline Editing — Rate Tables
**Role:** Controller (Anna Meier)
**Module:** Administration > Rate Tables

1. Click **"Rate Tables"** in the entity selector
2. Find **Senior Developer** role rates
3. Edit the hourly rate (e.g., from EUR 95 to EUR 105)
4. Verify the row highlights (amber unsaved indicator)
5. Click **Save**
6. Verify rate updates and highlight clears

**Verify:** Inline editing, change highlighting, save persists.

---

### Scenario 36: Other Admin Entities
**Role:** Controller (Anna Meier)
**Module:** Administration

1. Browse each entity type in the selector:
   - Cost Centers (10)
   - Competence Centers (4)
   - Lines of Business (4)
   - Locations (3)
   - People (50)
   - Rate Tables
   - Planning Parameters
   - Audit Log
2. For each: verify the table loads with data, columns are populated
3. For Planning Parameters: verify the form loads with current values
4. For Audit Log: verify entries are listed with timestamps and filters (~13 entries)

**Verify:** All 8 admin entity panels load correctly with data matching seed counts.

---

# PART 8 — CROSS-MODULE WORKFLOWS

### Scenario 37: Full CR Lifecycle
**Goal:** Verify end-to-end CR flow: PL submits > CC Owner confirms > Controller approves > forecast updates > notification generated.

1. As **Priya Sharma**, start a forecast cycle on a project, make changes, submit
2. Verify CR created with status "pending_cc_confirmation"
3. Switch to **Thomas Brenner** — verify pending action appears on Launchpad
4. Navigate to the CR, click **Confirm**
5. Verify CR status moves to "pending_controller_approval"
6. Switch to **Anna Meier** — verify pending action appears on Launchpad
7. Navigate to Portfolio > Approvals, click **Approve**
8. Verify CR status is "approved" and forecast values update
9. Switch back to **Priya Sharma** — verify "CR Decision" pending action on Launchpad

**Verify:** Full lifecycle works across all 3 roles with pending actions updating at each step.

---

### Scenario 38: Submit New Project (Two Entry Points)
**Goal:** Verify project submission from both Launchpad tile and Workbench header.

1. As **Priya Sharma**, on Launchpad click **"Submit New Project"** tile
2. Verify submission dialog opens with required fields
3. Cancel and navigate to **Workbench**
4. Verify a **"Submit New Project"** button is also available in the Workbench header
5. Click it — verify same dialog opens
6. Fill in project details and submit
7. Switch to **Anna Meier** — verify the new project appears in Portfolio > Intake Queue
8. Verify "New Project Pending Review" pending action on Launchpad

**Verify:** Both entry points work, submission flows to controller's intake queue.

---

# CROSS-CUTTING CHECKS

Run these checks throughout the walkthrough:

### Formatting & Display
- [ ] **European currency formatting** — `EUR 1,2M` (summary), `EUR 14.400,00` (detail), dot=thousands, comma=decimals
- [ ] **Currency deltas** — explicit `+`/`-`: `+EUR 200K`, `-EUR 1,2M`
- [ ] **Percentages** — European decimal: `+1,2%`, `-6,5%`
- [ ] **No "CPC" anywhere** — all renamed to CRETA
- [ ] **No emojis anywhere** — text and Lucide icons only throughout the entire UI
- [ ] **Monospace financial data** — IBM Plex Mono font on tabular/financial numbers

### Layout & UX
- [ ] **Side panel** — 380px fixed width, main content shrinks (not overlaid)
- [ ] **Bottom drawer** — ~40vh height, semi-transparent overlay, closes via X or overlay click
- [ ] **Loading skeletons** — appear briefly on every data fetch
- [ ] **Hover states** — slate-50 bg on table rows, pointer cursor on clickable elements
- [ ] **Responsive breadcrumb** — top bar shows correct module name on each navigation
- [ ] **Role dropdown** — shows current user name and allows switching

### v3 Global Patterns
- [ ] **Collapsible year columns** — 2026 expanded by default, other years (2021-2029) collapsed, across ALL planning tables
- [ ] **Year boundary borders** — heavier left border at January columns, bolded January labels
- [ ] **Elapsed month tinting** — Jan and Feb 2026 have #fafafa background in grids
- [ ] **Pending action reactivity** — actions update after approval/rejection actions (re-fetch on navigation)
- [ ] **Per-line-item CapEx/OpEx** — tags appear on individual resource and external cost rows, not just project-level

### Data & Behavior
- [ ] **RAG colors** — Green (#22c55e), Amber (#f59e0b), Red (#ef4444) used consistently
- [ ] **Procurement badges** — color-coded status on external cost rows
- [ ] **Hours + EUR** — dual display on internal resource allocations
- [ ] **Actuals terminate at March 2026** — actuals line/data stops at last data month, no zero extension into future
- [ ] **Full historical data** — every project has baseline + forecast + actuals for all elapsed months (2021-2026)
- [ ] **Three-point comparison** — Baseline != Forecast where CRs have been applied; Actuals match real spend
- [ ] **Confirmed CRs** — reflected in forecast tables
- [ ] **Role-based access** — each persona sees only their authorized modules and data scope
- [ ] **32 projects** — tree shows all 32 across 4 LoBs (4 completed, 3 planned, 24 active + 1 pending)

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
