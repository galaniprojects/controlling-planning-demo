# Capacity Module Redesign — Implementation Guide

This document is the session-by-session implementation plan for the Capacity Module Redesign Specification (`Capacity_Module_Redesign_Spec.md`). It is designed to be consumed by Claude Code, with each session scoped to be completable in a single focused coding session.

**Authoritative source:** The spec (`Capacity_Module_Redesign_Spec.md`) is the single source of truth for all design decisions, behavioral rules, and component contracts. This guide tells you WHAT to build in WHICH ORDER. The spec tells you HOW each piece works. Always read the referenced spec sections before starting a session.

**Session discipline:**
- Begin each session by reading the referenced spec sections in full.
- Use extended thinking to plan before writing code.
- Update `PROGRESS.md` at the end of every session with: what was built, what was deferred, and what the next session should know.
- Do not build ahead — each session's scope is deliberately bounded. Building features from later sessions creates merge conflicts for parallel agents.

---

## Dependency graph

```
Phase 1 (sequential):
  S1 [Schema + API + Seed Data]
    → S2 [Workspace Shell + Routing]

Phase 2 (4 parallel agents):
    → Agent A: S3  [Timeline Rendering]
    → Agent B: S4  [KPI Bar + Filters + Demand Strip]
    → Agent C: S5a [Side Panel + Person/Cell Detail]
    → Agent D: S5b [Requests Inbox + History Page]

Phase 3 (3 parallel agents):
    → Agent A: S6a [Assignment Panel UI]      depends on S5a
    → Agent B: S7  [Dashboard Layer]          depends on S1, S2
    → Agent C: S8  [PL Availability View]     depends on S1, S2

Phase 4 (3 parallel agents):
    → Agent A: S6b [Timeline Overlay + Gestures + Entry Points]
                                              depends on S3, S6a
    → Agent B: S9  [Project View]             depends on S3, S5a
    → Agent C: S10 [Multi-Person + Audit]     depends on S6a, S5b

Phase 5 (sequential):
    → S11 [Cross-Cutting Integration]
    → S12 [Edge Cases + Polish]
```

**Maximum parallel agents:** 4 (Phase 2). Phases 1 and 5 are sequential. Total sessions: 14.

**Why S5 and S6 are split:**
- **S5 → S5a + S5b** — the side panel shell + person/cell detail and the inbox/history routes are three distinct surfaces. Splitting unblocks S6a (which only needs the panel shell) earlier and reduces single-agent surface area.
- **S6 → S6a + S6b** — the assignment panel form (S6a) is independent of the timeline ghost overlay and cross-component entry-point wiring (S6b). S6a stabilises the assignment state contract; S6b consumes it. Putting S6b in Phase 4 lets it run in parallel with S9 (project view) and S10 (multi-person + audit).

---

## Phase 1 — Foundation

### Session 1: Schema migrations, API endpoints, seed data

**Read spec sections:** §1.2 (data model changes), §5.2 (KPI computations), §8.2 (demand strip data), §9.5 (multi-person constraint), §9.9 (endpoint table), §11.10 (dashboard endpoints), §12.10 (CapacityActionLog DDL), §12.15 (history endpoint), §13.10 (role-availability enhancement)

**Depends on:** Nothing. This is the starting point.

**Deliverables:**

1. **Schema migration — `ResourceRequestAssignment` constraint change:**
   - Relax the unique constraint from `(resource_request_id, month)` to `(resource_request_id, month, person_id)`.
   - Verify existing data integrity after migration (no duplicate person assignments should exist in current data).

2. **Schema migration — new `CapacityActionLog` table:**
   - Create table per the DDL in §12.10, including all four indexes.
   - Add SQLAlchemy model (`CapacityActionLog`).

3. **New API endpoints:**

   | Endpoint | Spec reference | Purpose |
   |---|---|---|
   | `GET /api/capacity/org-summary` | §11.10 | Monthly available/allocated/demand hours for dashboard forecast chart. Params: `scope`, `start`, `end`. |
   | `GET /api/capacity/headcount-breakdown` | §11.10 | Headcount by dimension (location/hierarchy/role/cc) for dashboard breakdown chart. Params: `scope`, `dimension`. |
   | `GET /api/capacity/hotspots` | §11.10 | Top-N capacity issues ranked by severity. Params: `scope`, `limit`. Implements the three-category severity formula from §11.6. |
   | `GET /api/capacity/history` | §12.15 | Paginated audit trail. Params: `acting_user_id`, `action_type`, `cost_center_id`, `project_id`, `from`, `to`, `page`, `page_size`, `sort`, `sort_dir`. Enforces role-based scoping server-side per §12.14. |

4. **Enhanced existing endpoint:**

   | Endpoint | Change | Spec reference |
   |---|---|---|
   | `GET /api/capacity/role-availability` | Add `competing_demand_count` field per role-per-month. Exclude requesting PL's own project requests from the count. Add `location_summary` array when `location_id` is omitted. | §13.10 |
   | `PUT /api/capacity/requests/{cc}/{rid}/assignments` | Accept new request body shape: `[{month, assignments: [{person_id, hours}]}]` to support multi-person assignments. Maintain backward compatibility if possible. | §9.9 |

5. **Audit log write triggers:**
   - Wire `CapacityActionLog` inserts into the following existing endpoint handlers:
     - `PUT /api/capacity/project-confirmation/{pid}/confirm` → log `confirm` or `partial_confirm`
     - `PUT /api/capacity/project-confirmation/{pid}/decline` → log `decline`
     - `PUT /api/capacity/requests/{cc}/{rid}/assignments` → log `assign_draft`
     - `PUT /api/capacity/requests/{cc}/{rid}/partially-fulfill` → log `partial_confirm`
   - The `acting_user_id` is derived from the authenticated session context.
   - The `summary` field is a human-readable string generated server-side (e.g., "Confirmed 3 roles, 720h total for Predictive Maintenance PoC").
   - The `detail_payload` is a JSON blob per the schema in §12.10.

