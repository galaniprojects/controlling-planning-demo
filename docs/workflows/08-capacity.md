# 08 — Capacity Management

Team utilisation, organisation pivot, and the CC-Owner's project-confirmation gate. Two tabs (My Team / Organization Overview) plus a Resource Requests sub-route per `[E-04]` and `[F-AC-01]`. PLs have no access to this module — Capacity is the CC-Owner / Controller / Executive surface.

For the CC Owner's resource-request inbox (confirm / partial / counter / decline), see [05-resource-requests](./05-resource-requests.md). This doc focuses on the heatmaps and the project-level resource confirmation that pre-feeds the controller's intake.

---

## W08.1: Team heatmap + person drill-down

**Purpose**: View per-person utilisation as a colour-coded month heatmap and drill into any person's project allocation breakdown.
**When to use**: CC-Owner's daily morning glance; controller's "let me look at Brenner's team" walk; demoing capacity health.
**Personas involved**: CC Owner (Thomas Brenner) primarily; Controller (Anna Meier) can pick any cost centre via the CC selector; Executive can read.
**Pre-conditions**: Capacity module accessible. CC Owner persona is auto-scoped to their `managed_cost_center_id`; controller must pick a CC from the dropdown.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | CC Owner | Navigate to `/capacity` | ModuleHeader "Capacity Management". Tabs: **My Team** / **Organization Overview**; default tab is My Team for CC Owner | URL stays at `/capacity` |
| 2 | CC Owner | Inspect the page: Resource Requests button (top-left, blue when pending count > 0) + TeamSummaryBar + heatmap section header "Team Utilization Heatmap" | Summary bar shows team-level metrics: avg utilisation %, headcount, over-allocated count, under-allocated count, pending request count | All numbers populated; demo seed: Thomas's team ~6-8 people |
| 3 | CC Owner | Read the heatmap | Rows = people grouped by role, columns = months, each cell colour-coded: blue (<70%), green (70-90%), amber (90-100%), red (>100%) | Cell values are utilisation percentages |
| 4 | CC Owner | Click any person row | Bottom drawer opens with the person's name as title and `PersonDetailDrawer` content | Drawer header shows person name; body lists their allocations across projects with monthly hours, confirmed vs pending, and a utilisation trend |
| 5 | CC Owner | Close the drawer (ESC or click outside) | Drawer collapses | Heatmap remains in place |
| 6 | Controller | Switch persona to Anna; navigate to `/capacity` | Same My Team tab + an additional **Cost Center selector** above the summary bar | Selector dropdown lists every active CC; first CC auto-selected |
| 7 | Controller | Pick a different CC (e.g. "Munich Application Development") | Heatmap re-fetches and re-renders | TeamSummaryBar re-populates with the new CC's metrics |

### Alternative paths

- **Empty CC**: If a controller picks a CC with no people (rare), the page shows "Select a cost center to view team details" or a dim heatmap.
- **PL access attempt**: A PL navigating to `/capacity` sees "Capacity Management is not available for the Project Lead role." per the role gate in `CapacityManagement.tsx`.

### Post-conditions

No state change — read-only view. Heatmap data is computed on every page load via `routers/capacity.py::get_team_heatmap`.

### Cross-references

- **Decision tags**: `[E-04]`, `[F-AC-01]`
- **Backend endpoints**:
  - `routers/capacity.py::get_capacity_context` (GET `/api/capacity/context`)
  - `routers/capacity.py::get_team_summary` (GET `/api/capacity/teams/{cc_id}/summary`)
  - `routers/capacity.py::get_team_heatmap` (GET `/api/capacity/teams/{cc_id}/heatmap`)
  - `routers/capacity.py::get_person_detail` (GET `/api/capacity/people/{person_id}/detail`)
- **In-app manual**: `capacity_management.json § My Team Tab`
- **FAQ overlap**: faq-05 ("How do I check my team's utilization?")

---

## W08.2: Org-wide capacity pivot

