# CRETA v4 — Implementation Guide

This document defines the implementation session sequence, item-to-session mapping, per-session verification checklists, and the end-to-end verification checklist for the CRETA v4 changes.

**Companion document:** `CRETA_v4_Change_Specification.md` contains the full specification for every item referenced here. Read the spec for detailed problem statements and required behaviour. This guide tells you **what to implement when** and **how to verify it**.

**Approach:** Bugs are tackled first to stabilize existing functionality, then UX refinements, then new requirements. Each session ends with a verification pass — do not proceed to the next session until all checks pass.

**Important:** Plan first, then implement. Use extended thinking to produce a plan before writing any code in each session.

---

## Session 1 — Bug Fixes (Critical)

**Items:**
- GEN-01: Anonymize real name in seed data
- WB-01: TODAY label not visible in timeline chart
- WB-02: Timeline chart extends full app width
- WB-06: Euro values not shown for internal resources
- WB-07: Line item column not sticky during horizontal scroll
- WB-10: Phase 3 crash
- WB-11: Change history items incoherent (display side)
- WB-12: Remove project-level CapEx/OpEx toggle
- WB-13: Submit for approval does not work
- PO-06: Euro values missing in intake detail
- PO-08: Approving project sets incorrect baseline
- PO-10: CR approvals not shown in tabular detail view format
- SIM-01: Missing scenario action types
- SIM-02: Rate escalation action missing
- RPT-01: Year selector limited to FY 2024–2027
- RPT-02: Clearing year filter does not show lifetime totals
- RPT-06: Forecast accuracy report not populated

**Verification Checklist:**
- [ ] "Atilla Biber" replaced everywhere — search the database for the old name, confirm zero results
- [ ] Timeline chart: TODAY badge fully visible, chart scrolls independently within its container, app viewport unchanged
- [ ] FC&Planning grid: every internal resource cell shows `Xh / €Y` format. Scroll right — line item column stays fixed
- [ ] Monthly review: navigate through all 5 phases without crash. Phase 3 loads and is functional
- [ ] Change history: open a CR detail — verify it shows a tabular before/after grid with affected line items and monthly values
- [ ] Submit new project: no CapEx/OpEx toggle on form. Submit for approval — project appears in Intake Queue with "Pending Approval" status
- [ ] Intake approve: approve a project — baseline matches the submitted resource/external cost plan exactly (not €1.8M or any hardcoded value)
- [ ] CR Approvals detail: CRs display in the same tabular grid format as Change History
- [ ] Euro values visible in Intake detail for internal resources
- [ ] What-If Simulator: all 12 action types available in the action palette (7 existing + 5 restored). Rate escalation action available with scope/percentage/effective-date parameters
- [ ] Programme Rollup: year selector shows full data range (2021–2029). Clear year filter — report shows lifetime aggregates
- [ ] Forecast Accuracy report: data populates (historical forecast snapshots exist in seed data)

---

## Session 2 — UX Refinements

**Items:**
- GLB-01: Context-sensitive default year expansion
- WB-03: Timeline summary strip — current year scoping and label
- WB-05: Line item column auto-sizing
- WB-08: Rename "Start Monthly Review" to "Rolling Forecast Review"
- CM-01: First column auto-sizing in Organization Overview
- CM-05: My Team as default Capacity Management view
- PO-02: "Budget by LoB" chart — rename and redesign
- PO-03: Project summary pane auto-close on Workbench navigation
- PO-05: KPI tiles — square shape, single row
- PO-09: Rename "Approvals" tab to "CR Approvals"
- RPT-04: Cost center as first column in CC Financial Summary

**Verification Checklist:**
- [ ] Collapsible year columns: open a running project — current year expanded. Open a future project — starting year expanded. Open a completed project — final year expanded. Verify in FC&Planning, timeline chart, and at least one report
- [ ] Timeline summary strip: labelled "FY 2026" (or equivalent), values are current-year scoped
- [ ] Line item columns auto-size to longest label in FC&Planning and Capacity Organization Overview
- [ ] Monthly review button reads "Rolling Forecast Review"
- [ ] Capacity Management opens to My Team tab by default
- [ ] Portfolio dashboard: chart renamed (no "Budget" in title), shows forecast bars with baseline inset, scoped to current year
- [ ] Click project summary → Open in Workbench → summary pane closes automatically
- [ ] KPI tiles: all square, all in one row
- [ ] Approvals tab reads "CR Approvals"
- [ ] CC Financial Summary: cost center is the first column

---

## Session 3 — New Requirements (Workbench + Portfolio + Capacity)

