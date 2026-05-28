# CRETA v5.1 — Change Specification

**Date:** May 5, 2026
**Scope:** 16 items — 5 bug fixes, 2 seed data enrichments, 9 feature changes
**Target:** Functional demo with April 2026 operational date
**Consumed by:** Claude Code implementation sessions

---

## Preamble

This document specifies all changes for the v5 → v5.1 iteration of CRETA. It is self-contained — all design patterns, cell rendering rules, and layout specifications needed for implementation are embedded directly. Do not rely on prior spec documents; everything you need is here.

### Implementation order

Execute in this sequence. Items within a group can be parallelised.

**Phase 1 — Bug fixes (A-01 through A-05).** These are independent of each other and should be quick. Fix all five before moving to feature work.

**Phase 2 — Seed data (B-01, B-02).** Backlog seed expansion and time horizon extension. These must land before feature work on the F&P grid and backlog, since the features depend on having adequate data to render.

**Phase 3 — Feature changes, ordered by dependency:**

1. C-02 (collapsible years) — grid infrastructure that C-03, C-04, C-08, and C-09 build on
2. C-08 (three-point cell display) — cell rendering pattern used by C-03 and C-04
3. C-03 (milestone phase highlighting) — visual layer on the grid
4. C-04 (three-point comparison chart below F&P) — depends on grid being correct
5. C-05, C-06 (row expansion for employee/vendor names) — independent, can be done together
6. C-07 (resource roles on external costs) — data model change
7. C-09 (external costs tab monthly grid overhaul) — largest item, depends on C-02 and C-07
8. C-01 (launchpad revert) — standalone, do last to avoid disrupting navigation during other work

---

## Category A — Bug Fixes

### A-01: Run Portfolio back button broken

**Current behaviour:** In the Run Portfolio view, clicking into an Offering or Internal Service and then pressing the back button does not navigate back to the Run Portfolio list.

**Required behaviour:** Back button returns to the Run Portfolio entity list, preserving the user's scroll position and any active filters.

**Likely cause:** Routing mismatch — the EntityWorkspace URL (`/workbench?entity={id}&type={offering|internal_service}`) may not be pushing a proper history entry, or the back button handler is using a hardcoded route instead of `navigate(-1)`.

---

### A-02: Backlog "Back to Backlog" button breaks on non-default tabs

**Current behaviour:** When viewing a project in the Backlog detail panel (which has 4 tabs: Scores & Ranking, Financial, Master Data, Milestones), if the user switches to any tab other than Scores & Ranking and then clicks "Back to Backlog," the navigation fails or returns to the wrong state.

**Required behaviour:** The back button returns to the Backlog list/cube view regardless of which detail tab is currently active. The detail panel's tab state should not interfere with parent navigation.

**Likely cause:** Tab state is being written into the URL or route params, and the back button is consuming the tab-change history entry instead of the panel-open entry.

---

### A-03: Variance Waterfall column title overlap

**Current behaviour:** The column labels in the Variance Waterfall chart on the Workbench Overview tab overlap and are illegible, especially for longer category names (e.g., "Rate Changes," "CR Adjustments").

**Required behaviour:** All column labels are fully legible without overlap. Options (in order of preference):

1. Rotate labels 45° with adequate spacing
2. Abbreviate labels and show full text on hover tooltip
3. Increase chart width to accommodate labels

Ensure the fix works in both light and dark themes.

---

### A-04: Portfolio Overview External Spend tab back-to-dashboard crash

**Current behaviour:** In Portfolio Overview, navigating to the External Spend tab and then clicking "Back to Dashboard" crashes the application and shows a "Project not found" error screen.

**Required behaviour:** Back button returns cleanly to the Portfolio Overview Dashboard tab. No crash, no "not found" error.

**Likely cause:** The External Spend tab's URL path segment is being parsed as a project ID by the portfolio detail route matcher. The route definition order or pattern specificity needs adjustment so that `/portfolio/external-spend` (or equivalent) is matched before `/portfolio/:projectId`.

---

### A-05: Charging & Allocations access control inverted

**Current behaviour:** The Charging & Allocations module (`/charging`) is only accessible when logged in as the Executive role (Dr. Klaus Weber), who has read-only access. The Controller (Anna Meier) — who should be the primary user with full edit capability — cannot access the module. Other roles also cannot access it.

**Required behaviour:**

