# CRETA v4 — Change Specification

This document specifies all changes for the fourth iteration of the CRETA demo application. It builds on the v3 implementation (complete) and captures bugs, UX refinements, and new requirements identified during hands-on review on 20 March 2026.

**Relationship to prior versions:** This document is fully self-contained. It supersedes all prior specs where conflicts exist. No cross-references to v1, v2, or v3 specification documents are needed to implement this spec.

**Source:** Issue list compiled 20.03.2026 during application walkthrough.

---

## 1. General Changes

### GEN-01: Anonymize Real Name in Seed Data

**Type:** Seed data fix

**Problem:** The name "Atilla Biber" — a real employee — appears in the seed data. No real names should be present in the demo application.

**Required behavior:** Replace "Atilla Biber" with a fabricated name across all database tables where it appears (people, allocations, change requests, notifications, any other references). Verify no other real names remain in the seed data.

---

## 2. Project Workbench

### 2.1 Project Timeline Chart

#### WB-01: TODAY Label Not Visible in Timeline Chart

**Type:** Bug

**Module:** Project Workbench → Overview → Timeline Chart

**Problem:** The vertical viewport of the timeline chart is too small. The "TODAY" label on the red dashed line is not visible.

**Required behavior:** The chart's vertical dimensions must be sufficient to display all elements including the TODAY badge. The badge must be fully visible without scrolling.

---

#### WB-02: Timeline Chart Extends Full App Width

**Type:** Bug

**Module:** Project Workbench → Overview → Timeline Chart

**Problem:** The timeline chart's horizontal axis occupies and extends the entire application viewport width, causing the whole page to scroll horizontally.

**Required behavior:** The timeline chart must be a self-contained component with its own horizontal scroll. The total width of the application must remain unchanged. Only the chart content scrolls left/right within its container.

---

#### WB-03: Timeline Summary Strip — Unclear Time Frame

**Type:** Specification gap (now closed)

**Module:** Project Workbench → Overview → Timeline Chart → Summary Strip

**Problem:** The KPIs directly below the timeline chart (Baseline, Forecast, YTD Actuals) have no indication of what time frame they represent — lifetime, current year, or trailing 12 months.

**Required behavior:** The summary strip shows **current year** values. Label the strip explicitly (e.g., "FY 2026" or "Current Year") so there is no ambiguity. Lifetime values are already available in the 3-point comparison table on the Overview tab.

---

#### WB-04: Monthly Table Below Timeline Chart

**Type:** New requirement

**Module:** Project Workbench → Overview → Timeline Chart

**Problem:** The timeline chart provides a visual overview but there is no tabular companion showing exact per-month values.

**Required behavior:** Add a table below the timeline chart showing monthly Baseline, Forecast, and Actuals values. Structure: month columns with all three values stacked in each cell (Baseline / Forecast / Actuals). Uses the standard collapsible year column pattern — current year expanded, other years collapsed (subject to GLB-01 context-sensitive rule). The table scrolls horizontally in sync with the chart above it, with row labels frozen on the left.

---

### 2.2 Forecast & Planning

#### WB-05: Line Item Column Auto-Sizing

**Type:** UX refinement

**Module:** Project Workbench → Forecast & Planning

**Problem:** The line item label column has a fixed width that truncates long names.

**Required behavior:** The line item column auto-sizes to fit the longest label in the current view. No truncation of line item names.

---

#### WB-06: Euro Values Not Shown for Internal Resources

**Type:** Bug (never implemented)

**Module:** Project Workbench → Forecast & Planning

**Problem:** Internal resource rows show only hours. The euro equivalent is not displayed.

**Required behavior:** For each internal resource row, display the euro value alongside the hours value in every monthly cell. Format: `120h / €14.400` (hours first, then euro value using European formatting). This applies everywhere internal resources appear: FC&Planning grid, detail view grids, monthly review tables.

---

#### WB-07: Line Item Column Not Sticky During Horizontal Scroll

**Type:** Bug

**Module:** Project Workbench → Forecast & Planning

**Problem:** When scrolling the monthly columns to the right, the line item column scrolls away and is no longer visible.

**Required behavior:** The line item column remains fixed/frozen on the left. Only the value cells scroll horizontally.

