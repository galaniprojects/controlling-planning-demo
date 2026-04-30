# 03 — Forecast Cycle

The monthly forecast cycle is the heartbeat of the CRETA demo: every active project's PL submits a fresh 12-month + quarterly outlook each cycle, the controller reviews + approves, the system snapshots the result as an immutable `ForecastVersion`, and the cycle closes.

Five-phase wizard per `[E-04a]`:

| Phase | Label | Purpose |
|---|---|---|
| 1 | Retrospective | Acknowledge / explain prior-month variances |
| 2 | Suggestions | Apply or dismiss AI / system-generated forecast adjustments |
| 3 | Edit Forecast | Make per-month changes (hours / EUR) on the grid |
| 4 | Review | Verify the diff before submission |
| 5 | Confirmation | Final submit; PL drops out of edit-mode, CRs are auto-created per CC |

Versioning per `[C-FV-01..07]`: every cycle submission and every CR approval writes a `ForecastVersion` snapshot (mixed-granularity payload as JSON, ~70 KB / version). Versions are sequential per project.

---

## W03.1: Monthly forecast cycle (5-phase wizard)

**Purpose**: PL submits the new month's forecast for an active project, kicking off the controller-review chain that closes the cycle.
**When to use**: Triggered monthly (on the cycle deadline). PL sees a "Monthly forecast due" pending action on the Launchpad with a deep link to the project's Forecast & Planning tab.
**Personas involved**: Project Lead (Priya).
**Pre-conditions**: Project at `pipeline_stage='Active'`, `doi=3`. No CR currently locking the project's forecast (the **Rolling Forecast Review** button is disabled while a CR is in flight).
**Estimated walk-time**: 8 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | PL | From Launchpad, click the pending action **Monthly forecast due — Master Data Hub Rollout — submit 2026-04 forecast** | Navigates to `/workbench?project=proj-mdh-rollout` Forecast & Planning tab | Project workspace loads; tab "Forecast & Planning" is selected |
| 2 | PL | Click **Rolling Forecast Review** (page header) | Wizard modal opens. The 5-phase stepper is pinned at the top: **1 Retrospective · 2 Suggestions · 3 Edit Forecast · 4 Review · 5 Confirmation** | Modal heading "Phase 1: Retrospective — March Actuals"; stepper highlights step 1 |
| 3 | PL | Phase 1 — Retrospective: review last month's forecast vs actuals table. Variances > 10% are flagged (red row outline + "Flag" indicator) | Each line item shows March Forecast / March Actual / Variance / Var % | Two flagged rows visible: Data Engineer (-32,3%) and Consulting (-49,4%); **Acknowledge & Continue** button is **disabled** until both flags have explanatory text |
| 4 | PL | Type a short explanation for each flagged variance ("Daniel Schubert reduced workload due to PoC reprioritisation"; "Deloitte invoice slipped to April"); click **Acknowledge & Continue** | Phase 2 loads | Stepper highlights step 2; modal heading "Phase 2: Suggestions" |
| 5 | PL | Phase 2 — Suggestions: Review 0-N AI-suggested adjustments (trend-based, burn-rate, utilisation insights). Apply or dismiss each. (If none surface, click **Continue without suggestions**) | Phase 3 loads | Stepper highlights step 3; modal heading "Phase 3: Edit Forecast" |
| 6 | PL | Phase 3 — Edit Forecast: edit the monthly + quarterly grid. Internal resource roles + external cost types are rows; columns are months out to the granularity boundary, then quarters. Cells beyond the boundary are flagged "Provisional" per `[C-FG-07]`. To skip edits, click **Keep as is** | Phase 4 loads with the edit summary | Stepper highlights step 4 |
| 7 | PL | Phase 4 — Review: Compare summary in EUR (e.g., "Senior Developer: 80h → 100h (+20h, +€2.000)" per affected month). Add a justification text in the free-text field | Justification field accepts free text; **Submit** button enables | Modal shows old / new / delta in full EUR format |
| 8 | PL | Phase 5 — Confirmation: Click **Submit** | Backend creates `ForecastVersion` snapshot (`version_type='cycle'`) + CR(s) per cost-center scope of the changes; modal closes | Toast "Forecast submitted"; Workbench Forecast Health tile flips to "v3 · Q2 2026 Cycle · Last submission just now"; **Rolling Forecast Review** button is replaced by a "CR pending" status indicator |

### Alternative paths

