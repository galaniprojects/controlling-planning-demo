# CRETA v2 — Change Specification

This document specifies all changes to be made to the demo application (currently named "CPC Demo App", repository `vision-demo-prototype`). It covers bug fixes, UX improvements, feature additions, and a new module. Use this as the authoritative implementation guide — each item has enough detail to execute without ambiguity.

**Naming convention in this document:**
- "Current build" = the v1 demo app as it exists today
- "CRETA" = the renamed application going forward
- "Spec" = the original `CPC_Demo_App_Specification.md`

---

## 0. Global Changes

### 0.1 Rename CPC → CRETA

**Scope:** Every occurrence of "CPC" or "Controlling & Planning Centre" throughout the codebase.

**Full name:** CRETA — Controlling, Reporting, Estimation, Tracking & Allocations

**What to change:**
- Application title, logo text, browser tab title
- Top bar breadcrumb root (currently "CPC" → "CRETA")
- All API documentation strings, docstrings, and comments
- Module manuals and FAQ content
- Seed data text that references the application name
- README and any documentation files
- The `demo-reset` endpoint response messages

**What NOT to change:**
- Repository name (`vision-demo-prototype`) — no need to rename
- Internal variable/class names unless they literally say "CPC" in user-facing strings

---

## 1. Launchpad

### 1.1 Notification Deep-Link Navigation

**Problem:** Clicking a notification navigates to the correct module but not to the specific entity referenced.

**Required behavior:** Clicking a notification should navigate to the exact view. The data model already supports this — notifications have `deep_link_module` and `deep_link_entity_id` fields. The frontend must use both: navigate to the module AND pass the entity ID as a query parameter (e.g., `?project=proj-005`) so the target module opens with that entity selected/focused.

**Implementation notes:**
- For Workbench notifications: open Project Workbench with the referenced project pre-selected in the left panel
- For Portfolio notifications (e.g., intake approvals): open Portfolio Overview on the relevant tab (Approvals or Intake) with the referenced item highlighted or expanded
- For Capacity notifications: open Capacity Management with the relevant cost center focused
- If the deep_link_entity_id doesn't match anything (edge case), fall back to just opening the module

### 1.2 Role Switch Always Lands on Launchpad

**Problem:** Switching persona via the role switcher sometimes lands on a specific module instead of the Launchpad.

**Required behavior:** Every role switch must navigate to the Launchpad, regardless of which module the user was previously viewing. The role switch resets navigation state.

### 1.3 Remove KPIs from Launchpad

**Problem:** The Launchpad currently shows KPI summary cards. These are redundant with Portfolio Overview and clutter the starting page.

**Required behavior:** Remove all KPI cards/widgets from the Launchpad. The Launchpad should contain only:
- Module tiles (role-filtered as before)
- Notifications panel
- "Submit New Project" action (if applicable to the role)

The Launchpad's purpose is navigation and alerts, not analytics.

---

## 2. Portfolio Overview

### 2.1 Dashboard

#### 2.1.1 Interactive RAG Doughnut Chart

**Problem:** The RAG distribution doughnut chart is static — no hover interaction, no click behavior.

**Required behavior:**
- **Hover:** Hovering over a segment shows a tooltip with the RAG color label (Green/Amber/Red) and the count and percentage of projects in that status
- **Click:** Clicking a segment filters the view to show only projects with that RAG status. This should behave as if the user had applied a RAG filter — the project list/table below updates, and the KPIs recalculate (see 2.1.4). Clicking the same segment again clears the filter. The active filter should be visually indicated (e.g., the other segments dim, or a filter chip appears).

#### 2.1.2 Forecast Trajectory Chart — Investigation Required

**Problem:** The numbers shown in the forecast trajectory chart don't match any other data in the system. It's unclear what the chart is computing or displaying.

**Action for Claude Code:** Before making any changes, investigate and document:
1. What data source does this chart pull from?
2. What does the X-axis represent (months? quarters?)?
3. What do the Y-axis values represent (cumulative spend? monthly spend? budget?)?
4. What lines/series are shown and what do they each mean?

Report findings as a comment block at the top of the chart component. Then either fix the data source so it shows meaningful data, or flag what seed data changes are needed to make the chart accurate. The chart should show cumulative budget trajectory: baseline plan vs current forecast vs actuals over time.

