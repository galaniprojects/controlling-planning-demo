# 10 — Administration

Controller-only. Five-section sidebar covering 24 admin sub-surfaces per `[D-NAV-06]`:

| # | Section | Items |
|---|---|---|
| 1 | Master Data | Cost Centers, Competence Centers, Lines of Business, Workforce Locations, People, Charging Locations, Legal Entities, Regions, Countries, User Measurement |
| 2 | Reference Catalogues | Role Types, External Cost Types, Project Dependencies |
| 3 | Planning & Ranking | Planning Parameters |
| 4 | Portfolio Hierarchy | Portfolio Hierarchy editor (Entity Types / Hierarchies / Grouping Entities / Hierarchy Assignment) |
| 5 | System | Users, Role Permissions, Rate Tables, Workflow Templates, Scheduled Changes, Audit Log |

Every change emits an `audit_log` row with one of 8 categories per Cluster D Session D2: `master_data`, `configuration`, `hierarchy`, `forecast_actions`, `pipeline_transitions`, `simulator`, `access_control`, `scheduled_change_lifecycle`.

PL access attempt: an "Access Restricted" card with shield icon and copy "The Administration module is available to Controllers only." per the role gate in `Administration.tsx`.

---

## W10.1: Add a person

**Purpose**: Onboard a new team member into the master-data People panel.
**When to use**: New hire / contractor join. Reflects in capacity heatmaps and project allocations once activated.
**Personas involved**: Controller.
**Pre-conditions**: Cost Center already exists; Role Type already exists.
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/admin?section=people` (or pick **People** under "1 · Master Data" in the left rail) | PeoplePanel renders with header "People" + table | Existing seeded people listed |
| 2 | Controller | Click **+ New person** (top-right of panel) | Dialog opens with fields: Name, Role Type (dropdown), Cost Center (dropdown), Active toggle | Save disabled until required fields filled |
| 3 | Controller | Fill Name "Anika Ostrowski"; Role Type "Senior Developer"; Cost Center "Munich Application Development"; leave Active = true | Form validates inline | Save button enables |
| 4 | Controller | Click **Save** | Dialog closes; new row appears in People table | Toast / state: row visible. `audit_log` row in `master_data` category |

### Alternative paths

- **Deactivate (not delete)**: Editing an existing row offers a **Deactivate** action (soft delete). Per CPC's non-negotiable rule, deactivated rows are hidden from active views but preserved in the DB so historical allocations stay valid.
- **Edit role / CC reassignment**: Same dialog, just editing fields. Historical cost calculations continue to use the rate-in-effect at the time per the Rate Tables effective-date model (W10.2).

### Post-conditions

- New `Person` row with `is_active=true`, FKs to `RoleType` and `CostCenter`.
- `audit_log` row in `master_data` category with action `create`.

### Cross-references

- **Decision tags**: `[D-NAV-06]`, `[D-CAT-07]`
- **Backend endpoints**:
  - `routers/admin.py::list_people` (GET `/api/admin/people`)
  - `routers/admin.py::create_person` (POST `/api/admin/people`)
  - `routers/admin.py::update_person` (PUT `/api/admin/people/{person_id}`)
  - `routers/admin.py::deactivate_person` (PUT `/api/admin/people/{person_id}/deactivate`)
- **In-app manual**: `administration.json § People Management`

---

## W10.2: Update a rate table effective date

**Purpose**: Set a new hourly rate for a (role × competence centre) starting from a future effective date, preserving the historical rate for backwards-compatible cost calculations.
**When to use**: Annual rate-card update; mid-year adjustment for a specific role.
**Personas involved**: Controller.
**Pre-conditions**: Role Type and Competence Center exist.
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/admin?section=rate_tables` | RateTablePanel loads with header "Rate Tables" + table showing role × CC × hourly rate × effective date | Demo seed: ~30 rows |
| 2 | Controller | Click the pencil on a row (or **+ New rate** to add) | Inline edit or dialog with fields: hourly rate (€/h), effective date (date picker, must be ≥ today) | Save disabled until effective date is valid |
| 3 | Controller | Change rate from e.g. 90.00 to 95.00; set effective date "2026-07-01"; click **Save** | Dialog closes; a new RateTable row is appended (the old row stays) | The old row remains in the table but with an `effective_to` style implicit boundary; the new row's `effective_from` is the entered date |
| 4 | Controller | Verify history is preserved by inspecting the audit log or by re-loading the panel | Both rows visible | Historical cost calculations (e.g., the Forecast Accuracy report) continue to use the rate-in-effect for each historical month |

