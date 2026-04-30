# 04 — Change Requests

A Change Request (CR) is the canonical mechanism by which the live forecast for an active project moves. Every cycle submission generates 1+ CRs; every controller-edit-and-send-back round-trip carries diffs through CR rows; every approved CR is materialised into the live `Forecast` table and snapshot-versioned.

CR lifecycle (status transitions per `[E-04b]`):

```
Draft (transient — happens inside the wizard, never persisted as Draft)
  ↓
pending_cc_confirmation (only if internal resource changes)
  ↓ confirmed by CC Owner
pending_controller_approval
  ↓ controller decision
approved | rejected | changes_requested
  ↓ (changes_requested) PL accepts or counter-edits
pending_controller_approval (resubmitted)
```

Run-portfolio CRs (DoI 5 / Offerings / InternalServices) skip the CC step and go straight to `pending_controller_approval`.

The 7 seeded CRs as of the demo baseline:

| CR # | Project | Status | Notes |
|---|---|---|---|
| 1 | ERP Integration Phase 2 | `approved` | Baseline reference; PL sees it in Recent Changes |
| 2 | ERP Integration Phase 2 | `approved` | Baseline reference |
| 9 | ERP Integration Phase 2 | `pending_cc_confirmation` | Sr Developer MUC hours + Deloitte Q3 — assigned to Thomas |
| 15 | Sensor Data Pipeline | `pending_cc_confirmation` | AWS scaling — assigned to Thomas |
| 19 | Identity & Access Management Run | `pending_controller_approval` | Run-portfolio CR; CC-confirmed by Thomas; awaiting Anna |
| 27 | Predictive Maintenance PoC | `changes_requested` | Sent back; PL sees diff banner |
| 28 | Master Data Hub Rollout | `approved` | Baseline reference |

---

## W04.1: PL drafts a CR via forecast cycle submission