---

### 2.3 Global Pattern Override: Context-Sensitive Year Expansion

#### GLB-01: Context-Sensitive Default Year Expansion

**Type:** UX refinement

**Scope:** Global — applies everywhere collapsible year columns appear (FC&Planning, timeline chart, detail views, reporting, capacity management, etc.)

**Problem:** The current rule of always expanding the current year is not optimal for all project states. For a project that hasn't started yet, the current year may be empty; for a completed project, the current year is irrelevant.

**Required behavior:** The default expanded year depends on context:
- **Running projects:** Current year expanded
- **Future projects (not yet started):** Starting year expanded
- **Past projects (completed):** Final year expanded

All other years remain collapsed. Users can still manually expand/collapse any year. This rule applies globally wherever collapsible year columns are used.

---

### 2.4 Monthly Review (Rolling Forecast)

#### WB-08: Rename "Start Monthly Review" Button

**Type:** UX refinement

**Module:** Project Workbench → Forecast & Planning

**Problem:** The button label "Start Monthly Review" does not accurately describe the workflow.

**Required behavior:** Rename the button to **"Rolling Forecast Review"**.

---

#### WB-09: Variance Explanation Shared Across Same-Role Line Items

**Type:** Bug + New requirement

**Module:** Project Workbench → Forecast & Planning → Monthly Review Phase 1

**Problem (bug):** When two line items with the same role are flagged for variance explanation in Phase 1, the variance explanation text populates both boxes with identical text. Each line item should have its own independent explanation field.

**Problem (new requirement):** Line items show generic role names (e.g., "Senior Developer") rather than the names of employees allocated to those roles. Since multiple people can hold the same role on a project, generic names make it impossible to distinguish which allocation is which.

**Required behavior:**
- Each flagged line item gets its own independent variance explanation text field, even when two line items share the same role.
- Line items display the **employee name** alongside the role name (e.g., "Senior Developer — Max Richter"). The employee name comes from the resource allocation data in the seed data. Where a role has no named person assigned, fall back to the generic role name.

---

#### WB-10: Phase 3 Crash

**Type:** Bug (critical)

**Module:** Project Workbench → Forecast & Planning → Monthly Review Phase 3

**Problem:** Navigating to Phase 3 of the monthly review crashes the application. The user must refresh the browser and restart the review from Phase 1.

**Required behavior:** Phase 3 (forecast editing) must load without errors. Investigate the root cause — likely a missing null check, an undefined data reference, or a rendering issue in the editable grid.

---

### 2.5 Change History

#### WB-11: Change History Items Incoherent

**Type:** Bug (display) + Seed data fix

**Module:** Project Workbench → Change History

**Problem (display):** Change history items do not show changes in a human-readable, structured way. The fields shown as "changed" appear random and don't correspond to meaningful planning changes.

**Problem (seed data):** The CR seed data contains changes that don't match the actual baseline/forecast data. Changed values in CRs must be reflected in the underlying project data and vice versa.

**Required behavior:**

1. **Display format:** Each CR in the Change History must be shown as a tabular before/after comparison using the Detail View Pattern grid. For quantitative changes (resource hours, external costs), the grid shows affected line items with their monthly values — old value and new value per cell, with deltas highlighted. Example: "Senior Engineer — Jul: 40h → 55h, Aug: 40h → 55h, Sep: 40h → 55h". For qualitative changes (scope extension, timeline shift, etc.), the CR shows a description field only — no fake field-level changes.

2. **Seed data consistency:** Every CR in the seed data must have changes that are traceable in the project's financial data. If a CR says "Senior Engineer hours increased from 40 to 55 in Jul–Sep," then the project's baseline must show 40h and the forecast must show 55h for those months. No CRs with random or placeholder field changes.

---

### 2.6 Submit New Project

#### WB-12: Remove Project-Level CapEx/OpEx Toggle from Submission Form

**Type:** Bug (form not updated to match data model)

**Module:** Project Workbench → Submit New Project

**Problem:** The project submission form still has a binary CapEx/OpEx selector at the project level. Since CapEx/OpEx classification is now per-line-item, a project can contain a mix of both. The project-level toggle is incorrect.