6. **Seed data additions:**
   - Ensure at least 2 people are over-allocated (utilization > 100%) in at least one month within the next 12 months. This is needed for the "Over-allocated" filter chip, hotspot list, and red-border summary bar testing.
   - Ensure at least 3 pending resource requests across at least 2 different role types and 2 different CCs. This is needed for the demand strip, inbox, and PL competing demand badge.
   - Ensure at least 1 project has resource requests directed at multiple CCs (fan-out scenario for §12.6).
   - Ensure at least 1 project has a pending CR-triggered re-confirmation with `change_direction` indicators on affected months.
   - Ensure at least 2 `ResourceRequest` rows with `request_type='external_cost'` for the assignment panel's external cost section.
   - Seed 5–10 `CapacityActionLog` entries spanning different action types, users, and dates within the last 30 days. This populates the history page and the inbox's "Recently completed" section on first load.
   - Ensure at least 1 person has 0% utilization across 6+ consecutive months (chronic under-utilization scenario for the hotspot list).

**Acceptance criteria:**
- All new endpoints return correctly shaped JSON responses with test data.
- The enhanced `role-availability` endpoint includes `competing_demand_count` and `location_summary`.
- The `assignments` endpoint accepts the new multi-person request body.
- The `CapacityActionLog` table receives entries when confirmation/decline endpoints are called.
- Seed data covers all listed scenarios and is verifiable via API calls.

---

### Session 2: Workspace shell and routing

**Read spec sections:** §1.3 (component hierarchy), §2 (unified workspace & scope model), §12.1 (module-level navigation)

