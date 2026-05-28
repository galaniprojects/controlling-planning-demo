# Capacity Module Redesign Specification

This document specifies the complete redesign of the CRETA Capacity Management module. It is the authoritative source for implementation. Where this spec conflicts with the original CPC Demo App Specification or the as-is module behavior, this spec takes precedence.

The document is organized into numbered design areas, each containing implementation-ready detail.

---

## 1. Overview & design philosophy

### 1.1 What is changing

The current module is a collection of loosely connected surfaces — My Team tab, Organization Overview tab, Resource Requests inbox, and Project Assignment page — each with its own layout patterns, drill-down models, and data representations. The redesign replaces this with a **single unified workspace** built around six principles:

1. **Person-centric visualization.** The primary visual is a horizontal stacked-bar timeline per person, where each colored segment represents a project allocation. Utilization becomes a derived signal (bar fill relative to capacity), not the primary data. Over-allocation and idle time are visually obvious without reading numbers.

2. **Unified workspace with scope + grouping controls.** The My Team / Organization Overview tab split is eliminated. A single surface supports scope selection (My CC, All CCs, specific location, specific hierarchy node) and grouping (by Role, by Project, by Person flat list). Every combination is valid. "My Team grouped by Role" is the CC Owner default; "All CCs grouped by Cost Center" is the Controller/Executive default.

3. **Inline assignment context.** Resource requests surface within the workspace. CC Owners can review, assign people, and confirm or decline directly from the side panel without navigating to a separate page. The Project Assignment page is absorbed into the workspace.

4. **Smart filtering.** A chip-based filter bar provides instant slicing: Over-allocated, Under-utilized, Has Pending Requests, Unassigned Months. Filters are combinable (AND logic).

5. **Side panel replaces bottom drawer.** All drill-down detail (person breakdown, cell breakdown, request actions) opens in a right-side slide-in panel. The timeline/grid remains fully visible on the left.

6. **Demand-vs-supply visibility.** An incoming demand strip at the bottom of the timeline shows pending resource requests per month, giving CC Owners and Controllers an at-a-glance view of unfulfilled demand against current capacity.

### 1.2 What is preserved

- **Role-based access model.** CC Owner = read/write for own CC. Controller = full read/write across all CCs. Executive = read-only. PL = limited read-only (new: role-level availability view). Permissions are enforced identically to the current module.
- **All current workflows.** Resource request confirmation, project-level confirm/decline, assignment of named people to requests, CR-driven re-confirmation — all remain functional. The workflows are re-surfaced within the new layout, not removed.
- **Data model.** `Allocation`, `ResourceRequest`, `ResourceRequestAssignment` tables are unchanged in structure. Two schema changes are required: (1) the `ResourceRequestAssignment` unique constraint is relaxed from `(resource_request_id, month)` to `(resource_request_id, month, person_id)` to support multi-person assignments (§9.5), and (2) a new `CapacityActionLog` table is added for the audit trail (§12.10). No existing tables are removed or renamed.
- **API surface.** Existing endpoints are reused. New endpoints may be added for features the current API does not support (e.g., demand-strip aggregation). No existing endpoints are removed.
- **Color bucket semantics.** Blue < 70%, green 70–89%, amber 90–100%, red > 100%. These thresholds are unchanged.

### 1.3 Component hierarchy (new)

```
/capacity
├── CapacityModuleNav.tsx              ← secondary nav: Workspace | Requests (N) | History
├── CapacityWorkspace.tsx              ← main workspace, route: /capacity
│   ├── ScopeBar.tsx                   ← scope pills + group-by pills
│   ├── KPISummaryBar.tsx              ← 5 KPI cards
│   ├── DashboardLayer.tsx             ← executive/controller charts (§11), conditional
│   │   ├── UtilizationDistributionCard.tsx
│   │   ├── CapacityForecastCard.tsx
│   │   ├── HeadcountBreakdownCard.tsx
│   │   └── HotspotListCard.tsx
│   ├── FilterChipBar.tsx              ← filter chips with counts
│   ├── TimelineView.tsx               ← main content area
│   │   ├── TimeAxisHeader.tsx         ← collapsible year/quarter/month columns
│   │   ├── RoleGroup.tsx              ← expandable role section (when grouped by role)
│   │   │   └── PersonTimelineRow.tsx  ← individual person bar row
│   │   ├── ProjectGroup.tsx           ← expandable project section (when grouped by project)
│   │   ├── FlatPersonRow.tsx          ← ungrouped person row (when grouped by person)
│   │   └── DemandStrip.tsx            ← incoming demand row at bottom
│   └── DetailSidePanel.tsx            ← right slide-in panel
│       ├── PersonDetail.tsx           ← person allocation breakdown + pending requests
│       ├── CellDetail.tsx             ← org-level cell drill-down
│       └── AssignmentPanel.tsx        ← assignment mode (§9)
├── RequestsInbox.tsx                  ← triage queue, route: /capacity/requests
│   ├── InboxFilterBar.tsx
│   ├── RequestTable.tsx
│   └── RecentlyCompletedSection.tsx
├── CapacityHistory.tsx                ← audit trail, route: /capacity/history
│   ├── HistoryFilterBar.tsx
│   ├── HistoryTable.tsx
│   └── Pagination.tsx
├── PLAvailabilityView.tsx             ← PL read-only view, route: /capacity/availability
│   ├── AvailabilityScopeBar.tsx
│   ├── AvailabilityKPIs.tsx
│   ├── AvailabilityGrid.tsx
│   └── AvailabilitySidePanel.tsx
├── PLAvailabilitySlideOver.tsx        ← Workbench slide-over wrapper (reuses PLAvailabilityView)
└── /capacity/project-assignment/:id   ← DEPRECATED — redirects to workspace + assignment panel
```

---

## 2. Unified workspace & scope model

### 2.1 Scope selector

A horizontal row of pill-shaped toggle buttons. Two groups separated by a visual divider:

**Scope group** (single-select):
- `My CC` — default for CC Owner. Scopes to `managed_cost_center_id`. For Controller, this pill is replaced by a searchable dropdown listing all CCs.
- `All CCs` — default for Controller and Executive. No CC filter applied.
- One pill per **location** present in the data: `Munich`, `Budapest`, `Pune` (derived from `Location` table). Scopes to all CCs at that location.
- One pill per **hierarchy node** at the top level of the active portfolio hierarchy: e.g., `TBS`, `RVS`, `Corporate IT`, `Digital & Data` if the active hierarchy is "Line of Business" (derived from `GroupingEntity` table filtered by the active hierarchy configuration — see ADM-01 in the v5 spec). The label group header reads the hierarchy name dynamically (e.g., "Line of Business" or "Division" or whatever the admin has configured). Scopes to all projects/allocations under that node.

The scope pills are dynamically generated from master data. If a location or hierarchy node has zero headcount, its pill is hidden.

**Group-by group** (single-select):
- `Role` — rows grouped by `RoleType`, each expandable to show people. Default.
- `Project` — rows grouped by project, each expandable to show allocated people. See §10.
- `Person` — flat list of all people, no grouping. Sorted by utilization descending (highest-utilized first).

### 2.2 Behavior rules

- Changing scope re-fetches all data (KPIs, timeline, demand strip) for the new scope.
- Changing group-by re-renders the timeline without a new fetch (the data is the same, only the grouping axis changes).
- The current scope + group-by combination is persisted in URL query params (`?scope=my_cc&group=role`) so it survives page refresh and back-navigation.
- For CC Owners, hierarchy node scope pills are visible but filter to "only people in my CC who are allocated to projects under this hierarchy node." This is a cross-cut: scope by org unit AND filter by demand origin.

### 2.3 Controller CC selector

When a Controller selects `My CC` scope, a dropdown appears next to the pill showing all cost centers. This replaces the current `CapacityManagement.tsx:77-95` CC selector. The dropdown is searchable (type-to-filter). Selecting a CC pins the view to that CC, identical to what a CC Owner sees.

### 2.4 Executive landing

Executives land on `All CCs` scope, `Role` grouping. The executive dashboard layer (§11) renders above the timeline when scope is `All CCs`.

### 2.5 Role gating

| Surface | Controller | CC Owner | Executive | PL |
|---|---|---|---|---|
| Workspace (all scopes/groups) | ✅ full read | ✅ read; write only for own CC allocations | ✅ read-only | ❌ blocked (see §13 for PL view) |
| Scope: My CC | ✅ with CC dropdown | ✅ pinned to own CC | ❌ hidden (no managed CC) | ❌ |
| Scope: All CCs / location / hierarchy node | ✅ | ✅ read-only | ✅ read-only | ❌ |
| Side panel: assignment actions | ✅ | ✅ for own CC | ❌ hidden | ❌ |
| Demand strip | ✅ | ✅ | ✅ read-only | ❌ |

---

## 3. Person-centric timeline bars

### 3.1 Visual model

Each person occupies one row. The row contains a **name cell** (fixed-width left column) and a series of **bar cells** (one per visible time column — month, quarter, or year depending on collapse state).

Each bar cell renders a single horizontal stacked bar:

```
┌─────────────────────────────────────────┐
│ ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  25% utilized
│ ████████████████████░░░░░░░░░░░░░░░░░░░ │  50% utilized
│ ████████████████████████████████████████ │  100% utilized
│ ████████████████████████████████████████▓▓│  110% over-allocated
└─────────────────────────────────────────┘
```

- The bar's **total fill width** represents utilization percentage relative to available capacity (standard hours for that person's location in that month).
- The bar is **subdivided into colored segments**, one per project the person is allocated to. Segment width is proportional to that project's hours relative to total available hours.
- An **empty gap** on the right side of the bar represents idle/available capacity.
- When total allocation exceeds 100%, the bar gets a `1.5px solid` border in the danger color (red) and the segments extend to their actual proportional width (the bar visually "overflows" its cell slightly via the border as a signal).

### 3.2 Color assignment

Each project is assigned a unique color from a rotating palette. Colors are stable within a session — the same project always gets the same color regardless of which person row it appears in. The palette uses the 9-color design system ramps (blue, teal, green, purple, coral, pink, amber — avoiding red and gray which are reserved for semantic meaning):

```
Project color assignment order:
  1. Blue (#85B7EB)
  2. Green (#97C459)
  3. Teal (#5DCAA5)
  4. Purple (#AFA9EC)
  5. Coral (#F0997B)
  6. Pink (#ED93B1)
  7. Amber (#EF9F27)
  ... cycles if > 7 projects visible
```

The color-to-project mapping is maintained in a `ProjectColorMap` context so it is consistent across all rows, the side panel, the legend, and the demand strip.

### 3.3 Row content

**Name cell** (left column, fixed 160px width):
- Person name (12px, primary text color, truncated with ellipsis if too long).
- On hover: tooltip showing full name + role.