- **Phase 2 skipped**: Per `SPEC-003`, Phase 2 may be skipped (no suggestions surface for the project / month); the wizard auto-advances to Phase 3. The 5-step stepper still renders all five steps even when one is silently skipped.
- **Cancel**: Clicking **Cancel** in any phase discards all edits and closes the wizard. No `ForecastVersion` is written.
- **Validation failure on submit**: If the changes violate constraint rules (e.g., exceed planning-horizon limits), Phase 5 surfaces inline error messages and **Submit** stays disabled.
- **CR-locked**: If a CR is currently pending for this project, the **Rolling Forecast Review** button shows a status indicator with the blocking CR number; you cannot enter the wizard until the CR resolves (approved / rejected / sent-back-and-resubmitted).

### Post-conditions

- New `ForecastVersion` row, sequential `version_number`, `version_type='cycle'`, `cycle_label='Q2 2026 Cycle'` (or whatever cycle is active), `payload_json` with the full mixed-granularity grid, `granularity_boundary_months` and `planning_horizon_months` snapshotted.
- One or more `ChangeRequest` rows with `status='pending_controller_approval'` (or `pending_cc_confirmation` if the change involves resource allocations within a single CC's pool).
- Project's `Forecast` rows updated — but per `[B-OQ-02]` the project remains in "submitted" state until the controller approves; the PL can no longer edit until the CR resolves.
- `audit_log` row in `forecast_actions` category.
- Notification fires to the Controller's Launchpad ("CR pending review").

### Cross-references

- **Decision tags**: `[E-04a]` (5-phase wizard), `[C-FV-01..07]` (versioning), `[C-FG-07]` (provisional cells beyond boundary), `[B-OQ-02]`
- **Backend endpoint**: `routers/workbench.py::submit_forecast_cycle()` → `services/forecast_cycle.py::submit_forecast_cycle()`; ForecastVersion creation in `services/forecast_versioning.py`
- **In-app manual**: `project_workbench.json § Monthly Forecast Wizard`, `§ Forecast & Planning Tab`
- **FAQ overlap**: faq.json `faq-09` ("How do I update my project's monthly forecast?")
- **Cross-walks**: [W04.1](./04-change-requests.md#w041-pl-drafts-cr-via-forecast-cycle-submission) (CR creation continuation), [W03.2](#w032-controller-forecast-review-with-edit-in-place) (controller review)

### Known issues / caveats

- `SPEC-003` (from `qa/bug-report.md`): Phase 2 may show no suggestions even when the project has data drift. The wizard handles this gracefully by auto-advancing.
- The granularity boundary is fixed at "next 12 months" relative to the demo date (April 2026 + 12 = March 2027). Cells beyond that are explicitly labelled **Provisional** in the grid header.
- Quarter columns are collapsible. Expanding a quarter splits it into three months; collapsing aggregates them back into a single Q-cell.

---

## W03.2: Controller forecast review with edit-in-place

**Purpose**: Controller reviews a PL-submitted CR (from W03.1) — read the diff, optionally edit specific cells, then approve / reject / send back.
**When to use**: After W03.1 fires the CR. Notifications surface on the Controller's Launchpad ("Pending Reviews · 1 item · 1 CR · 0 intake").
**Personas involved**: Controller (Anna).
**Pre-conditions**: ≥ 1 CR with `status='pending_controller_approval'`. Default seed has CR #19 awaiting Anna's review.
**Estimated walk-time**: 6 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From Launchpad, click the **Pending Reviews** tile (or **CR #19** pending action) | Navigates to `/portfolio/approvals` with CR Approvals tab selected | Page heading "Portfolio Overview"; tab strip shows Dashboard / **CR Approvals** / External Spend; CR #19 row visible |
| 2 | Controller | Click the CR #19 row | Detail panel / drawer opens showing CR metadata: project, summary ("Licensing cost increase + additional security consultant for migration complexity"), submitter (Thomas Brenner), confirmed-by (Thomas Brenner — already CC-confirmed since this is a Run-portfolio CR), impact (+€2K), date | Header reads "CR #19 — Identity & Access Management Run" |
| 3 | Controller | Read the diff: line-item-level deltas with old / new / variance | Table shows each `CRChangeDetail` row with field name, old value, new value, monetary delta | Detail rows visible: e.g. "Licenses · CapEx · 2026-05 · €0 → €1.500 (+€1.500)" |
| 4 | Controller | (Optional) Click **Request Changes** to enter the controller-edits flow | An editable grid replaces the diff view; modify any cell directly | Modified cells get an "edited" badge; commentary box appears below the grid |
| 5 | Controller | If happy with the proposal, click **Approve** | Confirmation prompt: "Approve CR #19?" | Modal heading visible |
| 6 | Controller | Click **Confirm approve** | CR status flips to `approved`; backend writes a new `ForecastVersion` (`version_type='cr_approval'`) reflecting the approved deltas; affected `Forecast` rows updated; audit row written | Toast "CR approved"; CR row disappears from the pending queue; PL gets a "Change request approved" notification |
| 7 | Controller | (Alternative) Click **Reject** instead | Modal asks for required reason ("Why is this CR rejected?") | Reason box, **Confirm reject** disabled until text entered |
| 8 | Controller | (Alternative) Click **Request Changes** with edits + commentary, then **Send back to PL** | CR status flips to `changes_requested`; PL gets a "Change request returned with feedback" notification (see W04.4) | Toast "Sent back with feedback" |

### Alternative paths

- **CR not yet CC-confirmed**: For Change-Portfolio CRs (DoI 0-4 projects) with internal resource changes, the CR routes to the CC Owner first — the controller's **Approve** button is replaced by a "Pending CC confirmation" indicator. Run-portfolio CRs (CR #19's case) skip the CC step.
- **Bulk approve**: Some seeded controller-tier surfaces support bulk-approve (e.g., approve N CRs in one click); v5 keeps this single-CR for clarity.

### Post-conditions

- `ChangeRequest.status` updated to `approved` / `rejected` / `changes_requested`.
- On approval: new `ForecastVersion` row (`version_type='cr_approval'`), affected `Forecast.is_provisional` flags cleared on the cells the CR touched.
- `audit_log` row in `forecast_actions` category.

### Cross-references

- **Decision tags**: `[C-FV-04]` (CR-approval snapshot), `[E-04a]`, `[F-AC-01]` (role gating)
- **Backend endpoint**: `routers/portfolio.py::approve_cr()` / `reject_cr()` / `send_back_cr()`; ForecastVersion creation hook in `services/forecast_versioning.py`
- **In-app manual**: `project_workbench.json § Change Request Workflow`
- **FAQ overlap**: faq.json `faq-06` ("How do I approve or reject a change request?")
- **Cross-walks**: [W04.3](./04-change-requests.md#w043-controller-cr-approval), [W04.4](./04-change-requests.md#w044-cr-send-back--pl-resubmit--diff-view)

### Known issues / caveats

- `SPEC-002` (from `qa/bug-report.md`): the controller intake grid is **read-only** in some viewports (compact / iPad). Use a desktop viewport (≥ 1440px) for the edit-in-place flow.
- The diff view shows monthly deltas only — quarterly-zone cells aren't broken out into months for the visual diff (they appear as a single Q-cell delta).

---

## W03.3: Cycle close + ForecastVersion snapshot fan-out

**Purpose**: Close the active forecast cycle. The system fans out `ForecastVersion` + `ProgressSnapshot` for every active project (whether or not the project's PL submitted), advancing the cycle pointer.
**When to use**: Once the controller has cleared the CR queue for the cycle and ≥ 90% of active projects have submitted (the demo cycle is monthly; in production it's typically aligned to the financial calendar).
**Personas involved**: Controller (Anna).
**Pre-conditions**: At least one project at DoI 3 Active.
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From Launchpad, click the **Forecast Cycle** tile | Navigates to a cycle-summary view (e.g., `/portfolio?view=forecast-cycle`) | Tile sub-line "4 overdue · cycle 2026-04" |
| 2 | Controller | Inspect the cycle dashboard (submitted vs overdue, by project) | Table or chart showing submission status per active project | Visual list with status badges (Submitted / Overdue / Approved) |
| 3 | Controller | Click **Close cycle** in the page header | Confirmation modal: "Close the 2026-04 cycle? This snapshots the current forecast for every active project and locks the cycle for further submissions." | Modal heading "Close cycle" |
| 4 | Controller | Click **Confirm close** | Backend fans out: for each `pipeline_stage='Active'` project, write a `ForecastVersion` (`version_type='cycle'`) and a `ProgressSnapshot` (best-effort, failures don't block the close). Cycle pointer advances to next month. | Toast "Cycle 2026-04 closed"; new active cycle reads "Q2 2026 Cycle · 2026-05" |
| 5 | Controller | Navigate to any project's Workbench Forecast Health tile | Version count incremented for every active project | E.g. proj-mdh-rollout shows "v3" (was v2) |

### Post-conditions

- N new `ForecastVersion` rows (where N = active project count, typically 11 in the demo).
- N new `ProgressSnapshot` rows (best-effort — see `services/progress_tracker.capture_progress_for_cycle`).
- `PlanningParameter` for `current_cycle` advanced.
- `audit_log` row in `forecast_actions` category.

### Cross-references

- **Decision tags**: `[C-FV-03]` (cycle fan-out), `[E-04c]` (progress snapshot fan-out)
- **Backend endpoint**: `routers/portfolio.py::close_cycle()` → `services/forecast_cycle.py::close_cycle()` (fans out to `services/forecast_versioning.py::create_forecast_version()` and `services/progress_tracker.py::capture_progress_for_cycle()`)
- **In-app manual**: `project_workbench.json § Forecast & Planning Tab`

### Known issues / caveats

- `ProgressSnapshot` creation is best-effort — if a single project's snapshot fails (e.g., NULL `current_milestone_id`), the cycle still closes and an audit warning is logged. The accuracy report (`services/report_service.py::forecast_accuracy()`) tolerates missing snapshots.
- Closing a cycle is **irreversible** from the UI. To re-open a cycle for further submissions, restore from a database backup or use a manual SQL UPDATE on `PlanningParameter`.

---

## W03.4: View forecast version history + diff

**Purpose**: Inspect the full history of versioned forecasts for a project — every cycle submission + every CR approval is captured immutably.
**When to use**: Audit trail; explaining why the current forecast looks different from last month; investigating a cycle's drift.
**Personas involved**: Controller (Anna) primarily; PL can view their own project's history.
**Pre-conditions**: Project has ≥ 2 `ForecastVersion` rows (any active project after one cycle has elapsed).
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any role with project access | Navigate to `/workbench?project=<project-id>` (e.g., `proj-mdh-rollout`) | Project Workbench loads with Overview tab | Forecast Health tile shows "v2" + "Versions · 2" |
| 2 | Any | Click **Forecast & Planning** tab | Forecast grid loads | Tab selected |
| 3 | Any | Click the **Compare against** dropdown (top-right of grid header) | Dropdown lists all versions: "v1 — Q2 2026 Cycle (creation)", "v2 — Q2 2026 Cycle (cr_approval CR #28)", "No comparison" | Each version label includes type + cycle + (optionally) trigger |
| 4 | Any | Pick "v1 — Q2 2026 Cycle" | Grid renders side-by-side: current values vs v1 values; deltas highlighted (green = decrease / red = increase) | Each cell shows current value with a smaller v1 reference; changed cells coloured |
| 5 | Any | Click **Take snapshot** | Optional: capture the current view as a saved snapshot for comparison later (separate from automatic versions) | Modal "Save snapshot for comparison?" with name field |
| 6 | Any | Switch back to "No comparison" | Grid returns to single-version view | Comparison hidden |

### Alternative paths

- **API access**: `GET /api/projects/{id}/forecast-versions` returns all versions; `GET /api/projects/{id}/forecast-versions/{version-number}` returns the snapshot payload.
- **Diff between two specific versions**: select v1 in the dropdown then v2 — UI shows v1 → v2 deltas. (The "current" view is whatever the live `Forecast` rows say.)

### Post-conditions

- No state change — read-only.

### Cross-references

- **Decision tags**: `[C-FV-01..07]`
- **Backend endpoint**: `routers/workbench.py::get_forecast_versions()`, `get_forecast_version_payload()`
- **In-app manual**: `project_workbench.json § Forecast & Planning Tab`

### Known issues / caveats

- `ForecastVersion.payload_json` is the canonical snapshot. The live `Forecast` table is what the grid displays by default. These can be inconsistent transiently (during a cycle submission); the UI handles this gracefully by always reading the latest version's payload when the comparison dropdown is engaged.

---

## Cross-workflow notes

- **Forecast cycle vs CR**: A cycle submission can produce multiple CRs (one per affected CC). Until all those CRs resolve, the project's forecast is locked from further edits. CR approval triggers an additional `ForecastVersion` snapshot (`cr_approval` type) on top of the cycle's submission snapshot.
- **Progress fan-out**: Progress tracker snapshots (`ProgressSnapshot`) are fanned out at cycle close (W03.3), not per-cycle-submission. This is a deliberate v5 decision: a project's progress is "frozen" at cycle close, not at every PL edit.
- **Provisional cells**: After Apply-to-forecast (see [W06.6](./06-simulator.md#w066-apply-scenario-to-forecast-pl)), beyond-boundary cells are marked `is_provisional=true`. These visually render with a "Provisional" badge on the grid until the next cycle's PL submission overwrites them.

## Related FAQ entries

- `faq-09` — "How do I update my project's monthly forecast?"
- `faq-06` — "How do I approve or reject a change request?"