**Purpose**: Show how a CR comes into existence — it is **not** a separate "create CR" form. CRs are an output of the 5-phase forecast cycle wizard (W03.1).
**When to use**: Whenever a PL needs to change an active project's forecast.
**Personas involved**: Project Lead (Priya).
**Pre-conditions**: Project at DoI 3 Active. No CR currently locking the project.
**Estimated walk-time**: 4 min (the wizard itself is 8 min; this walkthrough focuses on the CR side-effect).

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | PL | Walk steps 1-7 of [W03.1](./03-forecast-cycle.md#w031-monthly-forecast-cycle-5-phase-wizard) on a project with active forecasted lines (e.g., `proj-mdh-rollout`) | At Phase 5 Confirmation, the Submit button is enabled | Modal heading "Phase 5: Confirmation" |
| 2 | PL | Click **Submit** | Backend creates one or more `ChangeRequest` rows partitioned by affected CC; each row's `status` is `pending_cc_confirmation` if internal resource changes are present, else `pending_controller_approval`. | Toast "Forecast submitted"; Workbench Forecast Health tile shows "Last submission · just now"; **Rolling Forecast Review** button replaced by "CR pending" status indicator |
| 3 | PL | Navigate to the **Change History** tab | New CR(s) listed at the top with their status badge (`Pending CC Owner` / `Pending Controller Approval`) | Each CR row shows status badge, category, summary, cost impact, timestamp, submitter, and a "system-suggested" flag if the wizard's Phase 2 contributed |
| 4 | PL | Click on a CR row to expand | Detail view shows the line-item-level deltas | Expanded panel shows monthly comparison grid + KPI strip (Affected Lines / Total Impact) + justification text |
| 5 | PL | Click **View Full Detail** | Side panel opens with the complete CR diff including all months touched | Side panel scrollable; same grid as in the Workbench Forecast tab but filtered to the CR's affected lines |

### Alternative paths

- **No CR created**: If the wizard runs Phase 3 with **Keep as is** (no edits), no CR is created. The cycle submission is a no-op for downstream consumers, but a `ForecastVersion` row is still written for audit (capturing "no change" as a snapshot at that point in time).
- **Multi-CC fan-out**: A single submission can produce multiple CRs (one per CC whose people / external costs were touched). Each CR routes independently — one CC may confirm before another.

### Post-conditions

- 1+ `ChangeRequest` rows; for each, a parent `CRSubmissionSnapshot` capturing original forecast + proposed edits.
- `CRChangeDetail` rows for each affected line-item delta.
- Project's `Forecast` rows are NOT modified yet — they update on CR approval.
- Notification fires to relevant CC Owner(s) (if internal resource changes) or directly to Controller (if only external costs / Run-portfolio).

### Cross-references

- **Decision tags**: `[E-04a]`, `[E-04b]` (CR routing), `[E-08c]` (system-suggested flag)
- **Backend endpoint**: `routers/workbench.py::submit_forecast_cycle()` → `services/forecast_cycle.py`
- **In-app manual**: `project_workbench.json § Change Request Workflow`, `§ Change History Tab`
- **FAQ overlap**: faq.json `faq-01` ("How do I submit a change request for my project?")
- **Cross-walks**: [W03.1](./03-forecast-cycle.md#w031-monthly-forecast-cycle-5-phase-wizard), [W04.2](#w042-cc-owner-cr-confirmation), [W04.3](#w043-controller-cr-approval)

### Known issues / caveats

- The frontend **does not** expose a standalone "Create CR" button. CRs are always wizard-driven. If a stakeholder asks "how do I create a CR ad-hoc?", the answer is: open the wizard, edit the cells, submit.
- CR numbers are sequential global IDs (auto-incrementing primary key). They are NOT scoped per-project, so CR #19 may live alongside CR #27 on different projects.

---

## W04.2: CC Owner CR confirmation

**Purpose**: A CR routed to the CC Owner because it touches their cost-center's resources needs to be confirmed (or counter-proposed / declined) before the controller can approve.
**When to use**: A CR is in `pending_cc_confirmation` state. The CC Owner sees a "Change request pending confirmation" pending action on their Launchpad.
**Personas involved**: CC Owner (Thomas).
**Pre-conditions**: ≥ 1 CR with `status='pending_cc_confirmation'` for the CC Owner's cost center. Default seed has CR #15 (Sensor Data Pipeline) and CR #9 (ERP Integration Phase 2) waiting for Thomas.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | CC Owner | Switch to Thomas via persona dropdown | Launchpad re-renders | 3 urgent pending actions shown |
| 2 | CC Owner | Click the action **Change request pending confirmation — CR #15 for Sensor Data Pipeline** | Navigates to `/capacity/requests` (Resource Requests sub-view) with CR #15's project card shown | Page header reads "Capacity Management / Resource Requests"; cards include Sensor Data Pipeline with "Change Request" badge |
| 3 | CC Owner | Click **Review & Assign Resources** on the Sensor Data Pipeline card | Navigates to `/capacity/project-assignment/proj-sensor?cr=15` showing the CR's resource impact | Page heading "Sensor Data Pipeline · Change Request #15"; resource-assignment grid renders if hours change, else just the cost-only summary |
| 4 | CC Owner | Inspect the deltas: per-row badge ("Increase" / "Decrease") with delta hours, original allocation, resulting total, currently-allocated person | Each request row visible with the change context | If CR is cost-only (e.g., AWS scaling), the page shows "0 resource requests" and only the **Confirm All & Send to Controller** + **Decline** buttons |
| 5 | CC Owner | (For resource changes) Click cell to assign / re-assign people for the new monthly hours; assigned cells turn green with the person's initials, unassigned cells stay amber | Person dropdown appears with utilization-aware grouping ("Matching Role" first, then "Other Roles") | When all months covered, **Confirm All & Send to Controller** enables |
| 6 | CC Owner | Click **Confirm All & Send to Controller** | Backend marks the CR `pending_controller_approval`; allocations created / updated; controller notified | Toast "Confirmed and sent to controller"; PL sees no change yet (status badge updates to "Pending Controller Approval"); urgent pending action disappears from Thomas's Launchpad |

### Alternative paths

- **Decline**: Click **Decline** instead → modal asks for required reason; CR status flips to `cc_declined` → routes back to the PL with the decline note as a "CR declined by CC" notification.
- **Counter-propose**: For per-row alternatives (different person, different period), the row's dropdown surfaces "Counter-propose" mode → enter alternative resource plan → CR status flips to `cc_counter_proposed` → routes back to PL for negotiation.
- **Partial fulfill**: Per-row partial assignments (e.g., only assign 6 of 12 months) leave the CR in `pending_cc_confirmation` until all rows have ≥ 1 assignment. The **Confirm All** button stays disabled.

### Post-conditions

- `ChangeRequest.status` = `pending_controller_approval` (on confirm) / `cc_declined` (on decline) / `cc_counter_proposed` (on counter).
- `Allocation` rows created / updated to reflect the assigned people × months × hours.
- Notification fires to Controller (on confirm) or PL (on decline / counter).

### Cross-references

- **Decision tags**: `[E-04b]`, `[F-AC-01]` (CC scope)
- **Backend endpoint**: `routers/capacity.py::confirm_cr()` / `decline_cr()` / `counter_propose_cr()`
- **In-app manual**: `capacity_management.json § Confirming Resources`, `§ Response Actions`
- **FAQ overlap**: faq.json `faq-02` ("How do I respond to a resource request?"), `faq-10` ("What happens when a CR involves reducing hours for a role?")
- **Cross-walks**: [W04.3](#w043-controller-cr-approval), [W05.x](./05-resource-requests.md)

### Known issues / caveats

- A CC Owner can only confirm CRs that touch their own cost center. Cross-CC CRs route to multiple CC Owners in parallel; the controller can only act once **all** CC Owners have confirmed.
- The "0 resource requests" rendering for cost-only CRs (CR #15's case in the seed) is correct — the CR still requires CC sign-off because the cost is booked against the CC's budget, even if no hours change.

---

## W04.3: Controller CR approval

**Purpose**: Final decision on a CR. Either approve (write to live forecast + version it) or reject (close it out) or send back with edits (W04.4).
**When to use**: CR is in `pending_controller_approval`. Controller sees it in the **Pending Reviews** tile / Pending Actions panel.
**Personas involved**: Controller (Anna).
**Pre-conditions**: ≥ 1 CR awaiting controller decision. Default seed has CR #19 ready.
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From Launchpad, click the **CR #19** pending action OR navigate to `/portfolio/approvals` and select the **CR Approvals** tab | Approvals queue loads | Tab selected; CR #19 row visible with columns: CR # / Project / Summary / Submitted By / Confirmed By / Impact / Date |
| 2 | Controller | Click the CR #19 row | Detail panel / drawer opens | Header "CR #19 — Identity & Access Management Run"; impact "+€2K" |
| 3 | Controller | Read the diff (line-item-level changes with old / new / delta) | Per-month detail rows visible | Detail rows for licensing + consultant lines with EUR amounts |
| 4 | Controller | Verify the CC confirmation indicator | Confirmed-by column reads "Thomas Brenner" (CR #19 already CC-confirmed; Run portfolio so this happens implicitly) | Indicator visible |
| 5 | Controller | Click **Approve** | Confirmation prompt: "Approve CR #19? This writes the proposed deltas to the live forecast." | Modal visible |
| 6 | Controller | Click **Confirm approve** | CR status flips to `approved`; new `ForecastVersion` (`version_type='cr_approval'`) created; affected `Forecast` rows updated; PL notified ("Change request approved") | Toast "CR approved"; row leaves the queue; Forecast Health on the project shows v+1 |

### Alternative paths

- **Reject**: Click **Reject** → modal requires a reason; on confirm, CR status = `rejected`; PL notified with the reason.
- **Request Changes (send-back)**: see [W04.4](#w044-cr-send-back--pl-resubmit--diff-view).
- **Approve a CR that hasn't been CC-confirmed**: the **Approve** button is disabled with a tooltip "Awaiting CC confirmation". The controller cannot bypass the CC step.

### Post-conditions

- `ChangeRequest.status` = `approved` / `rejected`.
- On approval: new `ForecastVersion`, live `Forecast` rows updated, `Forecast.is_provisional=false` for cells the CR touched.
- `audit_log` row in `forecast_actions`.

### Cross-references

- **Decision tags**: `[E-04b]`, `[C-FV-04]`
- **Backend endpoint**: `routers/portfolio.py::approve_cr()`, `reject_cr()`
- **In-app manual**: `project_workbench.json § Change Request Workflow`
- **FAQ overlap**: faq.json `faq-06` ("How do I approve or reject a change request?")
- **Cross-walks**: [W03.2](./03-forecast-cycle.md#w032-controller-forecast-review-with-edit-in-place), [W04.4](#w044-cr-send-back--pl-resubmit--diff-view)

### Known issues / caveats

- The Approvals tab shows CRs in the order they entered the queue (oldest first). For a controller with many in-flight CRs, this is the canonical triage view.
- CR #19's "+€2K" impact is the **net** EUR delta (sum of approved increases minus decreases across all line items). Not the same as gross spend volume.

---

## W04.4: CR send-back + PL resubmit + diff view

**Purpose**: The controller wants edits before approving. Walk the full round-trip: controller marks send-back with edits + commentary → PL sees the action banner → PL views the diff → PL accepts changes or counter-edits and resubmits.
**When to use**: Controller review identifies fixable issues that warrant a co-edit rather than a reject. Default seed has CR #27 (Predictive Maintenance PoC) sent back, ready for Priya to walk steps 4-7.
**Personas involved**: Controller (Anna) initiates, Project Lead (Priya) responds.
**Pre-conditions**: CR in `pending_controller_approval`. To start fresh, use any of CR #9 / #15 / #19 (after their CC step). To walk just the PL side, use CR #27 (already seeded as `changes_requested`).
**Estimated walk-time**: 6 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From the CR detail panel (continuing from W04.3 step 2), click **Request Changes** | Editable grid replaces the diff view; commentary box appears | Grid cells become editable; "edited" badge appears on modified cells |
| 2 | Controller | Edit specific cells (e.g., reduce a forecast row by 30%); type a commentary explaining why ("Scope can't expand mid-cycle — defer the consultant hours to Q3") | Cells update with the new values; commentary box accepts free text | Modified cells highlighted; commentary required |
| 3 | Controller | Click **Send Back to PL** | CR status flips to `changes_requested`; PL receives "Change request returned with feedback" notification on Launchpad | Toast "Sent back with feedback"; CR leaves the controller's pending queue |
| 4 | PL | Switch to Priya. From Launchpad, click the **Change request returned with feedback — CR #27 for Predictive Maintenance PoC** action | Navigates to `/workbench?project=proj-predmaint` Change History tab with CR #27 expanded | Tab "Change History" selected; CR #27 row shows amber border + "Action Required" badge + amber background |
| 5 | PL | Read the **Controller Feedback** banner (amber) | Banner with controller's commentary | Heading "Controller Feedback" + the commentary text |
| 6 | PL | Inspect the **diff view**: KPI strip (Affected Lines Current / Affected Lines Proposed / Total Impact) + color-coded comparison grid (collapsible year columns; green = decrease, red = increase, blue = other change) | Each changed cell shows the original value (strikethrough) above the proposed value | Legend visible explaining the colors |
| 7 | PL | Click **Accept Changes** | Controller's proposed values are applied; CR routes onward (back to CC confirmation if resource changes touched, else directly approved) | Toast "Changes accepted"; CR status updates accordingly |
| 8 | PL | (Alternative) Click **Decline and Resubmit** instead | CR returns to `pending_controller_approval` with the PL's original values; controller sees it again in their queue | Toast "Resubmitted for review" |

### Alternative paths

- **PL counter-edits before resubmitting**: After step 6, the PL can edit the affected cells in the Workbench grid (outside the diff view) and then click **Decline and Resubmit** — this puts a new round of changes in front of the controller.
- **Multiple round-trips**: A CR can bounce between PL and Controller many times. Each send-back creates a new `ProjectSubmissionSnapshot`-style audit row; the diff view chains them so the full back-and-forth is auditable.

### Post-conditions

- On accept: `Forecast` updated with controller's values; CR status = `approved` (or back to `pending_cc_confirmation` if resource-affecting); new `ForecastVersion`.
- On decline-and-resubmit: CR status = `pending_controller_approval` with the PL's values; no `Forecast` change yet.
- Notifications fire as per the new state.

### Cross-references

- **Decision tags**: `[E-04b]`, `[A-BK-27]`, `[A-BK-29]`
- **Backend endpoint**: `routers/portfolio.py::request_changes_cr()`, `routers/workbench.py::accept_cr_changes()`, `routers/workbench.py::decline_and_resubmit_cr()`
- **In-app manual**: `project_workbench.json § Changes Requested Banner`, `§ Change History Tab`
- **FAQ overlap**: faq.json `faq-01` (steps 7-8 cover the PL side)
- **Cross-walk**: [W02.6](./02-project-lifecycle.md#w026-project-send-back-from-intake) (the project-intake equivalent send-back; same pattern, different entity)

### Known issues / caveats

- The **diff view for sent-back CRs is the only place** in the app that renders the full color-coded delta grid. The standard CR detail (W04.3 step 3) renders a tabular list of changes, not a grid.
- CR send-back DOES NOT cancel any CC Owner work that has happened — if the CR was already CC-confirmed and the controller's edits don't touch resources, the CC step is preserved on resubmit.

---

## W04.5: Browse Change History tab

**Purpose**: Read-only audit trail of every CR for a single project. Filterable by status, category, date.
**When to use**: Investigating "why does this project's forecast look different?"; pre-meeting prep ("show me everything that's hit this project this cycle").
**Personas involved**: Any role with access to the project (PL for own projects; Controller for all; CC Owner / Executive for portfolio-visible projects).
**Pre-conditions**: Project has ≥ 1 CR.
**Estimated walk-time**: 2 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | Navigate to `/workbench?project=<project-id>` | Project Workbench loads | Tab strip visible |
| 2 | Any | Click the **Change History** tab | History panel loads with chronological CR list (newest first) | Each CR row shows: status badge, category, summary, cost impact, timestamp, submitter, "system-suggested" flag |
| 3 | Any | (Optional) Click a CR row to expand | Inline detail view: KPI strip + monthly comparison grid + justification + "View Full Detail" button | Expanded panel renders below the row |
| 4 | Any | (Optional) Click **View Full Detail** | Side panel slides in with the complete CR diff (all months, including those collapsed in the inline view) | Side panel scrollable |
| 5 | Any | (Optional) Filter by status (e.g., "Approved only") | Rows re-filter | Filter chip active; non-matching rows hidden |

### Alternative paths

- **Sent-back CRs**: render with amber border + warning icon + "Action Required" badge (only visible to the PL of the project; controllers / CC owners see them in neutral state).
- **Empty state**: A project with no CRs shows the standard `EmptyState` component ("No change requests yet — the project's first CR will appear when a forecast cycle is submitted").

### Post-conditions

- No state changes — fully read-only.

### Cross-references

- **Decision tags**: `[E-04b]`
- **Backend endpoint**: `routers/workbench.py::list_project_change_requests()`
- **In-app manual**: `project_workbench.json § Change History Tab`

### Known issues / caveats

- The "system-suggested" flag is sticky on the CR row even after the suggestion was edited or dismissed during the wizard — it indicates the CR's lineage, not its current content.

---

## Cross-workflow notes

- **CR ↔ ForecastVersion**: every approved CR writes a `ForecastVersion` (`version_type='cr_approval'`). Combined with cycle snapshots (`version_type='cycle'`), this gives a complete immutable history.
- **CR ↔ Allocation**: only CRs with internal-resource changes touch `Allocation` rows; the CC Owner step (W04.2) materialises those.
- **Cross-CC CRs**: a single CR can touch multiple CCs. It splits into N parallel `pending_cc_confirmation` sub-states; the controller's approve button enables only when **all** CCs have confirmed. This is invisible in the v5 UI (controller sees "Pending CC confirmation" until all clear); the underlying state model handles it.

## Related FAQ entries

- `faq-01` — "How do I submit a change request for my project?"
- `faq-02` — "How do I respond to a resource request?"
- `faq-06` — "How do I approve or reject a change request?"
- `faq-10` — "What happens when a CR involves reducing hours for a role?"
