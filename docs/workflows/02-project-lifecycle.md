# 02 — Project Lifecycle

End-to-end project journey from intake (DoI 0) to operate (DoI 5). The DoI (Degree of Implementation) values per `[A-DOI-01]` map to pipeline stages; transitions between them are the gates this doc walks.

**DoI ladder (per `[A-DOI-01]` + `[A-PS-02]`):**

| DoI | Pipeline stage | Meaning |
|---|---|---|
| 0 | Proposed | Lightweight intake; not yet screened |
| 1 | Under Evaluation (early) | Past AI Council screening |
| 2 | Under Evaluation (late) | Business case ready; Pitch Board pending |
| 3 | Approved / Active | Approved by Pitch Board with baseline; in execution |
| 4 | Hyper-maintenance | Post-launch stabilisation |
| 5 | Operate | Steady-state run |

Off-path stages (`Paused`, `Cancelled`) freeze DoI in `frozen_doi` per `[A-DOI-03]`.

---

## W02.1: Submit a new project (DoI 0)

**Purpose**: Create a new project at the bottom of the Backlog, ready for AI Council screening.
**When to use**: A new ask comes in (e.g., a business unit proposes a new initiative). The Project Lead captures it lightweight before the full business case is built.
**Personas involved**: Project Lead (Priya).
**Pre-conditions**: PL persona active. Backlog reachable.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | PL | From Launchpad, locate the **My Projects** tile or navigate directly to `/backlog` | Backlog page loads with 8 ranked projects + 1 pre-funded above | Heading "Backlog"; subtitle "Ranked IT project backlog with composite scoring and cutoff analysis." |
| 2 | PL | Click **+ New** in the page header (or **Create Project** tile if present on Launchpad) | `SubmitProjectDialog` modal opens | Modal heading "Create new project" with fields: Name, Description, Line of Business, T-shirt size |
| 3 | PL | Fill: Name "Customer Insights Pilot"; LoB "Digital & Data"; Size "S"; brief description | Form validates inline; Create button enabled | All fields show valid markers; no inline error messages |
| 4 | PL | Click **Create** | Modal closes; redirects to `/workbench?project=proj-customer-insights-pilot` (or similar generated ID) | Toast "Project created". New project appears in Workbench left rail with `Draft · DoI 0` badge |
| 5 | PL | Open `/backlog` in another tab to confirm new project appears | The new project is listed at the bottom of the unranked group with composite score blank or "—" | Total project count increments to 9 (was 8). New project shows `Proposed · DoI 0` |

### Alternative paths

- **Validation failure**: If Name is empty or T-shirt size omitted, **Create** stays disabled with inline field errors.
- **API failure**: If backend returns 5xx, modal stays open and a toast "Failed to create project" appears. The form does not lose its values.

### Post-conditions

- New row in `projects` table with `pipeline_stage='Proposed'`, `doi=0`, `is_active=true`.
- New row in `chargeable_entities` with `entity_type='Project'`, identifier auto-generated `IT0XXXXX`.
- Notification fires to Controller's Launchpad: "New project pending screening".
- An `audit_log` entry with `category='pipeline_transitions'`.

### Cross-references

- **Decision tags**: `[A-DOI-04]`, `[A-INT-01]`, `[A-BK-26]`
- **Backend endpoint**: `routers/intake.py::create_project()`
- **FAQ overlap**: faq.json — adjacent ("How do I submit a change request?")
- **In-app manual**: `portfolio_overview.json § Backlog Tab`

### Known issues / caveats

- The Create Project tile on Launchpad may not be visible at all viewport widths; use the Backlog page **+ New** button as the canonical entry.

---

## W02.2: AI Council screening + DoI 0→1 advance