**Purpose**: Compare utilisation across the whole organisation, pivoted by cost centre, role, or the active portfolio hierarchy level (e.g. Line of Business).
**When to use**: Controller's portfolio-wide glance to find systemic over- or under-utilised pools; Executive's read for portfolio reviews.
**Personas involved**: Controller, Executive (read-only).
**Pre-conditions**: Capacity module accessible. ≥ 2 active cost centres in the seed.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/capacity` | My Team tab loads (default for controller too) | TabsList visible |
| 2 | Controller | Click the **Organization Overview** tab | Tab switches; OrgSummaryBar + pivot selector + OrgHeatmap render | URL stays `/capacity`; tab state in component, not URL |
| 3 | Controller | OrgSummaryBar shows org-wide metrics: total headcount, avg utilisation, hot CCs / cool CCs counts | All numbers visible | Aggregates roll up across active CCs |
| 4 | Controller | Pivot selector "View by:" with 3 options: **Cost Center** (default), **Role**, **Line of Business** | Selector dropdown labelled per the active portfolio hierarchy (the LoB option label adapts to whichever entity-type is the active hierarchy's top level) | Choosing each option re-fetches and re-renders |
| 5 | Controller | Click any cell in the heatmap (a CC × month tile) | Bottom drawer opens with header `<CC name> — <month>` and project-level consumption detail for that slice | Drawer body lists every project consuming hours from that CC in that month |
| 6 | Controller | Click any row label (the CC / Role / LoB name on the left) | Drawer opens with the wider slice (no specific month) — full row detail | Drawer body lists projects with monthly granularity |

### Alternative paths

- **Hierarchy adaptation**: When the active portfolio hierarchy is changed in Administration (W10.4), the third pivot option's label changes accordingly. The default falls back to "Line of Business" if no hierarchy is active.
- **Filter by CC Owner / Exec**: CC Owner sees Organization Overview but their CC's row is labelled inline; exec sees a read-only version with no row-action affordances.

### Post-conditions

No state change — read-only.

### Cross-references

- **Decision tags**: `[E-04]`
- **Backend endpoints**:
  - `routers/capacity.py::get_org_summary` (GET `/api/capacity/org/summary`)
  - `routers/capacity.py::get_org_heatmap` (GET `/api/capacity/org/heatmap?pivot={cost_center|role|lob}`)
  - `routers/capacity.py::get_org_detail` (GET `/api/capacity/org/detail/...`)
- **In-app manual**: `capacity_management.json § Organization Overview Tab`
- **FAQ overlap**: faq-08 ("How do I view the organization-wide capacity overview?")

---

## W08.3: Project resource confirmation (all-or-nothing)

**Purpose**: When a Project Lead submits a new project that needs internal resources, the CC Owner reviews **all** resource requests for that project on a single page and confirms them as a batch before the project advances to controller review.
**When to use**: After a PL submits a new intake project at DoI 2 with resource requests; the CC Owner sees a project banner on their My Team tab and walks the assignment grid.
**Personas involved**: CC Owner (assigns resources); Project Lead (originator); Controller (downstream approver).
**Pre-conditions**: ≥ 1 project at DoI 2 with resource requests targeting the CC Owner's CC. The MyTeamTab's Project Confirmation banner surfaces these.
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | CC Owner | From `/capacity`, MyTeam tab, look at the top of the page for a "Project Confirmation Banner" | Banner appears when there is ≥ 1 pending project; each project card shows name, hierarchy entity, project lead, timeline, and number of resource requests | Banner only renders when seed has pending projects |
| 2 | CC Owner | Click **Review & Assign Resources** on a project card | Navigates to `/capacity/project-assignment/<projectId>` | Dedicated page loads with assignment grid |
| 3 | CC Owner | Inspect the grid: rows = requested roles (Senior Developer, QA / Test Engineer, …), columns = months with collapsible year headers, **All** column between role name and month columns | Grid renders with amber unassigned cells, green assigned cells | Each row's right-side Status column shows "X / Y assigned" |
| 4 | CC Owner | Click the **All** cell on a row, pick a person | All months in that row fill with the person's abbreviated name in blue | Confirms one-click bulk assignment |
| 5 | CC Owner | Override individual months by clicking specific cells; person dropdown groups people: "Matching role" first, then "Other roles", with per-month utilisation shown beside each name | Selected cells turn green | Each person shows utilisation colour-coded: green (<70%), amber (70-90%), red (>90%) |
| 6 | CC Owner | Once every role's months are fully assigned, click **Confirm All & Send to Controller** | Confirmation succeeds; allocation records created; project moves to the controller's intake queue | Toast "Resources confirmed"; navigation back to `/capacity` |

### Alternative paths

- **Decline path**: Step 2 alternative — click **Decline** on the banner card → modal asks for a reason → project sent back to PL with the reason recorded.
- **Partial completion**: If some roles still have unassigned months, the **Confirm All & Send to Controller** button stays disabled (per `capacity_management.json § Confirming Resources`). The page shows a toast "X months still need assignment".

### Post-conditions

- New `Allocation` rows created (`person_id`, `project_id`, monthly hours, `is_confirmed=true`).
- `ResourceRequestAssignment` rows linking the request and the assignment.
- Project's pipeline state advances; controller sees it in the intake queue with assigned-person names visible.
- `audit_log` row in `forecast_actions` category.

### Cross-references

- **Decision tags**: `[E-04]`
- **Backend endpoints**:
  - `routers/capacity.py::get_project_assignment_grid` (GET `/api/capacity/project-assignment/{project_id}`)
  - `routers/capacity.py::confirm_project_resources` (POST `/api/capacity/project-assignment/{project_id}/confirm`)
- **In-app manual**: `capacity_management.json § Project Confirmation Banner` and `§ Resource Assignment Grid`
- **FAQ overlap**: faq-02 ("How do I respond to a resource request?") and faq-10 ("What happens when a CR involves reducing hours for a role?")

### Known issues / caveats

- The "matching role" prioritisation in the dropdown is by role-type ID; people whose role has been reassigned mid-project may appear lower than expected. Use the search inside the dropdown to override.
- For CR-linked resource requests (delta-based), see [05-resource-requests W05.1](./05-resource-requests.md#w051-confirm-a-resource-request) — those are confirmed individually rather than via this all-or-nothing project flow.

---

## Cross-workflow notes

- **Heatmap colour bands** are a system-wide convention: blue (<70%), green (70-90%), amber (90-100%), red (>100%). The exact cutoffs are pulled from `PlanningParameter` rows under `param_group='capacity'` (see [W10.3](./10-administration.md#w103-edit-a-planning-parameter)).
- **Request Management subroute** (`/capacity/requests`) handles the per-request confirm/partial/counter/decline flow per [W05.1-W05.4](./05-resource-requests.md). The CR-linked requests in that subroute share state with the Portfolio CR queue (see [W04.2](./04-change-requests.md)).
- **PL exclusion**: The PL has no access to Capacity Management; the route falls through to a friendly empty-state. PLs receive resource-confirmation outcomes through the Workbench's allocation tab and through the CR resolution notifications.

## Related FAQ entries

- faq-02 "How do I respond to a resource request?"
- faq-05 "How do I check my team's utilization?"
- faq-08 "How do I view the organization-wide capacity overview?"
- faq-10 "What happens when a CR involves reducing hours for a role?"