**Required behavior:** Remove the CapEx/OpEx field from the initial project submission screen. CapEx/OpEx classification is handled at the line-item level in the resource and external cost planning grids.

---

#### WB-13: Submit for Approval Does Not Work

**Type:** Bug (critical)

**Module:** Project Workbench → Submit New Project

**Problem:** Clicking "Submit for Approval" on a new project submission does not work. The project does not appear in the Intake Queue for controller review.

**Required behavior:** Submitting a new project must: (a) persist the project with status "Pending Approval", (b) add it to the Portfolio Overview → Intake Queue, (c) generate a pending action for the Controller. Investigate whether this shares a root cause with the intake approval bug (PO-08) — the entire intake pipeline may be broken.

---

## 3. Portfolio Overview

### 3.1 Dashboard

#### PO-01: Dashboard KPIs — Unclear Time Frame + Missing Lifetime View

**Type:** Specification gap (now closed) + New requirement

**Module:** Portfolio Overview → Dashboard

**Problem:** The dashboard KPI tiles have no indication of what time frame they represent. Users cannot tell whether they are looking at current year, lifetime, or trailing 12 months.

**Required behavior:**

1. **Top KPI row — Current Year:** The existing KPI tiles (total forecast, total actuals YTD, total baseline, plan drift, Run/Change split, CapEx/OpEx split) remain unchanged in content. Scope them to the **current fiscal year** and label the row explicitly (e.g., "FY 2026"). The KPIs themselves are not changed — only the time frame scoping and labelling are added.

2. **Lifetime summary section — below the main KPIs:** Add a secondary, more compact row or card showing portfolio-wide lifetime totals: total baseline (lifetime), total forecast-at-completion (lifetime), total actuals (lifetime), and number of active projects. This section is visually subordinate to the CY KPIs — smaller text, lighter styling — so it provides context without competing for attention.

3. **Filter reactivity:** Both the CY KPI row and the lifetime summary must recalculate dynamically when dashboard filters are applied (LoB, status, RAG, cost center, type).

---

#### PO-02: "Budget by LoB" Chart — Rename and Redesign

**Type:** UX refinement

**Module:** Portfolio Overview → Dashboard → Charts

**Problem:** The chart is titled "Budget by LoB" but there is no concept of "budget" in CRETA — the system works with baselines and forecasts. It's also unclear what the bars represent (baselines? forecasts? actuals?).

**Required behavior:** Rename the chart to **"Forecast by Line of Business"** (or similar — no "budget" terminology). Redesign as a grouped bar chart scoped to the **current fiscal year**: each LoB gets a forecast bar (primary, full colour) with a baseline bar rendered smaller and in a muted/lighter colour inside or alongside the forecast bar. This immediately communicates whether each LoB is tracking above or below its baseline. The chart must react to active dashboard filters.

---

#### PO-03: Project Summary Pane Should Close on Workbench Navigation

**Type:** UX refinement

**Module:** Portfolio Overview → Dashboard → Project Summary Panel

**Problem:** When viewing a project's slide-in summary panel and clicking "Open in Workbench," the summary pane remains open after navigating to the Project Workbench.

**Required behavior:** Clicking "Open in Workbench" must automatically close/dismiss the summary panel before or during navigation to the Project Workbench. The user should arrive at the Workbench with a clean view.

---

#### PO-04: Portfolio Table Column Rearrangement — CY/PY Clusters

**Type:** New requirement

**Module:** Portfolio Overview → Dashboard → Portfolio Table

**Problem:** The project table shows a single set of financial columns without distinguishing between current year and prior year data.

**Required behavior:** Rearrange the table columns into two financial clusters separated by the timeline column:

- **Cluster 1 — Current Year:** Baseline CY, Forecast CY, Actuals YTD
- **Timeline column** (visual separator between clusters)
- **Cluster 2 — Previous Years (combined):** Baseline PY, Forecast PY, Actuals PY

All other existing columns (name, LoB, type, status, RAG, etc.) remain in their current positions to the left. The PY columns aggregate all prior fiscal years into a single value per metric. Column headers should clearly label "CY" and "PY" groupings.

---

#### PO-05: KPI Tiles — Square Shape, Single Row

**Type:** UX refinement

