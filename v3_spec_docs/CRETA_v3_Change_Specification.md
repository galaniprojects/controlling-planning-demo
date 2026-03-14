# CRETA v3 — Change Specification

This document specifies all changes for the third iteration of the CRETA demo application. It builds on the v2 implementation (complete) and draws from two planning sessions: one covering UX improvements and design decisions, and one covering the detail view pattern.

**Relationship to prior documents:**
- `CPC_Demo_App_Specification.md` — the original demo app spec (v1 foundation)
- `CRETA_v2_Change_Specification.md` — the v2 changes (all implemented)
- This document supersedes both where conflicts exist

**Demo date:** March 2026. This supersedes the February 2026 date used in earlier spec versions. All "current month" logic, forecast boundaries, actuals cutoffs, and pending action triggers are calibrated to March 2026.

**Scope of this spec:**
- UX improvements and new features (locked)
- Detail view pattern — reusable grid component (locked)
- Seed data overhaul (complete — see `CRETA_v3_Section9_Seed_Data.md`)
- Bug fixes (locked)

---

## 1. Launchpad Redesign

### 1.1 Three-Zone Layout

The Launchpad is redesigned from scratch with three zones.

**Zone 1 — Identity + CRETA Branding (top center):**
CRETA acronym treatment: each first letter in bold primary blue (#1e40af), rest of each word in light gray (#94a3b8), separated by dots (·). Full text: **C**ontrolling · **R**eporting · **E**stimation · **T**racking · **A**llocations. Below: personal greeting ("Good morning, [First Name]") and role badge in light blue pill.

**Zone 2 — Module Tiles (left, approximately two-thirds width):**
2-column grid of module cards. Each shows: module name, one-line description, contextual metric. Primary module for the active role gets a blue border and "Default" badge. Modules ordered by role relevance. No icons or emojis — text only. For the PL role: includes a "Submit New Project" tile with dashed border and centered "+" icon, integrated into the grid.

**Zone 3 — Pending Actions (right, approximately 280px side panel):**
Compact card with section header ("Pending Actions") and urgent count badge. Each action item: thin urgency bar on left (red for urgent, gray for informational), action text, optional target entity in lighter text, and a subtle arrow. Items are clickable and deep-link to the relevant module and entity. Empty state: "All caught up." No icons or emojis.

### 1.2 Reactive Pending Actions

Pending actions must be truly reactive — completing an action removes it from the actor's list, creating work for someone else adds to their list. The actions list is dynamically generated from actual system state, not static seed data.

**Removed from Launchpad:** Old notification/alert blocks, KPI strip (already removed in v2).

### 1.3 Submit New Project — Dual Entry Point

"Submit New Project" is available as a tile on the Launchpad (PL role only) AND as a button in the Project Workbench project list panel header. Both open the same submission form.

### 1.4 Pending Action Type Mapping

Nine defined action types. Each has a trigger, target audience, display text pattern, deep-link target, and clear condition.

| # | Action Type | Trigger | Who Sees It | Display Text | Target | Clears When |
|---|---|---|---|---|---|---|
| 1 | Forecast Due | System detects current month's forecast not submitted | PL | "Monthly forecast due" | Workbench → project | PL submits forecast cycle |
| 2 | Forecast Overdue | Forecast deadline passed | PL (urgent), Controller (info) | "Monthly forecast overdue" | PL: Workbench; Controller: Portfolio | PL submits |
| 3 | CR Pending Confirmation | PL submits forecast changes | CC Owner | "Change requests pending confirmation" | Capacity Mgmt → Request Mgmt | CC Owner confirms/declines all CRs |
| 4 | CR Pending Approval | CC Owner confirms CR (Stage 2) | Controller | "Change requests awaiting approval" | Portfolio → Approvals | Controller approves/rejects |
| 5 | New Project Pending Review | PL submits new project | Controller | "New project pending review" | Portfolio → Intake | Controller acts |
| 6 | CR Feedback Received | CC Owner or Controller sends back CR | PL | "Change request returned with feedback" | Workbench → project → Change History | PL revises/acknowledges |
| 7 | CR Decision | Controller approves/rejects CR | PL | "Change request approved" / "Change request rejected" | Workbench → project | PL views it |
| 8 | Project Submission Decision | Controller acts on intake | PL | "Project submission approved" / "Project submission returned" | Workbench | PL views it |
| 9 | Scenario Published | Controller/Executive publishes scenario | Other Controllers/Executives | "New scenario published" | What-If Simulator | User views it |

---

## 2. Portfolio Overview

### 2.1 KPI Restructuring

Replace "Total Budget" KPI (which was redundant with Baseline) with a restructured KPI row:

- **Baseline** — the original approved budget
- **Current Forecast** — the living plan
- **YTD Actuals** — recorded costs to date
- **Plan Drift** — Current Forecast minus Baseline, shown as amount and percentage

Run/Change split and CapEx/OpEx split remain as secondary KPIs.

All KPIs must recalculate dynamically based on active filters (this was already in v2 spec item 2.1.4 but may be broken — see bug list in §8).

### 2.2 Per-Filter Reset

Each filter dropdown in the Portfolio Overview Dashboard gets a "Select All" / "Clear" option, allowing users to reset individual filters without clearing all filters at once.

### 2.3 Approvals — Full Detail Workspace

The existing two-level interaction pattern (drawer preview → full detail workspace) from v2 spec item 2.2.1 remains unchanged. The full detail workspace now uses the Detail View Pattern specified in §6 of this document. This replaces the simpler before/after comparison table described in the v2 spec.

### 2.4 Intake — Full Detail Workspace

Same two-level pattern as Approvals from v2 spec item 2.3. The full detail workspace now uses the Detail View Pattern specified in §6 (Intake variant — single values, no deltas).

---

## 3. Project Workbench

### 3.1 Project Timeline Visualization

**Location:** Top of Project Workbench Overview tab, above the existing forecast trajectory chart.

**Design:** Grouped bar chart with monthly/cumulative toggle and phase strip.

**Monthly view (default):** Three bars per month — Baseline (gray #cbd5e1), Forecast (blue #3b82f6), Actuals (green #059669). Past months where actuals exceed forecast get a small red dot above the actuals bar. Elapsed months have a subtle background tint distinguishing past from future.

**Cumulative view (toggle):** Line chart showing running totals for all three series, plus a red dashed "Budget Ceiling" line representing the total baseline budget.

**Phase strip:** A thin horizontal bar below the month labels showing project phases (e.g., Planning → Development → Testing → Rollout) as coloured segments. Hovering a phase segment shows both baseline and forecast date ranges plus slip. Baseline phase boundary markers (gray triangles above the strip) show where transitions were originally planned, with red slip indicators connecting to where they actually occur in the forecast.

The phase strip degrades gracefully:
- Full phase data → complete strip with baseline markers
- Limited phase data → simpler strip
- No phase data → no strip at all; the bar chart works standalone

**Today line:** Red dashed vertical line cutting through the chart and phase strip, with a "TODAY" badge.

**Year separators:** Heavier vertical line at each January boundary with bolded January labels. This is a global design pattern applied everywhere monthly data appears on a time axis (see §7).

**Summary strip:** Below the chart — Baseline, Forecast, YTD Actuals, Plan Drift, Execution Variance as a compact grid with small uppercase labels.

**Scrollability:** The chart must be horizontally scrollable within a fixed-width viewport matching the module content width. Default view on load: centred on a window from approximately 3 months before today to 6–9 months after. Y-axis labels stay fixed on the left during horizontal scroll.

**Seed data requirement:** At least one project with full phase data (e.g., ERP Integration Phase 2), one with partial/limited phase data, and one with no phase data, to demonstrate graceful degradation during the demo.

### 3.2 Change History — Full Detail View

Add a "View Full Detail" button on compact CR cards in the Change History tab. Clicking opens the Detail View Pattern (§6) in read-only mode — same layout as the Approvals detail but without action buttons. The CR's lifecycle status (approved, rejected, sent back) is shown in the header.

### 3.3 Submit New Project in Workbench

Add a "Submit New Project" button in the Project Workbench left panel header, as a second entry point alongside the Launchpad tile (§1.3). Both open the same submission form.

---

## 4. Reporting

### 4.1 Year Selector

Every report needs a fiscal year selector. The Year-over-Year Comparison report needs a multi-year range selector. This was identified as missing in the v2 build.

---

## 5. Collapsible Year Columns (Global)

**Approach:** Clickable year label with ▸/▾ chevron.

**Behaviour:** Year labels in column headers are styled in primary blue (#1e40af) to signal interactivity. Clicking toggles between expanded (all 12 monthly columns) and collapsed (single summary column showing yearly sums). Chevron indicates state: ▸ collapsed, ▾ expanded.

**Default state:** Current year expanded, all other years (past and future) collapsed. This makes the pattern self-documenting — users see collapsed year labels and intuit they can be clicked.

**Year boundary styling:** Heavier left border at each January column. This is the same visual pattern used in the timeline chart — consistent across the product.

**Applies to:** FC&Planning grid, CR detail tables, Intake detail tables, Approval detail workspace, Change History full detail, Reporting views — everywhere monthly columns appear.

**Replaces:** The broken collapsible years implementation in v2.

---

## 6. Detail View Pattern (Reusable Component)

A reusable month × line-item grid component deployed in four locations with context-specific adaptations.

### 6.1 Core Grid Structure

**Rows:** Only line items affected by the CR or submission. Grouped by category ("Internal Resources" and "External Costs" as section headers in uppercase muted gray).

**Columns:** Full 12-month timeline for the relevant year(s), with collapsible year columns (§5). Elapsed months (before today) have a subtle `#fafafa` background tint. January columns get the heavier left border (§7). Three summary columns on the right: Current, Proposed, Delta.

**Row totals:** Each summary column shows the primary unit value and the euro equivalent below it. For hours rows: `1.180h` on top, `€141.6K` below. For euro rows: `€135K` as a single value.

### 6.2 Cell Pattern — Comparison Contexts (Approvals, Change History, Forecast Review)

Each cell in a row can be either unchanged or changed.

**Unchanged cells:** Show the current value with inline euro equivalent, in muted gray (#94a3b8). Format: `160h (€19.2K)` for hours rows, `€30K` for euro rows. Zero values display as `—` in lighter gray (#d1d5db).

**Changed cells:** Warm background (#fffbeb). Three lines stacked vertically:

1. **Proposed value** (bold, #0f172a): `200h (€24.0K)`
2. **Delta** (coloured, semi-bold): `+40h (+€4.8K)`
3. **Current value** (muted gray #94a3b8, same format as unchanged): `160h (€19.2K)`

**Delta colour logic:**
- **Green (#059669):** Reductions (proposed < current)
- **Blue (#2563eb):** Moderate increases (proposed > current, change < 25% of current value)
- **Red (#dc2626):** Significant increases (change ≥ 25% of current value, or new from zero)

The 25% threshold is a suggestion for the demo. A note should be visible in the application indicating that this threshold is configurable for production.

### 6.3 Cell Pattern — Intake Context

No "before" state exists. Each cell shows a single value: the proposed allocation in standard format. No delta, no current reference. Unchanged cell styling (muted gray) for zero months; normal weight for months with planned values.

### 6.4 KPI Summary Strip

Below the grid. Three KPIs displayed horizontally:

- **Affected Lines (Current):** Sum of current euro values across all affected line items. Dark gray (#334155).
- **Affected Lines (Proposed):** Sum of proposed euro values. Primary blue (#1e40af).
- **Total Impact:** Euro delta and percentage. Colour follows the delta logic from §6.2 applied to the total.

For the Intake context, the KPI strip simplifies to: Total Internal Cost, Total External Cost, Grand Total.

### 6.5 Context-Specific Adaptations

**Approvals (Portfolio → Approvals → Full Detail):**
- Header: breadcrumb, CR title, status badge, project name, category, submitted by + date, confirmed by (CC Owner) + date
- Grid: comparison cell pattern (§6.2)
- Justification section below KPIs
- Action buttons: Approve / Reject / Request Changes (with comment field for Reject and Request Changes)

**Intake (Portfolio → Intake → Full Detail):**
- Header: breadcrumb, project name, status badge, requesting LoB, project lead, proposed timeline
- Grid: single-value cell pattern (§6.3)
- Business case / justification section below KPIs
- Timeline bar (simple start/end) if defined
- Action buttons: Approve / Reject / Request Changes

**Change History (Project Workbench → Change History → Full Detail):**
- Header: breadcrumb, CR title, lifecycle status badge (Approved / Rejected / Sent Back), project name, submitted by + date, decided by + date
- Grid: comparison cell pattern (§6.2), read-only
- Justification section
- No action buttons — informational only
- Accessed via "View Full Detail" button on compact CR cards

**Forecast Cycle Review (Project Workbench → Forecast Wizard → Phase 4):**

This is the PL's review screen before submitting their forecast changes. It uses the detail view grid but with important differences from the other three contexts: the PL is *composing* their submission, not reviewing someone else's.

- Header: project name, cycle context (e.g., "March 2026 Forecast Cycle"), count of changes made ("12 line items affected across 3 cost centres")
- Grid: one unified grid showing **all** line items affected by the PL's Phase 3 edits, using the comparison cell pattern (§6.2). Rows grouped by category headers ("Internal Resources", "External Costs") as in the other contexts. The grid is read-only at this stage — editing happens in Phase 3, not here.
- Summary strip: same KPI pattern as §6.4 — Affected Lines (Current), Affected Lines (Proposed), Total Impact
- Justification section: below the grid. Changes are grouped by affected cost centre (since each group will route to a different CC Owner for Stage 1 confirmation). Each group shows: cost centre name, list of affected line items in that group, and an **editable text field** for the PL to provide justification. The PL must provide justification for each group before submitting. If all changes affect a single cost centre, there is one justification field.
- System-suggested indicator: line items that originated from Phase 2 system suggestions are marked with a subtle "System suggested" tag. This carries through to the CR record so controllers can see which changes were AI-recommended vs manual.
- Action buttons: Submit (creates CRs and routes to CC Owners) / Save Draft (preserves current state, PL can return later) / Cancel (discards all Phase 3 edits, returns to FC&Planning read mode)
- On Submit: the backend creates separate CRs per affected cost centre, each routed to the relevant CC Owner for Stage 1 confirmation. The PL sees a single submission action; the system handles the splitting.

---

## 7. Global Design Patterns

These patterns must be applied consistently across all modules wherever they appear. Some are carried forward from v2; all are listed here for completeness.

1. **Year separator lines:** Heavier left border at January columns on all monthly grids and charts. January labels bolded and darker. Used in: timeline chart, FC&Planning grid, detail view grids, reporting views.

2. **Collapsible year columns:** Clickable year labels with ▸/▾ chevron, primary blue (#1e40af), current year expanded by default, other years collapsed. Applied to all monthly data tables (§5).

3. **No emojis:** Text and Lucide icons only throughout the application. No emojis in notifications, pending actions, or module tiles.

4. **European number formatting:** Dot for thousands, comma for decimals (€14.400,00). Carried forward from v2 spec item 6.5.

5. **Monospace for financial data:** Tabular numbers in data cells for alignment (IBM Plex Mono or similar).

6. **Detail view cell pattern:** The three-line changed cell (proposed → delta → current) with colour-coded deltas. Applied everywhere the detail view component is used (§6.2).

7. **Elapsed month tinting:** Months before today get a subtle `#fafafa` background in all monthly grids. Applied in: FC&Planning grid, detail view grids, timeline chart.

---

## 8. Bug Fixes

Two known bugs from v2 that are not addressed by any structural change in this spec. These should be verified and fixed **after** all Sessions 1–4 implementation work is complete, since the codebase will have changed significantly by then.

| # | Bug | Module | Expected Behaviour |
|---|---|---|---|
| 1 | Intake approve does nothing | Portfolio → Intake | Approving a project in the Intake queue should: (a) change project status from Pending Approval to Active, (b) generate baseline values from the submitted resource and external cost plan, (c) add the project to the active portfolio tree, (d) create a notification for the submitting PL (action type #8 from §1.4). Currently the approve button has no effect. |
| 2 | Publish scenario doesn't move to published | What-If Simulator | When a user clicks Publish on a private scenario, the scenario should move from the Private list to the Published list and become visible to other Controllers/Executives. Currently the state transition doesn't persist. This also triggers action type #9 (Scenario Published notification from §1.4). |

---

## 9. Seed Data Overhaul

**See `CRETA_v3_Section9_Seed_Data.md` for the complete specification.**

The seed data has been fully designed in a dedicated planning session. The separate document covers: organizational structure (4 LoBs, 10 cost centres, 3 locations, 4 competence centres), 32-entity project/service roster, 50 people with per-role per-location hourly rates, external cost model with line-item granularity and procurement lifecycle, change request landscape, workflow states at demo start, phase assignments, What-If scenarios, and data consistency rules.

Key parameters: demo date is March 2026, data spans January 2021 – December 2029, all historical months carry full baseline/forecast/actuals three-point comparison.

---

## 10. CapEx/OpEx Per Line Item (Data Model Change)

CapEx/OpEx moves from a project-level flag to per-line-item classification. Each row in the planning grid (whether role allocation or external cost type) gets tagged as CapEx or OpEx.

**Rationale:** A single project can have CapEx development work and OpEx maintenance/support work. Per-line-item tagging allows accurate aggregation at every level.

**Impact:** This is a data model change that affects seed data, the planning grid display, all summary/aggregation views, and the detail view pattern. At least 2–3 projects in the seed data should have mixed CapEx/OpEx classifications.

---

## 11. WBS Architecture

WBS is a backend ingestion layer only, not a user-facing navigation layer. CRETA receives cost postings at WBS-element level from SAP PS/MM, stores them internally, but rolls up to project level for all user-facing views. No WBS hierarchy in the demo.

---

## 12. Module Names

Keep current module names unchanged: Portfolio Overview, Project Workbench, Capacity Management, What-If Simulator, Reporting, Administration. Do not rename to fit the CRETA acronym. The CRETA → module conceptual mapping may be shown on the Launchpad or in the user guide, but module names stay descriptive.

---

## 13. Items Explicitly Not Being Changed

- Executive role customisation — not needed for demo
- Notification bell in top bar — parked, revisit after other changes
- Visual polish / animations — deliberately keeping prototype feel
- WBS as user-facing hierarchy — backend only (§11)
- Module renaming to fit CRETA acronym — names stay as-is (§12)

---

## 14. Implementation Sequence

Suggested order for Claude Code sessions, grouped by dependency. Each session includes a per-session verification checklist. Bug fixes are deferred to after Session 4. End-to-end testing is Session 6.

**Important context for Claude Code:** The v1 and v2 specification documents are not provided. Work from the existing codebase plus this document and `CRETA_v3_Section9_Seed_Data.md` as the authoritative specification. Where this document describes a component or behaviour, it supersedes whatever exists in the current code.

**Session 1 — Global Patterns + Launchpad:**
- §5 Collapsible year columns (global component, used everywhere)
- §7 Global design patterns (year separators, elapsed month tinting — foundational CSS/styling)
- §1 Launchpad redesign (full rebuild — replaces the existing Launchpad entirely, including the pending actions engine and Submit New Project tile)
- **Verify:** Collapsible columns work in at least one existing grid. Launchpad renders all three zones. Role switch lands on Launchpad. Pending actions list populates from system state (at least one action type visible with current seed data).

**Session 2 — Detail View Component + Portfolio:**
- §6 Detail view pattern (build the reusable component with all four context variants)
- §2.1 KPI restructuring (verify KPIs recalculate correctly when filters are applied — this was broken in v2)
- §2.2 Per-filter reset
- §2.3 Approvals full detail workspace (wire up detail view component)
- §2.4 Intake full detail workspace (wire up detail view component, intake variant)
- **Verify:** Detail view component renders correctly in Approvals and Intake contexts. KPIs update when filters change. Per-filter reset works. Drawer → full detail navigation works for both Approvals and Intake.

**Session 3 — Project Workbench:**
- §3.1 Project timeline visualization (bar chart, phase strip, scrollability)
- §3.2 Change History full detail (wire up detail view component, read-only variant)
- §3.3 Submit New Project in Workbench (second entry point)
- §10 CapEx/OpEx per line item (data model change)
- §6.5 Forecast Cycle Review Phase 4 (wire up detail view component for PL submission review — see expanded spec in §6.5)
- **Verify:** Timeline chart renders with monthly/cumulative toggle. Phase strip degrades gracefully (test with projects that have full, partial, and no phase data). Change History detail opens in read-only mode. CapEx/OpEx tags appear per line item. Phase 4 review shows unified grid with per-cost-centre justification fields.

**Session 4 — Reporting + Simulator Fix + Cleanup:**
- §4.1 Year selector in reports
- §8 Bug #2 (Publish scenario state transition — verify and fix)
- Clean up any dead code from replaced v2 implementations (old collapsible years, old Launchpad components)
- **Verify:** Year selector works in all report types. Scenario publish persists state change. No orphaned v2 code remains.

**Session 4b — Bug Verification Pass:**
- §8 Bug #1 (Intake approve flow — verify and fix after all structural changes are in place)
- Re-test all pending action types with current seed data
- **Verify:** Intake approve creates active project with baseline, adds to portfolio tree, generates PL notification. All 9 action types fire correctly.

**Session 5 — Seed Data:**
- Generate the complete seed.sql following `CRETA_v3_Section9_Seed_Data.md`
- Validate all consistency rules from §9.13 of that document
- Verify all demo walkthrough anchors from §15 work with the new data
- Verify all 9 pending action types fire correctly
- **Verify:** Run consistency checks. Walk through at least 5 anchors from §15 spanning all 4 roles.

**Session 6 — End-to-End Verification & Polish:**
- Full demo walkthrough with all 4 roles using the anchor list in §15
- Fix any data inconsistencies surfaced during walkthrough
- Tune financial values for visual impact in charts and KPIs
- Run the complete verification checklist from §16
- **Verify:** Every anchor in §15 works. Every pending action type fires and clears correctly. All consistency rules hold.

---

## 15. Demo Walkthrough Anchors

Explicit list of presenter demonstrations that the seed data and application must support. Every item below must work when the presenter walks through it — no data gaps, no broken flows. Updated from v1 to reflect v3 changes.

| # | Demo Scenario | Required Data State | Key Screen |
|---|---|---|---|
| 1 | **Switch between all 4 roles** and see different Launchpad views | All 4 personas with correct module tiles, pending actions, and role badges | Launchpad |
| 2 | **See pending actions as PL (Priya)** — forecast due, forecast overdue, CR returned, CR approved, project approved | Action types #1, #2, #6, #7, #8 all visible | Launchpad (PL view) |
| 3 | **See pending actions as CC Owner (Thomas)** — CR pending confirmation | Action types #3 visible for MUC/APD | Launchpad (CC Owner view) |
| 4 | **See pending actions as Controller (Anna)** — CR pending approval, new project pending, forecast overdue (info), scenario published | Action types #4, #5, #2 (info), #9 visible | Launchpad (Controller view) |
| 5 | **Browse the portfolio tree**, expand LoBs, click a project, see KPIs recalculate with filters | Full hierarchy with aggregated values at every level. KPIs update on filter change. | Portfolio Overview — Dashboard |
| 6 | **Review and approve a new project submission** via two-level pattern | Autonomous Braking Prototype in Pending Approval with full resource plan and external cost breakdown | Portfolio Overview — Intake → Detail |
| 7 | **Review a pending change request** via drawer → full detail workspace | CR-C (S/4HANA reduction) or CR-D (IAM Overhaul licensing) at Stage 2 | Portfolio Overview — Approvals → Detail |
| 8 | **View project timeline with full phase data**, toggle monthly/cumulative, see phase slip | ERP Integration Phase 2 with 5 phases, baseline vs forecast slip visible | Project Workbench — Timeline |
| 9 | **View project timeline with no phase data** to show graceful degradation | Any service or simple project without phase assignments | Project Workbench — Timeline |
| 10 | **Walk through the monthly forecast wizard** (all 5 phases) including Phase 4 review | ERP Integration Phase 2 mid-cycle with actuals diverging from forecast; system suggestions ready | Project Workbench — Forecast & Planning |
| 11 | **Browse CR history** for a project with many changes, open full detail on a historical CR | ERP Integration Phase 2 with 8–10 CRs, read-only detail view | Project Workbench — Change History |
| 12 | **View CapEx/OpEx mixed classification** on a project's planning grid | ERP Integration Phase 2 or SAP S/4HANA Migration with mixed CapEx/OpEx line items | Project Workbench — FC&Planning |
| 13 | **View team heatmap**, identify over-allocated person, drill into their project breakdown | Thomas Brenner's team (MUC/APD) with one Senior Developer at >100% utilisation | Capacity Management — My Team |
| 14 | **Respond to a resource request** with assignment preview | Pending request for Senior Developer from BUD/APD for Predictive Maintenance PoC | Capacity Management — Request Management |
| 15 | **View organization-wide heatmap** with all three pivot dimensions | Full allocation data across all 10 cost centres | Capacity Management — Organization Overview |
| 16 | **Open an existing What-If scenario**, review its impacts | "Budget Pressure: 15% Reduction" (published) with full cascading impact data | What-If Simulator — Workspace |
| 17 | **Compare two scenarios side by side** | "Budget Pressure: 15% Reduction" vs "Conservative: Freeze New Starts" | What-If Simulator — Comparison |
| 18 | **Use the AI Advisor** — type a goal, review paths, apply one | Pre-computed goal patterns from v1 spec | What-If Simulator — AI Advisor |
| 19 | **Run a report with year selector** and verify collapsible year columns | At least 2 fiscal years of data available | Reporting |
| 20 | **Submit a new project from the Workbench** (second entry point) | Submit New Project button in Workbench left panel header | Project Workbench — Left Panel |

---

## 16. Testing & Verification Strategy

Testing is integrated into the implementation flow at three levels. This is a demo application, not production software — the goal is reliability during presenter walkthroughs, not comprehensive unit test coverage.

### 16.1 Per-Session Verification

At the end of each implementation session, Claude Code runs the verification checklist listed under that session in §14. This catches issues immediately rather than letting them compound. Each checklist item should be manually tested in the browser by navigating to the relevant screen and confirming the expected behaviour.

### 16.2 Automated Consistency Checks (Session 5)

During seed data generation, Claude Code should write and run validation scripts that check the consistency rules from §9.13 of the seed data document:

- Summation integrity (project totals = sum of monthly line items)
- Temporal consistency (no actuals in future months)
- Allocation consistency (no impossible over-allocations except the intentional one)
- CR consistency (approved CRs reflected in forecast values)
- Rate consistency (cost calculations use correct per-role, per-location rates)
- CapEx/OpEx consistency (project-level classification matches dominant line-item classification)

These should be runnable scripts (Python or SQL queries) that can be re-executed after any data fix.

### 16.3 End-to-End Demo Verification (Session 6)

The final session is a structured walkthrough, not ad-hoc testing. Claude Code should:

1. Walk through every anchor in §15 as the specified role, confirming the screen renders correctly and the data makes sense
2. Verify every pending action type (#1–#9) is visible on the correct role's Launchpad and deep-links to the correct target
3. Complete one full action cycle: approve a CR through both stages (CC Owner → Controller), confirm the forecast updates, confirm the pending action clears from the Launchpad
4. Verify collapsible year columns work in at least 3 different contexts (FC&Planning, Approvals detail, Reporting)
5. Verify the timeline visualization with all three phase data states (full, partial, none)
6. Verify CapEx/OpEx per-line-item tags display correctly in the planning grid and aggregate correctly in KPIs
7. Document any issues found as a punch list for immediate fix within the same session

---

## Summary

| Category | Item Count |
|----------|-----------|
| Launchpad | 4 (redesign + pending actions + submit entry point + action types) |
| Portfolio Overview | 4 (KPIs + filter reset + Approvals detail + Intake detail) |
| Project Workbench | 4 (timeline + change history detail + submit button + Phase 4 review) |
| Reporting | 1 (year selector) |
| Detail View Pattern | 1 reusable component, 4 deployment contexts |
| Global Patterns | 7 patterns |
| Data Model | 2 (CapEx/OpEx + WBS architecture) |
| Bug Fixes | 2 (deferred to post-implementation verification) |
| Seed Data | Complete (see separate document) |
| Demo Anchors | 20 |
| Testing | 3-level strategy (per-session, automated consistency, end-to-end) |
| **Total change items** | **~24 + seed data overhaul + testing** |