**Items:**
- WB-04: Monthly table below timeline chart
- WB-09: Variance explanation — independent fields + employee names
- PO-01: Dashboard KPIs — current year scoping + lifetime summary section
- PO-04: Portfolio table CY/PY column clusters
- PO-07: "Send Back" workflow redesign
- CM-02: Add collapsible year columns to Organization Overview
- CM-03: Cell drill-down drawer — replace content
- CM-04: Cell drill-down drawer — person-level detail
- CM-06: Utilization percentage definition + configurable standard hours

**Verification Checklist:**
- [ ] Monthly table below timeline chart: values stacked per cell (Baseline/Forecast/Actuals), collapsible years, scrolls in sync with chart, row labels frozen
- [ ] Monthly review Phase 1: two same-role line items flagged — each has its own independent text field. Line items show employee names alongside roles
- [ ] Portfolio dashboard KPIs: labelled "FY 2026", values are current-year scoped. Lifetime summary section visible below with lifetime totals. Apply a filter — both CY and lifetime sections recalculate
- [ ] Portfolio table: two financial clusters visible (CY and PY) separated by timeline column
- [ ] Intake Send Back flow: controller clicks Send Back → full detail opens in edit mode → controller modifies values and adds comments → confirms → project stays in Intake Queue with "Changes Requested" status → switch to PL role → PL sees notification → PL resubmits → project returns to "Pending Approval" in queue
- [ ] Organization Overview: collapsible year columns present, current year expanded by default
- [ ] Cell drill-down drawer: shows allocated hours, available hours, delta with colour coding. Projects listed with hours. Expand arrow reveals employee names. Project name links to Workbench
- [ ] Capacity My Team: utilization shows "Xh / Yh — Z%" format with colour coding

---

## Session 4 — New Requirements (Simulator + Reporting)

**Items:**
- SIM-03: Portfolio impact view — time frame breakdown
- SIM-04: Year selector for scenario actions
- RPT-03: Custom project groupings in Programme Rollup
- RPT-05: Expense cost type filter and column in Vendor Spend
- RPT-07: LoB and Project columns in YoY Comparison
- RPT-08: Month column optional with toggle and month filter in YoY Comparison

**Verification Checklist:**
- [ ] What-If Simulator impact view: shows CY FC, CY Scenario FC, 2027 FC, 2027 Scenario FC, Overall — with deltas per segment. Only CY uses abbreviation, future years use 4-digit labels
- [ ] Scenario action panel: year selector available, scopes actions correctly
- [ ] Programme Rollup: custom group mode available — can multi-select projects, view rollup for just those projects, optionally save as named group
- [ ] Vendor Spend: expense cost type column visible, filter dropdown works
- [ ] YoY Comparison: LoB and Project columns present. Month column hidden by default, toggle enables it, month filter allows selecting specific months

---

## Session 5 — Administration + Dynamic Hierarchy

**Items:**
- ADM-01: Configurable portfolio hierarchy
- ADM-02: Cost center edit — clarify functionality
- ADM-03: Competence center — employee assignment
- ADM-04: Grouping entity — project/child assignment
- ADM-05: People — competence center assignment
- ADM-06: Standard available hours configuration

**Verification Checklist:**
- [ ] Create a new entity type "Department" with 3 departments. Define hierarchy: Department → Project. Assign projects to departments
- [ ] Toggle active hierarchy from LoB to Department — verify propagation across: Portfolio Overview tree/filters/charts, Project Workbench metadata, Capacity Management views, Reporting groupings, What-If Simulator, KPI rollups
- [ ] Toggle back to LoB — everything reverts correctly
- [ ] Cost center edit: name and location editable, code field disabled
- [ ] Competence center edit: can add/remove employees
- [ ] Grouping entity edit: can assign/remove child entities. Reassigning a project from one parent to another shows a warning and removes from the old parent
- [ ] People edit: competence center dropdown available, changing it updates capacity views
- [ ] Standard available hours: global default configurable, per-location overrides configurable. Change a location's hours — verify utilization percentages in Capacity My Team recalculate

---

## Session 6 — Seed Data Fixes + End-to-End Verification

**Items:**
- WB-11: Seed data consistency for CRs (every CR has traceable before/after values in project data)
- RPT-06: Seed data — historical forecast snapshots for Forecast Accuracy report
- Full end-to-end walkthrough using the checklist below

**Verification Checklist:**
- [ ] Audit all CRs in seed data: for each quantitative CR, confirm the project's baseline and forecast values match the CR's before/after values for the affected line items and months
- [ ] Forecast Accuracy report: populated with at least 6–12 months of historical comparison data
- [ ] All items from the End-to-End Verification Checklist below pass

---

## End-to-End Verification Checklist

This checklist is executed in Session 6 after all implementation sessions are complete. It covers every module and key cross-module workflows. Every item must pass.