**Module:** Portfolio Overview → Dashboard → KPI Tiles

**Problem:** The KPI tiles are rectangular and span multiple rows, taking up more vertical space than necessary.

**Required behavior:** Reshape all KPI tiles to **square proportions**. Each tile displays a single KPI. All tiles must fit in a single horizontal row. Adjust font sizes and internal padding as needed to maintain readability within the square format.

---

### 3.2 Intake Queue

#### PO-06: Euro Values Missing in Intake Detail for Internal Resources

**Type:** Bug (same root cause as WB-06)

**Module:** Portfolio Overview → Intake Queue → Detail View

**Problem:** Internal resource rows in the Intake detail view show only hours. The euro equivalent is not displayed.

**Required behavior:** Same as WB-06 — display euro values alongside hours for all internal resource line items in the Intake detail view. Format: `120h / €14.400`.

---

#### PO-07: "Send Back" Workflow — Redesign

**Type:** New requirement (replaces current message-only behaviour)

**Module:** Portfolio Overview → Intake Queue

**Problem:** The current "Send Back" action only sends a text message to the submitting PL. After sending back, the project vanishes from the Intake Queue entirely and cannot be found anywhere in the system.

**Required behavior — full structured feedback loop:**

1. **Controller clicks "Send Back":** The project opens in its full detail view with all value cells editable (same grid as the Intake detail workspace, but in edit mode). The controller can modify resource hours, external costs, and other planning values directly. A comments field is available for each change or as a general note.

2. **Controller confirms send-back:** After making changes and/or adding comments, the controller confirms the send-back. The project remains visible in the Intake Queue with status **"Changes Requested"** (not removed from the queue).

3. **PL notification:** The submitting Project Lead (e.g., Priya Sharma) receives a pending action notification that the project has suggested changes. The notification deep-links to the project.

4. **PL reviews and resubmits:** The PL opens the project submission, sees the controller's suggested changes and comments, can accept/modify them, and resubmits. Upon resubmission the project returns to **"Pending Approval"** status in the Intake Queue.

**Intake Queue status lifecycle:**
- **Pending Approval** — initial submission, awaiting controller review
- **Changes Requested** — controller sent back with edits/comments, awaiting PL revision
- **Pending Approval** (again) — PL resubmitted after addressing feedback

---

#### PO-08: Approving Project Sets Incorrect Baseline

**Type:** Bug

**Module:** Portfolio Overview → Intake Queue → Approval

**Problem:** Approving a project in the Intake Queue correctly adds it to the active portfolio, but the baseline value changes to €1.8M regardless of what was submitted. The baseline should exactly match the submitted resource and external cost plan.

**Required behavior:** When a project is approved, the baseline must be generated from the approved submission's resource plan (hours × rates) and external cost plan. No hardcoded or default values. The baseline values must match the detail-level data visible in the Intake detail view at the time of approval.

---

### 3.3 Approvals

#### PO-09: Rename "Approvals" Tab to "CR Approvals"

**Type:** UX refinement

**Module:** Portfolio Overview → Approvals

**Problem:** The tab is labelled "Approvals" which is ambiguous — it could refer to project intake approvals or change request approvals.

**Required behavior:** Rename the tab to **"CR Approvals"** to clearly distinguish it from the Intake Queue.

---

#### PO-10: CR Approvals Not Shown in Tabular Detail View Format

**Type:** Bug (same root cause as WB-11)

**Module:** Portfolio Overview → CR Approvals → Detail View

**Problem:** Change requests in the Approvals detail view are not displayed in the same structured tabular format used elsewhere. CRs should show line items matching the origin project with before/after values in monthly columns, but instead they appear in an inconsistent, unstructured format.

**Required behavior:** Same as WB-11 — CRs must be displayed using the Detail View Pattern grid. Affected line items shown with monthly columns, old value and new value per cell, deltas highlighted. The display must be consistent with how roles and plans appear in the Project Workbench FC&Planning grid and Change History detail.

---

## 4. Capacity Management

### 4.1 Organization Overview

#### CM-01: First Column Auto-Sizing

**Type:** UX refinement

**Module:** Capacity Management → Organization Overview

**Problem:** The first column (row labels — role names, cost center names, etc.) is too narrow, truncating text.