**Purpose**: After offline AI Council review, the Controller flags `ai_council_approved` and advances the project from Proposed to Under Evaluation (early).
**When to use**: Once-per-project gate. AI Council meets out-of-band; the controller records the decision in CRETA.
**Personas involved**: Controller (Anna).
**Pre-conditions**: ≥ 1 project at DoI 0 (e.g., "Customer Insights Pilot" from W02.1, or seeded `proj-greenedge` / `proj-connveh`).
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From Launchpad, click the **Pipeline** tile (counter shows "4 projects proposed or under evaluation") | Navigates to `/backlog` | Page heading "Backlog" |
| 2 | Controller | Click on a DoI 0 project (e.g., "Connected Vehicle Platform") | Navigates to `/backlog/proj-connveh` | Project detail page with 4 tabs: Scores & Ranking / Financial Overview / Master Data / Milestones |
| 3 | Controller | Open **Master Data** tab | Shows DoI-aware completeness checklist | Checklist items per DoI gate (per `[A-DOI-04]`): description, t-shirt size, business case stub, AI Council flag |
| 4 | Controller | Click **Mark AI Council Approved** (if AI-related) | Confirmation prompt appears asking for the AI Council document URL | `ai_council_approved=true` recorded; `ai_council_doc_url` saved |
| 5 | Controller | From the **Scores & Ranking** tab, click **Advance to DoI 1** | Status pill updates to `Under Evaluation · DoI 1`; pipeline stage changes accordingly | Toast "Advanced to Under Evaluation"; `audit_log` row in `pipeline_transitions` category |

### Alternative paths

- **Non-AI project** (the majority): Step 4 is skipped per `[A-DOI-03]`; the AI Council gate auto-passes.
- **Reject path**: From the Scores & Ranking tab, controller clicks **Reject** with reason → status pill flips to `Cancelled`. The project still appears in Backlog but is dimmed and excluded from cutoff calculations.

### Post-conditions

- `projects.doi=1`, `pipeline_stage='Under Evaluation'`.
- If AI: `ai_council_approved=true`, `ai_council_doc_url` set.

### Cross-references

- **Decision tags**: `[A-DOI-03]`, `[A-PS-02]`, `[A-BK-26]`
- **Backend endpoint**: `routers/pipeline.py::transition_project_stage()`
- **In-app manual**: `portfolio_overview.json § Backlog Tab`

---

## W02.3: Score Tech Navigator (lifecycle touch)

**Purpose**: PL fills the project's Tech Navigator profile so the composite score can rank it on the Backlog.
**When to use**: Between DoI 1 and DoI 2 — the project must have a composite score before going to Pitch Board.
**Personas involved**: Project Lead.
**Pre-conditions**: Project at DoI ≥ 1.
**Estimated walk-time**: 5 min.

This workflow has a deeper companion in [`11-tech-navigator-and-backlog.md#W11.1`](./11-tech-navigator-and-backlog.md) — see there for the full scoring rubric. The lifecycle-touch version is the **minimum** required to advance:

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | PL | Navigate to `/backlog/<project-id>` | Project detail page opens | 4 tabs visible |
| 2 | PL | Open **Scores & Ranking** tab | Tech Navigator rubric appears with 6 sub-criteria + 2 reserved | All sub-criteria default to `—` for unscored projects |
| 3 | PL | Set Project Type (1, 2, or 3) and Transformation Level (T0, T1, or T2) | Type/T-level dropdowns saved inline | Composite score recalculates as inputs change |
| 4 | PL | Score 3 Complexity sub-criteria (Standardization 40% / Usage 40% / Maintenance 20%) on a 1-5 scale | Each click stores the value; complexity score recomputes | Complexity score visible in panel; e.g. "Complexity: 3.4" |
| 5 | PL | Score 3 Value Creation sub-criteria (Financial 50% / Payback 40% / Competitive 10%) on 1-5 | Value creation score updates | "Value Creation: 4.2" displayed |
| 6 | PL | Confirm Composite Ranking shown (Value 70% × Complexity 30%) | Composite score = e.g. "3.96" | Backlog rank position updates if list refreshes |

### Post-conditions