#### 2.1.3 Run/Change Ratio — Add Percentage Split

**Problem:** The Run/Change KPI box shows absolute values only.

**Required behavior:** Display both the absolute euro values AND the percentage split. Example format:
```
Run: €12.4M (62%)  |  Change: €7.6M (38%)
```

#### 2.1.4 Dynamic KPI Filtering

**Problem:** The summary KPI cards at the top of the dashboard remain static when filters are changed. They always show company-wide totals regardless of active filters.

**Required behavior:** All KPI cards must recalculate dynamically based on the currently active filters (LoB, status, RAG, cost center, type). When no filters are active, they show portfolio-wide totals. When filters are applied, they show the aggregated values for the filtered subset only.

This applies to: total budget, total actuals, total forecast, Run/Change split, project count, RAG distribution, and any other summary KPIs displayed.

### 2.2 Approvals

#### 2.2.1 Approvals — Drawer Preview + Detail Workspace

**Problem:** The side drawer provides too little detail for approval decisions. It's impossible to get a proper overview of what's being approved.

**Required behavior — two-level interaction pattern:**

**Level 1 — Quick Preview (right drawer, as today):**
- Keep the existing side drawer but make it a lightweight preview
- Show: CR title, requesting project, requester name, date submitted, affected cost category, total budget impact (delta), and severity/priority
- Add a prominent "Open Full Detail" button at the top of the drawer

**Level 2 — Full Detail Workspace (new):**
- Clicking "Open Full Detail" (or double-clicking the approval item in the list) opens a full-width detail view that replaces the approvals list
- Navigation: breadcrumb updates to "CRETA > Portfolio Overview > Approvals > [CR Title]"
- Content of the detail workspace:
  - **Header:** CR title, status badge, requesting project name, requester, date submitted
  - **Before/After comparison table:** Shows the affected budget lines with baseline value, current forecast value, and proposed new value. Highlight the deltas with color coding (green for decrease, red for increase)
  - **Justification section:** The text justification provided by the requester
  - **Impact summary:** Total budget delta, effect on project RAG status, effect on LoB budget totals
  - **Action buttons:** Approve / Reject / Request Changes (with comment field for Reject and Request Changes)
- Back navigation via breadcrumb or a "Back to Approvals" button

#### 2.2.2 Change Request Routing — Bug Fix

**Problem:** Change requests created by a PL (e.g., Priya Sharma) do not appear in the approval queues for the relevant approvers (Anna Meier, Thomas Brenner). CRs may not be persisted or the routing logic may be broken.

**Investigation and fix required:**
1. Verify that CRs created through the forecast wizard are actually persisted to the database (check the API endpoint and database after submission)
2. Verify the approval routing logic: which role/person should see which CRs? Current assumption: the Controller assigned to the project's LoB should see CRs for projects in that LoB
3. If CRs are persisted but not showing, fix the query that populates the approvals list
4. If CRs are not persisted, fix the submission endpoint

This is a functional bug, not a design change.

### 2.3 Intake Queue — Drawer Preview + Detail Workspace

**Problem:** The intake queue shows only topline budget and duration. This is insufficient for evaluating whether to approve a new project.

**Required behavior — same two-level pattern as Approvals (2.2.1):**

**Level 1 — Quick Preview (right drawer):**
- Project name, requesting LoB, project lead, estimated total budget, proposed start/end dates, project type
- "Open Full Detail" button

**Level 2 — Full Detail Workspace:**
- Breadcrumb: "CRETA > Portfolio Overview > Intake > [Project Name]"
- **Resource plan table:** Roles required, hours per month, for which months, mapped to cost centers. This is essentially a read-only mini version of the Project Workbench planning grid. Columns: Role, Cost Center, and then monthly columns showing planned hours. Include a total row.
- **External cost plan:** Estimated external costs by category (consulting, licenses, infrastructure, etc.) with monthly breakdown
- **Budget summary:** Total internal cost (hours × rates), total external cost, grand total, CapEx/OpEx split
- **Timeline:** Gantt-style bar or simple start/end with milestones if defined
- **Justification/business case:** The text provided during project submission
- **Action buttons:** Approve / Reject / Request Changes

---

## 3. Project Workbench

### 3.1 Actuals Line in Forecast Trajectory Chart

**Problem:** The actuals line continues at zero for future months instead of terminating at the current month.