**Required behavior:** The first column auto-sizes to fit the longest label in the current view. Same pattern as WB-05.

---

#### CM-02: Add Collapsible Year Columns to Organization Overview

**Type:** New requirement

**Module:** Capacity Management → Organization Overview

**Problem:** The Organization Overview only shows a limited time window. Historical and future months are not accessible. This is inconsistent with the collapsible year column pattern used elsewhere in the application.

**Required behavior:** Apply the standard collapsible year column pattern to the Organization Overview grid. Historical years and future years are available as collapsed columns that can be expanded. The context-sensitive default expansion rule (GLB-01) applies — for current capacity views, the current year should be expanded by default.

---

#### CM-03: Cell Drill-Down Drawer — Replace Content

**Type:** UX refinement

**Module:** Capacity Management → Organization Overview → Cell Drawer

**Problem:** Clicking a cell in the Organization Overview opens a bottom drawer with near-irrelevant information.

**Required behavior:** Replace the drawer content with actionable capacity data:
- **Allocated hours** for the selected cell (role × month, or cost center × month, depending on the active view)
- **Total available hours** for the same scope
- **Delta** (available minus allocated), with colour coding: green for under-allocated, red for over-allocated

---

#### CM-04: Cell Drill-Down Drawer — Person-Level Detail

**Type:** New requirement

**Module:** Capacity Management → Organization Overview → Cell Drawer

**Problem:** The drawer does not show which people are working on which projects for the selected cell.

**Required behavior:** Below the summary numbers (CM-03), the drawer shows a list of projects contributing to the allocated hours. Each project entry displays: project name (as a clickable link that opens the Project Workbench) and allocated hours for that project in the selected month. To the left of each project name, a small expand arrow allows drilling down to see the **names of employees** allocated to that project for the selected role/cost center. 

Example: User is on the "View By Role" overview and clicks the "Senior Developer" cell for Jul 2026. The drawer shows:
- Allocated: 280h / Available: 320h / Delta: +40h
- ERP Integration Phase 2 — 160h
  - ▸ (click to expand: Max Richter, Lisa Hoffmann)
- Predictive Maintenance PoC — 120h
  - ▸ (click to expand: Andrei Kovacs)

The project name remains a link to open the Project Workbench.

---

### 4.2 My Team

#### CM-05: My Team as Default View

**Type:** UX refinement

**Module:** Capacity Management

**Problem:** The Capacity Management module opens to the Organization Overview by default. For most users (particularly CC Owners), their own team is the primary working view.

**Required behavior:** The Capacity Management module opens to **My Team** as the default view.

---

#### CM-06: Utilization Percentage — Definition and Configurable Standard Hours

**Type:** Specification gap (now closed) + New requirement

**Module:** Capacity Management → My Team

**Problem:** The utilization percentages displayed in My Team have no clear definition. It is not documented what the denominator is (160h/month? actual working days? something else?). If the calculation is wrong, the displayed percentages are misleading.

**Required behavior:**

1. **Utilization formula:** `Utilization % = (Allocated Hours / Available Hours) × 100` per person per month.

2. **Available hours — configurable:** The standard available hours per month must be configurable in **Administration** (new setting — see ADM section). Default value: 160h/month. The setting should support configuration per **location** (e.g., Munich 160h, Budapest 168h) to account for different working calendars and public holiday profiles. If no location-specific value is set, the global default applies.

3. **Display:** The utilization percentage must be shown alongside the absolute hours (e.g., "128h / 160h — 80%"). Colour coding: green for healthy utilization (e.g., 70–90%), amber for under-utilization (<70%) or approaching capacity (90–100%), red for over-allocation (>100%).

---


## 5. What-If Simulator

#### SIM-01: Missing Scenario Action Types

**Type:** Bug (never implemented)

**Module:** What-If Simulator → Scenario Actions

**Problem:** Several scenario action types that were previously specified were never implemented. The simulator lacks sufficient action variety to model realistic portfolio scenarios.

**Required behavior:** Implement the following missing action types:

- **Pause Project** — zero out all budget from a specified month onward for a selected project. Parameters: project, start month. Engine logic: set all forecast values (internal + external) to zero for the specified month and all subsequent months. Project status changes to "Paused" in the scenario comparison.
- **Change Resource Allocation** — add, remove, or modify role allocations for a selected project for future periods. Parameters: project, role, action (add/remove/modify), hours per month, start month, end month. Engine logic: adjust the internal resource allocation for the specified role, recalculate euro impact using applicable hourly rates.
- **Cut by Type (Portfolio Rule)** — reduce all projects OR all services by a flat percentage. Parameters: target type (Project/Service/All), reduction percentage. Engine logic: apply the percentage reduction to all future-month budget values for items matching the selected type.
- **Freeze New Starts (Portfolio Rule)** — remove all projects that haven't started yet as of a specified month. Parameters: cutoff month. Engine logic: identify all projects with start date after cutoff, zero out their entire budget, show them as "Frozen" in comparison view.
- **Cap Cost Category (Portfolio Rule)** — set a maximum monthly or annual spend for a specific cost type, distributed proportionally across all projects using that cost type. Parameters: cost type, cap amount (monthly or annual), time period. Engine logic: sum total spend across all projects for specified cost type, if exceeding cap calculate reduction ratio and apply proportionally.

---

#### SIM-02: Rate Escalation Action Missing

**Type:** Bug (never implemented)

**Module:** What-If Simulator → Scenario Actions

**Problem:** The rate escalation action type was previously specified but never implemented.

**Required behavior:** Implement rate escalation as a scenario action type.

**Parameters:**
- **Scope:** Role (e.g., "Senior Developer") OR Cost Center (e.g., "MUC App Dev") OR Location (e.g., "BUD") — user selects one scope type and one or more values within that scope
- **Increase:** Percentage (e.g., 5%)
- **Effective from:** Month/year when the increase takes effect

**Engine logic:**
1. Identify all internal resource allocations matching the scope criteria
2. For months from the effective date onward, recalculate euro cost using escalated rate: `new_rate = current_rate × (1 + increase_pct / 100)`
3. Aggregate the total budget impact across all affected projects
4. Show per-project impact in the comparison view

**UI:** New action type in the scenario action palette. Parameter form: scope type dropdown (Role / Cost Center / Location), multi-select for scope values (populated from reference data), percentage input, month/year picker for effective date.

---

#### SIM-03: Portfolio Impact View — Time Frame Breakdown

**Type:** New requirement

**Module:** What-If Simulator → Portfolio Impact / Comparison View

**Problem:** The portfolio impact view shows only a generic total budget and budget change KPI with no time frame context. It is impossible to understand the impact on different planning horizons.

**Required behavior:** The portfolio impact view must show a time-frame-segmented comparison between the current forecast and the scenario forecast:

- **CY FC** / **CY Scenario FC** (current year — labelled "CY")
- **NY FC** / **NY Scenario FC** (next year — labelled with full 4-digit year, e.g., "2027")
- **Subsequent years** — each labelled with full 4-digit year (e.g., "2028", "2029")
- **Overall** (lifetime totals)

Naming convention: only the current year uses the "CY" abbreviation. All future years are shown with their full 4-digit year. Each time segment shows: current forecast, scenario forecast, and delta.

---

#### SIM-04: Year Selector for Scenario Actions

**Type:** New requirement

**Module:** What-If Simulator → Scenario Actions

**Problem:** There is no way to scope scenario actions to a specific year. Actions apply globally without time frame control.

**Required behavior:** Add a year selector to the scenario action panel. When configuring an action, the user can select which year(s) the action applies to. This works in conjunction with each action's existing month parameters — the year selector sets the broader scope, and month parameters provide precision within that scope.

---

## 6. Reporting

### 6.1 Programme / Multiproject Rollup

#### RPT-01: Year Selector Limited to FY 2024–2027

**Type:** Bug

**Module:** Reporting → Programme / Multiproject Rollup

**Problem:** Only fiscal years 2024–2027 are selectable in the year filter. The seed data spans 2021–2029, so the full date range should be available.

**Required behavior:** The year selector must dynamically populate from the actual data range present in the system. All years with data should be selectable.

---

#### RPT-02: Clearing Year Filter Does Not Show Lifetime Totals

**Type:** Bug