- `projects.complexity_score`, `value_creation_score`, `composite_score` all populated as `Numeric(4,2)`.
- 8 sub-criterion columns (`complexity_subcriterion_1..3`, `value_creation_subcriterion_1..3`, `reserved_1..2`) populated as `Integer 1-5`.
- `tshirt_size` derived from `total_budget` per planning parameters.
- Project re-ranks against the cutoff line.

### Cross-references

- **Decision tags**: `[A-TN-01..09]`
- **Backend endpoint**: `routers/tech_navigator.py::update_scores()`
- **Deep dive**: [W11.1](./11-tech-navigator-and-backlog.md#W11.1)

---

## W02.4: Advance to under-evaluation late (DoI 1→2)

**Purpose**: Move project from Under Evaluation (early) to Under Evaluation (late) once business case is complete.
**When to use**: After Tech Navigator scoring and budget estimate are recorded.
**Personas involved**: Controller.
**Pre-conditions**: Project at DoI 1, with composite score, t-shirt size, and budget set.
**Estimated walk-time**: 2 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/backlog/<project-id>` | Project detail loads | 4-tab shell visible |
| 2 | Controller | Verify **Master Data** tab shows all required-for-DoI-2 fields green-checked | Completeness checklist all-green for DoI 2 gate | No red/amber rows |
| 3 | Controller | From **Scores & Ranking** tab, click **Advance to DoI 2** | Stage badge updates to `Under Evaluation · DoI 2` | Toast "Advanced to DoI 2"; row position re-ranks if composite score changed |

### Post-conditions

- `projects.doi=2`, `pipeline_stage='Under Evaluation'` (label same as DoI 1; the difference is `doi`).

### Cross-references

- **Decision tags**: `[A-DOI-04]`, `[A-PS-02]`
- **Backend endpoint**: `routers/pipeline.py::transition_project_stage()`

---

## W02.5: Pitch Board approval (DoI 2→3) with baseline

**Purpose**: Approve project at Pitch Board, lock the baseline forecast, and shift status to Active. The most consequential gate in the lifecycle.
**When to use**: Pitch Board meeting outcome (Controller records).
**Personas involved**: Controller (records the decision); PL (has prepared the forecast).
**Pre-conditions**: Project at DoI 2 with non-empty forecast grid (PL has authored at least an initial monthly forecast for the planning horizon).
**Estimated walk-time**: 6 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/backlog/<project-id>` | Project detail loads | DoI 2 stage badge |
| 2 | Controller | Open **Financial Overview** tab | Embedded Workbench overview tile grid shows the proposed forecast | Three-Point Summary tile shows Baseline blank, Forecast populated, Actuals YTD blank |
| 3 | Controller | From **Scores & Ranking** tab, click **Approve at Pitch Board** | Confirmation modal: "Lock baseline from current forecast?" | Modal explains: locking creates `Baseline` rows mirroring `Forecast` snapshot |
| 4 | Controller | Click **Confirm & lock** | Modal closes; status badge updates to `Approved · DoI 3`; baseline rows created | Toast "Project approved"; `Baseline` count = `Forecast` count for the planning horizon |
| 5 | Controller | Return to `/backlog`; project's row position locks (no longer subject to cutoff exclusion) | Cutoff column shows "In" for this project | Project is now part of the funded portfolio |

### Alternative paths

- **Reject path**: Step 3, click **Reject** → modal asks for reason; status becomes `Cancelled`, frozen DoI 2.
- **Send-back path**: see [W02.6](#w026-project-send-back-from-intake).
- **Forecast incomplete**: Step 3 modal shows a validation summary listing missing months / line items; **Confirm & lock** is disabled.

### Post-conditions

- `projects.doi=3`, `pipeline_stage='Approved'` (transitions to `Active` once execution starts; some seeds skip directly to Active).
- `Baseline` rows created mirroring `Forecast`. Per `[A-MS-01]`, `baseline_locked_at=now()`; baseline dates immutable except via controller override (W02.5 alternative path "milestone override" not documented separately — see `routers/milestones.py`).
- First `ForecastVersion` created with `version_type='cycle'`, `cycle_label='Pitch Board approval'`.
- `audit_log` row in `pipeline_transitions` category.

### Cross-references

- **Decision tags**: `[A-DOI-04]`, `[A-MS-01]`, `[A-MS-03]`, `[C-FV-02]`
- **Backend endpoint**: `routers/pipeline.py::approve_at_pitch_board()` (or `routers/intake.py::approve_project()`); baseline creation in `services/intake_workflow.py`
- **In-app manual**: `portfolio_overview.json § Approvals`

### Known issues / caveats

- Baseline lock is irreversible from the UI. To override baseline dates after approval, use the controller-only milestone override flow (audit-trailed per `[A-MS-03]`).

---

## W02.6: Project send-back from intake

**Purpose**: Controller can return a project to the PL with edits and feedback before approval, instead of approving or rejecting outright.
**When to use**: Pitch Board / pre-approval review identifies fixable gaps (scope unclear, budget too thin, dependencies unresolved). PL revises and resubmits.
**Personas involved**: Controller (initiates) + PL (responds).
**Pre-conditions**: Project at DoI 1 or 2 (any pre-approval state).
**Estimated walk-time**: 5 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | From `/backlog/<project-id>`, **Scores & Ranking** tab, click **Send back for revision** | Modal opens with required free-text "Feedback" field and per-section change toggles | Modal heading "Return for revision" |
| 2 | Controller | (Optional) Edit fields directly in the embedded grid (e.g., reduce a forecast row); add commentary | Edits captured against a controller-edits snapshot | Each edit shows an "edited" badge; commentary box accepts free text |
| 3 | Controller | Type feedback ("Scope needs decomposition into 2 phases; reduce 2026 estimate by 30%") and click **Return to PL** | Modal closes; project DoI flips back one rung (e.g., 2 → 1); PL gets notification | Toast "Sent back with feedback"; Pending Action on PL Launchpad ("Project revisions requested: <name>") |
| 4 | PL | Switch persona to PL. From Launchpad, click the new pending action | Navigates to `/workbench?project=<id>` Overview tab with a banner "Controller requested revisions — view diff" | Banner has **View diff** + **Resubmit** buttons |
| 5 | PL | Click **View diff** | Side-by-side diff opens (PL submission vs. Controller edits) | Modified rows highlighted amber; commentary visible inline |
| 6 | PL | Address the feedback (edit forecast / scope / etc.) and click **Resubmit** | Project re-enters the controller queue; banner is cleared | Toast "Resubmitted for review"; DoI returns to its pre-send-back value |

### Post-conditions

- `ProjectSubmissionSnapshot` row created with `type='controller_sent_back'` capturing the controller's edits + feedback.
- Second `ProjectSubmissionSnapshot` row with `type='pl_resubmitted'` after step 6.
- The diff view (`get_intake_diff`) renders fields-level before/after.

### Cross-references

- **Decision tags**: `[A-BK-27]`, `[A-BK-29]`
- **Backend endpoint**: `routers/intake.py::send_back_project()`, `resubmit_intake_project()`, `get_intake_diff()`
- **In-app manual**: `portfolio_overview.json § Send-back cycle`
- **FAQ overlap**: faq.json "How do I respond to a project sent back for revision?"

### Known issues / caveats

- `SPEC-002` (from `qa/bug-report.md`): the controller intake grid is currently read-only in some viewports; for a full edit-then-send-back walk, use the comments box + leave grid edits to the PL.
- The send-back diff view shows project metadata diff; it does not show forecast-grid cell-level diff (limitation, not blocker).

---

## W02.7: Activate project (DoI 3 Approved → Active)

**Purpose**: Once approved, project moves into execution. In some seeds this is automatic on DoI 2→3 transition; in others it's a separate step.
**When to use**: At the kickoff date / once execution actually begins.
**Personas involved**: Controller (or system, if scheduled).
**Pre-conditions**: Project at `pipeline_stage='Approved'`, `doi=3`.
**Estimated walk-time**: 2 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Open `/backlog/<project-id>` or `/workbench?project=<id>` | Project loads with `Approved · DoI 3` badge | Status pill visible |
| 2 | Controller | From the Workbench Overview tab, project header card, click **Mark Active** | Status pill flips to `Active · DoI 3` | Pipeline stage UPDATE; resource allocations begin to populate |

### Post-conditions

- `projects.pipeline_stage='Active'`, `doi=3` (no DoI shift; only stage label changes).
- Forecast cycle gating opens; PL can now run W03.1 (forecast cycle).

### Cross-references

- **Decision tags**: `[A-PS-02]`
- **Backend endpoint**: `routers/pipeline.py::transition_project_stage()`

---

## W02.8: Transition to Run (DoI 4→5)

**Purpose**: After post-launch hyper-maintenance, the project becomes a steady-state Run item — managed in the Run Portfolio rather than the Change Portfolio.
**When to use**: Once stabilisation is complete and the system is in normal operation.
**Personas involved**: Controller.
**Pre-conditions**: Project at DoI 4 (Hyper-maintenance) — note: not all seeded projects pass through DoI 4; the seed jumps proj-cloud3-run / proj-iam-run directly to DoI 5.
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Open the project (Workbench or Backlog detail) | Project loads with `Hyper-maintenance · DoI 4` badge | Status pill |
| 2 | Controller | Click **Transition to Operate** | Modal: "Move to Run Portfolio. The project will no longer be tracked in Change Portfolio." | Modal heading visible |
| 3 | Controller | (Optional) Set / confirm `to_business_pct` for Stage 1 distribution | The chargeable entity gets a non-zero `to_business_pct` if it serves business directly | Field accepts 0-100 |
| 4 | Controller | Click **Confirm** | Status pill flips to `Operate · DoI 5`; project disappears from Change Portfolio list and appears in Run Portfolio | Toast "Moved to Operate"; navigate to `/portfolio?view=run` and confirm project is listed |

### Post-conditions

- `projects.doi=5`, `pipeline_stage='Operate'`.
- `chargeable_entities.is_change_or_run` flips to "Run" (computed property — DoI 5 = Run).
- Project visible in Run Portfolio entity list.

### Cross-references

- **Decision tags**: `[A-PS-02]`, `[A-DOI-01]`, `[F-DM-01]`
- **Backend endpoint**: `routers/pipeline.py::transition_project_stage()`
- **Run Portfolio navigation**: see [W01.1](./01-launchpad-by-persona.md#w011-controller-launchpad) and Portfolio module

### Known issues / caveats

- Once at DoI 5, projects are no longer ranked in the Backlog (they're managed in Charging & Allocations for Stage 1 / Stage 2 cost flows). To bring a project back to Change Portfolio (rare), a controller must explicitly transition DoI 5 → 4 with a written justification recorded in `audit_log`.

---

## Cross-workflow notes

- **Forecast cycle independence**: Once a project hits DoI 3 Active, it's eligible for monthly forecast cycles (see [`03-forecast-cycle.md`](./03-forecast-cycle.md)) and Change Requests (see [`04-change-requests.md`](./04-change-requests.md)). The project lifecycle and the forecast lifecycle run in parallel from this point on.
- **Backlog re-ranking**: Any time a project's composite score, t-shirt size, or `within_cutoff` flag changes, the Backlog re-ranks. Cutoff bands (`should_be_cutoff_rank`, `reality_cutoff_rank`) are recomputed server-side per `[A-BK-14]`.
- **Send-back snapshots are append-only**: every send-back / resubmit cycle creates new `ProjectSubmissionSnapshot` rows. The diff view chains them together so a long back-and-forth is fully auditable.

## Related FAQ entries

After Phase 2 fixture refresh, expect these FAQ entries to cross-reference back here:
- "How does a project move through the DoI lifecycle?"
- "How do I respond to a project sent back for revision?"
- "What does Pitch Board approval lock?"