**Required behavior:** The actuals series should end at the last month that has actual data. Do not plot zero values for months where no actuals exist yet. The line simply stops. If using a line chart, the line ends; if using an area chart, the fill ends. Future months show only the baseline and forecast lines.

### 3.2 External Cost Status Detail

**Problem:** External costs have too little variety and detail. The current build shows simple cost entries without procurement lifecycle status.

**Required behavior:** Each external cost line item must include a `status` field reflecting where it is in the procurement lifecycle. The statuses to support:

| Status | Meaning | Source (Production) |
|--------|---------|-------------------|
| **Planned** | Forecast only — no procurement action taken | Manual entry in CRETA |
| **In Basket** | Requisition created, not yet ordered | SAP MM (future integration) |
| **Ordered / Obligo** | Purchase order issued, commitment exists | SAP MM — PO data |
| **Goods Received** | Delivery confirmed, invoice pending | SAP MM — GR data |
| **Invoiced** | Invoice received and posted | SAP MM — invoice data |
| **Accrual** | Cost estimated for period, invoice not yet received | Manual or automated accrual logic |
| **Open** | PO exists but partially fulfilled | Computed: Ordered minus Invoiced |

**Data model changes:**
- Add `status` field (enum/string) to the external cost entries
- Add `po_number` (string, nullable) for PO reference
- Add `vendor` (string, nullable) for vendor name

**Display changes:**
- External cost table in the Workbench should show a Status column with color-coded badges
- Add a summary bar above the table showing aggregated amounts by status: Total Planned | Total Committed (Obligo) | Total Invoiced | Total Accruals | Total Open
- Filter capability by status

**Seed data:** Create realistic demo data showing a mix of statuses across projects. For example, in the Predictive Maintenance PoC:
- 2–3 items as "Invoiced" (past months)
- 1 item as "Ordered/Obligo" (current/near future)
- 1 item as "Accrual" (pending invoice)
- 2–3 items as "Planned" (future months)

### 3.3 Collapsible Yearly View for Planning Tables

**Problem:** The planning/forecast tables show all months flat, which creates a very wide table that's hard to navigate across multi-year projects.

**Required behavior:**
- **Default view:** The current calendar year (2026) is expanded showing all 12 months. Past years and future years are each collapsed into a single summary column showing the yearly total.
- **Expand/collapse:** Each collapsed year column has a toggle button (e.g., chevron icon) that expands it to show all 12 months. Clicking again collapses it.
- **Viewport constraint:** The table should be constrained to the viewport width. When content exceeds the viewport, the table becomes horizontally scrollable. The left-side row labels (cost category names, role names) should be sticky/frozen so they remain visible during horizontal scrolling.
- **Sticky header:** The month/year column headers should also remain visible when scrolling vertically.

This applies to all monthly planning tables in the Workbench: the budget/forecast grid, internal resource allocation grid, and external cost grid.

### 3.4 Internal Resources — Show Euro Values

**Problem:** Internal resource allocations are displayed only as hours, not as euro values.

**Required behavior:** For each internal resource row, display both hours and the euro equivalent. The euro value is calculated as: `hours × hourly_rate` where the hourly rate comes from the rate table (per role, per competence center, per effective date).

**Display approach:** Show hours as the primary value with the euro equivalent below or beside it in a secondary style (e.g., smaller text, muted color). Example:
```
120 hrs
€14,400
```

Totals/subtotals should sum both hours and euros independently.

### 3.5 Confirmed Change Requests Reflected in Tables

**Problem:** Historically confirmed change requests are not reflected in the planning tables. For example, the Predictive Maintenance PoC has a confirmed CR for ext-training in the past, but the budget table doesn't show this adjustment.

**Root cause:** Likely a seed data issue — the CRs are seeded as "confirmed" but the corresponding budget line adjustments were not applied to the seed data.

**Required fix:**
1. Audit all confirmed CRs in the seed data
2. For each confirmed CR, ensure the corresponding budget/forecast values in the affected months reflect the CR's impact (baseline + CR delta = current forecast)
3. The CR history panel in the Workbench should show these CRs, and the "Baseline" vs "Current Forecast" columns in the 3-point comparison should show the difference attributable to each CR

### 3.6 Monthly Review — Formatting