### Alternative paths

- **Past effective date**: The date picker rejects past dates; rate corrections for already-billed periods require a different remediation flow (out of scope for v5 demo).
- **Bulk rate update**: Not exposed in v5 UI; bulk updates require API loop or seed reload.

### Post-conditions

- New `RateTable` row with `effective_from=<date>`.
- Existing rows untouched (no UPDATE on prior rates).
- `audit_log` row in `master_data` category.

### Cross-references

- **Decision tags**: `[D-NAV-06]`
- **Backend endpoints**:
  - `routers/admin.py::list_rates` (GET `/api/admin/rate-tables`)
  - `routers/admin.py::create_rate` (POST `/api/admin/rate-tables`)
- **In-app manual**: `administration.json § Rate Table Management`

### Known issues / caveats

- The effective-date model is "rate per (role, CC) in effect at month T = the latest RateTable row with `effective_from ≤ T`". Adding a future-dated row does not retroactively change calculations.

---

## W10.3: Edit a planning parameter

**Purpose**: Adjust a system-wide planning parameter (e.g. a t-shirt size threshold, RAG variance band, or capacity utilisation target).
**When to use**: Demo of admin tunability; recalibrating thresholds based on portfolio shape.
**Personas involved**: Controller.
**Pre-conditions**: Planning Parameters section accessible.
**Estimated walk-time**: 2 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/admin?section=parameters` | PlanningParameters panel loads with header "Planning Parameters"; 6 group cards: Fiscal Settings / Planning Horizon / Thresholds / Limits / Capacity Settings / Integrations | Each group has its own table + Save / Reset to Defaults buttons |
| 2 | Controller | Locate **Thresholds** group; find row for `tshirt_xs_max_eur` (or similar t-shirt threshold) | Row visible with current value (e.g. 100000) | Param key, label, current value, Save button per group |
| 3 | Controller | Click the value cell, change to e.g. 120000, click **Save** for the Thresholds group | Toast / inline confirmation; value persists | If the param affects derived state (e.g. t-shirt size on projects, composite scores), a portfolio-wide recompute fires server-side |
| 4 | Controller | Optionally check the Audit Log under section `audit_log` | Row visible: timestamp, "anna_meier", `planning_parameter`, action `update`, old → new diff | Category = `configuration` |

### Alternative paths

- **Reset to Defaults**: Each group has a **Reset to Defaults** button that reverts every param in that group to the seed value.
- **Secret params**: Integrations group has a secret-flagged Anthropic API key with masked display + eye icon to reveal.
- **Tech Navigator weights**: Editing any `tn_*` param (sub-criterion weight, ranking weight, t-shirt threshold) triggers a portfolio-wide recompute of `complexity_score`, `value_creation_score`, `composite_score`. See [W11.2](./11-tech-navigator-and-backlog.md#w112-adjust-ranking-weights--t-shirt-thresholds).

### Post-conditions

- `PlanningParameter.value` updated.
- Derived columns on `Project` / other entities recomputed (when the param drives derived state).
- `audit_log` row in `configuration` category.

### Cross-references

- **Decision tags**: `[A-PRI-01..04]`, `[A-TN-09]`
- **Backend endpoints**:
  - `routers/admin.py::list_planning_parameters` (GET `/api/admin/planning-parameters`)
  - `routers/admin.py::update_planning_parameter` (PUT `/api/admin/planning-parameters/{param_key}`)
  - `routers/admin.py::reset_planning_parameter_group` (POST `/api/admin/planning-parameters/group/{group}/reset`)
- **In-app manual**: `administration.json § Planning Parameters`
- **FAQ overlap**: faq-12

---

## W10.4: Configure portfolio hierarchy

**Purpose**: Configure the multi-level grouping hierarchy that propagates across Portfolio Overview tree, Capacity pivot dimensions, Workbench entity selector, and Reporting dimensions.
**When to use**: Initial setup; switching from a Line-of-Business hierarchy to a Programme-based one.
**Personas involved**: Controller.
**Pre-conditions**: Hierarchy section accessible.
**Estimated walk-time**: 6 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/admin?section=portfolio_hierarchy` | PortfolioHierarchyPanel loads with header "Portfolio Hierarchy" and 4 tabs: **Hierarchies** / **Entity Types** / **Grouping Entities** / **Hierarchy Assignment** | Default tab depends on prior visit |
| 2 | Controller | Open **Entity Types** tab → click **+ New entity type** | Dialog: name + description fields | Per `[D-CAT-07]`-style CRUD pattern |
| 3 | Controller | Add e.g. "Programme" type | Row appears in Entity Types list | Type now eligible to participate in hierarchies |
| 4 | Controller | Switch to **Grouping Entities** tab → pick an entity type → **+ New entity** | Dialog: name + parent entity (within the parent type) | E.g. Add "Predictive Maintenance" under Programme |
| 5 | Controller | Switch to **Hierarchies** tab. Either edit existing hierarchy or click **+ New hierarchy** → enter name "TBS / RVS / Corporate IT / Digital & Data" and order entity types into levels | Hierarchy is saved; **Mark Active** toggles the active hierarchy | Only one hierarchy is active at a time |
| 6 | Controller | Switch to **Hierarchy Assignment** tab | Tree view of the active hierarchy with projects assigned to leaf nodes | Drag projects between entities (or use the assign control) |
| 7 | Controller | Verify propagation: navigate to `/portfolio` Dashboard tab → tree groupings now follow the active hierarchy. Navigate to `/capacity` Organization tab → "View by:" pivot now offers the new top-level entity type label | Both surfaces use the new hierarchy labels | Confirms cross-module propagation per the data model |