### Cross-Module Workflows

- [ ] **Full intake pipeline:** Submit new project (Workbench) → appears in Intake Queue (Portfolio) → controller opens detail → controller sends back with edits → project shows "Changes Requested" status → PL receives notification (Launchpad) → PL resubmits → project returns to "Pending Approval" → controller approves → project appears in active portfolio with correct baseline → project accessible in Workbench
- [ ] **Full CR pipeline:** PL starts Rolling Forecast Review (Workbench) → completes all 5 phases without errors → CR submitted → CC Owner sees pending action (Launchpad) → CC Owner confirms → Controller sees pending action (Launchpad) → Controller opens CR in CR Approvals (Portfolio) → detail view shows tabular before/after grid → Controller approves → forecast updates in Workbench → CR visible in Change History with correct before/after data → pending actions clear from Launchpad
- [ ] **Scenario to impact:** Create scenario in What-If Simulator → add rate escalation action scoped to a specific role → add Pause Project action → view portfolio impact → impact view shows CY, NY (4-digit year), and Overall breakdowns with correct deltas → publish scenario → pending action appears for other Controllers/Executives
- [ ] **Capacity drill-through:** Open Capacity Management (defaults to My Team) → utilization percentages show correctly with colour coding → switch to Organization Overview → click a cell → drawer shows allocated/available/delta → expand a project → see employee names → click project link → arrives at Project Workbench with that project loaded
- [ ] **Dynamic hierarchy switch:** In Administration, create a new grouping hierarchy → assign projects → toggle it as active → verify Portfolio Overview, Reporting, and all other modules reflect the new hierarchy → toggle back to LoB → verify everything reverts

### Project Workbench — All Views

- [ ] **Timeline chart:** TODAY badge visible. Chart scrolls independently. Summary strip labelled with current year. Monthly table below in sync with chart
- [ ] **FC&Planning grid:** Internal resources show hours + euros. Line items auto-sized. Columns sticky on scroll. Collapsible years with context-sensitive defaults
- [ ] **Monthly review:** Button reads "Rolling Forecast Review". Phase 1: same-role items have independent explanation fields, employee names shown. Phase 3: loads without crash, cells editable for current/future months only
- [ ] **Change history:** CRs displayed as tabular before/after grids. Seed data CRs have traceable values
- [ ] **Submit new project:** No CapEx/OpEx toggle. Submission works and project appears in Intake Queue

### Portfolio Overview

- [ ] **Dashboard KPIs:** Labelled "FY 2026", current-year values. Square tiles in single row. Lifetime summary section below. Both react to filters
- [ ] **LoB chart:** Renamed (no "Budget"), shows forecast with baseline inset, current-year scoped
- [ ] **Portfolio table:** CY/PY column clusters separated by timeline column
- [ ] **Intake Queue:** Full Send Back workflow functional. Approval sets correct baseline. Euro values visible for internal resources
- [ ] **CR Approvals:** Tab labelled "CR Approvals". CRs in tabular detail view format
- [ ] **Project summary pane:** Closes automatically on "Open in Workbench"

### Capacity Management

- [ ] **Default view:** Opens to My Team
- [ ] **Organization Overview:** Collapsible year columns. First column auto-sized. Cell drawer shows allocated/available/delta with person-level drill-down
- [ ] **My Team:** Utilization shows hours + percentage with colour coding. Percentages use configurable standard hours from Administration

### What-If Simulator

- [ ] **Action palette:** All 12 action types available including Pause, Change Resource Allocation, Cut by Type, Freeze New Starts, Cap Cost Category, Rate Escalation
- [ ] **Year selector:** Available and functional for scoping actions
- [ ] **Impact view:** Time-frame-segmented (CY, future years with 4-digit labels, Overall) with current forecast, scenario forecast, and delta per segment

### Reporting

- [ ] **Programme Rollup:** Full year range selectable. Clearing year shows lifetime totals. Custom project grouping mode functional
- [ ] **CC Financial Summary:** Cost center is first column
- [ ] **Vendor Spend:** Expense cost type column and filter present
- [ ] **Forecast Accuracy:** Populated with historical data
- [ ] **YoY Comparison:** LoB and Project columns present. Month column hidden by default, toggle works, month filter works

### Administration

- [ ] **Dynamic hierarchy:** Can create entity types, define tree structure, assign projects, toggle active hierarchy. Propagation works across all modules
- [ ] **Cost center edit:** Name/location editable, code locked
- [ ] **Competence center:** Employee assignment functional
- [ ] **People:** Competence center dropdown functional
- [ ] **Standard hours:** Global default and per-location overrides configurable, reflected in utilization calculations