**Problem:** Hours are not shown alongside euro values in the monthly review. Euro values lack proper formatting.

**Required behavior:**
- Show hours next to euro values in the monthly review tables (same pattern as 3.4)
- Format euro values with two decimal places and thousands separator. Example: `€14,400.00` or European format `€14.400,00` — use European format (dot for thousands, comma for decimals) since this is a German company
- Apply consistently across all financial displays in the monthly review

#### 3.6.1 Phase 3 (Forecast Entry) — Future-Only Editing + Collapsed History

**Problem:** All cells are editable including past months (which shouldn't be changeable since they're forecasts). The full history is shown expanded.

**Required behavior:**
- **Editability:** Only cells for the current month and future months should be editable. Past month cells should be read-only (visually distinct — e.g., greyed out background)
- **Collapsed history:** Only the most recent 4 past months should be expanded and visible by default. Months older than that should be collapsed into yearly summary columns (same collapsible pattern as 3.3). The current month and all future months in the current year remain expanded.

### 3.7 Guide Panel — Markdown Rendering Fix

**Problem:** Various guide panels across the app show raw markdown bold markers (`**text**`) instead of rendered bold text.

**Priority:** Low

**Fix:** Audit all guide panel / module manual content for unrendered markdown. Ensure the rendering component properly converts markdown to HTML/React elements. Check all 6 module manuals and the FAQ content.

---

## 4. What-If Simulator

### 4.1 Restore Omitted Scenario Actions

The original spec defined 11 action types but only 7 were built. Implement the 4 missing ones plus the new rate escalation action:

#### 4.1.1 Pause Project

**Description:** Zero out all budget from a specified month onward for a selected project.

**Parameters:** Project, start month (from when to pause)

**Engine logic:** Set all forecast values (internal + external) to zero for the specified month and all subsequent months. The project status should visually change to "Paused" in the scenario comparison.

#### 4.1.2 Change Resource Allocation

**Description:** Add, remove, or modify role allocations for a selected project for future periods.

**Parameters:** Project, role, action (add/remove/modify), hours per month, start month, end month

**Engine logic:** Adjust the internal resource allocation for the specified role. Recalculate the euro impact using the applicable hourly rates.

#### 4.1.3 Cut by Type (Portfolio Rule)

**Description:** Reduce all projects OR all services by a flat percentage.

**Parameters:** Target type (Project / Service / All), reduction percentage

**Engine logic:** Apply the percentage reduction to all future-month budget values for items matching the selected type.

#### 4.1.4 Freeze New Starts (Portfolio Rule)

**Description:** Remove all projects that haven't started yet as of a specified month.

**Parameters:** Cutoff month

**Engine logic:** Identify all projects with a start date after the cutoff month. Zero out their entire budget. Show them as "Frozen" in the comparison view.

#### 4.1.5 Cap Cost Category (Portfolio Rule)

**Description:** Set a maximum monthly or annual spend for a specific cost type. Distribute the reduction proportionally across all projects that use that cost type.

**Parameters:** Cost type, cap amount (monthly or annual), time period

**Engine logic:** Sum the total spend across all projects for the specified cost type. If it exceeds the cap, calculate the reduction ratio and apply it proportionally across contributing projects.

### 4.2 Rate Escalation Scenarios (New Action)

**Description:** Model the impact of hourly rate increases for specific roles, cost centers, or locations.

**Parameters:**
- **Scope:** Role (e.g., "Senior Developer") OR Cost Center (e.g., "MUC App Dev") OR Location (e.g., "BUD") — user selects one scope type and one or more values within that scope
- **Increase:** Percentage (e.g., 5%)
- **Effective from:** Month/year when the increase takes effect

**Engine logic:**
1. Identify all internal resource allocations matching the scope criteria
2. For months from the effective date onward, recalculate the euro cost using the escalated rate: `new_rate = current_rate × (1 + increase_pct / 100)`
3. Aggregate the total budget impact across all affected projects
4. Show per-project impact in the comparison view

**UI:** Add as a new action type in the scenario action palette. The parameter form should have:
- Scope type dropdown (Role / Cost Center / Location)
- Multi-select for scope values (populated from reference data)
- Percentage input
- Month/year picker for effective date

### 4.3 Fix Delay/Accelerate Timeline Modeling

**Current issue (from deviations doc):** The Delay/Accelerate action is a no-op for timeline — budget stays the same regardless of delay.