### Alternative paths

- **Deactivate hierarchy without replacement**: Setting active hierarchy to none defaults Portfolio Overview / Capacity to the seed-default Line of Business grouping for backwards compatibility.
- **Mid-cycle reassignment**: Reassigning projects mid-cycle does not retroactively change historical reports; new reports use the current assignment.

### Post-conditions

- New / updated rows in `GroupingEntityType`, `GroupingEntity`, `GroupingHierarchy`.
- `audit_log` rows in `hierarchy` category.
- The active hierarchy ID is stored in `PlanningParameter` so the UI knows which to render.

### Cross-references

- **Decision tags**: `[D-CAT-07]`, `[D-NAV-06]`
- **Backend endpoints**:
  - `routers/admin.py::list_grouping_entity_types`, `create_grouping_entity_type`, etc.
  - `routers/admin.py::list_hierarchies`, `set_active_hierarchy`, etc.
  - `routers/admin.py::assign_project_to_entity`
- **In-app manual**: `administration.json § Portfolio Hierarchy Management`
- **FAQ overlap**: faq-21

---

## W10.5: Edit a workflow template touchpoint

**Purpose**: Configure a step's touchpoints — required, role, gates, notifications, time constraint, escalation — without changing the step sequence.
**When to use**: Demoing the Cluster D2 workflow template editor; tightening a deadline; adding a notification.
**Personas involved**: Controller.
**Pre-conditions**: Workflow Templates section accessible. Templates are seeded: Forecast Cycle (5 steps), Intake / Pipeline Progression (5), Change Request (4), Send Back (3), Milestone Baseline Override (3), Scheduled Master Data Activation (3).
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/admin?section=workflow_templates` | WorkflowTemplateEditor loads with header "Workflow Templates" + 6 template tabs across the top, each with a step-count badge | Subheader copy: "Six configurable workflows. Step sequence is fixed; touchpoints (required, role, data gates, notifications, time constraint, escalation) are editable per step." |
| 2 | Controller | Click the **Forecast Cycle** tab | Template detail card renders: Name, description, key (e.g. `forecast_cycle`), Active toggle | Below: list of step cards (5 for forecast cycle), each with step number, name, type badge, optional/skippable badges |
| 3 | Controller | Expand step 2 (e.g. "Phase 2: Suggestions") by clicking the step header | Edit panel reveals: Required step (checkbox), Skippable (checkbox), Assigned role (dropdown), Time constraint (days input), Data gates (CSV input), Notifications (JSON input), Escalation action (dropdown) | Read-only view shows the current values inline |
| 4 | Controller | Change Time constraint from 10 → 7 days | Input updates; "Unsaved" badge appears next to step name | Save button at the bottom of the step panel enables |
| 5 | Controller | Click **Save** for that step | Inline confirmation; "Unsaved" badge clears; backend persists the new `time_constraint_days=7` | `audit_log` row in `configuration` category |
| 6 | Controller | (Optional) Change Notifications JSON to add an "on_overdue" trigger — `{"on_start": ["all_pls"], "on_overdue": ["controller", "responsible"]}` | JSON validates inline | Save persists the new structure |

### Alternative paths

- **Step reordering** is not supported (sequence is fixed). The editor only exposes touchpoint editing.
- **Toggle template active**: Click the Active / Inactive toggle on the template header card to disable a workflow entirely (the workflow becomes inert until reactivated).

### Post-conditions

- `WorkflowStep` row updated with new touchpoint values.
- Template-active flag updated if toggled.
- `audit_log` row in `configuration` category.
- v5 ships templates as configurable data only; live workflow execution wiring (i.e., enforcing the gates at runtime) is a follow-on session.

### Cross-references

- **Decision tags**: `[D-CAT-07]`
- **Backend endpoints**:
  - `routers/workflow_templates.py::list_templates` (GET `/api/admin/workflow-templates`)
  - `routers/workflow_templates.py::get_template_detail`
  - `routers/workflow_templates.py::update_step` (PUT `/api/admin/workflow-templates/steps/{step_id}`)
  - `routers/workflow_templates.py::toggle_template_active` (PUT `/api/admin/workflow-templates/{key}/active`)
- **In-app manual**: `administration.json § Workflow Templates`
- **FAQ overlap**: faq-v5-11 ("How do I edit a workflow template's step deadlines?")

---

## W10.6: Schedule a master data change + activate

**Purpose**: Demo the 5-state lifecycle of Scheduled Changes — `pending_review` → `approved` → `activated` (or `rejected` / `cancelled`) — for future-dated master-data updates.
**When to use**: A planning parameter change that should land at the start of next quarter; a CC reassignment effective on a future date.
**Personas involved**: Controller (creates via API + reviews via UI), second controller (approves), engine / button (activates).
**Pre-conditions**: Scheduled Changes section accessible.
**Estimated walk-time**: 5 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | On the Scheduled Changes panel, click **+ New scheduled change**. Pick entity type `planning_parameter`, parameter `rag_amber_threshold` (or any of the 6 admin-exposed parameters), enter a new value, pick an activation date today-or-later, write a justification (≥ 20 chars), submit | Dialog closes; new row appears in the list at `pending_review` state | Activation date picker enforces today-or-future client-side; backend rejects past dates with 400. Equivalent payload via API: POST `/api/admin/scheduled-changes` body `{entity_type: "planning_parameter", entity_id: "rag_amber_threshold", description: "<justification>", pending_values: {"current_value": "4"}, activation_date: "2026-05-15"}` (note `current_value` key — the activation handler requires it). |
| 2 | Controller | Navigate to `/admin?section=scheduled_changes` | ScheduledChangesPanel loads with header "Scheduled Changes" + status filter dropdown + "Apply due changes" button | Subheader: "Future-dated master-data and parameter changes pending review or activation. Second-admin review required before activation." |
| 3 | Controller | Find the new row (filter "Pending Review"); inspect: Status badge `Pending Review`, Activation date, Entity type / id, Description, pending_values JSON, Created by | Row populated as expected | Action buttons visible: **Approve**, **Reject**, **Cancel** |
| 4 | Controller (second admin in production; same persona ok in demo) | Click **Approve** | Dialog opens "Approve scheduled change" with subtext "Once approved, the change will be eligible for activation on its scheduled date. Activation runs via the daily job (or 'Apply due changes')." + comments field | Comments optional |
| 5 | Controller | Click **Approve** in dialog | Status badge flips to `Approved` | `audit_log` row in `scheduled_change_lifecycle` category |
| 6 | Controller | Wait until the activation date has passed (or in the demo, set the date to today). Click **Apply due changes** | Dialog opens "Apply due scheduled changes" with subtext "Manually run the activation engine. Approved changes whose activation date has passed are activated; their entity values are updated where the engine has a wired handler." | After spinner: 3-cell summary "Applied / Skipped / Errors" |
| 7 | Controller | After the engine runs, the row's status flips to `Activated` and the Planning Parameter `tshirt_xs_max_eur` is now 150000 | List refetches; KPI cell shows applied count | The Activation date column shows the date in the past with a `Activated` badge |

### Alternative paths

- **Reject**: Step 4 alternative — click **Reject** → required comments field → submit → status `Rejected`. Engine never touches it.
- **Cancel**: Owner of the change (or any controller for `pending_review` / `approved` rows) can click **Cancel** → status `Cancelled`. Useful for changes that are no longer relevant.
- **No-op activation**: For entity types other than `planning_parameter`, the activation engine records the activation as a no-op (the wiring to the live entity isn't yet complete in v5; only `planning_parameter` is wired). The Audit Log records the activation regardless.

### Post-conditions

- `ScheduledChange.review_status` transitions through `pending_review` → `approved` → `activated`.
- For `planning_parameter` entity_type: the live `PlanningParameter.value` is updated.
- `audit_log` rows in `scheduled_change_lifecycle` (review) and `master_data` (activation) categories.

### Cross-references

- **Decision tags**: `[D-CAT-07]`, `[D-NAV-06]`
- **Backend endpoints**:
  - `routers/scheduled_changes.py::create_scheduled_change` (POST `/api/admin/scheduled-changes`)
  - `routers/scheduled_changes.py::list_scheduled_changes` (GET)
  - `routers/scheduled_changes.py::approve_scheduled_change` / `reject_scheduled_change` / `cancel_scheduled_change`
  - `routers/scheduled_changes.py::apply_scheduled_changes` (POST `/api/admin/apply-scheduled-changes`)
  - Activation engine: `services/scheduled_change_activation.py::APPLY_HANDLERS`
- **In-app manual**: `administration.json § Scheduled Changes`
- **FAQ overlap**: faq-v5-12 ("What is a Scheduled Change and how does activation work?")

### Known issues / caveats

- Only `planning_parameter` activation is fully wired in v5. Other entity types (`person`, `cost_center`, etc.) are shown disabled in the Create dialog with a "Coming soon — not wired in v5" tooltip; production extension would add handlers in `APPLY_HANDLERS`.
- Only 6 planning parameters are exposed via `/api/admin/parameters` (the ones surfaced in the Planning Parameters admin panel): `fiscal_year_start`, `planning_horizon`, `forecast_deadline`, `rag_amber_threshold`, `rag_red_threshold`, `max_utilization`. Tech-Navigator parameters (e.g. `tshirt_xs_max_eur`) live under `param_group='tech_navigator'` and are not exposed to the Scheduled Changes Create dialog by design — they have their own admin surface.

---

## Cross-workflow notes

- **Audit Log** at `/admin?section=audit_log` is the cross-cutting view of every admin action. Filter by category (8 categories), entity type, and date range. Each entry shows old → new diff and supports CSV / Excel export per `audit_export.py`.
- **UM Matrix viewer** (`/admin?section=user_measurement`): year + quarter + version selector; sparse cells with row + column totals; CSV upload creates a new version (no overwrite). The "Automatic refresh" button is intentionally stubbed in the demo (returns "not connected to a UM source") to preserve the integration boundary for production SAP-API connection. Each CSV import is versioned by import timestamp; switching to "Latest import" shows the freshest snapshot.
- **Charging Locations / Legal Entities CRUD** under "1 · Master Data" follows the standard CRUD pattern from `[D-CAT-07]`. Charging Locations carry division / region / country attributes feeding the Stage 2 BTC line picker; Legal Entities roll up many-to-one to a Charging Location.
- **Role Permissions Grid** under "5 · System" — per-role × per-entity-type grants for BTC profile and Stage 1 distribution edits per `[F-AC-01]`. Default: responsible person owns the entity; controller has audit-trailed override authority. Audit log category: `access_control`.
- **Project Dependencies** under "2 · Reference Catalogues" — define inter-project dependency relationships used by the Backlog ranker (W11.3) for cross-project conflict detection.

## Related FAQ entries

- faq-12 "How do I manage planning parameters?"
- faq-13 "How do I view the audit trail for administrative changes?"
- faq-21 "How do I configure the portfolio hierarchy?"
- faq-v5-11 "How do I edit a workflow template's step deadlines?"
- faq-v5-12 "What is a Scheduled Change and how does activation work?"
- faq-v5-13 "How do I import a UM matrix CSV?"