| Role | Access level |
|---|---|
| Controller (Anna Meier) | Full access — edit distribution edges, BTC profiles, manage rollup cache, all four sections |
| CC Owner (Thomas Brenner) | Read-only on entities within their cost centre scope. Can view distribution edges and BTC profiles for entities they're involved with |
| Project Lead (Priya Sharma) | Read-only on own entities via permission grants. Can view their projects' BTC profiles and cost allocation paths |
| Executive (Dr. Klaus Weber) | Read-only across all entities. Can view distribution, BTC, rollup map, and reporting bridge |

Fix the role gate in the routing/navigation layer and the backend `require_role(...)` dependency for all `/api/charging/*` endpoints.

---

## Category B — Seed Data Enrichment

### B-01: Expand backlog seed data

**Current state:** 11 Projects + 6 Offerings + 17 Internal Services = 34 chargeable entities total. Not all 11 projects are in the backlog-eligible range (DoI 0–2).

**Required state:** Add 15–20 new projects at DoI 0–2 (pipeline stages: `idea`, `under_review`, `pitch_board`) so the backlog surfaces have enough density to demonstrate:

1. **Both cutoff lines visible and distinct.** The should-be line (where the contestable budget envelope runs out based on ranking) and the reality line (controller override) must be at different positions with a visible amber misalignment zone between them.
2. **Projects clearly outside the envelope.** At least 4–5 projects ranked below both cutoff lines, visually "out" in both the cube view and list view.
3. **Reorganisation on addition.** When a new project of any type (Type 1/2/3) is added, the ranking shifts visibly — some projects cross cutoff lines, the envelope adjusts. This requires projects clustered near the cutoff boundaries with similar-but-different composite scores.

**Seed data requirements for each new project:**

- Unique identifier (`IT0<PPM>` pattern), name, description
- Pipeline stage (distribute across `idea`, `under_review`, `pitch_board`)
- DoI level (0, 1, or 2)
- Tech Navigator scores (all 6 sub-criteria scored 1–5) generating varied composite scores. Cluster several projects with scores near the cutoff boundary (e.g., composite 3.2–3.8 range) so reorganisation is visible
- T-shirt size (distribute across XS/S/M/L/XL based on total budget vs admin thresholds)
- Total budget (realistic range: €50K for XS up to €2M+ for XL)
- Project type (1, 2, or 3) — distribute across types
- Transformation level (T0, T1, T2) — at least 5 T2 projects for the cube view
- Hierarchy assignment (distribute across existing LoB/Programme nodes)
- Basic milestone data (at least 2–3 milestones per project)

**Cube view density target:** The t-shirt size × composite score matrix should have entries in at least 60% of cells, with some cells containing 2–3 projects for visual clustering.

---

### B-02: Extend project time horizons (2024–2029)

**Current state:** Most project forecast data covers a narrow time range that doesn't adequately demonstrate the mixed-granularity forecast horizon.

**Required state:** 3–4 existing or new projects with monthly forecast data extending from at least January 2024 through at least December 2029. This provides a 6-year span that clearly demonstrates:

- **Monthly inner zone:** ~12 months around the current period (centred on April 2026) showing per-month columns
- **Quarterly outer zone:** Everything beyond the monthly boundary showing collapsed quarterly columns
- **Collapsible year columns:** Multiple past years (2024, 2025) and future years (2027, 2028, 2029) that collapse/expand
- **Provisional markers:** Outer-zone cells generated by quarterly distribution showing the `is_provisional` visual indicator

**Candidate projects:** Use the largest, most complex projects in the seed (e.g., ERP-class multi-year transformations) to make the extended horizon feel realistic. Each should have:

- Baseline values across the full range
- Forecast values with some deviation from baseline
- Actuals for months up to March 2026 (the demo's "last closed month")
- At least 2 internal resource roles and 1–2 external cost categories per project
- Milestone data spanning the full range

---

## Category C — Feature Changes

### C-01: Revert Launchpad to module-launch card style

**Current state:** The Launchpad (Zone 3) shows a role-personalised KPI tile grid — 7–9 individual KPI tiles per persona, each linking to a specific module surface. The tiles display metric values and act as navigation targets.

**Required state:** Replace the KPI tile grid with a **module navigation card grid**. Each card represents one application module and serves as the primary navigation entry point.

#### Layout

- **Fixed 3-column grid.** No wrapping to 4 columns regardless of viewport width. Cards fill columns left-to-right, top-to-bottom.
- **Zones 1 and 2 unchanged.** The header (branding, greeting, role badge, date, cycle status) and the pending actions strip remain exactly as they are.
- **Zone 3 replacement:** Module card grid replaces the KPI tile grid.

#### Card design

Each card is a clickable action card (per the `[E-07d]` pattern: surface card + hover/click behaviour). Content:

1. **Module icon** (Lucide) — top-left
2. **Module name** — primary text, bold
3. **Module description** — one line, muted text
4. **Subtitle KPI line(s)** — 1–2 condensed metrics below the description, role-differentiated (see table below)

Cards that are inaccessible to the current role are hidden entirely (not greyed out).

#### Module card inventory and KPI allocation

**Card 1 — Portfolio Overview** (all roles)

| Role | Subtitle KPIs |
|---|---|
| All | Forecast: €X.Xm · Run/Change: XX%/XX% · Plan drift: ±X.X% |

**Card 2 — Backlog** (Controller, PL, Executive)

| Role | Subtitle KPIs |
|---|---|
| Controller | X projects in pipeline · Y within cutoff |
| PL | Your X projects in pipeline · Y within cutoff |
| Executive | X projects in pipeline · Y within cutoff |

**Card 3 — Project Workbench** (Controller, PL, CC Owner)

| Role | Subtitle KPIs |
|---|---|
| Controller | Forecast cycle: [status] · X projects overdue |
| PL | Forecast cycle: [status] · Your X projects |
| CC Owner | Forecast cycle: [status] · X projects in your CC |

**Card 4 — Capacity Management** (Controller, CC Owner, PL read-only)

| Role | Subtitle KPIs |
|---|---|
| Controller | My team: XX% · Org: XX% · X open requests |
| CC Owner | My team: XX% · Org: XX% · X open requests |
| PL | Role availability · X open requests |

**Card 5 — What-If Simulator** (Controller, Executive, CC Owner scoped, PL read-only)

| Role | Subtitle KPIs |
|---|---|
| All with access | X active scenarios · Y recently published |

**Card 6 — Charging & Allocations** (Controller full, others read-only per A-05)

| Role | Subtitle KPIs |
|---|---|
| Controller | X distribution edges · Y BTC profiles needing review |
| Others | X distribution edges · Y active BTC profiles |

**Card 7 — Reporting** (all roles)

| Role | Subtitle KPIs |
|---|---|
| All | X saved reports · Last generated: [date] |

**Card 8 — Administration** (Controller only)

| Role | Subtitle KPIs |
|---|---|
| Controller | X pending scheduled changes · Data quality: [indicator] |

**Card 9 — Documentation Hub** (all roles)

| Role | Subtitle KPIs |
|---|---|
| All | No dynamic KPIs. Static description: "Guides, API Reference & FAQ" |

#### API changes

The existing `GET /api/modules` endpoint already returns module data with `contextual_metric` and role-based `sort_order`. Extend the response to include the role-differentiated subtitle KPIs. The endpoint should compute these from live data (same queries that currently power the individual KPI tiles).

---

### C-02: Collapsible year columns in F&P grid

**Current state:** The F&P grid shows all months flat, or uses the v5 mixed-granularity layout (monthly inner zone + quarterly outer zone). Multi-year projects create an extremely wide table.

**Required state:** Restore the collapsible year column pattern from v3, integrated with the v5 mixed-granularity model.

#### Behaviour

- **Default state:** The current calendar year (2026) is expanded showing all 12 months. All other years (past and future) are collapsed into a single summary column per year showing yearly totals.
- **Expand/collapse toggle:** Each year label in the column header is clickable with a ▸ (collapsed) / ▾ (expanded) chevron. Year labels styled in primary blue (`#1e40af`) to signal interactivity.
- **Mixed granularity integration:** When a non-current year is expanded:
  - If the year falls within the monthly inner zone (within the granularity boundary), it expands to show 12 individual month columns
  - If the year falls within the quarterly outer zone (beyond the boundary), it expands to show 4 quarterly columns, each optionally further expandable to reveal constituent months
- **Year boundary styling:** Heavier left border at each January column. January labels bolded and darker. This is a global pattern applied everywhere monthly data appears on a time axis.

#### Viewport constraints

- Table constrained to viewport width. Horizontal scroll when content exceeds viewport.
- **Sticky left column:** Row labels (cost category names, role names) frozen during horizontal scroll.
- **Sticky header:** Month/year column headers remain visible during vertical scroll.

#### Applies to

The F&P grid is the primary target, but the pattern should be consistent with all monthly grids in the application (detail view grids, external costs grid, reporting views).

---

### C-03: Milestone phase highlighting in F&P grid

**Current state:** The F&P grid shows monthly/quarterly columns without visual indication of which project milestone phase each time period falls within.

**Required state:** Milestone phases are visualised as coloured background bands across the relevant month columns in the F&P grid.

#### Design

- **Phase strip row:** A thin horizontal row at the top of the grid (below the month/year headers, above the data rows) showing contiguous coloured segments for each milestone phase. Each segment spans the months that fall within that phase.
- **Column background tinting:** Each month column receives a very subtle background tint matching its phase colour (opacity ~0.05–0.08) so the phase context is visible across all data rows without interfering with cell readability.
- **Phase colours:** Use a muted palette that works in both light and dark themes. Assign colours from a predefined set (e.g., slate blue for Planning, soft green for Development, warm amber for Testing, coral for Rollout/Hypercare). The palette should accommodate up to 8 distinct phases.
- **Phase labels:** Each segment in the phase strip row shows the milestone/phase name. For narrow segments (1–2 months), truncate with ellipsis and show full name on hover.
- **Baseline vs. forecast phase boundaries:** Show the baseline phase boundary as a small gray triangle marker above the phase strip. If the forecast phase boundary differs (phase slip), connect the baseline marker to the actual boundary with a red slip indicator line.

#### Graceful degradation

- Full milestone phase data → complete strip with baseline markers
- Partial/limited data → simpler strip without baseline markers
- No milestone data → no strip rendered; grid works standalone

---

### C-04: Three-point comparison chart below F&P grid

**Current state:** The three-point comparison chart lives on the Workbench Overview tab (as part of the v3 Project Timeline Visualization). It is not visible when working in the F&P tab.

**Required state:** Place the three-point comparison chart below the F&P grid, creating an integrated planning view where the grid and chart are visible together.

#### Chart specification

This is the same chart concept from v3 §3.1, relocated:

**Monthly view (default):** Grouped bar chart with three bars per month:

- **Baseline** — gray (`#cbd5e1`)
- **Forecast** — blue (`#3b82f6`)
- **Actuals** — green (`#059669`)

Past months where actuals exceed forecast get a small red dot above the actuals bar. Elapsed months have a subtle background tint distinguishing past from future.

**Cumulative view (toggle):** Line chart showing running totals for all three series, plus a red dashed "Budget Ceiling" line representing the total baseline budget.

**Phase strip:** A thin horizontal bar below the month labels showing project milestone phases as coloured segments (same palette as C-03). Hovering a phase segment shows both baseline and forecast date ranges plus slip. Baseline phase boundary markers (gray triangles) show where transitions were originally planned, with red slip indicators connecting to actual positions.

**Today line:** Red dashed vertical line with "TODAY" badge.

**Year separators:** Heavier vertical line at each January boundary with bolded January labels.

**Summary strip:** Below the chart — Baseline, Forecast, YTD Actuals, Plan Drift, Execution Variance as a compact row with small uppercase labels.

#### Scrollability

The chart must be horizontally scrollable, synchronised with the F&P grid above it. When the user scrolls the grid horizontally, the chart scrolls in lockstep (same time axis alignment). Default view on load: centred on a window from approximately 3 months before today to 6–9 months after.

#### Interaction with Overview tab

The Overview tab retains its own chart (the Progress vs. Burn chart specified in v5 `[E-05a]`). The three-point comparison chart is now F&P-exclusive.

---

### C-05: Internal resource row expansion → employee name

**Current state:** Internal resource rows in the F&P grid show the role name and aggregated hours/costs, but clicking/expanding a row does not reveal the assigned employee.

**Required state:** Clicking an internal resource row expands it to show:

- **Employee name** — the person assigned to this role on this project
- **Cost centre** — the employee's home cost centre
- **Per-month breakdown** — individual allocation if multiple people share a role

If multiple employees are assigned to the same role on a project, the expanded section shows one sub-row per employee, each with their name, cost centre, and individual monthly hours. The parent row shows the aggregated total.

Display format for each employee sub-row: `[Name] · [Cost Centre]` with monthly hour values in the grid cells. Euro equivalent shown below hours in muted text (same pattern as the parent row: `120h` primary, `€14.400` secondary).

---

### C-06: External resource row expansion → vendor/consultant name

**Current state:** External cost rows in the F&P grid show the cost category and aggregated amounts, but clicking/expanding does not reveal vendor or consultant details.

**Required state:** Clicking an external cost row expands it to show:

- **Vendor/consultant name** — the company or individual providing the service
- **Contract reference** — PO number or contract identifier if available
- **Per-month breakdown** — individual line items if multiple vendors serve the same cost category

If multiple vendors are engaged under the same cost category, the expanded section shows one sub-row per vendor, each with vendor name, contract reference, and individual monthly amounts. The parent row shows the aggregated total.

Display format: `[Vendor Name] · [PO/Contract #]` with monthly euro values in the grid cells. For vendors with a role assignment (see C-07), also show the role in the sub-row header: `[Vendor Name] · [Role] · [PO #]`.

---

### C-07: Resource roles on external costs

**Current state:** External cost line items are categorised only by external cost type (Consulting, Cloud/Infrastructure, Licenses, Hardware, Other). There is no connection to the role catalogue used for internal resources.

**Required state:** External cost line items support an optional `role_type_id` foreign key linking to the same `RoleType` reference table used for internal resources.

#### Data model

Add `role_type_id` (FK to `role_types`, nullable) to the external cost line item entity. This is optional — not all external costs have a role association (e.g., licenses, hardware, cloud infrastructure don't map to a role). Consulting and leased staff categories will typically have a role.

#### UI impact

- **F&P grid external cost rows:** When a role is assigned, the row label shows `[Category] — [Role Name]` (e.g., "Consulting — Senior Developer"). When no role is assigned, the row label shows only the category as before.
- **External Costs tab:** Role column added to the vendor table. Filterable by role.
- **Capacity views:** External resources with role assignments can optionally appear in capacity planning views with an "External" badge, showing outsourcing ratio context.

#### Seed data

Update existing external cost line items for consulting-type entries to include role assignments. At least 5–6 line items across different projects should have roles assigned to demonstrate the feature.

---

### C-08: Baseline/Forecast/Actuals three-point cell display in F&P grid

**Current state:** F&P grid cells show a single value per cell (the forecast amount or hours).

**Required state:** Each cell in the F&P grid displays up to three values depending on temporal context and data availability. This restores the established pattern from v2/v3.

#### Cell rendering rules

**Past months (before current month, i.e., before April 2026):**

```
Actuals:    €12.500        (primary, bold, #0f172a)
Forecast:   €11.800        (secondary, muted, #94a3b8)
Baseline:   €10.000        (tertiary, smaller, #94a3b8)
```

All three values shown. Actuals is the primary value since the month is closed. If actuals exceed forecast, apply a subtle warm background tint (`#fffbeb`).

**Current month (April 2026):**

```
Forecast:   €13.200        (primary, bold, editable, #0f172a)
Actuals:    €8.400 (partial) (secondary, muted, #94a3b8, italic)
Baseline:   €12.000        (tertiary, smaller, #94a3b8)
```

Forecast is the primary editable value. Partial actuals shown with "(partial)" indicator.

**Future months (after current month):**

```
Forecast:   €14.000        (primary, bold, editable, #0f172a)
Baseline:   €13.500        (secondary, muted, #94a3b8)
```

Two values. No actuals exist for future months.

#### Hours rows (internal resources)

Same three-point pattern, but primary unit is hours with euro equivalent below:

```
Actuals:    140h            (primary)
            €16.800
Forecast:   120h            (secondary)
            €14.400
Baseline:   120h            (tertiary)
            €14.400
```

Euro values calculated as `hours × hourly_rate` from the rate table (per role, per competence centre, per effective date).

#### Summary columns

Three summary columns on the right side of the grid:

- **Baseline Total** — sum of baseline values across all months
- **Forecast Total** — sum of forecast values across all months
- **Actuals YTD** — sum of actuals for closed months only

A **Variance** column showing `Forecast Total − Baseline Total` with delta colour logic:
- Green (`#059669`): forecast < baseline (under budget)
- Red (`#dc2626`): forecast > baseline by ≥ 5%
- Blue (`#2563eb`): forecast > baseline by < 5%

#### Collapsed year cells

When a year is collapsed (per C-02), the summary cell shows the same three-point pattern but with yearly totals instead of monthly values.

#### Zero values

Display zero values as `—` in lighter gray (`#d1d5db`). Do not show the three-point stack for months where all three values are zero — show a single `—`.

---

### C-09: External Costs tab monthly grid overhaul

**Current state:** The External Costs tab in the Workbench shows a KPI strip (forecast, actuals YTD, open POs, variance vs baseline), a sortable category breakdown, and a sortable expandable vendor table. No monthly grid.

**Required state:** Add a full monthly grid as the primary view, with the existing vendor breakdown retained as a secondary section below.

#### Section 1 — KPI summary strip (enhanced)

Retain the existing 4 KPIs and add:

| KPI | Value |
|---|---|
| Total External Forecast | Current-year forecast for external costs |
| Actuals YTD | Year-to-date actuals (closed months) |
| Open POs | Total value of POs not yet fully invoiced |
| Remaining Not Invoiced | Open PO value minus actuals |
| Accruals | Total accrued amounts (estimated costs, invoices pending) |
| Variance vs. Baseline | External cost plan drift |

#### Section 2 — Monthly grid

A monthly grid with the same time axis, collapsible year columns (C-02), and sticky column behaviour as the F&P grid.

**Row structure:** One row per external cost line item, grouped by category header ("Consulting," "Cloud/Infrastructure," "Licenses," "Hardware," "Other" in uppercase muted gray).

**Columns per month:** Each month cell shows a stacked multi-value display:

```
Forecast:   €15.000        (primary, #0f172a)
Actuals:    €12.000        (if closed month, #059669)
Accrual:    €3.000         (if applicable, #7c3aed, italic)
PO/Obligo:  €15.000        (committed, #2563eb)
```

Not all values appear in every cell:
- Future months: Forecast only (+ PO/Obligo if a PO exists for future delivery)
- Past months: Forecast + Actuals + Accrual (if accrual exists) + PO status
- Current month: All applicable values

**Additional row-level columns (sticky right):**

| Column | Content |
|---|---|
| Vendor | Vendor name |
| Role | Role type (if assigned per C-07), otherwise `—` |
| PO # | Purchase order number (if exists) |
| Contract End | Contract end date (formatted as `MMM YYYY`) |
| Status | Procurement lifecycle status badge (Planned / Ordered / Goods Received / Invoiced / Accrual / Open) |
| Open PO | PO value minus invoiced amount |

**Status badge colours:**

| Status | Colour |
|---|---|
| Planned | Gray (`#94a3b8`) |
| Ordered / Obligo | Blue (`#2563eb`) |
| Goods Received | Amber (`#d97706`) |
| Invoiced | Green (`#059669`) |
| Accrual | Purple (`#7c3aed`) |
| Open | Red (`#dc2626`) |

**Row expansion:** Clicking a row expands to show the vendor/consultant name, contract details, PO line items, and delivery schedule — same pattern as C-06.

#### Section 3 — Vendor breakdown (retained, enhanced)

The existing vendor table remains below the monthly grid, enhanced with:

- **Contract reference column** — PO number or contract identifier
- **Contract end date column** — when the vendor engagement ends
- **Open PO amount** — committed but not yet invoiced
- **Remaining not invoiced** — open PO minus goods received

Clicking a vendor row still expands to show per-line-item detail.

#### Section 4 — Category breakdown (retained)

The existing category breakdown (visual rollup by category) remains below the vendor section. No changes.

#### Seed data for external costs

Ensure the seed data includes a realistic mix of procurement lifecycle statuses across projects:

- At least 3–4 line items as "Invoiced" (past months, fully closed)
- At least 2 items as "Ordered/Obligo" (PO issued, delivery pending)
- At least 1 item as "Goods Received" (delivered, invoice pending)
- At least 2 items as "Accrual" (cost estimated, no PO or no invoice yet)
- At least 3–4 items as "Planned" (future months, no procurement action)
- At least 1 item as "Open" (PO partially fulfilled)
- Contract end dates distributed across 2026–2028
- PO numbers in realistic format

---

## Global design patterns (reference)

These patterns are carried forward from v3/v5 and apply across all changes in this spec:

1. **Year separator lines:** Heavier left border at January columns on all monthly grids and charts. January labels bolded and darker.
2. **Collapsible year columns:** Clickable year labels with ▸/▾ chevron, primary blue (`#1e40af`), current year expanded by default, other years collapsed.
3. **No emojis:** Text and Lucide icons only throughout the application.
4. **European number formatting:** Dot for thousands, comma for decimals (`€14.400,00`).
5. **Monospace for financial data:** Tabular numbers in data cells for alignment.
6. **Elapsed month tinting:** Months before today get a subtle `#fafafa` background in all monthly grids.
7. **Three-point cell rendering:** Baseline, forecast, actuals stacked vertically with primary/secondary/tertiary visual weight as specified in C-08.
8. **Sticky columns and headers:** Row labels frozen on horizontal scroll, column headers frozen on vertical scroll, in all monthly grid surfaces.