**Required behavior:** When a project is delayed by N months:
1. Shift the entire remaining budget profile forward by N months
2. The project end date extends by N months
3. Monthly costs that were planned for month M now appear in month M+N
4. Months that become "empty" due to the shift show zero spend
5. Accelerate works in reverse — shift backward, project ends sooner

---

## 5. Reporting Module (New — Module 6)

### 5.1 Overview

A new module accessible from the Launchpad. This module provides cross-cutting analytical views that span multiple projects, cost centers, and time periods — reports that don't fit neatly into any single operational module.

**Access:** All roles (Controller, Executive, CC Owner, Project Lead). Reports are role-scoped: each user sees data filtered to their access level by default (PL sees their projects, CC Owner sees their cost center(s), Controller/Executive sees everything). Users can filter within their scope but not beyond it.

**Launchpad tile:** "Reporting" — position after What-If Simulator and before Administration.

### 5.2 Module Layout

**Report Library (landing view):**
- Grid or list of available reports, each as a card showing: report name, brief description, last-viewed date (if previously opened), and an icon indicating the report category
- Two sections: "Standard Reports" (Tier 1, pre-built) and "My Saved Views" (Tier 2, user-configured variants of standard reports)
- Filter/search bar to find reports by name or keyword

**Report Viewer (after selecting a report):**
- **Breadcrumb:** "CRETA > Reporting > [Report Name]"
- **Filter bar:** Top of the report, consistent with Portfolio Overview's filter pattern. Filters vary by report but common ones include: time period (date range or fiscal year picker), LoB, cost center, project type, RAG status
- **Summary KPI row:** Below the filter bar, showing 3–5 key metrics relevant to the report (e.g., total spend, variance %, project count in scope). These recalculate when filters change.
- **Main content area:** Chart and/or table depending on the report. Each report has a default visualization but users can toggle between chart and table views.
- **"Customize" button:** Opens a side panel (right drawer) for Tier 2 configuration — column selection, grouping, sort order, additional filters. See 5.4 for details.
- **"Export" button:** Exports the current view (with active filters and customizations) to Excel. See 5.5 for details.
- **"Save View" button:** Saves the current filter + customization state as a named view. See 5.4 for details.

### 5.3 Tier 1 — Standard Reports

#### 5.3.1 Programme / Multi-Project Rollup

**Purpose:** Consolidated financial view across multiple related projects.

**Use case:** A controller needs to see the combined financials for a set of projects that form a programme or initiative — something that individual project views in the Workbench can't show.

**Default view:** Table

**Columns:** Project Name, LoB, Status, Baseline Budget, Current Forecast, Actuals to Date, Remaining Forecast, Variance (Forecast vs Baseline), Variance %, RAG

**Grouping:** By LoB (default), toggleable to: by Programme (if a grouping concept exists), by Cost Center, flat list

**Summary row:** Totals across all projects in scope, showing aggregated baseline, forecast, actuals, variance

**Filters:** LoB, project type, status, RAG, time period

**Chart option:** Stacked bar chart showing baseline vs forecast vs actuals per project, sorted by variance

#### 5.3.2 Cost Center Financial Summary

**Purpose:** Total financial picture for a cost center across all projects it contributes to.

**Use case:** A CC owner wants to know: "How much total budget is flowing through my CC this year? What's my total internal vs external spend? How does that compare across projects?"

**Default view:** Table with summary header

**Summary header KPIs:** Total budget allocated to CC, total actuals, total internal cost (hours × rates), total external cost, number of active projects using this CC

**Table columns:** Project Name, Internal Hours, Internal Cost (€), External Cost (€), Total Cost (€), % of CC Budget, Status