**Module:** Reporting → Programme / Multiproject Rollup

**Problem:** Clearing the year from the filter appears to maintain the FY 2026 numbers instead of summarising the whole lifetime of each project.

**Required behavior:** When the year filter is cleared (no year selected), the report must show lifetime aggregates for each project — summing across all available years.

---

#### RPT-03: Custom Project Groupings

**Type:** New requirement

**Module:** Reporting → Programme / Multiproject Rollup

**Problem:** There is no way to build ad-hoc groupings of projects for analysis. Users can only view data by existing hierarchies (LoB, programme). Sometimes a user needs to pick and choose specific projects to look at together.

**Required behavior:** Add a "Custom Group" mode to the Programme Rollup report. The user can: (a) multi-select specific projects from a list or search, (b) view the rollup data for just those selected projects, (c) optionally save the selection as a named group for reuse. The custom group acts as an ad-hoc filter — the report structure and columns remain the same, only the project scope changes.

---

### 6.2 Cost Center Financial Summary

#### RPT-04: Cost Center as First Column

**Type:** UX refinement

**Module:** Reporting → Cost Center Financial Summary

**Problem:** The cost center is not available as the first column in the report, making it harder to scan by cost center.

**Required behavior:** The cost center name must be the first column in the report table.

---

### 6.3 Vendor Spend Analysis

#### RPT-05: Add Expense Cost Type Filter and Column

**Type:** New requirement

**Module:** Reporting → Vendor Spend Analysis

**Problem:** There is no way to filter or view vendor spend by expense cost type.

**Required behavior:** Add an "Expense Cost Type" column to the report table and a corresponding filter dropdown in the filter bar. The expense cost types should be populated from the existing cost type reference data.

---

### 6.4 Forecast Accuracy

#### RPT-06: Forecast Accuracy Report Not Populated

**Type:** Bug

**Module:** Reporting → Forecast Accuracy

**Problem:** The Forecast Accuracy report shows no data. The report appears empty.

**Required behavior:** Investigate and fix. The report requires historical forecast snapshots to compare against actuals. If the data model lacks a forecast snapshot mechanism, one must be added (a table storing point-in-time copies of forecast data). The seed data must include historical forecast snapshots so the report has data to display. At minimum, the demo should show forecast accuracy for the past 6–12 months.

---

### 6.5 Year-over-Year Comparison

#### RPT-07: Add LoB and Project Columns

**Type:** New requirement

**Module:** Reporting → Year-over-Year Comparison

**Problem:** The YoY comparison report has no columns for Line of Business or Project, making it impossible to see which entity the comparison belongs to.

**Required behavior:** Add LoB and Project as columns in the report table.

---

#### RPT-08: Month Column Should Be Optional

**Type:** New requirement

**Module:** Reporting → Year-over-Year Comparison

**Problem:** The report currently shows month-level detail by default. In the primary use case, the user wants to see an annual comparison between two years without monthly breakdown.

**Required behavior:** The month column is hidden by default. The report initially shows an annual comparison between the two selected years (one row per project or LoB, with Year A total and Year B total side by side). Add a toggle to "Show monthly detail" which, when enabled, expands each row to show per-month values. Add an additional filter allowing the user to select which specific months to include when monthly detail is shown.

---

## 7. Administration

### 7.1 Dynamic Grouping Hierarchy

#### ADM-01: Configurable Portfolio Hierarchy

**Type:** New requirement (major feature)

**Module:** Administration

**Problem:** The portfolio hierarchy is hardcoded as LoB → Programme/Initiative → Project/Service. Lines of Business is a relatively new organizational concept at KB and may not persist. Users need the ability to define their own grouping structures without code changes.

**Required behavior:**

1. **Entity type creation:** In Administration, users can create new entity types (e.g., "Department", "Division", "Value Stream", "Product Area"). Each entity type has a name and can contain any number of named entities (e.g., Department: "Sales IT", "Manufacturing IT", "Corporate IT").

2. **Hierarchy definition:** Users define a tree structure by specifying parent-child relationships between entity types. The tree always terminates at the Project/Service level — projects are always the leaf nodes. Any number of levels above Project are configurable. Examples:
   - Simple: Department → Project
   - Two-level: Division → Department → Project
   - Three-level: Business Unit → Division → Programme → Project
   