**Aggregate role row** (when grouped by role):
- Name cell shows role name with expand/collapse chevron.
- Bar cells show a single bar at 50% opacity representing the **average utilization** of all people in that role for that month. No project-color segments — just a single color (the role's dominant project color, or a neutral gray if mixed).
- Click chevron to expand/collapse the person rows within.

### 3.4 Interaction

- **Click a person row** → opens the Detail Side Panel (§7) for that person.
- **Click an aggregate role row** → toggles expand/collapse of the person rows within. Does NOT open the side panel.
- **Hover a bar segment** → tooltip showing: `Project Name: Xh (Y%)` where X is allocated hours and Y is utilization contribution.
- **Hover an empty gap** → tooltip showing: `Available: Xh (Y%)`.

### 3.5 Empty rows

People with 0% utilization across ALL visible months are rendered with completely empty bars. They are **not hidden by default** (the CC Owner needs to see their full headcount). However, the "Under-utilized" filter chip (§6) can be used to isolate them, and a future enhancement could add a "Hide zero-allocation rows" toggle.

### 3.6 Sorting

Within a role group, people are sorted by **peak utilization descending** (the person with the highest single-month utilization in the visible window appears first). This surfaces potential problems at the top. Secondary sort: alphabetical by last name.

---

## 4. Collapsible time axis

### 4.1 Hierarchy

The time axis has three zoom levels:

```
Year (collapsed) → Quarter (collapsed) → Month (expanded)
```

Each level is independently controllable. A single row might show:

```
| 2025 | Q1 | Apr | May | Jun | Jul | Aug | Sep | Q4 | 2027 |
  year   qtr  ─── expanded Q2 ───  ─── expanded Q3 ───  qtr   year
```

### 4.2 Header rendering (`TimeAxisHeader.tsx`)

The header is a two-row structure:

**Row 1 (top):** Year and quarter labels. Each is a clickable element with a chevron icon.
- Collapsed year: `▶ 2025` — single column, width = 1 column unit.
- Collapsed quarter: `▶ Q1` — single column, width = 1 column unit.
- Expanded quarter: `▼ Q2 2026` — spans 3 columns (one per month).
- Expanded year with collapsed quarters: `▼ 2026` — spans 4 columns (one per quarter).

**Row 2 (bottom):** Month labels. Only visible under expanded quarters. Shows 3-letter abbreviations: `Apr`, `May`, `Jun`, etc.

### 4.3 Click behavior

- Click a collapsed year → expands to 4 quarter columns (all quarters collapsed).
- Click a collapsed quarter → expands to 3 month columns.
- Click an expanded quarter label → collapses back to 1 quarter column.
- Click an expanded year label → collapses all quarters within it back to 1 year column.

### 4.4 Summary bars for collapsed periods

When a quarter or year is collapsed, each person's bar cell for that column renders a **summary bar**:

**Computation:**
- Utilization = arithmetic mean of the monthly utilization values within the period.
- Project segments = each project's average hours across the period, rendered as proportional segments in the same colors as the expanded view.
- A project that appears in only some months within the period still gets a segment — its average is computed across only the months it appears in, then scaled proportionally against the total.

**Visual rules:**
- Summary bars are rendered at `opacity: 0.85` to visually distinguish them from month-level bars (which are at `opacity: 1.0`).
- If **any month** within the collapsed period has utilization > 100%, the summary bar gets the red over-allocation border, even if the average is below 100%. This ensures over-allocation is never hidden by collapsing.
- Tooltip on hover shows: `Q3 2026 avg: 88% — Oct: 88%, Nov: 88%, Dec: 88%` (breakdown of individual months).

### 4.5 Default collapse state

- The **current fiscal year** is expanded to quarters, with the **current quarter** expanded to months. All other quarters within the current year are collapsed.
- **Past years** are collapsed to year level.
- **Future years** beyond the current year are collapsed to year level.
- The visible window spans from the earliest allocation in the dataset to `demo_date + 23 months` (approximately 2 years forward).

### 4.6 Column width rules

- Expanded month column: `42px` fixed.
- Collapsed quarter column: `48px` fixed.
- Collapsed year column: `48px` fixed.

These are fixed widths, not proportional. The timeline area scrolls horizontally if the total column width exceeds the available space. The name column (160px) is sticky-left during horizontal scroll.

---

## 5. KPI summary bar

### 5.1 Layout

Five `SummaryCard` tiles in a responsive grid (`grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))`). Positioned between the scope bar and the filter bar.

### 5.2 Cards

| # | Label | Value | Computation | Sub-text |
|---|---|---|---|---|
| 1 | Headcount | Integer | Count of distinct `Person` records within current scope. Only active people (`is_active=true`). | — |
| 2 | Avg utilization | Percentage (1 decimal) | Mean of all person-month utilization values within the **visible expanded time window** (not just the current month). | `"{start}–{end} window"` showing the visible date range. |
| 3 | Over-allocated | Integer | Count of distinct people who have utilization > 100% in **any month** within the visible window. | `"across {N} months"` where N = count of visible months. |
| 4 | Pending requests | Integer | Count of `ResourceRequest` rows with `status='pending'` directed at CCs within the current scope. | — |
| 5 | Supply gap | String: `"{N} roles"` | Count of distinct `role_type_id` values where total pending request hours exceed total available hours (based on people with utilization < 100%) for any month in the visible window. | `"demand > available"` static sub-text. |

### 5.3 Scope sensitivity

All KPI values recompute when scope changes. When scope is `My CC`, the headcount reflects just that CC. When scope is `All CCs`, it reflects the entire organization. When scope is a location, it reflects all CCs at that location.

### 5.4 Click behavior

Each KPI card is clickable. Clicking activates the corresponding filter chip (§6):
- Headcount → no filter (shows all).
- Avg utilization → no filter.
- Over-allocated → activates "Over-allocated" filter.
- Pending requests → activates "Pending requests" filter.
- Supply gap → activates "Unassigned months" filter.

---

## 6. Filter chips & smart filtering

### 6.1 Chip set

A horizontal row of pill-shaped toggle buttons, positioned below the KPI bar and above the timeline.

| Chip | Label | Count source | Filter logic |
|---|---|---|---|
| All | `All` | Total person count in scope | No filter. Shows all rows. Default active state. |
| Over-allocated | `Over-allocated` | Count of people with any month > 100% in visible window | Show only person rows where `max(utilization) > 100%` in any visible month. |
| Under-utilized | `Under-utilized` | Count of people with avg utilization < 40% across visible window | Show only person rows where `avg(utilization) < 40%` across all visible months. Threshold is 40% (configurable in planning parameters). |
| Pending requests | `Pending requests` | Count of people who are `assigned_person_id` on any pending `ResourceRequest` | Show only person rows who have at least one pending request targeting them. |
| Unassigned months | `Unassigned months` | Count of people with pending requests that have unassigned month cells | Show only person rows linked to requests with `ResourceRequestAssignment` gaps. |

### 6.2 Behavior

- Chips are **mutually exclusive** with the "All" chip. Selecting any specific filter deactivates "All." Selecting "All" deactivates all specific filters.
- **Multiple specific filters can be active simultaneously** (AND logic). Activating "Over-allocated" + "Pending requests" shows only people who are BOTH over-allocated AND have pending requests.
- Each chip displays a count badge showing how many people match that filter in the current scope, regardless of whether the filter is active. Counts update when scope changes.
- When a filter is active, role groups that contain zero matching people are hidden entirely (the group header disappears). Role groups with partial matches show only the matching people.
- The aggregate role row recalculates to reflect only the visible (filtered) people.

### 6.3 Visual state

- Inactive chip: transparent background, secondary text color, tertiary border.
- Active chip: primary text color background, inverted text color (background-primary), no border.
- Count badge: inline after the label text, slightly reduced opacity.

---

## 7. Side panel detail view

### 7.1 Layout

A right-side slide-in panel, 280px wide, that appears when a person row or an org-level cell is clicked. The panel pushes the timeline area narrower (the timeline area is `calc(100% - 280px)` when the panel is open). A close button (×) in the panel header dismisses it and restores the full timeline width.

### 7.2 Person detail content (`PersonDetail.tsx`)

Displayed when a person row is clicked in any grouping mode.

**Header:**
- Person name (16px, weight 500).
- Role name (13px, secondary text color).
- Location badge (12px, e.g., "MUC").

**Section: Allocations**
- One row per project the person is allocated to in the visible window.
- Each row: project color dot (8px square, matching the timeline segment color) + project name + hours per month (right-aligned, secondary text).
- Clicking a project name navigates to `/workbench?project={id}`.

**Section: Monthly summary**
- A compact table showing utilization by quarter (or by month if the current quarter is expanded).
- Each row: period label + utilization percentage, colored by the standard bucket (blue/green/amber/red).
- Shows the full visible window, not just the current month.

**Section: Pending requests** (conditional — only shown if this person has pending requests)
- A card with warning-style border (dashed, amber).
- Title: "Pending request" (or "Pending requests" with count if multiple).
- For each request: project name, requested role, hours/month, period.
- Action button: `Review project` — opens the project-level assignment panel (§9) for that request's project.

**Section: Demand pipeline** (conditional — only shown if there are pending requests for this person's role in their CC)
- Shows unassigned requests for the same role type that could potentially be assigned to this person.
- Each row: project name + hours/month + period.
- A "Review project" button on each row opens the assignment panel (§9) for that project.

### 7.3 Cell detail content (`CellDetail.tsx`)

Displayed when clicking a cell in the Org-level view (scope = All CCs / location / hierarchy node) on an aggregate row (not a person row). Replaces the current `OrgDetailDrawer`.

**Header:**
- Row label + month/quarter/year (e.g., "MUC / App Development — Q3 2026").

**Summary block:**
- Three values side by side: `Allocated` (total hours), `Available` (total capacity hours), `Delta` (available − allocated). Delta is green when positive, red when negative.

**Project allocations list:**
- One row per project with hours in this slice.
- Each row is expandable (chevron) to show per-person hours within that project.
- Clicking a project name navigates to `/workbench?project={id}`.

### 7.4 Panel transitions

- Opening a new person while the panel is already open: the panel content cross-fades (no close-then-reopen animation).
- Switching between person detail and cell detail: same cross-fade behavior.
- Keyboard: `Escape` closes the panel.

---

## 8. Demand-vs-supply strip

### 8.1 Position

A single row pinned to the bottom of the timeline area, below all role groups / person rows. It is always visible (does not scroll with the person rows if the timeline scrolls vertically — it is sticky-bottom).

### 8.2 Content

The demand strip shows, for each visible time column (month/quarter/year), the count of **unfulfilled resource requests** directed at CCs within the current scope.

**Per-cell value:**
- Count of `ResourceRequest` rows where `status IN ('pending', 'partially_fulfilled')` AND the request's period overlaps with the time column AND the request is for a CC within the current scope.
- Displayed as `+N` (e.g., `+3`) in the cell.

**Per-cell color:**
- 0 unfulfilled: empty cell (no background).
- 1–2 unfulfilled: warning background + warning text color.
- 3+ unfulfilled: danger background + danger text color.

### 8.3 Collapsed period behavior

When a quarter or year is collapsed, the demand cell shows the **peak** unfulfilled count from any month within the period (not the sum, not the average — the worst month). This surfaces the worst-case demand signal.

### 8.4 Click behavior

Clicking a demand strip cell opens the side panel with a filtered list of the unfulfilled requests for that time period. Each request shows: project name, role requested, hours/month, priority, submitting PL. Each request has a "Review project" button that opens assignment mode (§9) for that project. Visible to all roles with write access; read-only for Executives.

### 8.5 Visibility

The demand strip is visible to all roles that have access to the workspace (Controller, CC Owner, Executive). PLs do not have access to the workspace and use a separate availability view instead (§13).

---

## 9. Assignment interaction

Assignment mode is a **project-level** operation. When activated, the side panel shows ALL resource requests for one project, and the timeline overlay shows the full project footprint across all matching roles simultaneously. This replaces the standalone `/capacity/project-assignment/:id` page entirely.

### 9.1 Entry points

Assignment mode can be triggered from three places. All three land on the same panel state — the project-level assignment view:

1. **From the person detail side panel.** When viewing a person who has a pending request, a "Review project" button appears on the pending request card. Clicking opens assignment mode for that project.
2. **From the demand strip.** Clicking a demand strip cell shows pending requests for that period. Each request has a "Review project" button that opens assignment mode for its parent project.
3. **From the Resource Requests inbox (§12).** Clicking "Review & Assign" on a project card opens assignment mode. This is the same entry point as the current `/capacity/requests` → `/capacity/project-assignment/:id` flow, but now it opens the side panel instead of navigating away.

### 9.2 Assignment panel layout (`AssignmentPanel.tsx`)

The side panel widens to **400px** when in assignment mode (from the standard 280px detail panel width). This provides enough room for the month grid within each role section. The timeline area shrinks accordingly.

**Panel structure, top to bottom:**

**Project header:**
- Project name (16px, weight 500).
- Meta line: hierarchy node badge (e.g., LoB badge), PL name, period (`2026-04 – 2027-03`), project status badge.
- If opened from a CR: a blue banner showing CR ID, summary text, and change direction legend (blue ring = increase, orange ring = decrease).

**Progress bar:**
- A compact horizontal bar showing overall assignment completion: `"14 of 19 months assigned"`.
- The bar fills proportionally. Color: info (blue) when incomplete, success (green) when 100%.

**Role sections (one per resource request in the project):**

Each `ResourceRequest` with `request_type='resource'` for this project gets its own collapsible section. Sections are separated by a visible divider (1px border, secondary color) and have distinct section headers.

**Role section header:**
- Role name (e.g., "Senior Developer"), weight 500.
- Request meta: `80h/mo | high priority | Jun–Dec 2026`.
- Section completion badge: `"7/7"` (green) or `"3/7"` (amber).
- Expand/collapse chevron. All sections are expanded by default.

**Role section body — month-by-month assignment grid:**

A vertical list of month rows within the request's `period_start..period_end`:

```
┌──────────────────────────────────────────────────┐
│  Quick fill: [Person picker dropdown ▾]   [Fill] │
├──────────────────────────────────────────────────┤
│  Jun 2026    80h    F. Keller (52%) ✕   [+ Add]  │
│  Jul 2026    80h    F. Keller (52%) ✕   [+ Add]  │
│  Aug 2026    80h    ── unassigned ──    [Assign]  │
│  Sep 2026    80h    ── unassigned ──    [Assign]  │
│  ...                                              │
└──────────────────────────────────────────────────┘
```

Each month row contains:
- **Month label** (e.g., "Jun 2026").
- **Requested hours** (e.g., "80h"). For CR re-confirmations with `change_direction`, this shows the diff: `80h → 120h (+40h)` with blue text for increases, orange for decreases.
- **Assignment slot(s):** Either "unassigned" with an [Assign] button, or the assigned person's abbreviated name (e.g., "F. Keller") with their projected utilization in parentheses and a remove button (✕). For multi-person assignments, multiple person chips appear in a row, each with their hours portion.
- **[+ Add] button:** Appears on already-assigned months. Clicking opens the person picker to add a second (or third) person to this month, splitting the hours. See §9.5.

**Quick fill row** (top of each role section):
- A person picker dropdown. Selecting a person and clicking "Fill" assigns that person to ALL currently unassigned months in this role section. Already-assigned months are not overwritten.
- This replaces the current "All" column from the assignment grid.

**External cost requests:**

`ResourceRequest` rows with `request_type='external_cost'` get their own section at the bottom of the panel, below all resource sections. Each external cost request shows: cost type, amount/month, period, and a simple Confirm / Decline action pair (no person assignment needed). This addresses the current gap where external cost requests are invisible in the assignment grid.

### 9.3 Person picker (`PersonPicker.tsx`)

Opened by clicking [Assign] on an unassigned month row, [+ Add] on an assigned month row, or the quick-fill dropdown.

**Layout:** An inline dropdown anchored to the button that triggered it.

**Content — two groups:**

**"Matching role" group:**
- All people in the current scope's CC(s) whose `role_type_id` matches the request's role.
- Each row: person name, current utilization for this month (e.g., "52%"), and a projected utilization if assigned (e.g., "→ 102%"). Projected value is colored by the standard bucket.
- Sorted by current utilization ascending (most available first).

**"Other roles" group:**
- All other people in the current scope's CC(s).
- Each row: person name, role badge (e.g., "Developer"), current utilization, projected utilization.
- Sorted by current utilization ascending.

**Conflict warning:** If assigning a person would push them over 100% for that month, the projected utilization is shown in red and a small warning icon appears. Assignment is still allowed — the warning is informational, not a hard block. This preserves the current behavior.

**Search:** The dropdown includes a type-to-filter text input at the top for fast lookup when the CC has many people.

**Hours input for partial assignments:** When the person picker is opened via [+ Add] (adding a second person to an already-assigned month), an hours input field appears next to the person selection. The remaining unassigned hours for that month are pre-filled. See §9.5.

### 9.4 Timeline overlay during assignment mode

When assignment mode is active, the timeline reacts to show the project's full capacity footprint:

**Ghost segments:**
- For EVERY resource request in the project (all roles simultaneously), ghost segments appear on the timeline bars of people who could potentially fulfill that request.
- A ghost segment is a dashed-border, semi-transparent (30% opacity) block in the project's color, sized to represent the requested hours relative to the person's available capacity.
- Ghost segments appear on the bars for each month within the request's period.

**Role differentiation:**
- People whose role matches the request role: ghost segments at 30% opacity with a 1.5px dashed border in the project's color. These are the primary candidates.
- People in other roles: ghost segments at 15% opacity with a 1px dashed border. These are fallback candidates — visually present but clearly secondary.

**Over-allocation preview:**
- If adding the ghost segment's hours to a person's existing allocation would exceed 100%, the ghost segment's dashed border becomes red instead of the project color. This makes over-allocation risk visible before any assignment is committed.

**All roles visible simultaneously:**
- The timeline shows ghosts for ALL resource requests in the project at once. If the project needs a Senior Developer, a Developer, and a QA Engineer, all three sets of ghosts appear on the appropriate people's bars. Each role's ghosts use the same project color but appear on different people's rows, making the full project footprint visible.
- Role groups that contain matching people auto-expand if they were collapsed.

**Assignment feedback:**
- When a person is assigned to a month (via the side panel or by clicking a ghost segment — see §9.6), the ghost segment for that person-month becomes solid (full opacity, solid border, matching regular allocation style).
- All other ghost segments on ALL people in the timeline recalculate immediately. If assigning Felix to October pushed him to 95%, his November ghost segment might now show a red-tinted dashed border because adding more hours there would exceed 100%.
- KPI cards (§5) update live as assignments are made.

**Exiting overlay:**
- Ghost segments are removed when assignment mode is closed.
- No permanent visual changes are applied to the timeline until the CC Owner explicitly saves.

### 9.5 Multi-person partial assignment

A single resource request month can be fulfilled by multiple people, each contributing a portion of the requested hours. Hours are the split unit (not percentage).

**How it works:**

1. A month row starts with the full requested hours unassigned (e.g., "80h — unassigned").
2. The CC Owner clicks [Assign] and picks Person A. By default, Person A is assigned the full 80h.
3. If the CC Owner wants to split, they click [+ Add] on that month row. The person picker opens with an hours input pre-filled with the remaining hours. They pick Person B for, say, 40h. Person A's assignment automatically adjusts to 40h (the system enforces that assigned hours sum to the requested total, but the CC Owner can manually override individual amounts).
4. The month row now shows two person chips: `F. Keller 40h (72%) ✕` and `L. Fischer 40h (45%) ✕`.

**Visual on timeline:**
- When a month has a multi-person split, the corresponding bar cells for each assigned person show their individual portion as a solid segment. The segment width is proportional to their assigned hours, not the full request hours.

**Data model implication:**
- The `ResourceRequestAssignment` table's unique constraint on `(resource_request_id, month)` must be relaxed to `(resource_request_id, month, person_id)`. This allows multiple rows per request-month, one per assigned person.
- The `hours` field on each `ResourceRequestAssignment` row reflects that person's portion.
- Validation rule: the sum of `hours` across all assignments for a given `(resource_request_id, month)` must equal the request's `hours_or_amount_per_month` for that month (or the month-specific forecast value). If it doesn't, the month is considered partially assigned.

**Partial fulfillment:**
- A month can be intentionally left partially assigned. For example, the request asks for 80h but only 40h is assigned to one person. The remaining 40h shows as an "unassigned remainder" in the month row.
- The section completion badge counts a month as "assigned" only when the full requested hours are covered. Partial months count toward a "partially assigned" state displayed as e.g., `"5/7 full, 2 partial"`.
- The "Confirm & send to controller" button (§9.7) can be used even with partial months — but the panel shows a warning: "2 months are partially assigned. Confirm anyway?" This maps to the existing `partially_fulfill` API action.

### 9.6 Assignment gesture from the timeline

In addition to assigning from the side panel, the CC Owner can assign directly by interacting with ghost segments on the timeline:

**Click a ghost segment on a person's bar:**
- Assigns that person to that month for the full remaining hours.
- The ghost segment becomes solid. The side panel month row updates to show the assignment.
- If the month already has a partial assignment, clicking the ghost assigns the person for the remaining hours only.

**Click a person's name cell (not a specific month):**
- Bulk-assigns that person to ALL unassigned months in the request that matches their role.
- A confirmation tooltip appears first: "Assign {name} to {N} months of {role request}? [Confirm] [Cancel]".
- Only unassigned months are affected. Already-assigned months are not overwritten.

**Which request does a ghost belong to?**
- Ghost segments are visually identical across all role requests for the same project (same project color). When the CC Owner hovers a ghost, a tooltip shows: `"{Project Name} — {Role}: {hours}h"`. This disambiguates when a person matches multiple role requests (rare, but possible if the person's role matches one request and they're a fallback for another).

**Undo:**
- Clicking a solid (just-assigned) segment shows a small "✕ Remove" tooltip. Clicking it reverts the assignment to a ghost. This only works for assignments made during the current session that haven't been saved yet.

### 9.7 Save model and actions

Assignment mode uses **explicit save**. Changes accumulate in local state and are not persisted until the CC Owner takes an action.

**Action bar (sticky bottom of the assignment panel):**

Three buttons:

1. **"Save draft"** — persists all current assignments via `PUT /api/capacity/requests/{cc}/{rid}/assignments` for each modified request. Does NOT change project status. Does NOT create `Allocation` rows. The CC Owner can close the panel and return later to continue.

2. **"Confirm & send to controller"** — disabled until all months across all role sections are fully assigned (progress bar at 100%). On click:
   - If all months are fully assigned: calls `PUT /api/capacity/project-confirmation/{pid}/confirm`. Server creates `Allocation` rows from all `ResourceRequestAssignment` rows, sets project status to `pending_approval`, notifies Controller and PL.
   - If some months are partially assigned: the button label changes to "Confirm partial & send to controller". A warning banner appears: "{N} months are partially assigned. The controller will be notified of the partial fulfillment." On confirm: calls the confirm endpoint with a partial fulfillment flag.
   - After confirmation: the panel transitions to a success state showing "Confirmed — sent to controller for approval" with the project name. A "Close" button dismisses the panel and clears the timeline overlay.

3. **"Decline"** — opens an inline textarea for a decline reason. On submit: calls `PUT /api/capacity/project-confirmation/{pid}/decline`, notifies PL. The panel transitions to a decline-confirmed state.

**Unsaved changes protection:**
- If the CC Owner attempts to close the panel (×), navigate away, or change scope while there are unsaved assignment changes, a confirmation dialog appears: "You have unsaved assignments. [Save draft] [Discard] [Cancel]".
- "Save draft" persists and then proceeds with the navigation/close.
- "Discard" reverts all changes and proceeds.
- "Cancel" returns to the assignment panel.

### 9.8 CR re-confirmation specifics

When assignment mode is opened for a project via a Change Request (URL or entry point carries a `cr_id`):

**Panel header:**
- A blue banner appears below the project header: "Change Request CR-{id}: {summary}".
- A legend row: blue ring icon = "Hours increased", orange ring icon = "Hours decreased".

**Month rows:**
- Months affected by the CR show the change inline: `Jun: 80h → 120h (+40h)` in blue text for increases, `Aug: 120h → 80h (−40h)` in orange text for decreases.
- Months NOT affected by the CR show the previously assigned person pre-filled. The CC Owner only needs to handle changed months.
- New months added by the CR (the request period was extended) appear as unassigned rows.
- Months removed by the CR (period shortened) appear as struck-through rows with a note: "Removed by CR — allocation will be released on confirm."

**Timeline ghost overlay:**
- Ghost segments for increased months use a blue dashed border.
- Ghost segments for decreased months use an orange dashed border.
- Unchanged months show their existing solid allocation segments (no ghosts needed).

### 9.9 Relationship to existing API endpoints

| Action | Endpoint | Notes |
|---|---|---|
| Load project + all requests | `GET /api/capacity/project-assignment/{pid}?cr={cr_id}` | Existing endpoint. Returns project metadata + filtered requests + assignment status. |
| Load monthly hours for a request | `GET /api/capacity/requests/{cc}/{rid}/monthly-hours` | Existing endpoint. Returns per-month forecast hours. |
| Load current assignments | `GET /api/capacity/requests/{cc}/{rid}/assignments` | Existing endpoint. Returns per-month person assignments. |
| Save draft assignments | `PUT /api/capacity/requests/{cc}/{rid}/assignments` | Existing endpoint. **Changed behavior**: currently auto-saves per cell; now called explicitly on "Save draft" with the full assignment list for the request. Called once per modified request. |
| Preview assignment impact | `GET /api/capacity/requests/{cc}/{rid}/assignment-preview?person_id={pid}&month={m}` | Existing endpoint. Used to compute projected utilization in the person picker. |
| Confirm project | `PUT /api/capacity/project-confirmation/{pid}/confirm` | Existing endpoint. Creates `Allocation` rows, notifies controller + PL. |
| Decline project | `PUT /api/capacity/project-confirmation/{pid}/decline` | Existing endpoint. Requires reason text. |
| Confirm single request (partial) | `PUT /api/capacity/requests/{cc}/{rid}/partially-fulfill` | Existing endpoint (currently unused by UI). Now used when confirming with partial months. |

**New endpoint needed:**
- `PUT /api/capacity/requests/{cc}/{rid}/assignments` — the existing endpoint's behavior changes from "replace all assignments" to "replace all assignments" (no functional change), but the schema must now accept multiple `person_id` entries per month to support multi-person assignments (§9.5). The request body changes from `[{month, person_id, hours}]` to `[{month, assignments: [{person_id, hours}]}]`.

### 9.10 Deprecation of `/capacity/project-assignment/:id`

The standalone Project Assignment page is deprecated. The route should remain temporarily as a redirect: navigating to `/capacity/project-assignment/{pid}` opens the workspace with the assignment panel pre-activated for that project. This preserves any bookmarks or cross-links from other modules (e.g., the Portfolio module's approval queue may link to this route).

The redirect logic:
1. Navigate to `/capacity`.
2. Set scope to the CC that owns the project's resource requests.
3. Open the assignment panel for the specified project.

### 9.11 Component structure

```
DetailSidePanel.tsx
├── PersonDetail.tsx           ← standard person view (§7.2)
├── CellDetail.tsx             ← org cell drill-down (§7.3)
└── AssignmentPanel.tsx        ← assignment mode (this section)
    ├── ProjectHeader.tsx      ← project name, meta, CR banner
    ├── AssignmentProgress.tsx ← progress bar + completion count
    ├── RoleSection.tsx        ← one per resource request
    │   ├── RoleSectionHeader.tsx  ← role name, meta, completion badge
    │   ├── QuickFill.tsx          ← bulk person picker + fill button
    │   └── MonthRow.tsx           ← per-month assignment row
    │       ├── PersonChip.tsx     ← assigned person badge with remove
    │       └── PersonPicker.tsx   ← candidate dropdown with utilization
    ├── ExternalCostSection.tsx ← external cost requests (confirm/decline only)
    └── AssignmentActionBar.tsx ← save draft / confirm / decline buttons
```

---

## 10. Group-by-project view

The project view flips the primary axis from "who do I have?" (role view) to "what are they working on?" Projects become the parent groups, with assigned people and unfulfilled request slots as child rows. This gives Controllers and CC Owners a staffing-completeness perspective.

### 10.1 When active

The project view is active when the user selects the `Project` pill in the group-by control (§2.1). All other workspace elements — scope pills, KPI bar, filter chips, time axis, side panel — continue to function identically. Only the grouping of rows within the timeline area changes.

### 10.2 Row structure

**Project group row** (expandable, analogous to role group row in role view):

```
┌──────────────────────────────────────────────────────────────┐
│ ▼ Predictive Maintenance PoC   TBS  ●  A. Zeiner   [3/3 ✓] │
│   ├── Felix Keller         Sr Developer  [████░░] [████░░]  │
│   ├── Jan Schmidt          Developer     [██████] [██████]  │
│   └── ── QA Engineer ── unassigned ──    [╌╌╌╌╌╌] [╌╌╌╌╌╌] │
└──────────────────────────────────────────────────────────────┘
```

Three types of child rows within each project group:

1. **Assigned person rows.** One row per person who has an `Allocation` for this project in the visible time window. Shows the person's allocation to THIS project only.
2. **Unassigned request slot rows.** One row per `ResourceRequest` with `status IN ('pending', 'partially_fulfilled')` for this project. Represents demand that has not been fully staffed.
3. **External cost rows.** One row per `ResourceRequest` with `request_type='external_cost'` for this project. Shown with a distinct icon (€/$ symbol) and no person assignment — just cost confirmation status.

Child rows are sorted within each project:
- Assigned person rows first, sorted by hours descending (the person contributing the most hours appears first).
- Unassigned request slot rows next, sorted by period start ascending.
- External cost rows last.

### 10.3 Project group row content

**Name cell (left column, 160px):**
- Expand/collapse chevron.
- Project name (12px, weight 500, truncated with ellipsis).
- Hierarchy node badge (e.g., "TBS") — compact, secondary color, 10px text. Derived from the project's assignment in the active portfolio hierarchy.
- PL name (11px, tertiary color).
- Staffing status badge (right-aligned in the name cell):
  - `"3/3 ✓"` (green) — all role requests fully assigned.
  - `"2/4"` (amber) — some requests unassigned or partial.
  - `"0/3"` (red) — no requests assigned.

The badge denominator is the count of resource-type `ResourceRequest` rows for this project within the visible time window. The numerator is the count of those that are fully assigned for all months in the window.

**Bar cells — fulfillment bar:**

Each time column shows a fulfillment bar representing how much of the project's total requested hours for that month are covered:

- **Solid fill:** sum of assigned hours (from `Allocation` rows) as a proportion of total requested hours (from `ResourceRequest` forecast values) for that month.
- **Dashed remainder:** unfulfilled portion (total requested − assigned). Rendered as a dashed-border segment appended to the solid fill, using the project's color at 25% opacity with a dashed border.
- Width of the full bar (solid + dashed) represents the total requested hours relative to a reference maximum. The reference maximum is the highest total-requested-hours month across all visible projects. This ensures the bars are comparable across projects.

Examples:
- Project requests 160h total in October, 120h is assigned → bar is 75% solid + 25% dashed.
- Project requests 80h total in November, all assigned → bar is 100% solid, no dashed segment.
- Project has no requests for December → empty cell.

Fulfillment bar color: uses the project's assigned color from the `ProjectColorMap` (§3.2).

### 10.4 Assigned person row content

**Name cell:**
- Person name (12px, secondary text color, indented 20px from left edge).
- Role badge (10px, compact pill, tertiary color) — e.g., "Sr Developer".

**Bar cells — single-project allocation bar:**

Each time column shows a bar with TWO layers:

1. **Background layer (total utilization indicator):** A faded bar (15% opacity, neutral gray) showing the person's total utilization from ALL projects combined. Width = total utilization percentage. This gives context — you can see if someone is near capacity even though this row only shows one project's allocation.

2. **Foreground layer (this project's allocation):** A solid bar in the project's color showing the hours allocated to THIS project specifically. Width = this project's hours as a proportion of the person's total available capacity.

This means a bar showing a small green foreground segment against a wide faded background tells you "this person is heavily allocated overall, but only a small portion is for this project."

**Hover tooltip:** `"{Project}: {X}h ({Y}%) | Total: {Z}% across all projects"`.

### 10.5 Unassigned request slot row content

**Name cell:**
- Role name in italics (e.g., "Senior Developer"), secondary text color, indented 20px.
- Status label: `"unassigned"` (12px, warning color) or `"partial — {X}h of {Y}h filled"` (12px, amber).
- An action icon: clicking opens the assignment panel (§9) for this project, pre-scrolled to the relevant role section.

**Bar cells — demand ghost bars:**

Each time column within the request's period shows a dashed-border bar:
- Width = requested hours for that month as a proportion of the reference maximum (same scale as the project row's fulfillment bar).
- Style: dashed border (1.5px), project color at 25% opacity fill. Same visual language as ghost segments in assignment mode (§9.4), but here they are always visible (no assignment mode required).
- Months outside the request's period: empty cells.

For partially fulfilled months, the bar is split: solid portion (assigned hours) + dashed portion (remaining). This matches the project row's fulfillment bar decomposition.

### 10.6 External cost row content

**Name cell:**
- Cost description (e.g., "SAP License Renewal"), secondary text color, indented 20px.
- Cost type badge (e.g., "Software", "Consulting"), tertiary color.

**Bar cells:**
- A thin bar (8px height instead of 18px) in a neutral color (gray), showing the period span. No utilization concept — just a timeline indicator of when the cost is active.
- A status icon on the first month: ✓ (confirmed) or ⏳ (pending confirmation).

### 10.7 Demand strip behavior

When group-by-project is active, the per-project demand strip (§8) is **hidden** because unfulfilled demand is already directly visible as unassigned request slot rows within each project group.

In its place, a **summary row** appears at the bottom with the label `"Total unassigned hours"`. Each time column cell shows the sum of unassigned request hours across ALL visible projects for that month, formatted as a number (e.g., `320h`). Color thresholds:
- 0h: empty cell.
- 1–200h: warning background.
- 200h+: danger background.

These thresholds are indicative and should be configurable. The summary row is sticky-bottom, same as the demand strip in role view.

### 10.8 Side panel behavior

The side panel content changes based on what the user clicks:

**Click a project group row → Project summary panel:**
- Project name (16px, weight 500).
- Meta: hierarchy node, PL name, project status, project period.
- Role-by-role assignment progress: a compact list showing each resource request with its staffing status (e.g., "Sr Developer: 7/7 months assigned ✓", "QA Engineer: 0/5 months — unassigned").
- Total allocated hours for the project across the visible window.
- "Review & assign" button → enters assignment mode (§9) for this project.
- "View in workbench" link → navigates to `/workbench?project={id}`.

**Click an assigned person row → Standard person detail (§7.2):**
- Same content as in role view. The person's full allocation breakdown (all projects, not just the one they were clicked from) appears in the Allocations section.

**Click an unassigned request slot row → Request detail:**
- Request metadata: role, hours/month, priority, period, submitting PL.
- A "Review project" button → enters assignment mode (§9) for the parent project, pre-scrolled to this role section.

### 10.9 Sorting

Project groups are sorted by **fulfillment percentage ascending** (least-staffed projects first). This surfaces the biggest staffing gaps at the top of the view.

Fulfillment percentage = (count of fully-assigned request-months) / (total request-months across all resource requests for the project within the visible window).

Secondary sort: project name alphabetical.

### 10.10 Filter chip behavior in project view

The filter chips (§6) adapt their meaning when group-by-project is active:

| Chip | Behavior in project view |
|---|---|
| All | Show all projects. Default. |
| Over-allocated | Show only projects that have at least one assigned person who is over-allocated in any month. |
| Under-utilized | Show only projects where fulfillment is below 50% (half or more of request-months are unassigned). |
| Pending requests | Show only projects that have at least one `status='pending'` resource request. |
| Unassigned months | Same as "Pending requests" in this view (all projects with pending requests have unassigned months by definition). This chip may be hidden or merged with "Pending requests" to avoid redundancy. |

Additionally, a new chip appears only in project view:

| Chip | Label | Behavior |
|---|---|---|
| Needs staffing | `Needs staffing` with count | Show only projects where fulfillment < 100%. Count = number of such projects. Hides fully-staffed projects. |

### 10.11 Collapsible time axis interaction

The collapsible time axis (§4) works identically in project view. Collapsed periods show summary bars:

- **Project group summary bar:** Fulfillment percentage averaged across the collapsed months. Solid + dashed proportions reflect the average.
- **Assigned person summary bar:** Average allocation to this project across the collapsed months, with faded total utilization background.
- **Unassigned slot summary bar:** Average demand hours across the collapsed months, dashed style preserved.

The red over-allocation border rule (§4.4) applies to assigned person rows: if any month within the collapsed period pushes the person over 100% total utilization, the summary bar gets the red border.

### 10.12 Scope interaction

Scope filtering (§2.2) governs which people and projects are visible:

- **Scope = My CC (default for CC Owner):** Show all projects that have at least one allocation or pending request involving a person from the CC Owner's cost center. Person rows within each project show ALL people assigned to the project regardless of their CC — the scope filters which projects appear, not which people within a project. This is important because a project typically spans multiple CCs.
- **Scope = All CCs:** Show all projects. All assigned people visible.
- **Scope = specific location:** Show all projects that have at least one allocation or pending request involving a person from a CC at that location. Person rows show all assigned people.
- **Scope = specific hierarchy node:** Show only projects assigned to that hierarchy node. All assigned people visible.

**Rationale for showing all people within a project regardless of CC scope:** A CC Owner needs to see the full staffing picture for projects that touch their team. If a project has 3 people from MUC and 2 from BUD, the MUC CC Owner scoped to "My CC" sees the project and all 5 people — because they need to understand who else is on the project to make good assignment decisions. The scope determines which PROJECTS appear, not which people within those projects.

### 10.13 Component structure

```
TimelineView.tsx
├── RoleGroup.tsx            ← used when group = "Role" (§3)
├── ProjectGroup.tsx         ← used when group = "Project" (this section)
│   ├── ProjectGroupRow.tsx  ← project header with fulfillment bar
│   ├── AssignedPersonRow.tsx← person row with dual-layer bar
│   ├── UnassignedSlotRow.tsx← dashed demand ghost row
│   └── ExternalCostRow.tsx  ← thin cost timeline row
├── FlatPersonRow.tsx        ← used when group = "Person"
└── DemandStrip.tsx          ← hidden in project view; replaced by:
    └── UnassignedSummary.tsx ← total unassigned hours summary row
```

---

## 11. Executive / Controller dashboard layer

The dashboard layer provides a strategic overview of capacity health across the organization. It surfaces distribution patterns, supply/demand trends, and actionable hotspots that would be invisible from the timeline alone.

### 11.1 Visibility rules

The dashboard renders as a collapsible section positioned between the KPI summary bar (§5) and the filter chip bar (§6). It appears when BOTH of the following conditions are true:

1. **User role is Controller or Executive.** CC Owners never see the dashboard — their primary workspace is the CC-scoped timeline.
2. **Scope is a multi-CC view.** This means scope is set to `All CCs`, a specific location, or a specific hierarchy node. When a Controller narrows scope to a single CC (via "My CC" + CC dropdown), the dashboard hides — at single-CC granularity the timeline itself provides sufficient detail.

**Collapse toggle:**
- A compact toggle bar at the top of the dashboard section: `"▼ Capacity Dashboard"` / `"▶ Capacity Dashboard"`.
- Clicking toggles visibility of the four chart cards.
- Collapse state is persisted in `localStorage` (key: `creta_capacity_dashboard_collapsed`). Returning users land in their last-used state.
- Default: expanded on first visit.

### 11.2 Layout

A two-row, two-column grid:

```
┌───────────────────────────────┬───────────────────────────────┐
│  Utilization distribution     │  Capacity forecast            │
│  (histogram)                  │  (area chart)                 │
├───────────────────────────────┬───────────────────────────────┤
│  Headcount breakdown          │  Hotspot list                 │
│  (segmented bar)              │  (ranked list)                │
└───────────────────────────────┴───────────────────────────────┘
```

Grid spec: `grid-template-columns: 1fr 1fr; gap: 12px;`. Each card has a consistent structure: card title (12px, weight 500, secondary color, uppercase), chart/content area, and an optional interactive control. Cards use `background: var(--color-background-secondary)`, `border-radius: var(--border-radius-lg)`, `padding: 16px`.

Total dashboard height target: ~280px when expanded (cards are compact, not full-page charts). This keeps the timeline visible below without excessive scrolling.

### 11.3 Card 1: Utilization distribution

**Type:** Horizontal bar chart (histogram).

**X axis:** Person count.
**Y axis:** Utilization buckets (categorical, top to bottom):
- `>100%` — red bar
- `76–100%` — amber bar
- `51–75%` — green bar
- `26–50%` — blue bar
- `1–25%` — blue bar (lighter)
- `0%` — gray bar

**Computation:**
- For each person in scope, compute their **average utilization** across the visible time window.
- Bucket the average into the appropriate range.
- Bar length = count of people in that bucket.

**Visual:**
- Bars are colored using the standard capacity color ramp (matching the timeline bar colors).
- Each bar has a count label at its right end (e.g., `"12"`).
- A healthy distribution has most people in the 51–100% range. Spikes at 0% or >100% indicate problems.

**Interactivity:**
- Click a bucket bar → activates the corresponding filter chip on the timeline below:
  - Click `>100%` → activates "Over-allocated" filter.
  - Click `0%` or `1–25%` → activates "Under-utilized" filter.
  - Click any other bucket → activates "All" (no specific filter; the visual highlight is informational).
- Hover: tooltip showing `"{bucket}: {N} people ({X}%)"` where X is the percentage of total headcount.

### 11.4 Card 2: Capacity forecast

**Type:** Area chart with three series.

**X axis:** Months, spanning the visible time window (matching the timeline's date range).
**Y axis:** Hours.

**Three series:**

1. **Available capacity** (solid line, neutral/gray fill below):
   - Per month: sum of `standard_available_hours` for all people in scope.
   - Represents total possible hours if everyone were 100% utilized.

2. **Allocated hours** (solid line, blue fill below):
   - Per month: sum of `Allocation.hours` for all people in scope.
   - Represents currently committed capacity.

3. **Incoming demand** (dashed line, no fill):
   - Per month: sum of `hours_or_amount_per_month` from `ResourceRequest` rows where `status IN ('pending', 'partially_fulfilled')` and `request_type='resource'` for CCs in scope.
   - Represents queued demand that hasn't been assigned yet.

**Gap shading:**
- Between "Available" and "Allocated": shaded green (surplus capacity).
- If "Allocated" exceeds "Available" in any month: the exceeded portion is shaded red (deficit).
- The area between "Allocated" and "Allocated + Incoming demand" can be visualized as a lighter dashed fill to show what utilization WOULD be if all pending requests were fulfilled.

**Visual rules:**
- Available line: 1.5px solid, `var(--color-text-tertiary)`.
- Allocated line: 1.5px solid, `var(--color-text-info)`.
- Demand line: 1.5px dashed, `var(--color-text-warning)`.
- Chart height: ~120px (compact). Y axis labels on the left, abbreviated (e.g., `"2.4k"` for 2400 hours).
- X axis labels: 3-letter month abbreviations, every month if space allows, else every other month.

**Interactivity:**
- Hover on a month: vertical crosshair showing all three values in a tooltip: `"Oct 2026 — Available: 7,840h | Allocated: 5,200h | Demand: 1,600h | Gap: +1,040h"`.
- Click on a month: auto-expands the containing quarter in the timeline below (if it was collapsed), scrolling the timeline to that month.

**Key insight this chart provides:** The crossover point where "Allocated + Demand" exceeds "Available" is the capacity cliff — the month where the organization will run out of people if all pending requests are fulfilled. This is the most strategically important data point on the dashboard.

### 11.5 Card 3: Headcount breakdown

**Type:** Horizontal segmented bar chart with a dimension switcher.

**Dimension switcher:** A compact dropdown in the card header allowing the user to switch between:
- `By location` (default) — segments are locations (MUC, BUD, PUN, etc.).
- `By hierarchy node` — segments are top-level nodes from the active portfolio hierarchy.
- `By role` — segments are role types.
- `By cost center` — segments are individual CCs.

Only one dimension is active at a time. Selection is persisted in `localStorage`.

**Visual:**
- A single horizontal stacked bar spanning the full card width.
- Each segment is proportionally sized by headcount and colored from a categorical palette (distinct from the project color palette to avoid confusion).
- Segment labels inside the bar if they fit (e.g., `"MUC 25"`), or in a compact legend below if segments are too narrow.
- Total headcount label at the right end of the bar.

**Interactivity:**
- Click a segment → changes the workspace scope to that entity:
  - Click "MUC" in by-location view → sets scope to "Munich".
  - Click "TBS" in by-hierarchy-node view → sets scope to that hierarchy node.
  - Click "Sr Developer" in by-role view → no scope change (roles aren't a scope dimension), but activates a filter on the timeline showing only that role group expanded.
  - Click a specific CC in by-cost-center view → sets scope to "My CC" with that CC selected in the dropdown.
- Hover: tooltip showing `"{segment}: {N} people, {X}% avg utilization"`.

### 11.6 Card 4: Hotspot list

**Type:** Ranked list of the top 5 capacity issues.

**Issue detection and ranking:**

The system scans the current scope for three categories of issues, each with a severity weight:

| Category | Detection logic | Severity weight |
|---|---|---|
| Over-allocation | Person with `max(monthly_utilization) > 100%` in visible window | `3 × (peak_utilization - 100) × months_affected` |
| Unfulfilled demand | `ResourceRequest` with `status='pending'` and unassigned months | `2 × unassigned_hours_total` |
| Chronic under-utilization | Person with `avg(monthly_utilization) < 10%` across 6+ consecutive months | `1 × idle_months × standard_hours_per_month` |

All detected issues are scored, sorted by severity descending, and the top 5 are displayed.

**Row format:**

Each row contains:
- **Icon:** Red warning triangle (over-allocation), amber clock (unfulfilled demand), blue down-arrow (under-utilization).
- **Summary text (12px):** A one-line natural-language description:
  - Over-allocation: `"F. Keller over-allocated Oct–Dec (88% avg, peak 102%)"`.
  - Unfulfilled demand: `"QA Engineer — 3 open requests, 480h unassigned across 2 projects"`.
  - Under-utilization: `"M. Wolf (Developer) — 0% utilized for 12 months"`.
- **Action target:** The entire row is clickable. Click behavior depends on issue type:
  - Over-allocation → opens person detail in side panel (§7.2).
  - Unfulfilled demand → opens side panel with the demand detail for that role (same as clicking a demand strip cell).
  - Under-utilization → opens person detail in side panel.

**List footer:**
- If more than 5 issues exist: a `"View all ({N} issues)"` link at the bottom. Clicking expands the list inline to show all issues (scrollable within the card, max height 300px). The link changes to `"Show less"` when expanded.
- If zero issues exist: the card shows a green checkmark with `"No capacity issues detected"`.

**Executive vs. Controller behavior:**
- Both roles see identical hotspot content.
- Controllers: clicking a hotspot row opens the detail AND shows action affordances (e.g., "Review & assign" in the side panel for demand hotspots).
- Executives: clicking a hotspot row opens the detail in read-only mode (no action buttons).

### 11.7 Scope reactivity

All four dashboard cards recompute when the scope changes:

| Scope | Dashboard behavior |
|---|---|
| All CCs | Full organizational view. All people, all projects, all requests. |
| Specific location | Filtered to people/projects at that location. Headcount breakdown still shows all dimensions but scoped data. |
| Specific hierarchy node | Filtered to projects under that node and people allocated to them. |
| My CC (single CC) | **Dashboard hides entirely** (§11.1). The timeline alone provides sufficient detail for a single CC. |

When the dashboard hides (scope narrowed to single CC), the transition is smooth — the dashboard section collapses with a slide-up animation, and the filter chips / timeline shift upward to fill the space.

### 11.8 Chart library

All four chart cards are implemented using `Recharts` (already in the project dependencies). Specific components:

- Utilization distribution: `<BarChart>` with `<Bar>` per bucket, `layout="vertical"`.
- Capacity forecast: `<AreaChart>` with `<Area>` for available/allocated, `<Line>` with `strokeDasharray` for demand.
- Headcount breakdown: `<BarChart>` with stacked `<Bar>` segments, `layout="vertical"`, single bar.
- Hotspot list: plain HTML/CSS, no chart library needed.

### 11.9 Component structure

```
CapacityWorkspace.tsx
├── ScopeBar.tsx
├── KPISummaryBar.tsx
├── DashboardLayer.tsx                    ← NEW (this section)
│   ├── DashboardToggle.tsx              ← collapse/expand bar
│   ├── UtilizationDistributionCard.tsx  ← histogram
│   ├── CapacityForecastCard.tsx         ← area chart with 3 series
│   ├── HeadcountBreakdownCard.tsx       ← segmented bar + dimension switcher
│   └── HotspotListCard.tsx             ← ranked issue list
├── FilterChipBar.tsx
└── TimelineView.tsx
```

### 11.10 Data requirements

The dashboard requires aggregated data that may not be served by existing endpoints. New or enhanced endpoints:

| Data need | Current endpoint | Enhancement needed |
|---|---|---|
| Utilization distribution buckets | None (computed client-side from person data) | No new endpoint — client-side aggregation from the same data that populates the timeline. |
| Capacity forecast (available + allocated per month) | `GET /api/capacity/my-team/{cc}` returns per-person data; no org-wide aggregation | New: `GET /api/capacity/org-summary?scope={scope}&start={date}&end={date}` returning `{month, available_hours, allocated_hours, demand_hours}[]`. This avoids fetching all person-level data just to sum it. |
| Headcount by dimension | None | New: `GET /api/capacity/headcount-breakdown?scope={scope}&dimension={location|hierarchy|role|cc}` returning `{label, count, avg_utilization}[]`. |
| Hotspot detection | None | New: `GET /api/capacity/hotspots?scope={scope}&limit=5` returning ranked issue list with severity scores. Server-side computation avoids sending all person data to the client for analysis. |

These endpoints are additive — no existing endpoints are modified or removed.

---

## 12. Resource Requests inbox & audit trail

The inbox and audit trail are two separate routes within the capacity module that complement the workspace. The inbox is a triage queue for pending requests. The audit trail is a transparency log of all capacity actions. Together with the workspace, they form a three-route structure accessible via a secondary navigation strip.

### 12.1 Module-level navigation

A compact secondary nav strip renders below the page title ("Capacity Management") and above the scope bar. Three links:

```
Workspace    Requests (9)    History
```

- **Workspace** → `/capacity` — the timeline + dashboard (§§2–8, 10–11).
- **Requests** → `/capacity/requests` — the triage inbox (this section).
- **History** → `/capacity/history` — the audit trail (§12.9–12.15).

The active route is indicated by an underline or weight change on the link. The "Requests" link includes a badge count of pending items (matching the KPI card count from §5.2). The badge is hidden when the count is zero.

**Role visibility:**

| Route | Controller | CC Owner | Executive | PL |
|---|---|---|---|---|
| Workspace | ✅ | ✅ | ✅ | ❌ |
| Requests | ✅ (all CCs) | ✅ (own CC only) | ❌ hidden | ❌ |
| History | ✅ (all CCs, all users) | ✅ (own CC, own actions) | ✅ read-only (all CCs, all users) | ❌ |

Executives can view the history (transparency) but not the requests queue (they don't action requests). The nav link for hidden routes does not render.

### 12.2 Inbox layout (`RequestsInbox.tsx`)

The inbox is a full-page table view — not a timeline, not a card grid. It is a task queue optimized for quick triage and routing to the workspace for action.

**Page structure:**
- Page header: "Resource Requests" title.
- Filter bar (§12.4).
- Request table (§12.3).
- Recently completed section, collapsed by default (§12.8).

### 12.3 Request table

A sortable table with one row per **project per cost center**. This means a project that spans three CCs appears as three rows — one for each CC's resource requests. This matches the operational reality: each CC Owner acts on their own CC's requests independently.

**Columns:**

| Column | Content | Sortable | Width |
|---|---|---|---|
| Project | Project name + hierarchy node badge. If CR: blue "CR" pill + one-line CR summary below. | ✅ alpha | flex |
| PL | Requesting Project Lead's name. | ✅ alpha | 120px |
| Cost center | CC name (e.g., "MUC / App Dev"). Hidden for CC Owners (they only see their own CC). Visible for Controllers. | ✅ alpha | 160px |
| Roles requested | Compact badge set: `"Sr Dev ×1"`, `"QA ×2"`. Each badge shows the role name and count of resource requests for that role. | — | 180px |
| Unassigned hours | Total unassigned hours across all requests for this project-CC combination. Formatted as `"480h"`. Color: amber if > 0, green if 0. | ✅ numeric | 100px |
| Age | Days since the earliest pending request in this project-CC combination was created. Formatted as `"12d"`. Color: red if > 14d, amber if > 7d, default otherwise. | ✅ numeric | 60px |
| Priority | Project priority badge: `"High"` (red), `"Medium"` (amber), `"Low"` (default). Derived from the project's `priority` field. | ✅ categorical | 80px |
| Status | One of: `"New"` (no assignments), `"In progress"` (some assignments saved as draft), `"Re-confirm"` (CR-triggered, distinct blue style). | ✅ categorical | 100px |
| Action | Primary button: `"Review & assign"` → opens `/capacity` with assignment mode pre-activated for this project (§9). Secondary dropdown: `"Decline all"` → decline entire project flow (§12.7). | — | 140px |

**Default sort:** Priority descending → Age descending. This surfaces the oldest high-priority items first.

### 12.4 Inbox filters

A horizontal filter bar above the table.

**Filter controls:**

| Filter | Type | Options |
|---|---|---|
| Status | Single-select pill group | All (default) / New / In progress / Re-confirm |
| Role | Multi-select dropdown | All role types present in the current request set. E.g., "Senior Developer", "QA Engineer". Filter shows only rows where at least one request matches the selected role(s). |
| PL | Multi-select dropdown | All PLs who have pending requests. Useful for Controllers managing many PLs. |
| CC | Multi-select dropdown | All CCs with pending requests. **Controller only** — hidden for CC Owners. |

Filters are combinable (AND logic). Active filter state is reflected in the URL query params for shareability.

### 12.5 CR differentiation

Projects with a pending Change Request are visually distinct from new project intake:

- The project name cell includes a `"CR"` pill badge (blue background, white text, 10px) next to the project name.
- Below the project name: a one-line CR summary in secondary text color (e.g., "Scope increase: +2 developers Q4").
- The status column shows `"Re-confirm"` in blue instead of the standard "New" or "In progress".
- Sorting by status groups re-confirmations separately from new requests.

### 12.6 Multi-CC fan-out

A project may have resource requests directed at multiple CCs (e.g., the project needs a Senior Developer from MUC and a QA Engineer from BUD). In the inbox:

- **CC Owner view:** Only rows for their CC appear. They see one row per project (since each project can only have one set of requests per CC).
- **Controller view:** All CC rows appear. A project spanning 3 CCs shows as 3 rows. The CC column disambiguates. The Controller can filter by CC to focus on a specific team's queue.

The "Review & assign" button on each row opens assignment mode scoped to that project AND that CC. The assignment panel (§9) shows only the resource requests for the relevant CC, not the full cross-CC picture. (The full picture is available by changing scope in the workspace.)

### 12.7 Decline flows

Two decline paths exist, at different granularities:

**Decline entire project (from inbox row):**
- The row's action dropdown includes a "Decline all" option.
- Clicking opens an inline expansion below the row: a textarea for the decline reason + a "Confirm decline" button.
- On confirm: calls `PUT /api/capacity/project-confirmation/{pid}/decline` with the reason text. All resource requests for this project at this CC are declined. The row transitions to a "Declined" state with a strikethrough and fades out after 3 seconds (moving to the "Recently completed" section).
- This is the fast path for "I can't staff any of this."

**Decline single request (from assignment panel):**
- Individual role requests within a project are declined from within the assignment panel (§9), not from the inbox. The CC Owner opens assignment mode, decides they can staff 2 of 3 roles, and declines the third from within the panel.
- This is not duplicated on the inbox — the inbox operates at the project level.

### 12.8 Recently completed section

A collapsed section at the bottom of the inbox page.

**Header:** `"▶ Recently completed (14)"` — shows count of items completed in the last 7 days. Click to expand/collapse. Collapsed by default.

**Content when expanded:**
- Same table structure as the main request table, but with an additional "Completed" column showing the completion timestamp and action taken (e.g., "Confirmed 3 days ago" or "Declined 5 days ago").
- Rows are sorted by completion date descending (most recent first).
- Rows are non-actionable — no "Review & assign" button. Clicking a row opens the project in the workspace in read-only mode (no assignment panel).
- A "View full history" link at the bottom navigates to `/capacity/history`.

**Data source:** The recently completed section queries the `CapacityActionLog` (§12.10) for the current user's (or current CC's) actions in the last 7 days.

---

### 12.9 Audit trail overview

The audit trail (`/capacity/history`) is a transparency log of all capacity management actions. It provides a chronological record of who did what, when, and for which projects.

### 12.10 Data model: `CapacityActionLog` table

A new table that records every significant capacity action.

```sql
CREATE TABLE capacity_action_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    action_type     TEXT NOT NULL,
        -- 'confirm', 'partial_confirm', 'decline', 'decline_request',
        -- 'assign_draft', 'reassign', 'cr_reconfirm'
    acting_user_id  INTEGER NOT NULL REFERENCES user(id),
    project_id      INTEGER NOT NULL REFERENCES project(id),
    cost_center_id  INTEGER NOT NULL REFERENCES cost_center(id),
    summary         TEXT NOT NULL,
        -- Human-readable summary, e.g., "Confirmed 3 roles, 720h total for Predictive Maintenance PoC"
    detail_payload  TEXT,
        -- JSON blob with structured detail:
        -- {
        --   "requests_affected": [{"request_id": 1, "role": "Sr Developer", "months": 7, "hours": 560}],
        --   "assignments": [{"person_id": 5, "person_name": "Felix Keller", "months": [1,2,3], "hours_per_month": 80}],
        --   "cr_id": null,
        --   "decline_reason": null
        -- }
    cr_id           INTEGER REFERENCES change_request(id),
        -- Non-null if action was triggered by a CR
    FOREIGN KEY (acting_user_id) REFERENCES user(id),
    FOREIGN KEY (project_id) REFERENCES project(id),
    FOREIGN KEY (cost_center_id) REFERENCES cost_center(id)
);

CREATE INDEX idx_cap_action_log_user ON capacity_action_log(acting_user_id, timestamp DESC);
CREATE INDEX idx_cap_action_log_project ON capacity_action_log(project_id, timestamp DESC);
CREATE INDEX idx_cap_action_log_cc ON capacity_action_log(cost_center_id, timestamp DESC);
CREATE INDEX idx_cap_action_log_time ON capacity_action_log(timestamp DESC);
```

**Write triggers:** The log is written to by the server-side confirmation, decline, and assignment-save endpoints. Every call to the following endpoints creates a log entry:

| Endpoint | Action type logged |
|---|---|
| `PUT /api/capacity/project-confirmation/{pid}/confirm` | `confirm` or `partial_confirm` |
| `PUT /api/capacity/project-confirmation/{pid}/decline` | `decline` |
| `PUT /api/capacity/requests/{cc}/{rid}/assignments` (save draft) | `assign_draft` |
| `PUT /api/capacity/requests/{cc}/{rid}/partially-fulfill` | `partial_confirm` |
| Confirm triggered by CR | `cr_reconfirm` |
| Decline single request within assignment panel | `decline_request` |

The `acting_user_id` is derived from the authenticated session — no client-side spoofing.

### 12.11 Audit trail page layout (`CapacityHistory.tsx`)

A full-page view with filters and a chronological table.

**Page structure:**
- Page header: "Capacity History" title.
- Filter bar (§12.12).
- History table (§12.13).
- Pagination.

### 12.12 History filters

A horizontal filter bar above the table.

| Filter | Type | Options | Default |
|---|---|---|---|
| Acting user | Searchable dropdown | All users who have log entries. | CC Owner: "Me". Controller: "All". Executive: "All". |
| Action type | Multi-select pill group | Confirm / Partial / Decline / Draft / Re-confirm | All selected |
| Cost center | Multi-select dropdown | All CCs with log entries. **Hidden for CC Owners** (auto-scoped to own CC). | All |
| Date range | Date picker pair (from / to) | Any valid date range. | Last 30 days |
| Project | Searchable dropdown | All projects with log entries. | All |

Filters are combinable (AND logic). Active filter state is reflected in URL query params.

### 12.13 History table

A chronological table, one row per log entry.

| Column | Content | Sortable | Width |
|---|---|---|---|
| Date | Timestamp formatted as `"May 07, 2026 14:32"`. | ✅ | 140px |
| User | Acting user's full name. | ✅ alpha | 140px |
| Action | Action type badge: `"Confirmed"` (green), `"Partial"` (amber), `"Declined"` (red), `"Draft saved"` (gray), `"Re-confirmed"` (blue). | ✅ categorical | 100px |
| Project | Project name + hierarchy node badge. | ✅ alpha | flex |
| Cost center | CC name. Hidden for CC Owners. | ✅ alpha | 140px |
| Summary | The human-readable summary from `capacity_action_log.summary`. E.g., `"Confirmed 3 roles, 720h total"`. | — | flex |
| Detail | Expand chevron (▶). Clicking expands the row to show the `detail_payload` rendered as a structured breakdown. | — | 40px |

**Default sort:** Date descending (most recent first).

**Expanded detail row:**

When the expand chevron is clicked, a detail section appears below the row showing:

- **Roles affected:** List of role names with month counts and hours. E.g., "Senior Developer: 7 months, 560h — assigned to Felix Keller".
- **People assigned:** List of person names with their hours and months.
- **CR info** (if applicable): CR ID, summary, change direction.
- **Decline reason** (if applicable): The reason text.
- **Link:** "View project in workbench" → navigates to `/workbench?project={id}`.

### 12.14 History scoping rules

| Role | Visible log entries | User filter default |
|---|---|---|
| Controller | All entries across all CCs, all users | "All" — can filter to any user |
| CC Owner | Only entries where `cost_center_id` matches their managed CC (includes actions by any user on their CC, not just their own actions) | "Me" — but can switch to "All" to see actions by other users (e.g., Controller) on their CC. |
| Executive | All entries across all CCs, all users (read-only) | "All" — can filter to any user |

**CC Owner transparency use case:** A CC Owner sees all actions on their CC — including those made by the Controller on their behalf. This answers "did the Controller reassign someone on my team?"

**Controller transparency use case:** A Controller filters by a specific CC Owner to review "what has Thomas Brenner confirmed this quarter?" across all projects.

### 12.15 History API endpoint

**New endpoint:**

```
GET /api/capacity/history
  ?acting_user_id={id}          (optional, filter by user)
  &action_type={type}           (optional, comma-separated, filter by action type)
  &cost_center_id={id}          (optional, comma-separated, filter by CC)
  &project_id={id}              (optional, filter by project)
  &from={date}                  (optional, ISO date, inclusive start)
  &to={date}                    (optional, ISO date, inclusive end)
  &page={n}                     (optional, default 1)
  &page_size={n}                (optional, default 50, max 100)
  &sort={column}                (optional, default "timestamp")
  &sort_dir={asc|desc}          (optional, default "desc")
```

**Response:** Paginated list of log entries with joined project name, user name, and CC name. The `detail_payload` is returned as a parsed JSON object, not a raw string.

**Authorization:** The endpoint enforces role-based scoping server-side:
- Controller: no additional filter.
- CC Owner: server adds `WHERE cost_center_id = {managed_cc}`.
- Executive: no additional filter, but write endpoints are blocked.
- PL: 403 Forbidden.

### 12.16 Component structure

```
/capacity/requests                     ← Inbox route
├── RequestsInbox.tsx                  ← page layout
│   ├── InboxFilterBar.tsx             ← status / role / PL / CC filters
│   ├── RequestTable.tsx               ← sortable project-per-CC table
│   │   ├── RequestRow.tsx             ← single row with action button
│   │   └── DeclineInlineForm.tsx      ← inline expand for decline reason
│   └── RecentlyCompletedSection.tsx   ← collapsed section, last 7 days

/capacity/history                      ← Audit trail route
├── CapacityHistory.tsx                ← page layout
│   ├── HistoryFilterBar.tsx           ← user / action / CC / date / project filters
│   ├── HistoryTable.tsx               ← chronological log table
│   │   ├── HistoryRow.tsx             ← single row with expand chevron
│   │   └── HistoryDetailExpand.tsx    ← expanded detail breakdown
│   └── Pagination.tsx                 ← page controls
```

---

## 13. PL read-only capacity view

The PL availability view gives Project Leads role-level capacity visibility without exposing individual person data. It answers "where is there capacity for the role I need?" and integrates with the resource request flow to help PLs write better-targeted requests. Implements v5 workshop decision `[E-06a]`.

### 13.1 Route and access

**Route:** `/capacity/availability`

**Access:** PL only. Controllers, CC Owners, and Executives use the full workspace (`/capacity`) and do not see this route in their navigation. PLs do not have access to `/capacity`, `/capacity/requests`, or `/capacity/history`.

**Entry points:**
1. **Launchpad tile:** "Resource availability" tile (tile #7 in the PL launchpad grid) links directly to `/capacity/availability`.
2. **Workbench integration:** When a PL is in the Workbench Forecast & Planning tab and initiates a resource request, a "Check availability" link opens this view in a **slide-over panel** (right side, 50% viewport width) rather than a full-page navigation. The slide-over is pre-filtered to the role type and location context of the request being created. The PL can browse availability, then close the panel to return to the request form.
3. **Direct URL:** Bookmarkable. Supports query params: `?location={id}&role={id}`.

### 13.2 Page layout

A self-contained page with its own header, scope controls, and timeline grid. It shares the visual language of the workspace (same time axis, same bar rendering) but with a simplified structure.

**Page structure:**
- Page header: "Resource Availability" title.
- Scope controls (§13.3).
- KPI summary (§13.4).
- Availability timeline grid (§13.5).
- Side panel (§13.7).

### 13.3 Scope controls

A horizontal row with two selectors:

**Location picker** (single-select dropdown):
- Options: `All locations` (default), then one entry per location with headcount: `Munich (25)`, `Budapest (14)`, `Pune (10)`.
- "All locations" shows the combined availability across all locations. Rows are role types with aggregated numbers.
- Selecting a specific location filters to roles and capacity at that location only.
- Locations with zero headcount are hidden.

**Role filter** (optional, multi-select dropdown):
- Options: all role types present in the system.
- Default: all roles shown.
- Selecting specific roles filters the grid to only those role rows. Useful when the PL knows exactly which role they need and wants to scan across locations or time.

No group-by toggle, no hierarchy node scope — the view is always organized by role type at the selected location.

### 13.4 KPI summary

Three compact KPI cards (not five — the PL view is simpler):

| # | Label | Value | Computation |
|---|---|---|---|
| 1 | Roles shown | Integer | Count of distinct role types visible in the current scope/filter. |
| 2 | Total headcount | Integer | Count of distinct active people across all visible roles at the selected location. |
| 3 | Avg availability | Percentage | Mean of per-role availability percentages across the visible time window. "Availability" = (total capacity − total allocated) / total capacity. |

### 13.5 Availability timeline grid

The grid uses the same collapsible time axis as the workspace (§4) — year → quarter → month, with the same click-to-expand/collapse behavior. Default: next 12 months, current quarter expanded to months, other quarters collapsed.

**Row structure — one row per role type:**

Each row has a name cell and a series of bar cells.

**Name cell (left column, 180px):**
- Role type name (12px, weight 500).
- Headcount sub-label: `"{N} people"` (11px, secondary color). When location is "All locations", shows total across all locations. When a specific location is selected, shows count at that location.

**Bar cells — availability bar:**

Each time column renders a horizontal bar with two layers:

```
┌─────────────────────────────────────────┐
│ ████████████████████░░░░░░░░░░░░░░░░░░░ │
│  allocated (dark)    available (light)  │
└─────────────────────────────────────────┘
```

- **Full bar width** = 100% of total capacity for that role at the selected location in that month (headcount × standard available hours per person).
- **Dark filled portion** = total allocated hours across all people of that role. Color: a neutral dark tone (not project-specific — the PL doesn't see which projects are consuming capacity).
- **Light/empty portion** = remaining available hours. Color: a green-tinted highlight indicating "this is what's free."
- **Numeric label inside the bar:** The available hours shown as a number (e.g., `"320h"`) or, if the column is narrow, as a short form (e.g., `"320"`). Positioned inside the light portion if it fits, else as a tooltip.

**Color coding for availability level:**
- Available ≥ 50% of capacity: green background on the available portion (healthy supply).
- Available 20–49%: amber background (tight).
- Available < 20%: red background (scarce — demand will likely be hard to fill).
- Available = 0%: the bar is fully dark with no light portion. A small "Full" label in red.

**Competing demand indicator:**
- If there are pending resource requests from OTHER projects (not the PL's own) for this role at this location in this month, a small badge appears in the bar cell: `"⚡2"` meaning "2 other requests are competing for this role this month."
- The badge uses warning color. No project names or PL names are shown — just the count.
- This tells the PL: "even though 320h appear available, 2 other projects are also trying to claim this capacity — act quickly or consider alternatives."

### 13.6 Collapsed period behavior

When a quarter or year is collapsed, the availability bar shows:
- Allocated portion = average allocated hours across the months in the period.
- Available portion = average available hours.
- Competing demand badge shows the peak competing request count from any month in the period.
- Color coding uses the average availability percentage.

### 13.7 Side panel

Clicking a role row opens a right-side panel (280px, same as workspace standard). The panel provides a deeper breakdown without exposing person-level data.

**Panel content:**

**Header:**
- Role type name (16px, weight 500).
- Location context: `"Munich"` or `"All locations"` (13px, secondary color).
- Total headcount for this role at this location.

**Section: Monthly breakdown**

A compact table showing, for each month in the visible window:

| Month | Capacity | Allocated | Available | Competing |
|---|---|---|---|---|
| Apr 2026 | 800h | 480h | 320h (40%) | 1 request |
| May 2026 | 800h | 480h | 320h (40%) | 0 |
| Jun 2026 | 800h | 640h | 160h (20%) | 2 requests |
| ... | | | | |

- **Capacity:** Total possible hours (headcount × standard hours).
- **Allocated:** Total committed hours across all projects.
- **Available:** Capacity − Allocated. Colored by the availability threshold (green/amber/red).
- **Competing:** Count of pending requests from other PLs for this role/location/month.

**Section: Location comparison** (only visible when location = "All locations")

When the PL is viewing all locations, the side panel adds a location breakdown:

| Location | Headcount | Avg availability |
|---|---|---|
| Munich | 5 | 40% |
| Budapest | 3 | 65% |
| Pune | 4 | 80% |

Each row is clickable — clicking sets the location picker to that location, filtering the grid. This helps the PL identify which location has the most capacity for their needed role.

**Section: Quick request action**

A call-to-action at the bottom of the panel:

- Button: `"Request this role"`.
- Clicking opens the resource request form (in the Workbench) pre-populated with:
  - Role type = the selected role.
  - Target location/CC = the selected location (or the location with highest availability if "All locations" is selected).
  - Suggested period = the months where availability is highest (auto-selected, PL can adjust).
- If opened from the slide-over panel (entry point #2 in §13.1), the button closes the availability panel and populates the already-open request form instead of opening a new one.

### 13.8 Data privacy rules

The PL availability view enforces strict data privacy boundaries:

| Data | Visible to PL | Rationale |
|---|---|---|
| Role type names | ✅ | Needed to identify what to request. |
| Headcount per role per location | ✅ | Needed to gauge capacity scale. |
| Total allocated/available hours per role per location per month | ✅ | Core availability signal. |
| Competing demand count (pending requests from other PLs) | ✅ as aggregate count only | Useful signal; no project or PL names leaked. |
| Individual person names | ❌ never | Privacy boundary. |
| Individual person utilization | ❌ never | Privacy boundary. |
| Project names consuming capacity | ❌ never | Other PLs' project details are confidential. |
| Which PL submitted competing requests | ❌ never | Confidential. |
| Cost center names | ❌ never (location only) | CC structure is internal to Controllers/CC Owners. PLs see locations. |

### 13.9 Slide-over panel mode

When accessed from the Workbench (entry point #2), the availability view renders as a **slide-over panel** rather than a full page.

**Behavior:**
- The panel slides in from the right, covering 50% of the viewport width.
- The Workbench remains visible on the left (dimmed slightly).
- The panel contains the same content as the full page: scope controls, KPI summary, availability grid, and side panel (the side panel nests inside the slide-over as a collapsible section rather than a separate panel-within-panel).
- A close button (×) or clicking outside the panel dismisses it.
- The PL can interact with the availability view (change location, expand quarters, click role rows) without leaving the Workbench context.
- When the PL clicks "Request this role" in slide-over mode, the panel closes and the request form on the Workbench is populated with the selected role/location/period.

### 13.10 API endpoints

**Existing endpoint (enhanced):**

```
GET /api/capacity/role-availability
  ?location_id={id}         (optional, filter by location; omit for all locations)
  &role_type_id={id}        (optional, comma-separated, filter by role types)
  &start={date}             (required, ISO date, inclusive start month)
  &end={date}               (required, ISO date, inclusive end month)
```

**Current response** returns per-role-per-month availability. **Enhancement needed:** add a `competing_demand_count` field per role-per-month showing the count of pending resource requests from other projects for that role/location/month. The endpoint must exclude the requesting PL's own project requests from the competing count (based on authenticated user → their project IDs).

**Response shape (enhanced):**

```json
{
  "roles": [
    {
      "role_type_id": 1,
      "role_type_name": "Senior Developer",
      "headcount": 5,
      "months": [
        {
          "month": "2026-04",
          "capacity_hours": 800,
          "allocated_hours": 480,
          "available_hours": 320,
          "availability_pct": 40.0,
          "competing_demand_count": 1
        }
      ]
    }
  ],
  "location_summary": [
    {
      "location_id": 1,
      "location_name": "Munich",
      "total_headcount": 25,
      "avg_availability_pct": 42.5
    }
  ]
}
```

The `location_summary` array is included only when `location_id` is omitted (all-locations query). It provides the data for the side panel's location comparison section (§13.7).

### 13.11 Component structure

```
/capacity/availability                      ← PL route (full page)
├── PLAvailabilityView.tsx                  ← page layout
│   ├── AvailabilityScopeBar.tsx            ← location picker + role filter
│   ├── AvailabilityKPIs.tsx               ← 3 compact KPI cards
│   ├── AvailabilityGrid.tsx               ← role-row timeline grid
│   │   ├── TimeAxisHeader.tsx             ← reused from workspace (§4)
│   │   └── RoleAvailabilityRow.tsx        ← availability bar + competing badge
│   └── AvailabilitySidePanel.tsx          ← monthly breakdown + location comparison
│       └── QuickRequestAction.tsx         ← "Request this role" CTA

PLAvailabilitySlideOver.tsx                 ← Workbench slide-over wrapper
├── PLAvailabilityView.tsx                  ← same component, panel rendering mode
└── SlideOverControls.tsx                   ← close button, dimmed backdrop
```

---

## 14. Multi-person assignment

**Fully specified in §9.5.**

Multi-person partial assignment is an integral part of the assignment interaction, not a separate feature. See §9.5 for the complete design including: the [+ Add] gesture, hours splitting, the data model constraint change (`ResourceRequestAssignment` unique constraint relaxed to `(resource_request_id, month, person_id)`), partial fulfillment workflow, and timeline visualization of split assignments.

---

## 15. Permissions matrix

Updated matrix reflecting the redesigned module. Write permissions are unchanged from the current module; the layout changes do not alter authorization rules.

| Surface | Controller | CC Owner | Executive | PL |
|---|---|---|---|---|
| Workspace access | ✅ | ✅ | ✅ | ❌ (see §13 for PL view) |
| Scope: My CC | ✅ with CC dropdown | ✅ pinned to own CC | ❌ hidden | ❌ |
| Scope: All CCs | ✅ | ✅ read-only | ✅ read-only | ❌ |
| Scope: Location / hierarchy node | ✅ | ✅ read-only | ✅ read-only | ❌ |
| Group-by controls | ✅ | ✅ | ✅ | ❌ |
| Filter chips | ✅ | ✅ | ✅ | ❌ |
| Side panel: person detail | ✅ | ✅ | ✅ read-only (no assignment actions) | ❌ |
| Side panel: assignment actions (assign/confirm/decline) | ✅ for any CC | ✅ for own CC only | ❌ | ❌ |
| Demand strip | ✅ | ✅ | ✅ read-only | ❌ |
| KPI cards | ✅ | ✅ | ✅ | ❌ |
| Executive dashboard (§11) | ✅ | ❌ hidden | ✅ | ❌ |
| Requests inbox (§12) | ✅ all CCs | ✅ own CC only | ❌ hidden | ❌ |
| Requests inbox: decline all action | ✅ for any CC | ✅ for own CC only | ❌ | ❌ |
| History / audit trail (§12.9) | ✅ all CCs, all users | ✅ own CC, own + CC member actions | ✅ read-only, all CCs, all users | ❌ |
| PL availability view (§13) | ❌ (use workspace) | ❌ (use workspace) | ❌ (use workspace) | ✅ read-only, role-level only, no person data |
| PL availability slide-over from Workbench | ❌ | ❌ | ❌ | ✅ read-only |

---

## 16. Decisions log

Running list of design decisions locked during the redesign process. Each decision is tagged for traceability.

| # | Tag | Decision | Alternatives considered | Date |
|---|---|---|---|---|
| CAP-D-01 | Layout | Single unified workspace replaces My Team / Org Overview tab split | Keep tabs but add shared filter bar; three-tab layout (Team / Org / Requests) | 2026-05-06 |
| CAP-D-02 | Visualization | Person-centric stacked horizontal bars replace percentage heatmap grid | Enhanced heatmap with color-coded cells + inline mini-bars; Gantt chart with horizontal project lanes | 2026-05-06 |
| CAP-D-03 | Drill-down | Right-side slide-in panel replaces bottom drawer | Modal overlay; expandable inline row detail; keep bottom drawer | 2026-05-06 |
| CAP-D-04 | Time axis | Three-level collapsible: Year → Quarter → Month | Two-level only (Year → Month); fixed 12-month window with no collapse | 2026-05-06 |
| CAP-D-05 | Summary bars | Collapsed periods show average-utilization stacked bar with project color proportions preserved | Numeric-only summary (just show "45%"); mini sparkline; no summary (just a dash) | 2026-05-06 |
| CAP-D-06 | Over-allocation in collapsed periods | Red border on summary bar if ANY month in the period exceeds 100% | Red border only if the average exceeds 100%; no over-allocation signal on collapsed bars | 2026-05-06 |
| CAP-D-07 | Scope model | Scope pills (My CC / All CCs / per-location / per-hierarchy-node) replace tab-based scoping | Dropdown-only scope selector; hierarchical tree selector | 2026-05-06 |
| CAP-D-08 | Grouping | Three grouping modes: Role / Project / Person | Role only (current); Role + CC nested; free-form multi-dimensional pivot | 2026-05-06 |
| CAP-D-09 | Filtering | Chip-based filter bar with AND-combinable quick filters | Sidebar filter panel; dropdown multi-select filters; no filters (search only) | 2026-05-06 |
| CAP-D-10 | Demand visibility | Sticky demand strip at bottom of timeline showing unfulfilled request counts per month | Demand as overlay on person bars; demand as separate tab; demand only in side panel | 2026-05-06 |
| CAP-D-11 | KPI window | KPIs computed across visible expanded time window, not just current month | Current month only (status quo); rolling 3-month; user-selectable window | 2026-05-06 |
| CAP-D-12 | Sorting within role groups | Peak utilization descending (highest-risk person first) | Alphabetical (status quo); average utilization; headcount seniority | 2026-05-06 |
| CAP-D-13 | Role-based access | Preserved from current module — no changes to authorization rules | Add CC Owner read access to other CCs; give Executives write access | 2026-05-06 |
| CAP-D-14 | Project color stability | Session-stable color-to-project mapping via ProjectColorMap context | Random per-render; user-configurable colors; hash-based deterministic | 2026-05-06 |
| CAP-D-15 | Demand strip collapsed behavior | Show peak unfulfilled count from any month in the period | Sum of all months; average; show nothing when collapsed | 2026-05-06 |
| CAP-D-16 | Assignment scope | Assignment mode operates at project level — all role requests for one project visible in a single panel session | Per-individual-request assignment; per-role assignment | 2026-05-06 |
| CAP-D-17 | Assignment panel width | Panel widens to 400px during assignment mode (from 280px standard) | Fixed 280px; full-screen takeover; separate page (status quo) | 2026-05-06 |
| CAP-D-18 | Timeline overlay | Ghost segments shown for ALL role requests simultaneously during assignment, with role differentiation via opacity levels (30% matching, 15% other) | One role at a time; no overlay; overlay only for focused role section | 2026-05-06 |
| CAP-D-19 | Assignment gesture | Click ghost segment on timeline to assign person to that month; click person name cell for bulk assign to all unassigned months | Side panel only (no timeline interaction); drag-and-drop | 2026-05-06 |
| CAP-D-20 | Save model | Explicit save — changes accumulate in local state, persisted only on "Save draft" or "Confirm & send to controller" | Auto-save per cell (status quo); save on panel close | 2026-05-06 |
| CAP-D-21 | Multi-person assignment | Built into core assignment interaction; hours are the split unit; unique constraint relaxed to (request, month, person_id) | Deferred to separate feature; percentage-based splits; single person only (status quo) | 2026-05-06 |
| CAP-D-22 | External cost requests | Shown in assignment panel as a separate section below resource sections, with confirm/decline actions | Hidden (status quo); separate tab; inline with resource requests | 2026-05-06 |
| CAP-D-23 | Project Assignment page | Deprecated; route redirects to workspace with assignment panel pre-activated | Keep as separate page; remove entirely with no redirect | 2026-05-06 |
| CAP-D-24 | Partial fulfillment | Allowed — CC Owner can confirm with partially assigned months, with a warning. Uses existing partially-fulfill endpoint. | Block confirmation until 100% assigned; auto-decline partial months | 2026-05-06 |
| CAP-D-25 | Project view bar model | Fulfillment bar (solid = assigned, dashed = unfulfilled) rather than utilization bar. Reference maximum = highest total-requested month across all visible projects. | Utilization-style bar (no meaning for projects); numeric-only display; stacked person segments | 2026-05-07 |
| CAP-D-26 | Person row in project view | Single-project allocation bar (foreground) with faded total-utilization background layer. Shows this-project contribution in context of the person's overall load. | Full multi-project stacked bar (same as role view); this-project-only with no total context | 2026-05-07 |
| CAP-D-27 | Unassigned request slots | Rendered as explicit child rows within the project group, with dashed ghost bars. Always visible (no assignment mode required). | Hidden until assignment mode; shown only via filter; shown as a badge count on the project row | 2026-05-07 |
| CAP-D-28 | Demand strip in project view | Hidden; replaced by a "Total unassigned hours" summary row. Demand is already visible as unassigned slot rows. | Keep demand strip (redundant); hide with no replacement | 2026-05-07 |
| CAP-D-29 | Project view sorting | Fulfillment percentage ascending (least-staffed first) | Alphabetical; total hours descending; priority-based | 2026-05-07 |
| CAP-D-30 | Scope vs. person visibility in project view | Scope filters which PROJECTS appear, not which people within a project. CC Owner scoped to "My CC" sees all people on matching projects. | Scope filters people within projects; only show own-CC people | 2026-05-07 |
| CAP-D-31 | Hierarchy agnosticism | All references to "LoB" in the spec replaced with "hierarchy node." Scope pills, badges, and labels derive from the active portfolio hierarchy configuration (ADM-01). | Hardcode LoB as a fixed concept | 2026-05-07 |
| CAP-D-32 | Project view filter adaptation | "Needs staffing" chip added in project view; "Under-utilized" reinterpreted as fulfillment < 50%; "Unassigned months" merged with "Pending requests" to avoid redundancy | Same filter meanings as role view; no project-specific filters | 2026-05-07 |
| CAP-D-33 | Dashboard visibility | Shown only for Controller/Executive AND only when scope is multi-CC (All CCs, location, hierarchy node). Hides when scoped to single CC. | Always visible for Controller/Executive; visible for all roles; separate route | 2026-05-07 |
| CAP-D-34 | Dashboard collapsibility | Collapsible via toggle bar, state persisted in localStorage. Expanded by default on first visit. | Always expanded; not collapsible; collapsed by default | 2026-05-07 |
| CAP-D-35 | Capacity forecast series | Three series: Available (solid), Allocated (solid), Incoming demand (dashed). Gap shading green for surplus, red for deficit. | Two series only (no demand); single series (net capacity); stacked bar chart instead of area | 2026-05-07 |
| CAP-D-36 | Headcount breakdown dimension switcher | Single-dimension switcher (location / hierarchy node / role / CC) with localStorage persistence. Click-to-scope on segments. | Fixed dimension; multi-dimensional pivot; separate charts per dimension | 2026-05-07 |
| CAP-D-37 | Hotspot list | Top 5 issues, severity-weighted across 3 categories (over-allocation, unfulfilled demand, chronic under-utilization). "View all" expands inline. | Top 10; separate lists per category; no ranking | 2026-05-07 |
| CAP-D-38 | KPI trend indicators | Not included — considered too noisy for the current design. May revisit in a future iteration. | Show ↑/↓ vs. prior month on each KPI card | 2026-05-07 |
| CAP-D-39 | Inbox structure | Remains a separate route (/capacity/requests), redesigned as a project-per-CC triage queue with sortable table. Routes to workspace assignment mode on action. | Absorbed into workspace as a panel mode; absorbed into filter chip state; kept as-is | 2026-05-07 |
| CAP-D-40 | Inbox row granularity | One row per project per cost center. A project spanning 3 CCs = 3 rows. | One row per individual resource request; one row per project (regardless of CC) | 2026-05-07 |
| CAP-D-41 | Decline granularity from inbox | Project-level decline only (all requests for a project at a CC). Single-request decline is handled within the assignment panel (§9). | Single-request decline from inbox; no decline from inbox | 2026-05-07 |
| CAP-D-42 | Recently completed section | Collapsed by default at bottom of inbox, showing last 7 days. Links to full history. | No recently completed; always visible; separate tab | 2026-05-07 |
| CAP-D-43 | Module navigation | Three-route secondary nav: Workspace / Requests (N) / History. Accessible to Controller, CC Owner (partial), Executive (History only). | Two routes (no history); tabs within workspace; dropdown navigation | 2026-05-07 |
| CAP-D-44 | Audit trail data model | New `CapacityActionLog` table recording all capacity actions with acting user, project, CC, action type, summary, and structured detail JSON payload. Written server-side on confirmation/decline/save endpoints. | Stamp on existing Allocation records; client-side logging; no audit trail | 2026-05-07 |
| CAP-D-45 | Audit trail scope rules | Controller: all CCs, all users. CC Owner: own CC, all users on that CC. Executive: all CCs, all users (read-only). PL: no access. | CC Owner sees only own actions; Executive has no access; PL sees own project history | 2026-05-07 |
| CAP-D-46 | History as separate route | History is a dedicated route (/capacity/history), not embedded within the inbox — ensures Controller and Executive access without going through the inbox. | Embedded as a tab within inbox; embedded within workspace side panel | 2026-05-07 |
| CAP-D-47 | PL view route | Dedicated route `/capacity/availability`, separate from the workspace. PLs never see `/capacity`, `/capacity/requests`, or `/capacity/history`. | Mode flag on workspace; embedded in Workbench only; no PL capacity access | 2026-05-07 |
| CAP-D-48 | PL view data granularity | Role-level aggregation only. No person names, no person utilization, no project names, no CC names. Location is the finest organizational grain visible to PLs. | Person-level with names redacted; CC-level granularity; project-level detail | 2026-05-07 |
| CAP-D-49 | Competing demand visibility | PLs see aggregate count of pending requests from other PLs per role/location/month (e.g., "⚡2"). No project names or PL names. | No competing demand signal; full project-level detail; only own requests visible | 2026-05-07 |
| CAP-D-50 | Default location scope | "All locations" is the default. PLs can narrow to a specific location. | Force location selection first; default to PL's own location | 2026-05-07 |
| CAP-D-51 | Workbench integration | Slide-over panel (50% viewport) from Workbench resource request flow. Same component as full page, panel rendering mode. "Request this role" populates the open request form. | Full-page navigation away from Workbench; modal dialog; no integration | 2026-05-07 |
| CAP-D-52 | Availability color thresholds | ≥50% = green (healthy), 20–49% = amber (tight), <20% = red (scarce), 0% = "Full" label. | Binary (available/not); four-bucket matching workspace utilization thresholds; no color coding | 2026-05-07 |