**Depends on:** Session 1 (routes need API endpoints to exist, even if UI doesn't call them yet).

**Deliverables:**

1. **Route setup:**
   - `/capacity` → `CapacityWorkspace.tsx`
   - `/capacity/requests` → `RequestsInbox.tsx` (placeholder skeleton)
   - `/capacity/history` → `CapacityHistory.tsx` (placeholder skeleton)
   - `/capacity/availability` → `PLAvailabilityView.tsx` (placeholder skeleton)
   - `/capacity/project-assignment/:id` → redirect to `/capacity?assignment_project={id}` (§9.10 deprecation redirect)

2. **`CapacityModuleNav.tsx`:**
   - Secondary nav strip: `Workspace | Requests (N) | History`
   - Badge count on "Requests" from the pending requests KPI (can be hardcoded for now, wired to API in Session 4).
   - Role-based visibility per §12.1: Controllers see all three links; CC Owners see Workspace + Requests; Executives see Workspace + History; PLs see neither (they're on `/capacity/availability`).

3. **`ScopeBar.tsx`:**
   - Scope pill group (single-select): My CC, All CCs, per-location pills, per-hierarchy-node pills. Pills dynamically generated from master data API calls.
   - Group-by pill group (single-select): Role, Project, Person.
   - URL query param persistence: `?scope=my_cc&group=role`. State restored on page load from URL.
   - Controller CC dropdown (§2.3): when Controller selects "My CC", a searchable dropdown appears.
   - Default scope per role: CC Owner → My CC; Controller/Executive → All CCs.

4. **`CapacityWorkspace.tsx` skeleton:**
   - Renders `ScopeBar` at top.
   - Placeholder slots for KPI bar, dashboard layer, filter chips, timeline view, and side panel.
   - Scope state management: a React context (`CapacityScopeContext`) that holds current scope, group-by, and provides the state to all child components.
   - When scope or group-by changes, the context updates and all consumers re-render.

**Acceptance criteria:**
- All four routes are navigable and render the correct (skeleton) component.
- The deprecated project-assignment route redirects correctly.
- The nav strip shows/hides links based on the current user's role.
- Scope pills render dynamically from master data. Clicking a pill updates the URL and the scope context.
- Group-by pills toggle correctly. State survives page refresh via URL params.
- Controller CC dropdown appears/disappears based on the selected scope pill.

---

## Phase 2 — Core Surfaces (3 parallel agents)

### Session 3: Timeline rendering (Agent A)

**Read spec sections:** §3 (person-centric timeline bars), §4 (collapsible time axis)

**Depends on:** Session 2 (workspace shell, scope context).

**Do not build:** Side panel interactions (Session 5), filter chip integration (Session 4), demand strip (Session 4), assignment mode ghost segments (Session 6), project view (Session 9).

**Deliverables:**

1. **`ProjectColorMap` context (§3.2):**
   - A React context that assigns stable colors to projects from the 7-color palette.
   - Color assignment happens once when the data loads. The mapping persists across re-renders within a session.
   - Exported for use by the side panel, legend, and demand strip in other sessions.

2. **`TimeAxisHeader.tsx` (§4.2):**
   - Renders the two-row header: year/quarter labels (row 1), month labels (row 2).
   - Collapsible year → quarter → month hierarchy with chevron click handlers (§4.3).
   - Default collapse state per §4.5: current FY expanded to quarters, current quarter expanded to months, past/future years collapsed.
   - Column width rules: month 42px, quarter 48px, year 48px (§4.6).
   - State management: a `TimeAxisState` object tracking which years/quarters are expanded. Managed locally, not in the scope context.

3. **`RoleGroup.tsx` (§3.3):**
   - Expandable section with role name + chevron in the name cell.
   - Aggregate bar at 50% opacity showing average utilization for the role (§3.3).
   - Click chevron to expand/collapse person rows.

4. **`PersonTimelineRow.tsx` (§3.1):**
   - Name cell: person name, 160px fixed width, truncated with ellipsis, hover tooltip with full name + role (§3.3).
   - Bar cells: stacked colored segments per project per month. Segment width proportional to project hours relative to available capacity.
   - Over-allocation border: 1.5px solid danger color when total > 100% (§3.1).
   - Summary bars for collapsed quarters/years: averaged utilization, project proportions preserved, 0.85 opacity, red border if any hidden month > 100% (§4.4).
   - Hover tooltip on segments: `"Project Name: Xh (Y%)"` (§3.4).
   - Hover tooltip on empty gap: `"Available: Xh (Y%)"` (§3.4).

5. **`FlatPersonRow.tsx`:**
   - Same as `PersonTimelineRow` but without role grouping. Used when group-by is "Person".
   - Sorted by utilization descending (§2.1).

6. **Sorting within role groups:** Peak utilization descending, secondary alphabetical by last name (§3.6).

7. **Horizontal scroll:** The timeline area scrolls horizontally when total column width exceeds viewport. The name column (160px) is sticky-left (§4.6).

8. **Data fetching:** Wire to existing `GET /api/capacity/my-team/{cc}` or `GET /api/capacity/org-overview` endpoints depending on scope context. Parse response into the row/bar data model.

**Acceptance criteria:**
- The timeline renders people grouped by role with stacked colored bars.
- Collapsing a quarter to a single column shows an averaged summary bar with correct project proportions.
- Collapsing a year shows the year-level summary.
- The red over-allocation border appears on months and collapsed periods where any person exceeds 100%.
- Horizontal scroll works with sticky name column.
- Changing scope in `ScopeBar` re-fetches and re-renders the timeline.
- Group-by "Person" shows a flat list sorted by utilization.

---

### Session 4: KPI bar, filter chips, demand strip (Agent B)

**Read spec sections:** §5 (KPI summary bar), §6 (filter chips), §8 (demand-vs-supply strip)

**Depends on:** Session 2 (workspace shell, scope context).

**Do not build:** Timeline row rendering (Session 3), side panel (Session 5), dashboard (Session 7).

**Deliverables:**

1. **`KPISummaryBar.tsx` (§5):**
   - 5 cards in a responsive grid.
   - Card computations per §5.2: Headcount, Avg utilization (across visible window), Over-allocated (any month > 100%), Pending requests (from API), Supply gap (roles where demand > available).
   - Scope sensitivity: all values recompute when scope changes (§5.3).
   - Click behavior: clicking Over-allocated → activates "Over-allocated" chip; clicking Pending requests → activates "Pending requests" chip; etc. (§5.4). This requires exposing a filter-activation callback to the filter chip bar.
   - Wire the "Requests" badge count in `CapacityModuleNav` to the pending requests KPI value.

2. **`FilterChipBar.tsx` (§6):**
   - Chip set: All, Over-allocated, Under-utilized, Pending requests, Unassigned months.
   - Each chip displays a count badge computed from the current scope's data (§6.1).
   - Mutual exclusivity with "All": selecting a specific chip deactivates "All"; selecting "All" deactivates all others (§6.2).
   - Multiple specific chips can be active simultaneously (AND logic) (§6.2).
   - Filter state is managed in the scope context so it's accessible to the timeline view.
   - Visual states per §6.3: inactive (transparent bg, secondary text), active (inverted colors).
   - When a filter is active, the filter state is published to the scope context. The timeline (Session 3) will consume this state to show/hide rows — but the actual row filtering logic should be implemented here as a utility function (`filterPeople(people, activeFilters) → filteredPeople`) so the timeline can call it.

3. **`DemandStrip.tsx` (§8):**
   - A single sticky-bottom row below all role groups/person rows.
   - Per-cell: count of unfulfilled requests per month (§8.2). Formatted as `"+N"`.
   - Color thresholds: 0 = empty, 1–2 = warning, 3+ = danger (§8.2).
   - Collapsed period behavior: show peak count from any month in the period (§8.3).
   - Click behavior: placeholder for now — clicking a cell will open the side panel (wired in Session 5). For this session, emit a click event with the month/period data.
   - Visibility: hidden when group-by is "Project" (§10.7). Show `UnassignedSummary` in its place — but the `UnassignedSummary` component itself is built in Session 9 (Project View). For now, just hide the demand strip when group-by is "Project".
   - Data source: derive from the same data that feeds the pending requests KPI, or from a dedicated API call if needed.

**Acceptance criteria:**
- KPI cards render with correct values for the current scope. Changing scope updates all values.
- Clicking a KPI card activates the corresponding filter chip.
- Filter chips show correct count badges. Activating a filter publishes the filter state to the context.
- The filter utility function correctly filters people for each chip and for AND combinations.
- The demand strip renders at the bottom of the timeline area with correct counts and colors.
- The demand strip hides when group-by is "Project".
- Collapsed demand cells show the peak (not average, not sum) of months in the period.

---

### Session 5a: Side panel + person/cell detail (Agent C)

**Read spec sections:** §7 (side panel detail view — all subsections)

**Depends on:** Session 2 (workspace shell, routing, scope context).

**Do not build:** Assignment panel content (Session 6a — `AssignmentPanel.tsx` is added as a third panel mode there), project summary panel content (Session 9), inbox/history (Session 5b), dashboard (Session 7), PL availability (Session 8).

**Deliverables:**

1. **`DetailSidePanel.tsx` (§7.1):**
   - Right-side slide-in panel, 280px wide.
   - Pushes timeline area narrower when open: timeline width = `calc(100% - 280px)`.
   - Close button (×). Keyboard: Escape closes.
   - Cross-fade transition when switching between content types (§7.4).
   - Panel mode enum: `person | cell | assignment | project_summary` — only `person` and `cell` content rendered in this session, but the mode dispatch must support all four for downstream sessions.
   - Panel state management lives in a `CapacitySidePanelContext` so any component (timeline rows, demand strip, dashboard hotspot list, project group rows) can request a panel open without prop-drilling.
   - Width prop on the panel container so Session 6a can widen to 400px in assignment mode without rewriting this layout.

2. **`PersonDetail.tsx` (§7.2):**
   - Header: person name, role, location badge.
   - Allocations section: project color dots (consumed from `ProjectColorMap`, Session 3) + names + hours/month. Project names link to `/workbench?project={id}`.
   - Monthly summary: utilization by quarter, colored by standard buckets.
   - Pending requests section (conditional): pending request cards with "Review project" button. The button calls a callback on the panel context — Session 6b wires it to assignment-mode entry.
   - Demand pipeline section (conditional): unassigned requests for the same role with "Review project" buttons.

3. **`CellDetail.tsx` (§7.3):**
   - Header: row label + month/quarter/year.
   - Summary block: Allocated / Available / Delta with color.
   - Project allocations list: expandable rows with per-person breakdown.

**Acceptance criteria:**
- Once Session 3 lands, clicking a person row opens the side panel with `PersonDetail` populated.
- Once Session 3 lands, clicking a cell on the aggregate role row in an org-level scope opens `CellDetail`.
- Panel push/close animation works. Escape closes. Cross-fade on content switch between `PersonDetail` and `CellDetail`.
- "Review project" buttons render and emit the correct callback event (no-op until S6b wires it).
- The panel context is exported and a third panel mode can be registered by another session without modifying this code.

---

### Session 5b: Requests inbox + History page (Agent D)

**Read spec sections:** §12 (resource requests inbox & audit trail — all subsections)

**Depends on:** Session 1 (history endpoint + audit log), Session 2 (workspace shell, routing).

**Do not build:** Side panel content (Session 5a), assignment panel (Session 6a), single-request decline flow inside the assignment panel (Session 6a).

**Deliverables:**

1. **`RequestsInbox.tsx` (§12.2–12.8):**
   - Full page replacing the placeholder skeleton from Session 2.
   - `InboxFilterBar`: status (pill group), role (multi-select), PL (multi-select), CC (multi-select, Controller only) per §12.4.
   - `RequestTable`: sortable table per §12.3 column spec. One row per project per CC.
   - CR differentiation: blue "CR" pill + summary line (§12.5).
   - Multi-CC fan-out: CC column visible for Controllers, hidden for CC Owners (§12.6).
   - Default sort: priority desc → age desc (§12.3).
   - "Review & assign" button: navigates to `/capacity?assignment_project={pid}&cc={ccid}`. The workspace will pick this up and open assignment mode (auto-open is wired in S6a; the panel content renders correctly because S6a builds it).
   - "Decline all" dropdown action: inline expand with textarea + confirm button. Calls `PUT /api/capacity/project-confirmation/{pid}/decline`. Row transitions to strikethrough and fades (§12.7).
   - `RecentlyCompletedSection`: collapsed by default, shows last 7 days from `GET /api/capacity/history?from={7_days_ago}&acting_user_id={current_user}`. "View full history" link to `/capacity/history` (§12.8).

2. **`CapacityHistory.tsx` (§12.11–12.15):**
   - Full page replacing the placeholder skeleton from Session 2.
   - `HistoryFilterBar`: acting user, action type, CC, date range, project per §12.12.
   - `HistoryTable`: sortable table per §12.13 column spec. Default sort: date desc.
   - Expandable detail rows: roles affected, people assigned, CR info, decline reason, workbench link (§12.13).
   - Pagination (§12.11).
   - Role-based scoping enforced server-side (S1) — verify the page handles 403 / scoped responses correctly per §12.14.
   - Data source: `GET /api/capacity/history` with filter params (§12.15).

**Acceptance criteria:**
- The inbox renders with correct columns, sorts, and filters. CR rows are visually distinct.
- "Decline all" calls the API and visually removes the row.
- The history page renders with correct data, filters, and expandable detail.
- Recently completed section loads from the audit trail API.
- "Review & assign" navigates to the workspace with the correct query params (assignment-mode auto-open is verified in S6a).

---

## Phase 3 — Complex Features (3 parallel agents)

### Session 6a: Assignment panel UI (Agent A)

**Read spec sections:** §9.1 (entry points overview), §9.2 (panel layout), §9.3 (person picker), §9.7 (save model + actions), §9.8 (CR re-confirmation in the panel), §9.11 (component structure)

**Depends on:** Session 5a (side panel shell + `CapacitySidePanelContext`).

**Do not build:** Timeline ghost overlay (Session 6b), timeline assignment gestures (Session 6b), cross-component entry-point wiring beyond URL param (Session 6b), multi-person split UI (Session 10 — build the single-person assignment flow first; `[+ Add]` button is rendered but disabled in this session and activated in S10).

**Deliverables:**

1. **`AssignmentState` context (new):**
   - Holds the in-flight assignment session: project ID, CR ID (optional), per-request month → person mapping, dirty flag, entry source.
   - Single source of truth consumed by both the side-panel form (this session) and the timeline overlay (S6b).
   - Exposed actions: `enterAssignmentMode(projectId, ccId, crId?)`, `setMonthAssignment(requestId, month, personId, hours)`, `clearMonthAssignment(...)`, `saveDraft()`, `confirm()`, `decline(reason)`, `exit()`.
   - Persists across panel close-and-reopen within the same session, but clears on `exit()` or successful confirm/decline.

2. **`AssignmentPanel.tsx` (§9.2):**
   - Registers as the `assignment` panel mode in `DetailSidePanel`.
   - Panel width: widens from 280px → 400px when this mode is active. Uses the width prop established in S5a.
   - Project header: name, hierarchy node badge, PL, period, status (§9.2).
   - CR banner (conditional): blue banner with CR ID + summary + direction legend (§9.8).
   - `AssignmentProgress`: progress bar + completion count (e.g., "14 of 19 months assigned").

3. **`RoleSection.tsx` (§9.2):**
   - One collapsible section per `ResourceRequest` with `request_type='resource'`.
   - Section header: role name, request meta, completion badge, chevron.
   - Visual dividers between sections.

4. **`QuickFill.tsx` (§9.2):**
   - Person picker dropdown + "Fill" button at the top of each role section.
   - Fill assigns person to ALL unassigned months in this section via `AssignmentState.setMonthAssignment`.

5. **`MonthRow.tsx` (§9.2):**
   - Month label, requested hours (with CR diff display: `80h → 120h (+40h)`), assignment slot.
   - Unassigned state: "unassigned" label + [Assign] button.
   - Assigned state: person chip with abbreviated name + utilization + remove (✕).
   - Placeholder for [+ Add] button (rendered but disabled — activated in Session 10).
   - For CR re-confirmation (§9.8): months changed by the CR show the diff inline; struck-through rows for months removed by the CR; previously assigned months pre-filled; new months added by the CR appear as unassigned.

6. **`PersonPicker.tsx` (§9.3):**
   - Inline dropdown with two groups: "Matching role" and "Other roles".
   - Each candidate row: name, current utilization, projected utilization (colored by bucket).
   - Conflict warning: red projected utilization when > 100%.
   - Type-to-filter search.
   - Uses `GET /api/capacity/requests/{cc}/{rid}/assignment-preview` for projected utilization.

7. **`ExternalCostSection.tsx` (§9.2):**
   - Separate section below resource sections for `request_type='external_cost'` requests.
   - Simple Confirm / Decline pair per request.

8. **`AssignmentActionBar.tsx` (§9.7):**
   - Sticky bottom with three buttons: "Save draft", "Confirm & send to controller", "Decline".
   - Save draft: calls `PUT /api/capacity/requests/{cc}/{rid}/assignments` for each modified request.
   - Confirm: calls `PUT /api/capacity/project-confirmation/{pid}/confirm`. Disabled until all months assigned (or shows partial-confirm variant).
   - Decline: inline textarea + submit.
   - Success/decline confirmation state transition.

9. **Unsaved changes protection (§9.7):**
   - Dirty state tracking in `AssignmentState`.
   - Confirmation dialog on close/navigate when dirty: "Save draft / Discard / Cancel".

10. **URL param entry (§9.1, partial):**
    - On workspace mount, if `?assignment_project={pid}&cc={ccid}` is present, call `enterAssignmentMode` and open the panel. This makes the inbox's "Review & assign" button (S5b) and the deprecation redirect (S2) work end-to-end.
    - Other entry points ("Review project" buttons in person detail, demand strip, project view) are wired in S6b.

**Acceptance criteria:**
- Opening assignment mode via URL param shows all role sections with month-by-month grids in the 400px panel.
- Person picker shows candidates with correct utilization projections from the preview endpoint.
- Quick fill assigns person to all unassigned months in one click.
- Save draft persists without creating allocations. Confirm creates allocations and transitions to success state.
- Decline opens textarea and calls the decline endpoint.
- Unsaved changes dialog prevents accidental data loss.
- CR re-confirmation: month-row diffs render correctly. (Ghost border colors on the timeline are S6b.)
- `AssignmentState` is exported and ready for S6b to consume for the timeline overlay.

---

### Session 7: Dashboard layer (Agent B)

**Read spec sections:** §11 (executive/controller dashboard layer — all subsections)

**Depends on:** Session 1 (new API endpoints: org-summary, headcount-breakdown, hotspots), Session 2 (workspace shell, scope context).

**Does not depend on:** Sessions 3, 4, or 5. The dashboard is self-contained above the timeline.

**Do not build:** Timeline interactions, side panel content, inbox, assignment mode.

**Deliverables:**

1. **`DashboardLayer.tsx` (§11.1–11.2):**
   - Collapsible section between KPI bar and filter chips.
   - Visibility rules: Controller or Executive AND multi-CC scope only.
   - `DashboardToggle`: `"▼ Capacity Dashboard"` / `"▶ Capacity Dashboard"`.
   - Collapse state persisted in `localStorage` key `creta_capacity_dashboard_collapsed` (§11.1).
   - Slide-up animation when dashboard hides (scope narrowed to single CC) (§11.7).
   - 2×2 grid layout, ~280px total height (§11.2).

2. **`UtilizationDistributionCard.tsx` (§11.3):**
   - Horizontal bar chart (Recharts `<BarChart>` with `layout="vertical"`).
   - 6 buckets: 0%, 1–25%, 26–50%, 51–75%, 76–100%, >100%. Colors per §11.3.
   - Computed client-side from person utilization data.
   - Click bucket → activate corresponding filter chip (§11.3 interactivity).
   - Hover: tooltip with count and percentage.

3. **`CapacityForecastCard.tsx` (§11.4):**
   - Area chart (Recharts `<AreaChart>` + `<Line>`).
   - Three series: Available (solid gray), Allocated (solid blue), Incoming demand (dashed amber).
   - Gap shading: green for surplus, red for deficit (§11.4).
   - Data source: `GET /api/capacity/org-summary`.
   - Hover: vertical crosshair tooltip with all three values + gap.
   - Click month: auto-expand containing quarter in timeline. Emit event for timeline to consume.

4. **`HeadcountBreakdownCard.tsx` (§11.5):**
   - Horizontal segmented stacked bar (Recharts `<BarChart>`).
   - Dimension switcher dropdown: By location (default) / By hierarchy node / By role / By CC.
   - Selection persisted in `localStorage`.
   - Data source: `GET /api/capacity/headcount-breakdown`.
   - Click segment → changes workspace scope (§11.5 interactivity).
   - Segment labels inside bar if they fit, else legend below.

5. **`HotspotListCard.tsx` (§11.6):**
   - Plain HTML/CSS ranked list (not a chart).
   - Data source: `GET /api/capacity/hotspots?limit=5`.
   - Each row: severity icon + summary text. Clickable per §11.6.
   - "View all ({N} issues)" expansion (scrollable, max 300px).
   - Empty state: green checkmark + "No capacity issues detected".
   - Executive: read-only clicks (no action buttons in side panel).

**Acceptance criteria:**
- Dashboard appears for Controller/Executive on multi-CC scopes and hides on single-CC scope.
- Collapse toggle works, state persists across sessions.
- All four cards render with correct data from API endpoints.
- Forecast chart shows three series with gap shading. The "capacity cliff" crossover is visually identifiable.
- Headcount dimension switcher works and persists selection.
- Clicking chart elements triggers the correct scope change or filter activation.
- Hotspot list shows top 5 issues ranked by severity with correct icons and summaries.

---

### Session 8: PL availability view (Agent C)

**Read spec sections:** §13 (PL read-only capacity view — all subsections)

**Depends on:** Session 1 (enhanced `role-availability` endpoint), Session 2 (routing skeleton).

**Does not depend on:** Sessions 3–7. This is a fully independent route.

**Do not build:** Workbench slide-over integration (Session 11). Build the full-page view only.

**Deliverables:**

1. **`PLAvailabilityView.tsx` (§13.2):**
   - Full page layout: header, scope controls, KPI summary, availability grid, side panel.
   - Self-contained — no dependency on the workspace's scope context. Has its own local state.

2. **`AvailabilityScopeBar.tsx` (§13.3):**
   - Location picker (single-select dropdown): All locations (default) + per-location entries with headcount.
   - Role filter (multi-select dropdown): all role types.
   - Locations with zero headcount hidden.

3. **`AvailabilityKPIs.tsx` (§13.4):**
   - 3 cards: Roles shown, Total headcount, Avg availability.

4. **`AvailabilityGrid.tsx` (§13.5):**
   - Reuse `TimeAxisHeader` from Session 3 (import the component). Same collapsible time axis behavior.
   - One `RoleAvailabilityRow` per role type.

5. **`RoleAvailabilityRow.tsx` (§13.5):**
   - Name cell (180px): role name + headcount sub-label.
   - Bar cells: two-layer bar (dark allocated, light available). Numeric label for available hours.
   - Color coding per availability threshold: ≥50% green, 20–49% amber, <20% red, 0% "Full" (§13.5).
   - Competing demand badge: `"⚡N"` in warning color when other PLs have pending requests (§13.5).

6. **Collapsed period behavior (§13.6):**
   - Average allocated/available. Peak competing demand count. Color from average availability.

7. **`AvailabilitySidePanel.tsx` (§13.7):**
   - Right panel (280px) on role row click.
   - Header: role name, location context, headcount.
   - Monthly breakdown table: Capacity / Allocated / Available / Competing per month.
   - Location comparison section (visible when "All locations" selected): clickable rows that set the location picker.
   - "Request this role" button: for now, navigates to `/workbench?request_role={role_id}&location={loc_id}`. Workbench slide-over integration is Session 11.

8. **Data privacy enforcement (§13.8):**
   - Verify that the component never renders person names, project names, or CC names.
   - All data comes from the role-level `GET /api/capacity/role-availability` endpoint — never from person-level endpoints.

**Acceptance criteria:**
- PL can navigate to `/capacity/availability` and see role-level availability bars.
- Location picker filters the grid. Role filter narrows to specific roles.
- Availability bars use correct color thresholds.
- Competing demand badges show correct counts (excluding the PL's own projects).
- Side panel shows monthly breakdown and location comparison.
- "Request this role" navigates to Workbench with pre-populated params.
- No person names, project names, or CC names are visible anywhere on the page.
- Non-PL roles (Controller, CC Owner, Executive) are blocked from accessing this route (403 or redirect).

---

## Phase 4 — Second-Wave Features (3 parallel agents)

### Session 6b: Timeline overlay + gestures + entry points (Agent A)

**Read spec sections:** §9.1 (entry points — full), §9.4 (timeline overlay during assignment mode), §9.6 (assignment gesture from timeline), §9.8 (CR ghost border colors)

**Depends on:** Session 3 (timeline rendering — `PersonTimelineRow` and `RoleGroup` are the surfaces this session decorates), Session 6a (`AssignmentState` context is consumed here).

**Do not build:** Multi-person split visualisation (Session 10 — split-segment rendering follows the multi-person UI).

**Deliverables:**

1. **Ghost segments on timeline (§9.4):**
   - When `AssignmentState` is active, overlay ghost segments on person bars for all role requests in the project.
   - Primary candidates (matching role): 30% opacity, 1.5px dashed border in project color.
   - Fallback candidates (other roles): 15% opacity, 1px dashed border.
   - Over-allocation preview: red dashed border when ghost would push person > 100%.
   - Auto-expand role groups containing matching candidates when assignment mode opens.
   - Solid-ify assigned ghosts immediately. Recalculate all ghosts when an assignment changes (subscribe to `AssignmentState` changes).
   - Ghost overlay is removed when `AssignmentState.exit()` fires.

2. **CR re-confirmation ghost colors (§9.8):**
   - Ghost segments for months whose CR direction is `increase` use a blue dashed border.
   - Ghost segments for months whose CR direction is `decrease` use an orange dashed border.
   - Unchanged months: no ghost (existing solid allocation segments remain visible).

3. **Assignment gesture from timeline (§9.6):**
   - Click a ghost segment → call `AssignmentState.setMonthAssignment(requestId, month, personId, fullRemainingHours)`.
   - Click a person's name cell → confirmation tooltip ("Assign {name} to {N} months of {role}? Confirm/Cancel"), then bulk assign on confirm.
   - Click a just-assigned solid segment (within the current session) → "✕ Remove" tooltip. Click removes via `AssignmentState.clearMonthAssignment(...)`.

4. **Cross-component entry-point wiring (§9.1):**
   - `PersonDetail` "Review project" buttons (rendered as no-op in S5a) → call `enterAssignmentMode` with the request's project + CC.
   - Demand strip cell click (placeholder event in S4) → open the side panel with a filtered request list. Each request row has a "Review project" button that calls `enterAssignmentMode`.
   - Project view (S9) unassigned slot row click → also wired here once S9 is merged. (S9 builds the row; S6b owns the click → assignment-mode dispatch.)

5. **Open-while-dirty handling:**
   - If the user clicks an entry point while another assignment session is dirty, surface the unsaved-changes dialog from S6a (Save draft / Discard / Cancel) before swapping to the new project.

**Acceptance criteria:**
- Ghost segments appear on the timeline for all role requests simultaneously when assignment mode is active.
- Ghost border colors are correct for CR increases (blue) and decreases (orange).
- Clicking a ghost segment assigns the person and solidifies the segment.
- All other ghosts on every visible person row recalculate after each assignment.
- Click-name-cell bulk assign works with confirmation tooltip.
- Click-solid-segment undo removes the in-flight assignment.
- Every cross-component entry point ("Review project" from person detail, demand strip, project view) reaches `enterAssignmentMode` correctly.
- Switching projects mid-edit triggers the unsaved-changes dialog.

---

### Session 9: Project view (Agent B)

**Read spec sections:** §10 (group-by-project view — all subsections)

**Depends on:** Session 3 (timeline rendering — reuses `TimeAxisHeader` and bar rendering patterns), Session 5a (side panel — project summary uses the panel).

**Do not build:** Assignment mode interactions within project view (the click-to-enter-assignment from unassigned slot rows is wired in Session 6b — the assignment panel is the same regardless of which grouping triggered it).

**Deliverables:**

1. **`ProjectGroup.tsx` (§10.2):**
   - Expandable project section with three child row types: assigned person, unassigned slot, external cost.
   - Child row sorting per §10.2: assigned first (hours desc), then unassigned (period asc), then external.

2. **`ProjectGroupRow.tsx` (§10.3):**
   - Name cell (160px): project name, hierarchy node badge, PL name, staffing status badge.
   - Fulfillment bar: solid (assigned) + dashed (unfulfilled), proportional to reference maximum (§10.3).

3. **`AssignedPersonRow.tsx` (§10.4):**
   - Name cell: person name, role badge, indented 20px.
   - Dual-layer bar: faded gray background (total utilization), solid foreground in project color (this project's allocation).
   - Hover tooltip per §10.4.

4. **`UnassignedSlotRow.tsx` (§10.5):**
   - Name cell: role name in italics, status label ("unassigned" / "partial"), action icon.
   - Dashed ghost bars within the request period.
   - Click action icon → opens assignment mode (§9) for this project.

5. **`ExternalCostRow.tsx` (§10.6):**
   - Name cell: cost description, cost type badge.
   - Thin 8px bar in neutral gray. Status icon (✓ or ⏳).

6. **`UnassignedSummary.tsx` (§10.7):**
   - Replaces demand strip when group-by is "Project".
   - Sticky-bottom row showing total unassigned hours per month across all visible projects.
   - Color thresholds: 0 = empty, 1–200h = warning, 200h+ = danger.

7. **Project summary side panel (§10.8):**
   - New content type for `DetailSidePanel`: project summary when a project group row is clicked.
   - Shows: project meta, role-by-role assignment progress, total hours, "Review & assign" button, "View in workbench" link.

8. **Filter chip adaptation (§10.10):**
   - When group-by is "Project", reinterpret existing chips per §10.10 table.
   - Add "Needs staffing" chip (visible only in project view).

9. **Sorting (§10.9):** Fulfillment percentage ascending, secondary alphabetical.

10. **Scope interaction (§10.12):** Scope filters which projects appear, not which people within projects. CC Owner scoped to "My CC" sees all people on matching projects.

11. **Collapsed time axis summary bars (§10.11):** Fulfillment bar averaged; person bar averaged with total utilization background; unassigned slot bar averaged with dashed style.

**Acceptance criteria:**
- Selecting "Project" in group-by renders project rows with fulfillment bars.
- Expanding a project shows assigned people (dual-layer bars), unassigned slots (dashed bars), and external costs (thin bars).
- Least-staffed projects sort to the top.
- Demand strip hides; `UnassignedSummary` appears in its place.
- "Needs staffing" filter chip appears and correctly filters to projects with fulfillment < 100%.
- Side panel shows project summary on project row click.
- Scope correctly filters projects (not people within projects).

---

### Session 10: Multi-person assignment + audit trail wiring (Agent C)

**Read spec sections:** §9.5 (multi-person partial assignment), §12.8 (recently completed section data source), §12.10 (write triggers — verify wiring)

**Depends on:** Session 6a (assignment panel UI — the single-person flow must be working; the `[+ Add]` button is rendered-but-disabled there and activated here), Session 5b (inbox — recently completed section exists but may need data wiring).

**Deliverables:**

1. **Multi-person split UI (§9.5):**
   - Activate the [+ Add] button on assigned month rows (was rendered disabled in Session 6).
   - When clicked: open `PersonPicker` with an hours input field pre-filled with remaining hours.
   - On selection: add a second person chip to the month row. Show both chips with their hours portion.
   - Enforce validation: assigned hours must sum to requested total (warn if not).
   - Allow manual override of individual hour amounts.
   - Partial fulfillment state: months where sum < requested show "partial" status. Completion badge adjusts (e.g., "5/7 full, 2 partial").
   - "Confirm partial & send to controller" button variant when partial months exist (§9.7).

2. **Multi-person timeline visualization:**
   - When a month has a multi-person split, each assigned person's timeline bar shows their individual portion as a solid segment (width proportional to their assigned hours).
   - Ghost segments for partially assigned months show the remaining hours.

3. **Audit trail write trigger verification:**
   - Verify that all six endpoint handlers from §12.10 correctly insert `CapacityActionLog` entries.
   - Test each action type: confirm, partial_confirm, decline, decline_request, assign_draft, cr_reconfirm.
   - Verify `summary` field is human-readable and `detail_payload` JSON is correctly structured.

4. **Recently completed section data wiring:**
   - Verify that `RecentlyCompletedSection` in the inbox correctly queries `GET /api/capacity/history` for the last 7 days.
   - Verify that completing an assignment (confirm or decline from the assignment panel) immediately adds a row to the recently completed section on next inbox visit.

5. **Save draft multi-person support:**
   - Verify the `PUT /api/capacity/requests/{cc}/{rid}/assignments` endpoint correctly persists multiple person assignments per month in the new request body format.
   - Verify loading a saved draft correctly restores multi-person assignments in the assignment panel.

**Acceptance criteria:**
- [+ Add] button adds a second person to an assigned month with hours splitting.
- Hours validation warns when sum doesn't match requested total.
- Timeline bars correctly show individual portions for split months.
- Partial confirm workflow works end-to-end.
- All audit log entries are correctly written for every action type.
- Recently completed section in inbox reflects actions taken in the assignment panel.

---

## Phase 5 — Integration + Polish

### Session 11: Cross-cutting integration

**Read spec sections:** §9.1 (entry points), §9.10 (deprecation redirect), §10.8 (project view side panel → assignment), §11.3–11.5 (dashboard click interactions), §13.9 (slide-over panel mode)

**Depends on:** All previous sessions (S3–S10).

This session is primarily verification and cross-module integration. The entry-point wiring itself is built progressively in S6a (URL param), S6b (person detail / demand strip / project view), and S5b (inbox button); this session confirms every path lands correctly end-to-end and adds the Workbench slide-over.

**Deliverables:**

1. **End-to-end entry-point verification (§9.1):**
   - Verify clicking "Review & assign" in the inbox (S5b) navigates to `/capacity?assignment_project={pid}&cc={ccid}` and the workspace auto-opens the assignment panel (S6a URL handler).
   - Verify "Review project" buttons in person detail pending-request cards (S5a → S6b) open the correct project's assignment panel.
   - Verify demand strip cell click → request list → "Review project" (S4 → S6b) opens assignment mode.
   - Verify project-view unassigned slot row click (S9 → S6b) opens assignment mode pre-scrolled to the relevant role section.
   - Verify the unsaved-changes dialog correctly blocks every entry point when another assignment session is dirty.

2. **Deprecation redirect (§9.10):**
   - Verify `/capacity/project-assignment/{pid}` correctly redirects to `/capacity?assignment_project={pid}&cc={ccid}` with the panel pre-activated, scoped to the correct CC.
   - Audit other modules (Portfolio approval queue, Launchpad pending actions) for any links that target the deprecated route and update them to point at the new query-param URL.

3. **Dashboard → timeline interactions (§11.3–11.5):**
   - Clicking a utilization bucket in the distribution chart activates the corresponding filter chip.
   - Clicking a month on the capacity forecast chart auto-expands the containing quarter in the timeline and scrolls to that month.
   - Clicking a segment in the headcount breakdown changes the workspace scope.
   - Clicking a hotspot row opens the relevant side panel content.

4. **PL availability slide-over (§13.9):**
   - `PLAvailabilitySlideOver.tsx`: wraps `PLAvailabilityView` in a slide-over panel (50% viewport width, slides from right).
   - Trigger: "Check availability" link from the Workbench Forecast & Planning tab during resource request creation.
   - Workbench remains visible and dimmed on the left.
   - "Request this role" button in slide-over mode closes the panel and populates the Workbench request form with selected role, location, and suggested period.
   - Close button (×) and click-outside-to-dismiss.

**Acceptance criteria:**
- Every entry point into assignment mode (inbox, person detail, demand strip, project view, URL param, deprecation redirect) works end-to-end.
- Dashboard chart clicks trigger the correct scope change, filter activation, or timeline expansion.
- PL slide-over opens from Workbench, allows browsing, and "Request this role" populates the form correctly.
- No dead-end interactions — every clickable element reaches its intended destination.

---

### Session 12: Edge cases, empty states, polish

**Read spec sections:** All sections — this is a sweep across the entire spec for edge cases.

**Depends on:** Session 11 (all integrations wired).

**Deliverables:**

1. **Empty states:**
   - Timeline with zero people in scope: "No people in this scope" placeholder.
   - Demand strip with zero pending requests: row hidden entirely (not shown with empty cells).
   - Inbox with zero pending requests: green checkmark + "No pending requests — all caught up" (§12.7).
   - History with zero entries: "No history entries for the selected filters."
   - PL availability with zero roles: "No roles available at this location."
   - Dashboard hotspot list with zero issues: green checkmark + "No capacity issues detected" (§11.6).

2. **Permission enforcement verification:**
   - Verify every surface is correctly gated per §15 permissions matrix.
   - CC Owner cannot see request actions outside their CC.
   - Executive cannot see action buttons.
   - PL cannot access `/capacity`, `/capacity/requests`, or `/capacity/history`.
   - Controller can access everything.

3. **Panel width transitions:**
   - 280px → 400px when entering assignment mode. Timeline area shrinks smoothly.
   - 400px → 280px when exiting assignment mode. Timeline expands smoothly.

4. **Horizontal scroll:**
   - Sticky name column works correctly during horizontal scroll.
   - Sticky demand strip / unassigned summary stays at bottom during vertical scroll.

5. **Keyboard navigation:**
   - Escape closes the side panel in all modes (detail, assignment).
   - Tab navigation through filter chips, scope pills.

6. **Zero-data edge cases:**
   - Person with zero allocations across all months: renders empty bars (not hidden) per §3.5.
   - Collapsed period where all months are 0%: summary bar is empty, no red border.
   - Project with no resource requests: still renders in project view if it has allocations (from historical data).

7. **Responsive behavior:**
   - KPI cards wrap correctly when viewport is narrow.
   - Dashboard 2×2 grid stacks to 1-column on narrow viewports.
   - Filter chips wrap to second line when too many for one row.

8. **Performance:**
   - Verify timeline rendering doesn't degrade with 50+ people × 36 months visible.
   - Verify dashboard chart rendering is smooth when scope is "All CCs" with full org data.

**Acceptance criteria:**
- All empty states render gracefully with correct messages.
- Permission enforcement is verified for all four roles across all surfaces.
- Panel transitions are smooth with no layout jumps.
- Scroll behavior (horizontal sticky column, vertical sticky strips) works correctly.
- No console errors in any edge case scenario.