3. **Project assignment:** Each project must be assigned to exactly one parent entity at the lowest grouping level (single-parent, mandatory). The assignment is managed in the Administration module.

4. **Active grouping toggle:** Only one grouping scheme is active at a time, system-wide. The Administration module has a setting to select which grouping hierarchy is the active one. Switching the active hierarchy immediately propagates across all modules.

5. **Application-wide propagation:** When the active hierarchy changes, every location in CRETA that currently references LoB must dynamically reflect the new grouping structure:
   - Portfolio Overview: tree structure, filter dropdowns, chart groupings, table columns
   - Project Workbench: project metadata display
   - Capacity Management: any LoB-based views
   - Reporting: all report groupings, filters, and columns that currently reference LoB
   - What-If Simulator: any LoB-based scenario actions or impact views
   - KPI rollups: aggregation follows the active hierarchy

6. **Migration path:** The current LoB structure becomes the default grouping hierarchy on initial load. It is not removed — it becomes one of potentially several defined hierarchies, and starts as the active one.

---

### 7.2 CRUD Completeness

#### ADM-02: Cost Centers — Clarify Edit Functionality

**Type:** Specification gap

**Module:** Administration → Cost Centers

**Problem:** It is unclear what "editing" a cost center actually does. The edit functionality exists but its scope is not defined.

**Required behavior:** Editing a cost center must allow changing: cost center name, associated location, and description. It must NOT allow changing the cost center code (primary identifier). Clarify this in the UI with appropriate field labels and disabled states for non-editable fields.

---

#### ADM-03: Competence Centers — Employee Assignment

**Type:** Bug (missing functionality)

**Module:** Administration → Competence Centers

**Problem:** There is no way to adjust which employees belong to a competence center.

**Required behavior:** The Competence Center edit view must include a section showing currently assigned employees and allow: (a) adding employees to the competence center (from a searchable list of all people), (b) removing employees from the competence center. Changes take effect immediately and propagate to capacity views and rate calculations.

---

#### ADM-04: Lines of Business — Project Assignment

**Type:** Bug (missing functionality)

**Module:** Administration → Lines of Business (or whatever the active grouping hierarchy entity is)

**Problem:** There is no way to adjust which projects belong to an LoB.

**Required behavior:** The entity edit view (for any grouping hierarchy level, not just LoB) must include a section showing currently assigned child entities (projects, or lower-level groupings) and allow: (a) assigning entities to this parent, (b) removing entities from this parent. Since single-parent is enforced, assigning a project to a new parent automatically removes it from its previous parent. The UI should warn the user when this reassignment will occur.

**Note:** This functionality generalises once ADM-01 (dynamic hierarchy) is implemented — it applies to whatever grouping entity types are defined, not just LoB.

---

#### ADM-05: People — Competence Center Assignment

**Type:** Bug (missing functionality)

**Module:** Administration → People

**Problem:** There is no way to adjust which competence center a person belongs to from the People management view.

**Required behavior:** The People edit view must include a field for competence center assignment, presented as a dropdown of all available competence centers. Changing a person's competence center updates their assignment immediately and propagates to capacity views.

---

#### ADM-06: Standard Available Hours Configuration

**Type:** New requirement (referenced by CM-06)

**Module:** Administration → Planning Parameters

**Problem:** There is no way to configure the standard available hours per month used for utilization calculations in Capacity Management.

**Required behavior:** Add a "Standard Available Hours" setting in Administration under planning parameters. Structure:
- **Global default:** A single value applying system-wide (default: 160h/month)
- **Per-location overrides:** Optional overrides per location (e.g., Munich: 160h, Budapest: 168h). If a location override exists, it takes precedence over the global default for employees at that location.

The values are used by the utilization calculation in Capacity Management (CM-06).

---

## 8. Implementation & Verification

Implementation is organized into six sessions defined in the companion document `CRETA_v4_Implementation_Guide.md`. That document contains: session sequence, item-to-session mapping, per-session verification checklists, and the end-to-end verification checklist. **Claude Code must read `CRETA_v4_Implementation_Guide.md` before starting any session** to understand scope, order, and what to verify after each session.