**Filters:** Cost center (pre-set to user's CC if CC Owner role), time period, project type

**Chart option:** Pie chart showing budget distribution across projects for the selected CC; trend line showing monthly spend over time

#### 5.3.3 Vendor Spend Analysis

**Purpose:** Analyse external spending by vendor across the portfolio.

**Use case:** A controller wants to know which vendors receive the most spend, which have open commitments, and how vendor costs distribute across projects.

**Default view:** Table

**Columns:** Vendor Name, Total Ordered (Obligo), Total Invoiced, Total Open (Ordered minus Invoiced), Total Accruals, Number of Projects, Number of POs

**Drill-down:** Clicking a vendor row expands to show the individual PO/cost line items across projects

**Filters:** Vendor (search/select), time period, LoB, cost center, status (ordered/invoiced/open/accrual)

**Chart option:** Horizontal bar chart showing top 10 vendors by total spend; treemap showing vendor spend distribution

#### 5.3.4 Forecast Accuracy

**Purpose:** Retrospective analysis of how accurate past forecasts were compared to actuals.

**Use case:** A controller preparing for budget season wants to know: "How reliable are our forecasts? Which projects or LoBs consistently over- or under-forecast?"

**Default view:** Table with chart

**Columns:** Project Name, LoB, Forecast (as of N months ago), Actual, Variance (absolute), Variance %, Accuracy Rating (Green: <5%, Amber: 5–15%, Red: >15%)

**Key parameter:** "Forecast horizon" — user selects how far back to compare. Example: "Compare forecast from 6 months ago to actuals" or "Compare forecast from 12 months ago."

**Summary KPIs:** Average forecast accuracy %, number of projects within 5% accuracy, number with >15% variance, systematic bias indicator (net over-forecast vs net under-forecast)

**Chart:** Scatter plot with forecast on X-axis, actual on Y-axis, diagonal line representing perfect accuracy. Points above the line = under-forecasted, below = over-forecasted. Color-coded by LoB.

**Filters:** LoB, project type, time period, forecast horizon

#### 5.3.5 Year-over-Year Comparison

**Purpose:** Compare portfolio spending trajectory between fiscal years.

**Use case:** During planning season, controllers want to see: "Are we spending more or less than last year? Is the trajectory tracking similarly?"

**Default view:** Chart with table

**Chart:** Line chart with two (or more) series — each series represents a fiscal year. X-axis: months (Jan–Dec), Y-axis: cumulative spend. Allows visual comparison of spending pace across years.

**Table columns:** Month, FY[Current] Spend, FY[Previous] Spend, Delta (€), Delta (%), Cumulative FY[Current], Cumulative FY[Previous]

**Filters:** Fiscal years to compare (multi-select), LoB, cost center, project type, cost type (internal/external/all)

**Chart options:** Toggle between cumulative and monthly (non-cumulative) view

### 5.4 Tier 2 — Report Configurator

**Purpose:** Allow users to customize any standard report's display and save the configuration for reuse.

**Access method:** "Customize" button available in the Report Viewer for any report.

**Customization panel (right-side drawer):**
- **Columns:** Checkbox list of all available columns for the report. Users can show/hide columns. Drag-and-drop reordering.
- **Grouping:** Dropdown to select the primary grouping dimension (varies by report — e.g., LoB, Cost Center, Project Type, Status). Option for a secondary grouping.
- **Sort order:** Select column and direction (ascending/descending)
- **Additional filters:** Any filters beyond the default filter bar (e.g., filter by a specific person, by a minimum budget threshold)
- **Visualization:** Toggle between chart type options where applicable (bar, line, pie, table-only)

**Save View:**
- "Save View" button in the report viewer toolbar
- Prompts for a name (e.g., "My LoB Budget Review")
- Saved views appear in the "My Saved Views" section of the Report Library
- Saved views store: report type, all active filters, column selection, grouping, sort order, visualization choice
- Saved views are per-user (each user has their own)
- Users can rename, overwrite, or delete saved views

**Load View:**
- When opening a report, if saved views exist, they appear as tabs or a dropdown alongside the "Default" view
- Selecting a saved view applies all its stored configurations instantly

### 5.5 Export

**Scope:** Excel export for this iteration. PDF deferred.

**Behavior:**
- "Export to Excel" button in the report viewer toolbar
- Exports the current view with all active filters, column selections, and groupings applied
- The Excel file should include:
  - A header row with column names
  - All visible data rows (respecting filters)
  - A summary row at the bottom with totals
  - A metadata row or sheet noting: report name, export date, active filters
- File naming: `CRETA_[ReportName]_[YYYY-MM-DD].xlsx`

### 5.6 Seed Data Considerations

The reporting module pulls from the same underlying data as the other modules — no separate data model needed for Tier 1 reports. However, to make the reports meaningful in the demo:
- Ensure seed data spans at least 2 fiscal years (for Year-over-Year)
- Ensure there are at least 2–3 vendors with multiple POs across projects (for Vendor Spend)
- Ensure some projects share a cost center so the CC Financial Summary has interesting cross-project data (this should already be the case)
- Forecast Accuracy requires historical forecast snapshots — if these don't exist in the current data model, we need to either add a `forecast_snapshots` table that stores point-in-time copies of forecast data, or simulate this with seed data that represents what forecasts looked like N months ago

### 5.7 API Endpoints

New endpoints needed:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/reports` | List available reports (filtered by role) |
| `GET` | `/api/reports/{report_id}/data` | Fetch report data with query params for filters, grouping, sort |
| `GET` | `/api/reports/programme-rollup` | Programme rollup with filters |
| `GET` | `/api/reports/cc-financial-summary` | Cost center financial summary with filters |
| `GET` | `/api/reports/vendor-spend` | Vendor spend analysis with filters |
| `GET` | `/api/reports/forecast-accuracy` | Forecast accuracy with horizon param |
| `GET` | `/api/reports/year-over-year` | Year-over-year comparison with FY params |
| `GET` | `/api/reports/saved-views` | List user's saved views |
| `POST` | `/api/reports/saved-views` | Save a new view |
| `PUT` | `/api/reports/saved-views/{view_id}` | Update a saved view |
| `DELETE` | `/api/reports/saved-views/{view_id}` | Delete a saved view |
| `GET` | `/api/reports/{report_id}/export` | Export report data as Excel file |

---

## 6. Bug Fixes & Low-Priority Items

### 6.1 CR Routing (see 2.2.2)

Functional bug — CRs not appearing in approver queues. Investigate and fix.

### 6.2 Seed Data — Confirmed CRs (see 3.5)

Audit all confirmed CRs in seed data and ensure the corresponding budget values reflect their impact.

### 6.3 Forecast Trajectory Chart (see 2.1.2)

Investigate what the chart is actually computing. Document it. Fix or flag.

### 6.4 Guide Panel Markdown Rendering (see 3.7)

Low priority. Fix unrendered markdown bold markers in guide panels and manuals.

### 6.5 Euro Formatting Standard

Apply consistent European number formatting throughout the application:
- Thousands separator: dot (.)
- Decimal separator: comma (,)
- Two decimal places for detailed views (€14.400,00)
- No decimals for summary/KPI views where precision isn't needed (€14.400 or €14,4K)
- Always show the € symbol

---

## 7. Implementation Sequence Recommendation

Suggested order for Claude Code sessions, grouped by dependency:

**Session 1 — Global + Launchpad + Bug Fixes:**
- 0.1 (CRETA rename)
- 1.1, 1.2, 1.3 (Launchpad fixes)
- 6.1 (CR routing bug)
- 6.3 (Forecast chart investigation)
- 6.4 (Guide panel markdown)
- 6.5 (Euro formatting)

**Session 2 — Portfolio Overview:**
- 2.1.1, 2.1.2 (after investigation), 2.1.3, 2.1.4 (Dashboard improvements)
- 2.2.1, 2.2.2 (Approvals redesign)
- 2.3 (Intake queue redesign)

**Session 3 — Project Workbench:**
- 3.1 (Actuals line fix)
- 3.2 (External cost statuses — data model change first, then UI)
- 3.3 (Collapsible yearly view)
- 3.4 (Internal resources as euros)
- 3.5 (Seed data CR fix — depends on 6.2)
- 3.6, 3.6.1 (Monthly review formatting + future-only editing)

**Session 4 — What-If Simulator:**
- 4.1.1–4.1.5 (Omitted actions)
- 4.2 (Rate escalation)
- 4.3 (Fix delay/accelerate)

**Session 5 — Reporting Module:**
- 5.1–5.3 (Module structure + Tier 1 reports)
- 5.4 (Tier 2 configurator)
- 5.5 (Export)
- 5.6 (Seed data adjustments for reporting)

---

## Summary

| Category | Item Count |
|----------|-----------|
| Global changes | 1 |
| Launchpad | 3 |
| Portfolio Overview | 7 |
| Project Workbench | 8 |
| What-If Simulator | 8 |
| Reporting Module (new) | Full module — 5 standard reports + configurator + export |
| Bug fixes | 5 |
| **Total change items** | **~32 + new module** |
