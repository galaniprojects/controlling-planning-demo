# CRETA v5 — Workshop-Driven Changes

*Created: April 13, 2026*
*Last updated: April 28, 2026 — Cluster F added; Clusters A, B, D, E extended*
*Origin: Controller workshop outcomes, post-v4 implemented state, plus follow-up working sessions*
*Status: Cluster A extended (Change/Run portfolio split, ChargeableEntity expansion, post-launch decisions updated). Cluster C complete. Cluster B extended (lever 12 widened to all chargeable entities). Cluster D extended (new master data entities, permissions configuration). Cluster E extended (Charging & Allocations module, Workbench tile and tab, Portfolio split). Cluster F added (Charging & Allocations).*

---

## How to read this document

This spec captures changes to CRETA derived from the April 2026 controller workshop and follow-up working sessions on the IT cost charging cycle (April 27–28, 2026). Work is organized into six clusters, discussed in dependency order:

1. **Cluster A** — Portfolio Pipeline & Backlog *(extended — Change/Run split, ChargeableEntity expansion)*
2. **Cluster C** — Temporal Model (mixed-granularity forecast, versioning) *(complete)*
3. **Cluster B** — What-If Simulator Rebuild *(extended — lever 12 widened)*
4. **Cluster D** — Admin & Master Data *(extended — new master data entities, permissions configuration)*
5. **Cluster E** — UI Restyling (Workbench Overview tiles, Launchpad, visual consistency) *(extended — Charging & Allocations module, BTC tile and tab)*
6. **Cluster F** — Charging & Allocations (inter-service distribution, BTC profiles, location rollups) *(new in v5)*

Each cluster has its own section with design principles, detailed specifications, explicit out-of-scope items, and open questions. The **Decisions log** and **Open questions log** at the bottom of this document are the primary handoff mechanisms: if work on this spec resumes in a fresh session, those two sections plus the active cluster section are sufficient context to continue.

Decision tags follow the pattern `[<cluster>-<topic>-<nn>]` (e.g., `[A-TN-01]` = Cluster A, Tech Navigator, decision 1). Open questions use `-OQ-` (e.g., `[A-OQ-01]`).

This document builds on the v4 implemented state documented in `CRETA_Feature_Inventory.md`. It does not restate v4 features; it specifies additions and changes on top of them.

---

## Cluster A — Portfolio Pipeline & Backlog

**Scope:** Adds a prioritized, status-based project pipeline with explicit lifecycle stages, per-stage Degree of Implementation (DoI) values, Tech Navigator scoring for all projects, a visible cutoff line driven by budget/capacity constraints, and post-launch expense tracking for entities in steady-state operation.

**v5 extension (April 28, 2026):** The Portfolio module is restructured into two sub-modules — **Change Portfolio** (transformation entities: projects in DoI 0–4) and **Run Portfolio** (steady-state entities: projects in DoI 5, plus offerings and internal services). Post-launch cost allocation expands from project-only to all chargeable entity types via the polymorphic `ChargeableEntity` model introduced in Cluster F. The mechanics of distribution, BTC profiles, and location rollups are owned by Cluster F; Cluster A's responsibility is the Change Portfolio and Run Portfolio surfaces that consume the Cluster F engine.

### Design principles (locked)

- **Ranking supports decisions, it does not make them.** The Tech Navigator score produces an ordering of projects; the cutoff line provides visibility into what is funded versus what is not; humans decide what to cut, descope, or overrun.
- **The pipeline is status-based, not a separate ideation funnel.** Pipeline stages are lifecycle phases of existing projects, not a pre-intake backlog of raw ideas.
- **Every project is scored.** Tech Navigator profiles apply to all projects regardless of status or type, so that in-flight projects remain visible in the ranked view and can be compared against new candidates.
- **Value ranking and switching cost are separate signals.** Tech Navigator score reflects the intrinsic value of doing a project. DoI reflects how expensive it would be to stop one that is already in flight. The two must not be conflated in the ranking formula.
- **Type 3 (legal/compliance/security/lifecycle) projects are exempt from the cutoff.** They are funded off the top of the available budget before the ranked competition begins.

### Tech Navigator integration

The Tech Navigator is Knorr-Bremse's investment decision framework. Every project in CRETA carries a Tech Navigator profile used for portfolio visualization and backlog prioritization.

#### Dimensions

**Complexity score (Y-axis)** — weighted composite on a 1–5 scale. Counterintuitively, a *higher* Complexity score means *lower* real-world complexity (simpler, more standard, easier to run). The cube visualization places higher scores at the top of the Y-axis.

Sub-criteria:

| Sub-criterion | Weight | 1 (lowest) | 5 (highest) |
|---|---|---|---|
| Standardization of solution | 40% | Self-developed or heavily customized | Off-the-shelf SaaS (config only, existing APIs) |
| Usage | 40% | Local or adapted divisional solution | Group solution with high usage (uniform, high volume) |
| Maintenance and support | 20% | Very difficult, no external support, dependent on specific individuals | Very easy, IT standard, excellent vendor support |

Intermediate values of each sub-criterion are defined in the KB Tech Navigator reference slides and should be mirrored in the CRETA rubric UI.

**Value creation score (X-axis)** — weighted composite on a 1–5 scale.

| Sub-criterion | Weight | Notes |
|---|---|---|
| Financial benefit | 50% | Dominant factor |
| Payback | 40% | Speed of return |
| Competitive advantage | 10% | Strategic differentiation |
| *Reserved slot 1* | 0% | Inactive placeholder — present in data model, not surfaced in UI |
| *Reserved slot 2* | 0% | Inactive placeholder — present in data model, not surfaced in UI |

**Transformation level (Z-axis)** — self-assessed categorical, one of three values:

- **T0** — "just better" (incremental improvement)
- **T1** — "paper to software" (digitization of an analog process)
- **T2** — "new business" (enables something previously not possible)

#### Decorators

**Type** — determines how prioritization logic treats the project:

| Code | Label | Ring colour | Treatment |
|---|---|---|---|
| 1 | Project with business case | Black | Competes on score within the ranked budget envelope |
| 2 | Strategic need / consulting w/o technology | Yellow | Competes on score; strategic rationale may justify a score override |
| 3 | Legal, compliance, security, lifecycle need | Red | Exempt from cutoff; funded off the top of the budget before ranking |

**Budget t-shirt size** — derived automatically from the project's actual approved budget, not manually assigned:

| Size | Budget range |
|---|---|
| XS | < 100 k€ |
| S | 101–250 k€ |
| M | 251–500 k€ |
| L | 501–1.000 k€ |
| XL | > 1.000 k€ |

#### Configuration

- Sub-criterion weights (both Complexity 40/40/20 and Value creation 50/40/10) are **admin-configurable** in the Planning Parameters section of the Admin module.
- Weights are **global at KB level** — not configurable per Line of Business.
- The two reserved Value creation slots exist in the data model for future activation but are not editable in the admin UI in v5.
- T-shirt size thresholds are also admin-configurable and global.

#### Scoring scope and the cutoff line

- All projects receive a Tech Navigator profile regardless of status, type, or DoI.
- The profile produces a composite ranking score used to order projects in the backlog view.
- The **cutoff line** is drawn based on available budget and/or capacity constraints for the planning period. Projects above the line are within the envelope; projects below the line are not.
- **In-flight projects may fall below the cutoff** as new higher-scoring projects enter the backlog. When this happens, the system flags them but does not take automatic action. The controller decides whether to cancel, descope, or accept the overrun — this decision is supported by the What-If Simulator (Cluster B).
- **DoI informs the cancellation decision, not the ranking.** A project at DoI 10% is cheap to cancel; a project at DoI 80% is expensive to cancel because most of its budget is already committed. The simulator surfaces this switching cost alongside the ranking.
- **Type 3 projects are removed from the ranked competition entirely.** Their budget is deducted from the available envelope before the cutoff line is drawn.

### Project pipeline (status-based lifecycle)

Every project in CRETA carries exactly one **Pipeline Stage** that represents its position in the portfolio lifecycle. Pipeline Stage is a globally-defined KB-wide concept — every project picks from the same fixed set. It drives Degree of Implementation (DoI), backlog membership, budget envelope consumption, and the cutoff line calculation.

Pipeline Stage is distinct from **Project Milestones** (see dedicated subsection below). Milestones are per-project, freeform delivery checkpoints with dates; stages are portfolio-level lifecycle positions. The two concepts coexist and must not be conflated.

#### Stage set (aligned with KB DoI 0–5 model, April 2026)

KB's Degree of Implementation model uses **DoI 0–5** across three macro phases: **Demand Funnel** (DoI 0–2), **Change Execution** (DoI 3–4), and **Operation** (DoI 4–5). Two governance gates separate the macro phases: the **AI Council** gate (DoI 0→1) and the **Pitch Board** gate (DoI 2→3).

DoI is a maturity indicator that does not map one-to-one to CRETA pipeline stages. Some DoI levels span multiple pipeline stages (e.g., DoI 3 covers both Approved and Active).

| DoI | KB name | CRETA pipeline stage(s) | In backlog? | Consumes envelope? | Notes |
|---|---|---|---|---|---|
| 0 | Evaluate | Proposed | Yes | No | Early exploration. PL is shaping the idea, no commitment. |
| 1 | Assess (PoC) | Under Evaluation (early) | Yes | No | Post-AI Council gate. Assessment in progress — PoC, vendor evaluation, or desktop analysis. Innovation budget may be released. |
| 2 | Assess (Business Case) | Under Evaluation (late) | Yes | No | Prototype/assessment complete. Business value evaluated, complexity and cost estimated. Ready for Pitch Board. |
| 3 | Integrate (MVP → Product) | Approved + Active | Yes | Yes | Post-Pitch Board. Two sub-states: Approved (awaiting launch, carries `within_cutoff` flag) and Active (execution in progress, forecast cycles run, actuals accumulating). |
| 4 | Manage | Hyper-maintenance + Operate (early) | No | Yes (committed overhead) | Product management mode. Covers post-launch stabilization and ongoing product management. Distinguished by project milestones, not by DoI sub-level. |
| 5 | Scale | Operate (mature) | No (Run Portfolio) | No (cost allocation model) | Platform management. Self-service, templates, cost management. Not all projects reach DoI 5 — some remain at DoI 4 indefinitely. |
| — | — | Retired | No | No | Terminal stage for decommissioned solutions. |
| — | — | Paused | Yes (flagged) | No | Reversible off-path stage. DoI frozen at value held when project left the main path. |
| — | — | Cancelled | No | No | Terminal off-path stage. One-way with audited override to un-cancel. DoI frozen. |

DoI 0–5 is a linear on-path maturity scale. Paused and Cancelled have no DoI digit of their own — each project carries a frozen reference to the DoI it held when it left the on-path sequence.

**Governance gates:**

- **AI Council gate (DoI 0→1):** Early screening decision. In CRETA, modelled as a flag (`ai_council_approved`, date) plus document attachment for the confirmation, not a full approval workflow. The controller advances the project to DoI 1 after the offline AI Council decision.
- **Pitch Board gate (DoI 2→3):** Executive board decision to release budget and capacity. Maps to the controller's **Approve** action in the backlog. This is the major commitment point — baseline is created (two-step: approval on macro data, baseline registered after detailed forecast entry — subject to KB confirmation, see `[A-OQ-07]`).

#### Stage transitions

- **Forward and backward transitions are allowed.** A project that was Active can be moved back to Approved (e.g., scope change requires re-assessment), or back to Under Evaluation (e.g., fundamental rethink). The system does not enforce monotonic progression.
- **Auto-activation at launch date.** When an Approved project (DoI 3) reaches its planned launch date, if its `within_cutoff` flag is `true`, it automatically transitions to Active (still DoI 3). If `within_cutoff` is `false`, it does not auto-activate. The controller is notified and must explicitly decide: activate anyway (accept the overrun), push the launch date out, or move the project to Paused or Cancelled.
- **Manual override for activation.** The controller can manually activate an Approved project at any time, regardless of launch date or cutoff status.
- **The `within_cutoff` flag** is a dynamic attribute on Approved projects (DoI 3, Approved sub-state). It is recomputed on every rebalancing event. It is not a separate stage.
- **Cancellation is nearly one-way.** Moving a project to Cancelled is a terminal transition. Un-cancelling is possible as an explicit audited controller override. All un-cancel events are recorded in the audit log.
- **DoI 4 sub-transitions** (Hyper-maintenance to early Operate) are managed through project milestones, not through a DoI change. The project remains at DoI 4 throughout.
- **DoI 4→5 transition** (Manage → Scale) is a maturity progression. Not all projects reach DoI 5 — a small internal tool may remain at DoI 4 permanently. The transition is a controller decision reflecting that the project has matured into a self-service platform.

#### Intake workflow

The v4 intake queue and CR Approvals flow will **not** be retrofitted onto this new pipeline model. Intake is being rewritten from the ground up as a greenfield design in the backlog mechanics section. The design covers how projects enter Proposed, how they transition to Under Evaluation, what the controller sees, what actions are available, and what happens on approval, rejection, or send-back.

### Project Milestones

What v4 called `ProjectPhase` is renamed `ProjectMilestone` to eliminate terminology collision with the new Pipeline Stage concept. "Milestone" is also a more accurate description of what the data actually represents: per-project delivery checkpoints with baseline and forecast dates, used to render the timeline strip on the Workbench Overview chart.

#### Scope of the rename

- Backend model `ProjectPhase` → `ProjectMilestone`
- Backend table and field names updated accordingly
- Frontend type `TimelinePhase` → `TimelineMilestone`
- Frontend component `PhaseStrip` → `MilestoneStrip`
- All internal documentation and comments updated
- Pure terminology change — no behaviour difference from the rename itself

#### Making milestones editable (new in v5)

In v4, milestones exist only in seed data with no CRUD API — they cannot be added, edited, or removed through the UI. In v5, milestones become first-class editable objects:

- **New API endpoints:** create, update, delete, reorder milestones on a project
- **Editable at project creation and throughout project life** by the PL
- **Each project** can have zero or more milestones; zero-milestone projects continue to render the timeline strip gracefully (as in v4)
- **Fields per milestone** remain as in v4: name, ordering, baseline_start, baseline_end, forecast_start, forecast_end, colour
- **Baseline dates are immutable after first save.** This preserves the integrity of the baseline-vs-forecast slip visualization. Baseline fields can only be changed via an explicit audited controller override, similar to a change request
- **Forecast dates are freely editable** by the PL

Milestones editing is scoped to Cluster A (rather than Cluster E) because it requires backend model changes, new API endpoints, and validation logic, not just UI work.

#### Related cosmetic work deferred to Cluster E

The milestone strip can optionally be extended visually into the Hyper-maintenance and Operate pipeline stages as solid-colour extensions past the final milestone. This is purely a rendering enhancement and is deferred to Cluster E.

### Prioritized backlog mechanics

#### Backlog membership rules

The backlog shows projects at pipeline stages where a continue/stop/reprioritize decision is still meaningful. Projects past the decision horizon (stabilizing, operating, retired, or cancelled) are excluded.

| Stage | DoI | In backlog? | Consumes envelope? | Visual treatment |
|---|---|---|---|---|
| Proposed | 0 | Yes | No | Normal |
| Under Evaluation | 1–2 | Yes | No | Normal |
| Approved | 3 | Yes | Yes | Normal + `within_cutoff` flag |
| Active | 3 | Yes | Yes | Interleaved by score |
| Hyper-maintenance / Operate (early) | 4 | No | Yes (committed overhead) | Excluded — budget deducted from available envelope before ranking |
| Operate (mature) | 5 | No (Run Portfolio) | No (cost allocation model) | Run Portfolio view |
| Retired | — | No | No | Excluded |
| Paused | frozen | Yes | No | Paused badge, sorted by score in normal position |
| Cancelled | frozen | No | No | Excluded |

Key design choices:

- **Active projects are interleaved with pre-flight projects by score.** This is the core value proposition of the backlog: making visible that an in-flight project may rank lower than a new candidate. The misalignment zone (gap between reality and should-be cutoff lines) only works if Active and Proposed/Under Evaluation/Approved projects share one ranked list.
- **Hyper-maintenance is excluded** because a project in post-launch stabilization represents a completed delivery investment. Stopping it mid-stabilization would damage the investment already made. It is not a realistic decision point and therefore has no place in a decision-support view. Its budget is treated as committed overhead, deducted from the available envelope before the ranking competition begins (same treatment as type 3 projects).
- **Paused projects retain their score-based position** in the ranked list, rendered with a "Paused" badge. They are not demoted to the bottom. A paused project may be high-scoring but temporarily blocked for operational reasons (resource constraint, dependency delay), and its position in the ranking is relevant for restart decisions.
- **Cancelled and Retired projects are fully excluded.** They are findable through the Portfolio module or search, not the backlog.

#### Ranking formula and sort order

The Tech Navigator produces two quantitative axis scores (Complexity 1–5 and Value Creation 1–5) and one categorical axis (Transformation level T0/T1/T2). The backlog requires a single linear sort order.

**Composite ranking score** = `(w₁ × Value Creation) + (w₂ × Complexity)` where w₁ + w₂ = 1.0.

Default weights: **Value Creation 70%, Complexity 30%.** Rationale: the portfolio exists to fund value creation; Complexity (inverted — higher = simpler/better) is an execution risk modifier, not the primary value signal. Default weights are subject to KB confirmation (see `[A-OQ-06]`).

The formula shape (weighted sum) and the weights are fully configurable in the Backlog & Ranking Configuration admin section.

**Transformation level is a visual decorator and filter dimension.** It does not factor into the ranking score. T0/T1/T2 is categorical with no inherent numeric ordering; forcing it into the formula would require arbitrary mappings that obscure the signal.

**Tie-breaking order:**

1. Composite ranking score — descending (primary sort)
2. DoI — ascending (hardcoded; earlier-stage projects surface first because they need decisions sooner)
3. Additional configurable criteria — selected from a defined set in the Backlog & Ranking Configuration admin section. Available tiebreaker fields: budget (t-shirt size or absolute), submission date (oldest first), pipeline stage.

**Per-project score visibility:** Each project row in the backlog view displays the composite ranking score, the individual Complexity score, the individual Value Creation score, and the Transformation level. This gives the controller full transparency into why a project ranks where it does.

#### Backlog & Ranking Configuration (Admin module)

A dedicated sub-section in the Admin module, separate from Planning Parameters. It houses all backlog-specific configuration:

- Ranking formula axis weights (Value Creation vs. Complexity, default 70/30)
- Tie-breaking criteria selection and ordering
- *(Additional parameters — cutoff line configuration, budget envelope inputs — to be added as topics 3–6 are designed)*

#### Budget envelope and cutoff line calculation

**Inputs:**

1. **Total available budget** for the planning period. Set by the controller in the Backlog & Ranking Configuration admin section.
2. **Pre-ranked deductions** — budget commitments removed from the envelope before the ranking competition:
   - Type 3 project budgets (legal/compliance/security/lifecycle — funded off the top per `[A-TN-08]`)
   - Hyper-maintenance project budgets (committed overhead per `[A-BK-02]`)
3. **Contestable envelope** = Total available budget − Type 3 spend − Hyper-maintenance spend.
4. **Per-project budget consumption:** Approved and Active projects use their approved budget (baseline). Proposed and Under Evaluation projects use an estimated/requested budget field entered during intake (not yet baselined).

**Algorithm — two cutoff lines on one ranked list:**

Walk the ranked list from highest composite score to lowest, accumulating each project's budget.

- **Should-be line:** The position where cumulative budget in pure score order exceeds the contestable envelope. Projects above this line would be funded if ranking were followed strictly. Projects below would not.
- **Reality line:** The position where cumulative budget of currently committed projects (Approved with `within_cutoff == true` + Active) exceeds the contestable envelope. This reflects actual funding decisions.
- **Misalignment zone:** The gap between the two lines. Contains projects that are funded in reality but wouldn't be under pure ranking, or vice versa.

**Horizon:**

- **Primary view: 12-month horizon** using accurate monthly forecast data. The two cutoff lines operate here. This is the working view where portfolio decisions are made.
- **Long-term sustainability indicator:** A summary-level signal at the portfolio level (KPI or banner at the top of the backlog view) showing whether out-year committed spend exceeds projected out-year budget. Not a second set of cutoff lines. Detail-level multi-year analysis is the domain of the What-If Simulator (Cluster B).

**Recomputation triggers:**

Both cutoff line positions and the `within_cutoff` flag on Approved projects are recomputed whenever:

- A new project enters the backlog (submitted to Proposed)
- A project's Tech Navigator scores change
- A project's budget changes (CR approved, baseline revised)
- The total available budget changes
- A project's pipeline stage changes (e.g., Approved → Active, Active → Paused)
- A type 3 or Hyper-maintenance project's budget changes (affects contestable envelope)
- A rolling forecast cycle completes (cadence is configurable — see Cluster D seeded items)

#### Backlog view layout and rendering

The Backlog module has two primary views, toggle-switched at the top of the module:

**1. Ranked List view (default)**

A full-width table sorted by composite ranking score. Each row is a project.

Columns:

| Column | Content |
|---|---|
| Rank | Integer position (1, 2, 3…) |
| Project name | Clickable — opens full-page project detail |
| Pipeline stage | Stage badge (Proposed / Under Evaluation / Approved / Active) + Paused badge where applicable |
| Type | 1/2/3 with ring colour indicator (black / yellow / red per KB convention) |
| Composite score | The ranking number |
| Value Creation | Individual axis score (1–5) |
| Complexity | Individual axis score (1–5) |
| T-level | T0 / T1 / T2 badge |
| Budget | Estimated (pre-approval) or approved, with t-shirt size indicator |
| DoI | Switching cost signal |
| LoB | Organizational context |
| `within_cutoff` | For Approved projects: yes/no icon. Not shown for other stages. |

**Cutoff line rendering:**

Each cutoff line is rendered as a **visual band** spanning the full table width — not a thin line. Each band contains a one-sentence explanation of what it represents (e.g., "Should-be cutoff: projects above this band would be funded under pure ranking" / "Reality cutoff: projects above this band are currently committed"). The should-be band and reality band are visually distinct colours. The misalignment zone between them receives a subtle background tint.

**Jump buttons:** The view includes navigation buttons to jump directly to each cutoff band, since the ranked list may be long enough that both bands are not simultaneously visible.

**Type 3 pre-funded section:**

Type 3 projects (legal/compliance/security/lifecycle) are shown in a separate "Pre-funded" section above the ranked list. This section is **collapsed/hidden by default** to avoid dominating the view space, since type 3 projects are not competing in the ranking. It is expandable on demand. The section header shows a summary (count of type 3 projects, total pre-funded budget) even when collapsed. This separation makes the envelope deduction visually legible — the ranked competition starts after type 3 commitments.

**2. Tech Navigator Cube view**

An interactive 3D scatter plot:

- X-axis: Value Creation (1–5)
- Y-axis: Complexity (1–5)
- Z-axis or colour/layer: Transformation level (T0 / T1 / T2)
- Bubble size: budget (t-shirt size)
- Bubble ring colour: Type (black / yellow / red per KB convention)
- Hover: project name, scores, pipeline stage
- Click: opens the project's full-page detail view

The cube view is for pattern recognition ("where are our investments clustered?") and visual portfolio analysis, not for direct decision-making. It shows the same project set as the ranked list (backlog membership rules apply).

**Project detail view (full page):**

Clicking any project in either the ranked list or cube view opens a full-page detail view with a back button to return to the backlog. The detail view uses a tabbed layout:

**Tab 1 — Scores & Ranking**

- Composite ranking score, individual Complexity and Value Creation scores with sub-criteria breakdown
- Transformation level, Type with ring indicator, budget t-shirt size
- Rank position in the backlog, `within_cutoff` status (for Approved projects)
- DoI with visual indicator of which data completeness gates have been passed
- Pipeline stage with transition history

**Tab 2 — Financial Overview**

- Three-point comparison table (Baseline vs. Forecast vs. Actuals) — the standard Workbench Overview pattern
- Trajectory chart (baseline, forecast, actuals lines)
- CapEx/OpEx breakdown
- Only populated for Approved stage and above. Proposed/Under Evaluation projects show only the estimated budget.

**Tab 3 — Master Data**

- All project master data fields, with visual distinction between filled and unfilled
- Completeness shown relative to the current DoI level: at DoI 0, only basic fields are expected; at DoI 3, a fuller set should be complete. The tab functions as a DoI-aware completeness checklist that adapts to the project's maturity.
- This is the primary surface where the data completeness gate pattern (`[A-PS-04]`) is visible to the user.

**Tab 4 — Milestones**

- Timeline MilestoneStrip visualization
- Baseline vs. forecast dates with slip visualization
- Hidden or empty-stated for zero-milestone projects

#### Filtering, slicing, and interaction

**Filter bar** — persistent at the top of the backlog module, applies to both Ranked List and Cube views.

Available filter dimensions:

| Dimension | Control type |
|---|---|
| Pipeline stage | Multi-select (Proposed, Under Evaluation, Approved, Active, Paused) |
| Type | Multi-select (1, 2, 3) |
| Transformation level | Multi-select (T0, T1, T2) |
| LoB | Multi-select |
| Budget t-shirt size | Multi-select (XS, S, M, L, XL) |
| Score range | Slider or min/max input for composite score |
| `within_cutoff` | Toggle (within only / outside only / all) |

**Filters affect visibility only, never cutoff line calculation.** The cutoff lines always reflect the full portfolio reality. If filtering hides projects, the cutoff bands remain at their true positions. If a cutoff band falls inside a filtered-out zone, the jump button still navigates to it with a contextual note indicating the cutoff position relative to hidden projects. This prevents false "everything fits" impressions when slicing by LoB, type, or other dimensions.

**Sort override:** Default sort is composite score descending. The controller can temporarily re-sort by any column (budget, DoI, stage, LoB) for ad-hoc analysis. Custom sort is clearly marked in the UI. Cutoff line positions remain unchanged regardless of sort order (always computed on score-order). A "Reset to ranking" button restores the default sort.

**Role-based access:**

| Role | Backlog visibility | Edit capabilities |
|---|---|---|
| Controller | Full backlog, all projects | Edit Tech Navigator scores, change pipeline stages, trigger rebalancing, access Backlog & Ranking Configuration admin |
| Project Lead | Full backlog, all projects | Edit forecast, milestones, and master data on own projects only via project detail view. Read-only on all other projects. |
| Executive | Full backlog, all projects | Read-only. Portfolio oversight, no edit actions. |
| CC Owner | Full backlog, all projects | Read-only. |

#### Greenfield intake workflow

The v4 Intake Queue and CR Approvals flow are fully replaced. The backlog itself is the intake surface — there is no separate intake view.

**Project creation (DoI 0 — Evaluate):**

A PL or controller creates a new project. At creation, the project is automatically placed at **DoI 0 (Proposed)**. Minimum required fields are lightweight — enough to describe the intent using structured prompts, not a full business case (see DoI gate requirements below). The project immediately appears in the backlog. If Tech Navigator scores are empty, the composite score is zero and the project sits at the bottom of the ranked list.

**DoI 0→1 — AI Council screening:**

The AI Council (or equivalent screening body) decides offline whether the project warrants further investigation. In CRETA, the controller records this as a flag (`ai_council_approved`, date) and can attach the confirmation document (OneDrive link). The controller then advances the project to DoI 1. This is a manual transition, not a workflow with approve/reject actions — the decision happens outside the tool.

**DoI 1→2 — Assessment completion:**

The PL works through the assessment phase — PoC, vendor evaluation, desktop analysis, or whatever form the investigation takes. When complete, the PL submits the project for Pitch Board review. The submission triggers a DoI 2 gate check. If the project does not meet the data completeness requirements for DoI 2, the PL is told what is missing. If it passes, the stage transitions to DoI 2 (Under Evaluation — Business Case ready).

**Controller review experience (DoI 2 — Pitch Board preparation):**

The controller reviews projects **within the backlog**, not in a separate queue. Under Evaluation projects appear in the ranked list alongside all other backlog projects. The controller can filter to "Under Evaluation only" to see their review queue, but the default view shows these projects in full portfolio context.

From the project detail view, the controller has three actions:

- **Approve (Pitch Board)** — transitions to DoI 3 (Approved). Baseline creation follows as a two-step process: the project is approved at Pitch Board on macro-level data, then the PL enters the detailed forecast grid, and the controller locks the baseline once the detail is sufficient (subject to KB confirmation — see `[A-OQ-07]`). The project starts consuming the envelope and `within_cutoff` flag is computed.
- **Send Back** — returns to DoI 1 with a "Changes Requested" status. The PL receives a notification with the controller's comments and can revise and resubmit. On resubmission, a **diff view** shows before/after comparison of what changed.
- **Reject** — transitions to Cancelled. Requires a reason and a confirmation step (Cancelled is nearly one-way per `[A-PS-10]`).

**Controller edit restrictions:**

The controller **cannot** freely edit Tech Navigator scores or master data on other people's projects. Send Back is the standard correction mechanism. If a controller needs to edit another project's data (e.g., PL has left the company, urgent rebalancing), this is possible as an **audited controller override**, following the same pattern as baseline date overrides (`[A-MS-03]`). Override edits are logged with reason and timestamp.

**Deprecated v4 surfaces:**

The Portfolio module's Intake Queue tab is deprecated and replaced by the Backlog module's filtered view. The CR Approvals tab remains unchanged for now (change requests are a separate workflow from intake).

#### DoI gate requirements

Each DoI transition has a set of data completeness requirements. These are enforced as validation checks — the system warns when requirements are not met but can be overridden by the controller (audited). Specific field-to-DoI mappings remain subject to KB confirmation (`[A-OQ-04]`).

**DoI 0 — Evaluate (project creation minimum):**

- Project name
- Structured description with guided sections:
  - Problem Statement ("Describe the current state and what problem this project addresses…")
  - Business Driver ("What business need or opportunity motivates this project?")
  - Expected Outcome ("What does success look like?")
  - Current State ("How is this handled today, if at all?")
- Proposing person
- LoB assignment
- Requesting business unit (may differ from LoB)
- Demand type (M&A/legal change, business process improvement, technology & security, technology trend adoption)
- Project Type (1/2/3)
- Value stream (if applicable)
- Wave ID (optional, if part of a delivery wave)
- Document attachments (OneDrive links, optional)

No budget estimate, no Tech Navigator scoring, no timeline. The project exists in the backlog at rank zero, visible but unscored.

**DoI 0→1 gate — AI Council screening:**

- Everything from DoI 0
- Initial Tech Navigator scoring — at least Complexity and Value Creation scored at composite level (sub-criteria not required). Produces a non-zero ranking position.
- Budget t-shirt size estimate (XS/S/M/L/XL)
- Transformation level (T0/T1/T2)
- Strategic alignment statement (free text — which business objective does this serve?)
- AI Council approval flag set to true with date
- AI Council confirmation document attached (OneDrive link)

**DoI 1→2 gate — Assessment complete, ready for Pitch Board:**

- Everything from DoI 1
- Complete Tech Navigator profile (all Complexity and Value Creation sub-criteria scored, Transformation level confirmed)
- Budget estimate in euros with CapEx/OpEx split
- Rough quarterly resource plan — both internal and external hours/FTE by role by quarter
- Rough quarterly external cost estimate (deliverables and non-labour)
- High-level timeline (expected start, expected duration)
- Assessment recommendation (proceed / proceed with conditions / do not proceed)

**DoI 2→3 gate — Pitch Board approval (two-step baseline process):**

Step 1 (Pitch Board approval on macro data):
- Everything from DoI 2
- Pitch Board approval recorded

Step 2 (baseline registration — may follow Pitch Board):
- Detailed 12-month monthly forecast (per `[C-RH-05]`)
- Rough quarterly forecast for outer zone (per `[C-FG-02]`)
- Resource plan with role requirements and internal/external sourcing split
- Milestone breakdown with baseline dates (at least one milestone required; overridable by controller)
- Project timeline (planned start, planned end)
- Baseline locked by controller

Whether step 2 must be completed before or after the Pitch Board is subject to KB confirmation (`[A-OQ-07]`).

**DoI 3→4 gate — Manage (post-launch):**

- Named resource assignments confirmed by CC Owners (for internal resources)
- External vendor assignments recorded (for outsourced roles)
- Final delivery milestone marked complete (if milestones exist)
- Hyper-maintenance duration and scope defined (if applicable)

**DoI 4→5 gate — Scale (mature operation):**

- Cost allocation destinations defined
- Ongoing running cost estimate established
- Optional termination date set or explicitly left open
- Self-service/platform management model documented

#### Document attachments

Every project maintains a persistent list of document attachments throughout its lifecycle. Attachments are **OneDrive links** (company-wide accessible), not file uploads to the CRETA database. This keeps the database lean and respects KB's document management ecosystem.

Each attachment carries: URL, label/description, upload date, DoI level at which it was added, and uploading user. The attachment list is available on all project detail views and grows as the project matures — architecture documents at DoI 1, business case decks at DoI 2, vendor contracts at DoI 3, etc.

#### Resource model

The forecast grid uses three cost categories reflecting KB's mixed sourcing model (internal staff and outsourced resources):

**1. Resource Plan (by role)** — the unified resource planning section, replacing v4's "Internal Resources" label. Each line is a role requirement. Each role line carries:
- Total required hours (per month/quarter)
- Source split: internal hours + external hours
- Internal cost: computed from internal rate table (role × location, as in v4)
- External cost: computed from per-project external rate entry (role × vendor, contracted rate)
- Named internal person assignment (from DoI 3 onward, confirmed by CC Owner)
- External vendor reference (which vendor supplies this role)

**2. External Deliverables** — vendor contracts for deliverable-based work where the engagement is output-based rather than role-based. Each line has: description, vendor, deliverable scope, contracted amount, payment schedule mapped to months. No hours tracking — this is euro-based. Distinct from role-based outsourcing because there is no FTE/hours dimension.

**3. Non-labour Costs** — cloud hosting, licenses, hardware, travel, training, etc. Unchanged from v4 external cost category, with line-item structure (description + vendor + category) and category as expandable rollup grouping.

**External rate handling in v5:** External hourly rates are entered per project, per role, per vendor — not maintained in a global rate table. This reflects the reality that contracted rates vary by vendor and contract. A global vendor rate table may be introduced in a future version if KB wants standardization.

**Capacity Management impact:** My Team and Organization Overview views continue to show internal resources only. External vendor staff are not modelled in CRETA's capacity heatmap. A new portfolio-level reporting dimension — **outsourcing ratio** (internal vs. external hours and cost) — is available in the Report Builder and can be added to standard reports.

#### Milestone configuration model

Milestones represent the project's internal execution plan — sequential time-bounded phases with baseline and forecast dates, rendered as blocks on the MilestoneStrip. They are distinct from Pipeline Stage (the portfolio-level lifecycle position). Hyper-maintenance appears as both a milestone type and a pipeline stage: the milestone is the planned timing, the pipeline stage is the actual current state.

**Layer 1 — Milestone Type Library (admin-managed):**

A global catalogue of available milestone types. Each type has a name, a default colour for the MilestoneStrip rendering, and a suggested ordering. The library is extensible by the admin.

Default set:

- Planning
- Requirements & Analysis
- Development
- Testing / QA
- User Acceptance Testing (UAT)
- Pilot
- Rollout
- Data Migration
- Training / Change Management
- Hyper-maintenance

KB can add, rename, reorder, or deactivate types at any time.

**Layer 2 — Per-project selection (PL-managed):**

When creating milestones on a project, the PL picks from the library and assigns dates. Not all types are required — the selection is project-specific. Ordering is flexible. The DoI 3 gate requires at least one milestone but does not prescribe which types.

**Layer 3 — Project Type Templates (optional, nice-to-have):**

Pre-populated milestone sets based on project Type or Tech Navigator profile (e.g., "SaaS adoption projects typically use: Planning, Pilot, Rollout, Training"). Templates are suggestions, not enforcement. Flagged as a convenience enhancement, not a v5 requirement.

### Post-launch expense tracking

Entities in steady-state operation continue to incur running costs indefinitely (unless an explicit termination date is set, where applicable). v5 expands the scope of post-launch cost tracking from project-only to three entity types via the polymorphic `ChargeableEntity` model introduced in Cluster F:

- **Projects in the Operate stage (DoI 5)** — running costs continue after launch. Optional termination date.
- **Offerings** — first-class chargeable entities. Always in steady state. Always carry a BTC profile.
- **Internal services** — first-class chargeable entities. Always in steady state. Distribute cost to other services and/or to business.

Projects do not transform into offerings or services at Run phase — projects stay projects throughout their lifecycle, and offerings/services exist as separate first-class entity types from creation. The unified surface for these three types is the **Run Portfolio** (a sub-module of the Portfolio module).

#### Cost allocation model (resolved by Cluster F)

The cost allocation mechanics — Stage 1 inter-service distribution, Stage 2 Business-to-Charge across the ~90 KB charging locations, the User Measurement matrix that drives automatic-mode BTC, and the rollup engine — are specified in Cluster F. Cluster A's responsibility is the Run Portfolio view and the per-entity tile/tab in the Workbench that consume Cluster F's outputs.

Cluster A-specific decisions about post-launch tracking:

- **Allocation applies at the Operate stage for projects.** During Active and Hyper-maintenance stages, project costs are tracked directly without a cross-charge allocation dimension. Offerings and internal services always have an allocation profile (they are always in steady state). This resolves the working assumption flagged in earlier versions of `[A-OQ-03]`.
- **BTC profile required at the DoI 2 → DoI 3 transition (Pitch Board gate)** for projects that will have a To-Business cost share. Gate validates that a current-year profile exists and sums to 100%. Profiles are editable post-gate by the responsible person, audit-trailed.
- **BTC profile required at offering creation** for offerings.
- **Each project has an optional termination date** for its Operate stage. Empty means the project runs indefinitely until explicit retirement. Offerings and internal services do not have termination dates as a routine attribute.

#### Views required (Run Portfolio, Cluster A surface)

- **Per-entity detail (Workbench tab):** BTC profile editor, allocation breakdown, audit history. Specified in Cluster E `[E-09]`. Same surface for projects, offerings, and internal services with type-aware variants.
- **Per-entity Workbench tile:** Compact summary showing To-Business total + top 3 charging locations. Specified in Cluster E `[E-04]` extension.
- **Run Portfolio view (Cluster A surface):** Unified list of all chargeable entities currently in steady-state operation (DoI 5 projects + all offerings + all internal services). Type filter (Project / Offering / Internal Service) at the top. Type-aware columns and actions. One underlying query.
- **Per-destination rollup, by-region, by-division, by-country views:** Specified in Cluster F's "Charging & Allocations" module. Cluster A consumes this via embedded panels in the Run Portfolio view.

The Run Portfolio view lives inside the **Portfolio module as a sub-module** alongside Change Portfolio. This resolves `[A-OQ-05]`.

### Not in scope for Cluster A

- **Pre-intake idea funnel.** The pipeline covers projects from DoI 0 (Evaluate) forward. There is no ideation stage prior to DoI 0.
- **Automatic cancellation of below-cutoff projects.** The cutoff line is visualization only. No automated status changes happen based on ranking.
- **Per-LoB Tech Navigator weights.** Weights are global at KB level. Per-LoB configurability is not in scope.
- **Activating the two reserved Value creation criteria slots.** They are reserved in the data model but not editable in v5.
- **Multi-parenting for projects in the pipeline.** Strict single-parent assignment remains in force, consistent with v4.
- **Overwriting or deleting existing ProjectPhase seed data.** The rename to ProjectMilestone preserves all existing per-project data as-is. No data migration beyond the rename.
- **Automatic duration or budget bucket for Hyper-maintenance.** Hyper-maintenance is a milestone-level concern within DoI 4, manually planned. It rolls up under project budget; a separate budget bucket is not created for v5.
- **Conflating Pipeline Stage with Project Milestones.** These are deliberately separate concepts with different cardinality, semantics, lifecycles, and owners. They are never merged.
- **Services transforming into projects (or vice versa) at Run phase.** Projects stay projects throughout their lifecycle; offerings and internal services are separate first-class entity types from creation, not transformed projects. There is no automated entity-type conversion. (Cluster F introduces the polymorphic `ChargeableEntity` model that hosts all three types uniformly for cost allocation purposes.)
- **Retrofitting the v4 intake queue onto the new pipeline model.** Intake is rewritten from scratch in the backlog mechanics design.
- **Project Type Templates for milestone pre-population.** Flagged as a nice-to-have convenience feature (`[A-BK-36]`, `[D-05]`), not a v5 requirement.
- **Controller free-editing of other users' Tech Navigator scores or master data.** Send Back is the standard correction mechanism. Controller overrides require audit logging (`[A-BK-28]`).
- **Mandatory milestone type enforcement.** The Milestone Type Library provides a catalogue; PLs choose which types to use per project. No type is mandatorily required beyond the DoI 3 gate of "at least one milestone."
- **AI Council workflow in CRETA.** The AI Council decision happens offline. CRETA records the outcome as a flag and document attachment only.
- **Global vendor rate table.** External hourly rates are per-project in v5. A centralized vendor rate table is a future enhancement.
- **File upload to CRETA database.** Document attachments are OneDrive links only. No file storage in the application database.
- **AI-assisted description writing.** Project descriptions use structured sections with guiding placeholder text, not AI generation. AI writing assistance may be added in a future version.

### Open questions for Cluster A

- `[A-OQ-01]` — ~~Exact DoI values and their mapping to pipeline stages.~~ **Resolved:** KB uses DoI 0–5. Mapping confirmed from KB reference slides (April 2026). See updated stage set table.
- `[A-OQ-02]` — ~~Canonical KB names for pipeline stages.~~ **Partially resolved:** KB names confirmed: Evaluate, Assess (PoC), Assess (Business Case), Integrate, Manage, Scale. CRETA pipeline stage names (Proposed, Under Evaluation, Approved, Active, etc.) are the internal working labels.
- `[A-OQ-03]` — ~~Cost allocation timing. Current assumption is that allocation only applies at the Operate stage (DoI 4–5).~~ **Resolved (2026-04-28):** For projects, allocation applies only at the Operate stage (DoI 5 in CRETA pipeline terms). Offerings and internal services always carry allocation profiles since they are always in steady state.
- `[A-OQ-04]` — Specific DoI-to-required-field mappings for the data completeness gate pattern. Working definitions for DoI 0–5 gates now in spec with detailed field lists. **Updated (2026-04-28):** DoI 2 → DoI 3 gate additionally validates that a current-year BTC profile exists and sums to 100% if the project will carry a To-Business cost share. Subject to KB confirmation.
- `[A-OQ-05]` — ~~Operate Portfolio view placement. Tentatively a sub-view inside the Backlog module, but could also live inside the Portfolio module. Decision deferred.~~ **Resolved (2026-04-28):** The Portfolio module is restructured into Change Portfolio and Run Portfolio sub-modules. The Run Portfolio sub-module holds all chargeable entities currently in steady-state operation (DoI 5 projects + all offerings + all internal services), with a type filter at the top.
- `[A-OQ-07]` — Baseline detail timing: does the detailed forecast need to exist before the Pitch Board decision, or is a two-step flow (approve on macro data, baseline registered after detailed forecast entry) acceptable? Working assumption: two-step.
- `[A-OQ-08]` — Value stream: does KB have a defined catalogue of value streams, or is this a free-text field initially?
- `[A-OQ-09]` — T-shirt size budget ranges: confirm working thresholds (XS <100k, S 101–250k, M 251–500k, L 501–1.000k, XL >1.000k).
- `[A-OQ-10]` — AI Council: how formalized is this process? Does it need any workflow beyond a flag and document attachment in CRETA?

---

## Cluster C — Temporal Model

**Scope:** Introduces mixed-granularity forecast entry (monthly near-term, quarterly outer zone), synchronized company-wide forecast cycles with per-project versioning, version comparison across Workbench, Portfolio, and Reporting surfaces, and Workbench adaptations for the two-zone grid model.

### Design principles (locked)

- **Storage is always monthly.** Mixed granularity is a UI/entry concern. Every downstream consumer — three-point comparison, cutoff line calculation, Report Builder, What-If Simulator — operates on one uniform grain. No branching logic for two time resolutions.
- **Quarterly entry eliminates false precision.** PLs should not be forced to produce monthly detail 24+ months into the future. Quarterly buckets in the outer zone capture the level of certainty that actually exists. PLs who want month-level control can expand quarters.
- **Provisional data is always marked.** Any system-generated value — quarterly distribution, DoI 2 prepopulation, copy-from-project — carries a visual marker until a human deliberately reviews it. The system never silently presents estimated values as deliberate plans.
- **Forecast cycles are synchronized.** The portfolio needs consistent point-in-time snapshots. All projects update in the same cycle window, producing a portfolio-wide version at each cycle boundary.
- **Versions are immutable history.** Each accepted forecast cycle and each approved CR produces a snapshot that is never overwritten. The full evolution of every project's forecast is preserved.

### Forecast granularity model

#### Storage model

Every forecast line (internal hours by role, external costs by category) stores values at **monthly** granularity regardless of how far into the future the period falls. There is no quarterly storage entity. The monthly grain is the atomic unit for the entire system.

The distinction between "monthly detail zone" (near-term) and "quarterly entry zone" (outer) is purely a UI/entry concern. All calculations, comparisons, reports, and downstream consumers operate on monthly data without needing to handle two granularities.

#### Entry behaviour

**Monthly zone (near-term):** The forecast grid displays one column per month. PLs enter values at monthly granularity, exactly as in v4.

**Quarterly zone (outer):** The forecast grid displays one column per calendar quarter. The PL enters a single value per quarter. On save, the system distributes the quarterly value equally across the three constituent months: floor division, with the cent remainder added to month 3 of the quarter.

PLs can optionally expand a quarterly column to reveal its three constituent months and edit individual monthly values. This is an opt-in refinement, not the default experience.

#### Granularity boundary

The boundary between the monthly and quarterly zones defaults to **12 months** from the current period. Everything within 12 months displays as monthly columns; everything beyond displays as quarterly columns.

The boundary is an **admin-configurable global parameter** in Planning Parameters (not per-project). The 12-month default aligns with the primary backlog horizon locked in Cluster A (`[A-BK-12]`).

#### Total planning horizon

The total planning horizon is a separate admin-configured parameter (e.g., 36 months). The forecast grid extends to this horizon as a fixed-length rolling window. As the boundary advances, the quarterly zone shrinks by one month at its near edge but does not auto-extend at its far edge. The horizon only grows if the admin changes the parameter.

#### Provisional value tracking

Each monthly value carries an `is_provisional` flag. The flag is set to `true` when the value is system-generated by any of three mechanisms:

1. **Quarterly distribution** — value created by dividing a quarterly entry across three months
2. **DoI 2 prepopulation** — value created from the rough quarterly plan at project submission
3. **Copy-from-project** — value copied from another project's forecast grid

The flag is cleared to `false` when a PL manually edits the cell. The flag is **zone-independent** — it tracks whether a human deliberately set the specific monthly value, not which display zone the month currently sits in.

**Visual treatment:** Cells with `is_provisional == true` display a subtle visual provenance marker (dot, background tint, or similar) with a tooltip indicating the value is an estimate that needs review. The marker clears on manual edit. A single visual treatment applies regardless of the source mechanism.

### Rolling horizon mechanics

#### Horizon advancement

The granularity boundary advances **only when a new forecast cycle is initiated**, not on a calendar basis. The boundary stays in sync with the planning cadence configured by controllers/leadership.

When the boundary advances, months that were previously in the quarterly zone enter the monthly zone. Because storage is always monthly, this is purely a display change — the auto-distributed values are already stored as monthly data. The `is_provisional` markers on those values remain intact, prompting the PL to review them during the forecast editing phase.

#### New project grid initialization

A newly created project starts with an empty forecast grid extending to the total planning horizon. Three mechanisms can populate the grid before the PL manually enters detail:

**1. DoI 2 prepopulation:** The rough quarterly plan submitted at DoI 2 (covering both internal resource requirements and external cost estimates) is distributed across the forecast grid using the standard divide-by-3 rule. All prepopulated values are marked `is_provisional == true`. This covers the full cost picture — internal hours/FTE lines and external cost lines.

**2. Copy-from-project:** The PL can populate the grid from an existing project's forecast. This is a one-time snapshot — no live link is maintained between source and target projects. All copied values are marked `is_provisional == true`. Available via a "Copy from" dropdown in the forecast grid showing all projects the PL has visibility into.

**3. Manual entry:** The PL fills in the grid directly during their first forecast submission.

These mechanisms are not mutually exclusive. A PL might use DoI 2 prepopulation as a starting point, then refine individual lines manually.

#### Impact on Cluster A DoI gate definitions

The forecast grid is a **DoI 3 artifact** (post-Pitch Board). The Cluster A DoI gate definitions have been updated to reflect this: DoI 1→2 requires rough quarterly resource plan and external cost estimates (which prepopulate the grid), and DoI 2→3 (Pitch Board approval) leads to detailed forecast grid entry as part of the two-step baseline process. See the Cluster A DoI gate requirements section for the current field lists.

### Forecast versioning model

#### Synchronized forecast cycles

Forecast cycles are **synchronized company-wide**. All projects update in the same cycle window. The cadence is set by controllers/leadership and admin-configured (per Cluster D `[D-02]`). This ensures consistent point-in-time portfolio snapshots at every cycle boundary.

In each cycle, every project receives a new forecast version, even if the PL made no changes. At minimum, the rolling horizon shift means the grid structure has changed. "No change" is recorded explicitly as a version — this keeps portfolio snapshots complete without special-case logic.

#### Version-creating events

Two types of events create forecast versions:

**1. Forecast cycle acceptance (type: `cycle`):** When the controller accepts the forecast for a given project in a synchronized cycle, a new version is created. Because all projects are accepted within the same cycle window, the set of cycle versions across all projects forms a portfolio-wide snapshot.

**2. CR approval (type: `cr`):** When a change request is approved between cycles, it produces an interim project-level version capturing the post-CR forecast state. The next synchronized cycle then captures this state as part of the portfolio snapshot. Whether CRs should be restricted to cycle windows only is flagged for KB confirmation (`[C-OQ-01]`).

#### Version identification

Each project has a sequential integer version counter (v1, v2, v3…). Versions are never renumbered or reordered. Each version carries metadata:

| Field | Content |
|---|---|
| Sequence number | Integer, monotonically increasing per project |
| Type | `cycle` or `cr` |
| Timestamp | Date/time of acceptance |
| Cycle reference | For `cycle` versions: identifier of the forecast cycle |
| CR reference | For `cr` versions: identifier of the approved change request |
| Accepting user | The controller who accepted |

Portfolio-wide snapshots are derived by querying "latest version per project as of cycle X." No separate portfolio-level version entity is required.

#### Version snapshot contents

Each version captures:

- Complete monthly forecast grid — all lines, all months, all values
- `is_provisional` flags per cell
- CR details (reason for change, specific field changes) for `cr`-type versions

**Not versioned:**

- Baseline — immutable, does not change between versions (except via audited controller override, tracked through CR audit trail)
- Actuals — sourced externally, not forecast data

#### Retention

All versions are retained indefinitely. Forecast data is small per project (a few hundred cells per version). Long-term trend analysis depends on having the full history.

### Version comparison and visualization

Version comparison is accessed **in context** within existing modules. There is no standalone version history module.

#### Surface 1: Workbench Overview tab

**Trajectory chart:** *(Deferred — the current trajectory chart is being replaced. Version overlay will be designed as part of the replacement.)*

**Three-point comparison table:** An **"FC Version" dropdown** is added as a column. The table becomes:

| Baseline | FC Version [selected ▾] | Current Forecast | Actuals |

Variance columns are computed between baseline and current, and between the selected FC Version and current. This surfaces where forecast changes landed — which months, which cost lines — relative to any prior version.

#### Surface 2: Workbench Forecast & Planning tab

A **version selector** at the top of the forecast grid. When a prior version is selected, each cell shows a delta indicator (▲/▼ with amount) beneath the current value or as a tooltip. Prior version data is read-only; the current forecast remains fully editable. The PL sees line-by-line, month-by-month what moved since the selected version.

#### Surface 3: Portfolio Dashboard

**Cycle-over-cycle comparison mode.** The controller selects two forecast cycles and sees aggregate forecast delta across the portfolio, sliceable by LoB, programme, or project. Drill-down into contributing projects shows which ones drove the change and by how much.

#### Surface 4: Reporting

**Report Builder:** "Forecast Version" is added as a dimension in the semantic layer, making historical version data queryable in custom reports. A controller can build reports like "forecast by LoB by version" to see evolution across cycles.

**Standard Reports — new report #6: Forecast Version Comparison.** Select two forecast cycles or specific versions. See project-level forecast deltas with drill-down into monthly and cost line detail. Filterable by LoB, programme, cost center. Exportable.

### Workbench adaptations

#### Overview tab

The three-point comparison table displays **monthly columns in the near zone and quarterly columns in the outer zone**, matching the FC & Planning grid layout. Quarterly columns show aggregated values (sum of three constituent months). The mixed view is the canonical and only representation on this tab — no toggle to expand all months.

#### Forecast & Planning tab

The forecast grid adopts the **two-zone layout**:

- Monthly columns in the near zone (within the granularity boundary)
- Quarterly columns in the outer zone (beyond the boundary), each expandable to reveal constituent months for optional per-month editing
- Visual boundary marker (subtle divider or background tint change) between zones
- Quarterly entry distributes to months per `[C-FG-03]`
- Provisional markers per `[C-FG-08]`
- Version comparison delta layer per `[C-VC-03]`

The 5-phase forecast cycle workflow is unchanged in structure. The "edit" phase operates on the two-zone grid. The "acknowledge retrospective" phase (phase 2) is enhanced to show the **delta between the prior cycle's forecast and actuals** for the retrospective period, giving the PL forecast accuracy context before they begin editing.

#### Change History tab

Unchanged. CR approval creates interim versions per `[C-FV-03]`, but version tracking is not surfaced on this tab. The tab continues to track CR lifecycle (submission, review, approval/rejection) and CR-specific details.

### Not in scope for Cluster C

- **Quarterly storage entities.** Storage is always monthly. No data model for quarterly-grain records.
- **Per-project granularity boundaries.** The boundary is global, not configurable per project.
- **Named/labelled versions.** Versions use sequential integers with metadata. Named versions ("Spring Planning 2026") add overhead without analytical value.
- **Version pruning or archival.** All versions are retained indefinitely.
- **Trajectory chart redesign.** The current chart is being replaced; version overlay will be part of the new design, not specified here.
- **Weighted or pattern-based quarterly distribution.** Distribution is equal thirds. Sophisticated distribution models add complexity without proportional value.
- **Per-project forecast cycle cadence.** Cycles are synchronized company-wide. Individual project cycle schedules are not supported.
- **Baseline versioning.** Baseline is immutable and not part of the version sequence. Baseline changes via audited override are tracked in the CR audit trail.

### Open questions for Cluster C

- `[C-OQ-01]` — Should CRs be processable between forecast cycles (producing interim versions), or restricted to cycle windows only? Working assumption: CRs can happen at any time. To be confirmed with KB colleagues.



---

## Cluster B — What-If Simulator Rebuild

**Scope:** Complete rebuild of the What-If Simulator as a full-sandbox portfolio planning tool. The user works in sandbox copies of real CRETA surfaces — forecast grids, rate tables, people lists, the ranked backlog — making changes that are tracked as diffs against a versioned forecast anchor. A catalogue of bulk actions provides power-user shortcuts for common portfolio-level operations. An impact dashboard surfaces the cascading consequences of changes across financial, ranking, capacity, and structural dimensions. Scenarios can be compared, promoted to the live system, or used by PLs to pre-populate forecast cycle submissions.

### Design principles (locked)

- **The simulator is a sandbox mirror of the real system.** Editing surfaces inside the simulator look and behave identically to their counterparts in the production modules. The user does not learn a separate interface — the sandbox is CRETA with a diff layer on top.
- **Two interaction layers: direct manipulation and catalogue shortcuts.** The user can edit individual cells on any editable surface (Layer 1) or apply bulk actions from the catalogue that generate multiple cell-level diffs in one operation (Layer 2). Both layers produce the same underlying diff data structure.
- **On-demand recalculation, atomically consistent.** Impact recalculation runs server-side as a single atomic operation when the user explicitly triggers it. All impact dimensions update together. At production scale (~150 projects, ~5000 people), real-time recalculation would introduce unpredictable latency; on-demand gives the user control over when to pause editing and inspect results.
- **Ranking supports decisions, it does not make them.** Consistent with Cluster A's design principle. Target-setters (outsourcing targets, investment mix targets) show gaps and misalignments; they do not auto-adjust the portfolio. The simulator surfaces information for human decision-making.
- **Scenarios are anchored to versioned forecasts.** Every scenario is pinned to a specific forecast cycle version (Cluster C). Diffs are computed against this anchor. Scenarios can be rebased to newer versions, with conflict resolution for cells changed in both the scenario and the new forecast.
- **Promotion is selective, audited, and routed through native workflows.** Committing scenario changes to the live system is not a bulk overwrite. Each diff follows the appropriate system workflow — forecast changes become forecast submissions, stage transitions trigger gate checks, people changes generate action items.

### Access model

The simulator is accessible to **Controllers, Project Leads, and Executives**. Editable surfaces are gated by a three-tier permission model:

**Tier 1 — Project-scope actions (all simulator users):**

- Forecast grid edits (PLs: own projects only; Controller/Executive: any project)
- Timeline / milestone changes
- Tech Navigator score changes
- Pipeline stage changes
- Hypothetical new project injection
- Vendor contract adjustments on project level
- CapEx/OpEx reclassification on project cost lines
- External rate changes per project/role/vendor

**Tier 2 — Portfolio-scope actions (Controller + Executive):**

- Total available budget changes
- Hierarchy reassignment
- Investment mix targets
- Outsourcing ratio targets
- Escalation / inflation factors
- Catalogue bulk actions (all portfolio-level and project-level actions)
- Running cost and termination date changes for Operate-stage projects
- Cost allocation rule changes (destination percentages)

**Tier 3 — Sensitive/structural actions (admin-configurable per user):**

- People master data changes (hire, depart, reassign, headcount modelling)
- Capacity parameters (available hours per location)
- Rate table changes (internal and external)
- Restructuring bulk actions (Remove role, Reduce headcount, Relocate team, Hire block)

Tier 3 access is controlled by an admin-configurable permission flag on individual user accounts, not by a separate role hierarchy. By default, Tier 3 is disabled for all users and must be explicitly granted.

### Editable surfaces

The simulator exposes sandbox copies of the following CRETA surfaces. Each surface behaves identically to its production counterpart except that changes are tracked as diffs rather than committed.

**1. Forecast grids** — internal resource hours by role (with internal/external split), external deliverables, non-labour costs. Sandbox grids show current month forward only, truncating historical actuals. Baseline remains visible as a read-only summary reference row. Monthly near zone and quarterly outer zone per Cluster C.

**2. Rate tables** — internal rate tables (role × location) and external per-project rates (role × vendor). Changes cascade through all cost calculations in the scenario.

**3. Resource assignments** — named person assignments on projects. Moving a person between projects cascades through capacity utilization.

**4. People master data** (Tier 3) — add hypothetical people (hires), remove people (departures), reassign people to different cost centers. Removals cascade: all allocations for the person zero out across all projects.

**5. Pipeline stage** — change a project's pipeline stage. Stage changes affect backlog membership, envelope consumption, DoI level, and ranking visibility.

**6. Tech Navigator scores** — edit Complexity and Value Creation sub-criteria. Score changes recalculate composite ranking and can shift cutoff line positions.

**7. Total available budget** — change the budget envelope. Cascades through cutoff line calculation and contestable envelope.

**8. Project timeline / milestones** — shift milestone dates, add or remove milestones. Timeline changes can be combined with forecast grid shifts for comprehensive delay/acceleration modelling.

**9. Vendor contracts** — change contracted amounts, payment schedules, or rates for external deliverable lines. Covers renegotiation scenarios.

**10. Sourcing mix** — adjust the internal/external hour split per role line. Rate differentials apply automatically.

**11. CapEx/OpEx classification** — reclassify cost lines between capital and operating expenditure. Cascades through CapEx/OpEx ratio KPIs.

**12. Cost allocation rules** — for any chargeable entity in steady-state operation (Operate-stage projects, offerings, internal services), change the percentage distribution of running costs across charging locations (Stage 2 BTC) and/or change the inter-service distribution percentages (Stage 1). Cascades through per-location cost rollups, per-region rollups, and Run Portfolio totals. The simulator consumes Cluster F's data layer for impact computation; mutation lives in the simulator sandbox only, not in Cluster F's editors.

**13. Capacity parameters** (Tier 3) — available hours per location. Changes cascade through every utilization calculation for that location.

**14. Escalation / inflation factors** — applied through catalogue actions. Percentage increase on costs from a specified month forward, scoped by cost category, role, and/or hierarchy node.

**15. Running costs and termination dates** — for Operate-stage projects, model changes to the ongoing cost tail. Termination date changes zero out running costs after the specified month.

**16. Hypothetical project injection** — create a project that exists only in the scenario. Carries estimated budget, resource needs, Tech Navigator scores, and pipeline stage. Appears in the ranked backlog. Can be promoted to a real Proposed project (DoI 0) if the scenario is acted on.

**17. Hierarchy reassignment** — move a project to a different node in the active portfolio hierarchy (per ADM-01's configurable hierarchy model). Cascades through per-node budget aggregation and KPIs.

### Catalogue bulk actions

Twenty-one pre-defined actions organized in three categories. Each action generates the equivalent cell-level diffs as if the user had made the changes manually. All catalogue actions appear in the change summary and are individually undoable.

#### Project-level actions (10)

Applied to a selected project or a filtered set of projects.

| # | Action | Effect |
|---|--------|--------|
| 1 | **Remove project** | Zeros out all future forecast values. Project disappears from ranking. |
| 2 | **Pause project** | Zeros out future values from a specified month onward. Pipeline stage set to Paused. |
| 3 | **Delay project** | Shifts entire remaining timeline and forecast forward by N months. |
| 4 | **Accelerate project** | Compresses remaining timeline by N months, concentrating remaining budget. |
| 5 | **Scale budget** | Increase or decrease all future forecast lines by a percentage, uniformly across all cost categories. |
| 6 | **Change sourcing mix** | Shift a percentage of internal hours to external (or vice versa) across all role lines. Rate differential applied automatically. |
| 7 | **Set termination date** | For Operate-stage projects, set or change the termination date. Running costs after that date are zeroed. |
| 8 | **Clone project** | Create a hypothetical duplicate with the same forecast profile. Useful for "what if we run a second instance." |
| 9 | **Adjust vendor contract** | Change contracted amount, payment schedule, or rate for a specific external deliverable line. |
| 10 | **Change external rate** | Modify the per-project external hourly rate for a specific role/vendor combination. |

#### Portfolio-level rules (7)

Blanket actions across the portfolio, scoped by configurable parameters.

| # | Action | Effect |
|---|--------|--------|
| 11 | **Cut by hierarchy node** | Reduce all projects under a specific hierarchy node by X%. |
| 12 | **Cut by Type** | Reduce all Type 1, Type 2, or all non-Type-3 projects by X%. |
| 13 | **Cut by Transformation level** | Reduce all T0, T1, or T2 projects by X%. |
| 14 | **Across-the-board cut** | Reduce all non-Type-3 projects by X%. Type 3 exempt. |
| 15 | **Freeze new starts** | Zero out all projects with planned start date after a specified month. |
| 16 | **Apply escalation factor** | Increase costs by X% from a specified month onward. Scoped by cost category (all/internal/external/non-labour), by role, and/or by hierarchy node. Scoping options are combinable. |
| 17 | **Adjust rate table** | Increase or decrease all rates in a rate table by X%, optionally scoped by location or role. |

#### Portfolio-level target-setters (2)

Show gap between current state and target; do not auto-adjust.

| # | Action | Effect |
|---|--------|--------|
| 18 | **Set outsourcing target** | Specify target internal/external ratio. System shows which projects are furthest from target and the cost delta to reach it. |
| 19 | **Set investment mix target** | Specify target budget percentages by hierarchy node, Type, or Transformation level. Shows current vs. target distribution gap. |

#### Restructuring decisions — Tier 3 only (4)

Hidden entirely for users without Tier 3 permission. Framed as analytical restructuring decisions, not as workforce-specific terminology.

| # | Action | Effect |
|---|--------|--------|
| 20 | **Remove role from portfolio** | Select a role; system zeros out all allocations for that role across all projects (or within a scoped hierarchy node). Shows cascade: affected projects, cost saving, capacity gaps. |
| 21 | **Reduce headcount by location** | Reduce available FTEs at a location by N people or N%. Reduces the available capacity pool; shows which projects are affected by tighter supply. Does not pick specific people. |
| 22 | **Relocate team** | Move a set of people (or headcount block by role) from one cost center/location to another. Rate differentials apply automatically. |
| 23 | **Hire block** | Add N hypothetical people with a specified role and location, available from a specified month. They enter the capacity pool; system shows utilization impact and which understaffed projects could absorb them. |

### Scenario lifecycle

#### 1. Create

Three entry points:

- **New blank scenario** — snapshots the portfolio at the latest completed forecast cycle version. This is the default.
- **New from specific version** — user picks a historical cycle version to anchor to.
- **Clone existing scenario** — copies another scenario's anchor plus all its diffs as a starting point.

At creation the user provides a name, optional description, and optional tags. The system records the anchor version, creating user, and timestamp. The scenario starts with zero diffs.

#### 2. Edit

The user works in the sandbox using direct cell manipulation and/or catalogue bulk actions. Changes auto-save continuously. Every individual change is recorded with a timestamp in the change summary. The impact summary strip shows a stale indicator once edits have been made since the last recalculation.

#### 3. Rebase

When a new forecast cycle completes after the scenario was created, the scenario's anchor becomes stale. The user can trigger a rebase, which re-anchors the scenario to the new cycle version. The system carries forward all existing diffs and flags conflicts — cells changed in both the scenario and the new forecast version. The user resolves each conflict (keep scenario value, accept new forecast value, or enter a different value). Rebase is manual and explicit, never automatic.

#### 4. Publish

A private scenario can be promoted to a shared Published state. Publishing is a deliberate action. Published scenarios are read-only to non-owners; other users can clone them to create editable variants.

**Tier 3 content gating (Option C):** When publishing, the system detects whether the scenario contains Tier 3 diffs (people changes, rate table changes, capacity parameter changes, restructuring actions). If it does, visibility defaults to "Tier 3 users only." The publisher can override this to "All simulator users" if they judge the content is not sensitive — this override is an audited action. Even in scenarios published to all users, Tier 3 diff details are redacted for users without Tier 3 permission. Portfolio-level impact totals remain accurate, but the specific Tier 3 changes that contributed to those totals are hidden.

#### 5. Compare

Select up to 3 scenarios plus current state (always pinned as the first column). **Shared anchor requirement:** only scenarios anchored to the same forecast cycle version can be compared. If a selected scenario is stale, the user is prompted to rebase before comparison proceeds. Deltas are computed against the current state column.

**Three-level drill structure:**

**Level 1 — Portfolio summary.** Eight impact dimension rows (see Impact dashboard section) with expandable breakdowns. Each row shows the headline metric per scenario column with delta indicators. Entry point for the comparison.

**Level 2 — Project comparison.** Select a project to see its data across all scenarios in parallel columns. Shows forecast grid month-by-month with cell-level delta highlighting, milestone timelines, master data differences, Tech Navigator score differences, and resource plan with internal/external split per scenario.

**Level 3 — Line-level detail.** Focus on a specific forecast line (e.g., "Senior Developer, internal hours") and see month-by-month values for that line across all scenarios. Finest grain of comparison.

Navigation between levels uses breadcrumbs: "Comparison > ERP Migration > Senior Developer (internal)." Back button at each level.

**Display conventions:**

- **Per-scenario colour coding** on structural elements (column headers, column background tint, borders). Each scenario gets a distinct colour (e.g., Scenario A blue, Scenario B pink). Colour identifies which scenario a column belongs to.
- **Directional indicators** on individual values using inline arrows and +/- prefixes (e.g., "€45,000 ▲+5,000"). Directionality is conveyed through symbols, not colour, ensuring accessibility and avoiding conflict with the per-scenario colour coding.
- **Toggle: "Show values" vs. "Show changes from anchor."** Both views use the same grid layout. "Show values" displays the absolute numbers under each scenario. "Show changes" displays the diff from the anchor version. Toggle available at Level 2 and Level 3.

**Interactive jump:** clicking a project or line in the comparison view opens that project's sandbox surface inside the relevant scenario's workspace. Back button returns to the comparison view.

**Scenario column headers:** Each column displays scenario name, owner, anchor version, status badge, and total diff count. Stale indicators appear on any scenario with an outdated anchor.

#### 6. Promote (Controller only)

Selective diff application to the live system. This is not a bulk overwrite — each diff follows its native system workflow.

**Prerequisite:** Promote is only available when the scenario's anchor matches the latest completed forecast cycle. If the anchor is stale, the Promote button is disabled with a message: "Rebase to the latest forecast cycle before promoting."

**Step 1 — Enter promotion mode.** Controller clicks "Promote" from the scenario header or the change summary drawer. The scenario becomes read-only; no further edits while promotion is in progress.

**Step 2 — Review and select diffs.** The promotion review shows the complete change summary grouped by category: project forecast changes, pipeline stage transitions, Tech Navigator score changes, rate table changes, people changes, hierarchy reassignments, etc. Each diff shows before/after values and isolated impact. The controller selects which diffs to promote using checkboxes. Select-all per category is available but no global select-all — forcing at least category-level conscious selection.

**Step 3 — Validation and routing preview.** The system shows how each selected diff will be processed:

| Diff type | Routing |
|---|---|
| Forecast grid changes (own projects) | Direct forecast update |
| Forecast grid changes (other PLs' projects) | Change request sent to PL for acknowledgment |
| Pipeline stage transitions | DoI gate check; controller decides override (audited) or drop if gate not met |
| Tech Navigator score changes (own projects) | Direct update |
| Tech Navigator score changes (other PLs' projects) | Send Back to PL with suggested scores, or audited controller override (per `[A-BK-28]`) |
| Rate table changes | Admin update path with effective date |
| People changes (hire/depart/reassign) | Generates structured action item for HR / manual admin action |
| Budget envelope changes | Direct update to Backlog & Ranking Configuration |
| Hypothetical project injection | Creates a real Proposed project (DoI 0) with scenario data pre-populated |
| Hierarchy reassignment | Direct update |
| Cost allocation rule changes | Direct update |
| Capacity parameter changes | Admin update path |

**Step 4 — Confirm and execute.** Controller reviews the routing summary and clicks "Confirm promotion." Routable changes execute immediately; non-routable changes generate action items. An audit log entry captures the full promotion event: scenario identifier, which diffs were promoted, which were left behind, routing outcomes, and the promoting user.

**Step 5 — Post-promotion scenario state.** The scenario remains intact. Promoted diffs are marked with a "Promoted" badge and timestamp. Un-promoted diffs remain as-is. The scenario can be archived, or the controller can continue with remaining un-promoted diffs. Partial promotion is a deliberate design choice.

#### 7. Apply to forecast (PL only)

PLs use the simulator as a drafting surface and carry scenario results into the existing forecast cycle mechanics. The "Apply to forecast" button is available on any scenario during an active forecast cycle — including scenarios that were created and finalized before the cycle opened.

On trigger, the PL's next forecast cycle submission is pre-populated with the scenario's diffs on their own projects. Scenario-originated values are marked with a provenance indicator (similar to the `is_provisional` marker pattern from Cluster C). The PL can review, adjust, and submit through the normal cycle flow. From the controller's perspective, it is a standard forecast submission with a provenance note in the submission metadata.

Only diffs within the PL's edit authority are carried forward — forecast grid values, milestone dates, resource plan changes on own projects. Portfolio-level or cross-project diffs are left behind in the scenario with a message explaining that only own-project forecast changes can be carried forward.

The scenario is not consumed or closed by this action.

#### 8. Archive

A completed or abandoned scenario can be archived. Archived scenarios are read-only, no longer appear in the active scenario list, but remain queryable via a show/hide toggle on the Scenario Manager. Archived scenarios can be cloned (creating a new active scenario from the archived state) but not reopened for editing. No hard delete — consistent with CRETA's general audit philosophy.

**No hard scenario cap.** There is no artificial limit on the number of scenarios per user. A soft warning may be introduced if storage becomes a concern, but no hard limit is enforced.

### Impact dashboard

The impact dashboard provides visibility into the cascading consequences of scenario changes. It is organized as eight impact dimensions.

**Recalculation model:** All impact dimensions are computed server-side as a single atomic operation when the user clicks the "Recalculate" button. All dimensions update together, ensuring consistency. The change summary (dimension 8) updates in real time as edits happen — this is a local append operation with no computation. The impact summary strip shows a "stale" indicator when edits have been made since the last recalculation.

#### Impact dimensions

**1. Financial impact** — total portfolio budget delta, CapEx/OpEx shift, per-project budget changes, cost category breakdowns. Shows both the 12-month primary horizon and the full planning horizon (long-term sustainability analysis deferred from Cluster A per `[A-BK-13]` lives here).

**2. Backlog ranking impact** — how the ranked backlog shifts under the scenario. Which projects move above or below the cutoff lines, how the misalignment zone changes, what happens to the contestable envelope. A live preview of the backlog module's ranked list and cutoff bands under scenario conditions.

**3. Capacity impact** — utilization heatmap deltas per cost center, per role, per location. Which teams go from green to red, which people get freed up, where new gaps appear. Reflects the internal/external sourcing split — shifting work from external to internal shows the capacity impact on internal teams.

**4. People impact** (Tier 3 only) — specific people whose allocations change, people removed or added, department-level headcount deltas. Entirely hidden for users without Tier 3 permission.

**5. Outsourcing ratio impact** — how the portfolio-wide and per-project internal/external mix shifts. If outsourcing targets have been set, shows gap between current state, scenario state, and target.

**6. Investment mix impact** — if mix targets have been set (by hierarchy node, Type, Transformation level, demand type), shows current vs. scenario vs. target distribution. Visual overlay showing how portfolio composition shifts.

**7. Running cost impact** — for Operate-stage projects, how changes to running costs, termination dates, or cost allocation rules affect the long-term cost tail. This is the long-term sustainability view deferred from the backlog.

**8. Change summary** — audit-style list of every diff in the scenario, categorized by type. Each entry shows what changed, before/after values, and timestamp. Updates in real time as edits are made (no recalculation needed). Serves as the entry point for Promote and Apply-to-forecast actions, since those require the user to see and select their diffs.

### Workspace layout

The workspace has three persistent zones plus a collapsible drawer.

**Zone 1 — Scenario header (top bar).** Scenario name (editable inline), anchor version label (e.g., "Based on: Forecast Cycle Q2-2026"), scenario owner, status badge (Private/Published), creation date, last recalculated timestamp. The **Recalculate** button lives here prominently. The **Bulk Actions** button also lives here for quick access to the catalogue. Compact — one row.

**Zone 2 — Impact summary strip (below header).** Eight compact tiles, one per impact dimension. Each tile shows the headline delta as a compact card (e.g., "Budget: -€1.2M ↓8%" / "Ranking: 3 projects shifted" / "Capacity: 2 CCs over 100%"). Always visible, stale indicator when edits are pending recalculation. Tiles for Tier 3 dimensions (People impact) are hidden for users without Tier 3 permission.

**Click to expand:** Clicking any tile expands a detail panel below the strip, pushing the editing area down. The detail panel shows the full drill-down for that dimension. Only one detail panel open at a time. Clicking the tile again or clicking a different tile collapses/swaps.

**Zone 3 — Sidebar + editing surface (main body).** The main body is split into a **collapsible left sidebar** (navigation tree) and the **editing surface** (right side, takes remaining width). The sidebar follows the pattern established by the Report Builder, which is already familiar to KB stakeholders.

**Sidebar navigation tree:**

- **Projects** (expandable section)
  - Each project listed by name, with a badge if it has diffs in the current scenario (dot or change count)
  - Expanding a project reveals sub-surfaces: Forecast Grid, Milestones, Master Data, Vendor Contracts, Cost Allocation (Operate-stage only)
  - Searchable and filterable (essential at ~150 projects)
  - "New hypothetical project" action at the bottom, styled distinctly (+ button)
- **Backlog** (single item) — opens the sandbox copy of the full Backlog module (ranked list, cutoff bands, Tech Navigator Cube, filter bar — all functional in sandbox mode)
- **Portfolio Settings** (expandable section) — total available budget, investment mix targets, outsourcing ratio targets, escalation/inflation factors
- **Resources** (expandable section, Tier 3 gated — hidden entirely without Tier 3 permission) — people list, rate tables (internal and external), capacity parameters (available hours per location)
- **Bulk Actions** (single item) — opens the catalogue interface in the editing surface

The sidebar is collapsible to give full width to the editing surface (especially important for forecast grids with many monthly columns). Collapse/expand via a toggle button.

**Visual sandbox indicator:** A persistent coloured border or background tint across the entire workspace communicates that the user is in the simulator, not in the live system. This indicator is visible regardless of which surface is displayed.

**Change summary drawer (bottom).** Collapsible from the bottom of the screen. Can stay partially open (showing the last few changes) or fully expanded to show the complete diff list. Accessible from any surface without navigating away. The Promote and Apply-to-forecast buttons live here, since the user needs to see and select their diffs when committing.

### Scenario Manager (landing view)

The entry point when the user opens the simulator module.

**Two sections:**

**My Scenarios (top):**

Table of the user's own scenarios (private and published). Columns: scenario name, description (truncated), status badge (Private / Published), anchor version, stale indicator (if anchor is behind the latest cycle), creation date, last modified, tags, headline impact summary (e.g., "Budget -€1.2M, 3 projects removed, capacity freed in 2 CCs" — generated from last recalculation; empty if scenario has no diffs or has never been recalculated).

Row actions: Open, Clone, Publish/Unpublish (owner only), Rebase (owner only), Archive (owner only).

"Create New Scenario" button (prominent).

**Published Scenarios (bottom):**

Table of all published scenarios visible to the current user (subject to Tier 3 content gating — see Publish lifecycle step). Same columns as above, plus owner name. Row actions: Open (read-only for non-owners), Clone (creates a private copy).

**Tag filtering:** Free-text tags applied by the user when creating or editing a scenario. Tag filter bar at the top of the landing view, multi-select, applies to both My Scenarios and Published Scenarios.

**Archived scenarios:** Toggle or filter to show/hide archived scenarios. Archived scenarios are visually dimmed, read-only. Can be cloned but not reopened for editing.

**Compare entry point:** "Compare Scenarios" button opens the scenario selection step. The selection step enforces the shared-anchor requirement: only scenarios on the same anchor version can be compared. Stale scenarios are flagged with a rebase prompt.

**Role-based view:** PLs see their own scenarios plus published scenarios (subject to Tier 3 gating). Controllers and Executives see the same. No role sees other users' private scenarios. Create New is available to all three roles.

### AI Advisor (deferred)

The AI Advisor is designed but deferred from v5 implementation due to API access constraints. The design is preserved here for future activation.

**Two-mode concept:**

- **Mode 1 — Goal-directed planning:** User states a goal in natural language (e.g., "Find €2M in savings without touching Rail Systems"). The advisor analyses the current scenario state and proposes 2-3 solution paths, each expressed as catalogue actions and/or cell-level changes. Preview before apply. Evolved from the v4 pre-computed goal/path model.
- **Mode 2 — Scenario analysis and advisory:** User has made changes and wants assessment. The advisor reviews diffs and impact state, providing risk flags, opportunity identification, consistency checks, and long-term sustainability observations.

**Panel treatment:** Slide-over drawer from the right edge, triggered by a button in the scenario header. Overlays the editing area rather than compressing it. Retains conversation history within the scenario session.

**Architecture:** Dual-layer — pre-computed response layer for common goal patterns (demo/fallback), live Claude API layer for contextual reasoning when connected. Clean abstraction boundary: frontend does not know which layer is responding.

**Constraint:** The advisor proposes changes; the user explicitly confirms before any changes are applied to the scenario. No autonomous scenario modification.

### Not in scope for Cluster B

- **Inter-project dependency modelling.** Dependencies are a data model enhancement seeded to Cluster D (`[D-12]`). The simulator will consume dependency data when available, enabling cascade rescheduling of successor projects when a predecessor's timeline shifts. Cluster B does not introduce the dependency data model.
- **Monte Carlo / stochastic simulation.** Deterministic what-if with manual sensitivity testing (run multiple scenarios: optimistic, base, pessimistic) provides the majority of the value without requiring probability distribution inputs that KB does not maintain.
- **NPV / IRR / payback calculations.** KB's Tech Navigator already covers financial benefit and payback as scoring sub-criteria. A full DCF engine is a different product. The simulator shows cost impact, not investment return calculations.
- **Dependency-driven auto-rescheduling.** Even when dependencies are available from Cluster D, automatic cascade rescheduling in the simulator is deferred. The simulator will surface dependency conflicts; the user resolves them by manually adjusting successor timelines.
- **Organizational structure changes in the sandbox.** Cost center, LoB, and hierarchy definitions cannot be edited inside a scenario. These are structural changes that would produce enormous cascading complexity without actionable planning outcomes.
- **Planning parameter changes in the sandbox.** Horizon length, RAG thresholds, and similar display/calculation settings cannot be edited inside a scenario. They are presentation concerns, not portfolio decisions.
- **AI Advisor implementation.** Designed and architecture-ready but deferred from v5 implementation due to API access constraints. Pre-computed response layer may be implemented for demo purposes.

### Open questions for Cluster B

- `[B-OQ-01]` — Should the Promote workflow support promoting diffs that affect cost allocation rules (BTC profiles or inter-service distribution edges, per Cluster F), or should allocation changes always go through the admin path outside the simulator? Working assumption: promote is supported. Permission model: per-entity-type admin-configurable role grants (Cluster F) determine who can edit; the simulator uses the same permissions for promote-eligibility.
- `[B-OQ-02]` — When a PL uses "Apply to forecast," should the provenance note in the forecast submission be visible to the controller, or only stored in audit metadata? Working assumption: visible to the controller.

---

## Cluster F — Charging & Allocations

**Scope:** Brings KB's IT cost charging cycle into CRETA. Two stages currently split between CaPa (Stage 1: inter-service distribution) and 240+ external Excel workbooks (Stage 2: Business-to-Charge across legal entities) are unified inside CRETA, together with the User Measurement matrix that drives automatic-mode BTC. Cluster F provides the polymorphic `ChargeableEntity` model consumed by Cluster A's Run Portfolio view, the simulation engine consumed by Cluster B's lever 12, and the new master data entities consumed by Cluster D. Closes the gap explicitly named by Zuzanna in her interview ("we cannot simulate that interactively") and resolves the previous `[A-PL-02]` placeholder definitively.

**Origin:** Late-April 2026 follow-up working sessions on two KB sample files (`12791_2026_BTC.xlsx` and `total_cost_04072026_internal_Distribution.xlsx`) plus stakeholder interview material. Companion documents: `CRETA_Charging_and_Allocations_Briefing.md` and `CRETA_Cluster_F_Charging_and_Allocations_Decisions.md`.

### Design principles (locked)

- **Cluster F is the charging engine; consumers own their UI surfaces.** Stage 1 distribution editor, Stage 2 BTC profile editor, UM matrix viewer, and the rollup data layer live in Cluster F. The Run Portfolio view (Cluster A), the per-entity Workbench tile and tab (Cluster E), and the simulator's lever 12 (Cluster B) all consume the same Cluster F data layer through their own UI.
- **Polymorphic entity model.** Projects, offerings, and internal services are three subtypes of one `ChargeableEntity` root. Cost allocation logic is identical across types; only the WBS prefix in the generated SAP charging element differs (`IT0<PPM>`, `IT00<S-code>`, `ITF<NNNNN>`).
- **Storage shape matches mechanic.** Stage 1 (inter-service distribution) is sparse — edges-as-list. Stage 2 (BTC) is sparse internally but full-matrix at SAP export time, mirroring SAP's posting account requirements.
- **WBS Elements are algorithmic, never stored.** Given an entity and a charging location, the WBS Element is `<prefix>-64-99-<location_code>`. Synthesized at SAP export time. Working assumption: `64-` is KB's IT company-code marker, to be verified.
- **Hierarchy is consumed, not parallel.** Cluster F entities attach to nodes in Cluster D's configurable hierarchy via the same mechanism existing projects use. No separate LoB or Division concept introduced.
- **CRETA is consumer of UM, not master.** User Measurement values live in an external KB system (likely SAP-side, to be confirmed). CRETA imports them; CRETA does not edit them. Versioned snapshots, no overwrites.
- **Residual is self-retained, not implicitly To-Business.** When an entity distributes less than 100% of its rolled-up cost, the residual stays as self-retained cost on the entity's own books — the entity "charges itself". Confirmed by the controller workshop.

### The two-stage cycle

Stage 1 — *inter-service distribution*: each chargeable entity has a rolled-up total cost (own internal/external + inflows from upstream entities) and distributes up to 100% of that total. Distribution targets are either (a) other chargeable entities (cross-charge edges) or (b) "To Business" — a percentage that releases from IT entirely. Whatever isn't distributed is self-retained.

Stage 2 — *Business-to-Charge*: for each entity with a To-Business share, that share is split across the ~90 KB charging locations using either a manual percentage grid or an automatic computation driven by the User Measurement matrix for a chosen S-code. The split emits SAP-shaped WBS Elements (`<prefix>-64-99-<location_code>`) for posting.

The full picture and worked examples are in the briefing document (`CRETA_Charging_and_Allocations_Briefing.md`).

### Data model

#### Polymorphic root: `ChargeableEntity`

A single entity type with three subtypes — Project, Offering, Internal Service — distinguished by `entity_type` and `identifier` format. All three behave identically for cost-allocation purposes.

| Field | Description |
|---|---|
| `id` | UUID, primary key |
| `entity_type` | One of: Project, Offering, InternalService |
| `identifier` | PPM number (5 digits) for projects, S-code for offerings, ITF number for internal services |
| `hierarchy_node_id` | FK into Cluster D's configurable hierarchy |
| `responsible_person_id` | FK to People master |
| `to_business_pct` | Decimal 0–100. The percentage of rolled-up cost that releases to KB (Stage 2 input). |
| `is_change_or_run` | Derived: Change for projects in DoI 0–4, Run for projects in DoI 5 + all offerings + all internal services |
| Standard audit fields | created_at, updated_at, etc. |

#### `Distribution` (Stage 1 edges)

| Field | Description |
|---|---|
| `id` | UUID |
| `year` | Fiscal year |
| `version` | Tied to CRETA's standard baseline/forecast/actuals model |
| `source_entity_id` | FK to `ChargeableEntity` |
| `destination_entity_id` | FK to `ChargeableEntity` |
| `percentage` | Decimal 0–100 |

Sparse storage. One row per actually-flowing edge. The "To Business" share is the `to_business_pct` field on the entity, not a row in this table.

Self-retained percentage is derived: `100% − to_business_pct − sum(distribute_to %)`.

#### `BTCProfile` (Stage 2 profile per entity per year)

| Field | Description |
|---|---|
| `id` | UUID |
| `entity_id` | FK to `ChargeableEntity` |
| `year` | Fiscal year |
| `mode` | One of: manual, automatic |
| `s_code` | If automatic mode — the IT service catalogue code that drives UM-based computation |
| `um_snapshot_at` | If automatic mode — timestamp of the last UM snapshot baked into the profile |

Profile required when `to_business_pct > 0`. For projects, validated at the DoI 2 → 3 gate. For offerings, validated at creation.

#### `BTCProfileLine` (Stage 2 per-location percentages)

| Field | Description |
|---|---|
| `profile_id` | FK to `BTCProfile` |
| `charging_location_id` | FK to `ChargingLocation` master |
| `percentage` | Decimal 0–100 |

Sparse storage. Full-matrix presentation at SAP export time only, where all 90 charging locations are enumerated and absent rows emit zeros.

#### `UserMeasurement` (UM matrix)

| Field | Description |
|---|---|
| `id` | UUID |
| `year` | Fiscal year |
| `quarter` | 1–4 (prototype cadence) |
| `s_code` | Service catalogue code |
| `charging_location_id` | FK to `ChargingLocation` master |
| `value` | Decimal — license count, weighted score, or other measurement metric |
| `source` | Origin identifier (system name when imported via API, "csv-upload" when imported via file) |
| `imported_at` | Timestamp |

Versioned snapshots, no overwrites. Each import creates a new version.

#### Master data additions (specified in Cluster D)

- `ChargingLocation` — the ~90 KB charging codes. Per-code division, region, country attributes.
- `LegalEntity` — the ~120 KB legal entities, each with a many-to-one FK to `ChargingLocation`.
- `Region`, `Country` — small lookup masters for clean labels.

### Stage 1 — inter-service distribution

#### Edit interaction

Edges-as-list. The entity's responsible owns the profile. The editor surfaces the entity's `to_business_pct` field plus a list of `(destination_entity, percentage)` rows. Add/edit/remove rows; edit `to_business_pct`. Self-retained percentage is shown as derived.

Validation on save:
- Sum of distribution rows + `to_business_pct` must be ≤ 100%.
- No cycles. Adding a destination that creates a cycle in the cross-charge graph is hard-blocked with an error message showing the chain.

#### Editor permissions

Default: the entity's responsible has edit access; controllers have an audit-trailed override capability. **Permissions are admin-configurable per role** — see `[F-AC-01]` in the Decisions log and the Cluster D Access Control extensions.

#### Versioning

Distribution rules participate in CRETA's standard baseline/forecast/actuals model. Annual lifecycle cadence (one set of edges per entity per year) with within-year edits captured as forecast versions. What-If scenarios fork the current forecast version and mutate distribution rules in the sandbox without touching live data.

### Stage 2 — BTC profile per entity

#### Two modes

**Manual mode.** Add-only list editor. Empty profile starts blank. "Add charging location" button opens a searchable picker (90 codes, filterable by region and division). Each added row gets an editable percentage. Sum-to-100 validation gate on save.

**Automatic mode.** Pick an S-code from the IT service catalogue. System computes per-location percentages as `UM[s_code, location] / sum(UM[s_code, *])` for each location with a non-zero UM value. User sees a read-only preview before save. On save, the computed percentages are snapshotted into the profile's `BTCProfileLine` rows; the `s_code` and `um_snapshot_at` fields record provenance.

No inline override of automatic-mode values. To deviate from the UM-driven computation, switch to manual mode (which inherits the current automatic values as starting points).

#### UM refresh

Snapshot at save time. Explicit refresh action — a "Refresh from UM" button on automatic-mode profiles re-snapshots from the current UM matrix and shows a diff preview before commit. UM updates between snapshots do not silently change a profile's effective percentages.

#### Mode change

**Automatic → Manual:** snapshot the current automatic percentages as the new manual baseline; values become freely editable.

**Manual → Automatic:** warning dialog showing the current manual values that will be discarded; user confirms; system replaces with UM-driven values for the chosen S-code.

#### Year rollover

When a new fiscal year is created in CRETA, each entity's BTC profile auto-creates a draft for the new year. Manual-mode profiles inherit values verbatim. Automatic-mode profiles re-snapshot from the new year's UM matrix using the same S-code. The responsible can edit the draft before any charges land in the new year.

#### Copy-distribution-from feature

Three triggers, one mechanic:

1. **Year rollover** — automatic at year creation, source = same entity's prior year.
2. **New profile startup** — user-triggered via "Copy from..." button on a blank profile. Source = a different entity's profile (same or prior year). Searchable picker filterable by type, hierarchy node, region.
3. **Automatic mode snapshot** — triggered on save in automatic mode. Source = computed UM-derived values.

In all three cases, target rows land as freely-editable copies. No coupling between source and target after copy.

#### Profile-required rules

- Required when `to_business_pct > 0`.
- For projects: DoI 2 → DoI 3 gate validates current-year profile exists and sums to 100%.
- For offerings: required at creation.
- For mixed-shape entities (some To-Business, some service-to-service distribution), the BTC profile applies only to the To-Business share.

### User Measurement master

#### Storage

Normalized table per the data model above. ~99 service codes × ~90 charging locations × N quarters per year. Sparse — only non-zero measurement cells are stored.

#### Origin and import (prototype)

CRETA is a read-only consumer of UM data. The prototype provides two import surfaces in the admin module:

1. **CSV upload** — admin selects a year and quarter, uploads a CSV with the measurement matrix. System validates schema and creates a new UM version.
2. **Stubbed "automatic" button** — clickable button labelled "Automatic refresh" with tooltip *"In production, this would call the SAP UM API to refresh values automatically. For the demo, please use the CSV import."* Clicking the button opens an explanatory dialog ("Not connected — this is a prototype demonstration") rather than greying out. Frames the production target without faking the implementation.

The internal storage model is unaffected by which front door is used.

#### Refresh cadence

Prototype: quarterly versioned snapshots. Production cadence to be confirmed with KB. Each import creates a new version; no overwrites.

#### Visibility

Read-visible to all CRETA users (no privacy concern; helps BTC editors reviewing automatic-mode S-code choices). Admin-only import.

#### Matrix viewer

Read-only matrix viewer in the admin module's master data browser. Pick year and quarter, see the full ~99 × 90 matrix with values, totals per row and column, "imported at" badge per cell.

### Charging codes & legal entity mapping

Three distinct masters, none of which conflict with the existing v4 `Location` master (which stays unchanged for workforce planning):

- **Workforce Location** — existing v4 master. 3-character code (MUC, BUD, PUN). Drives FTE-hour calculations.
- **Charging Location** — new in v5. ~90 entries. 3-digit code, name, country, region, division. Used for BTC profile splits and SAP intercompany posting.
- **Legal Entity** — new in v5. ~120 entries. Code, name, country, FK to Charging Location (many-to-one rollup).

The three masters are kept distinct in the data model and in the UI. Hover tooltips on labels disambiguate them everywhere they appear:

- *Workforce Location* — "Where KB people physically work. Drives capacity planning and FTE-hour calculations."
- *Charging Location* — "One of the ~90 charging codes used to allocate IT costs across KB legal entities for SAP intercompany posting."
- *Legal Entity* — "A registered KB company. Multiple legal entities roll up to one Charging Location."

Division, region, and country live on `ChargingLocation` directly for fast rollups. `LegalEntity` carries its own country attribute for the rare cases where an entity charges to a code in a different country (shared-services arrangements).

Rollup mappings (legal entity → charging location) are editable in the admin module with effective-dating, following Cluster D's standard pattern.

### "Charging & Allocations" module (rollup views)

A new top-level module in CRETA's navigation. Four primary surfaces:

#### 1. Inter-service distribution editor

Cross-entity view of all Stage 1 distribution edges. List view with filters (year, version, source entity, destination entity, hierarchy node). Drill into an entity's profile from any row. The same edit surface appears as a per-entity tab on the Workbench — same component, two placements.

#### 2. BTC profile editor

Cross-entity view of all BTC profiles. Filter by year, mode, entity type, hierarchy node. Drill into an entity's profile. The same edit surface appears as a per-entity tab on the Workbench (Cluster E `[E-09]`).

#### 3. Location Cost Rollup views

The view answering Zuzanna's "where do our IT costs land geographically" question. Two complementary visualisations over the same data:

**Map view.** Static SVG world map (no tile-based map service). Bubbles placed at country level by default; click a country to drill into individual charging locations within it. Bubble size = cost magnitude. Bubble color = division. Hover/click reveals a popup with the breakdown of contributing entities. One tile among several in the module — quiet, neutral, not the hero.

**Tree-table view.** Three pre-built rollup paths: Region → Country → Charging Location, Division → Charging Location, Country → Charging Location. Pivot direction toggleable. Cell click drills into entity contributions and upstream chains. Arbitrary cross-tabs available via Report Builder integration (see surface 4).

Time granularity: annual default, quarterly drill-down where supported. No monthly.

#### 4. Report Builder integration

Cluster F exposes its rollup data layer as a queryable source consumed by the existing Report Builder. Dimensions and measures specification:

**Dimensions:** Year, Version (baseline / forecast / actuals / specific scenario), Source entity, Source entity type, Source entity hierarchy node, Source entity cost centre, Source entity responsible, Source entity Change/Run classification, Destination charging location, Destination legal entity, Destination region, Destination division, Destination country, Stage (Stage 1 internal / Stage 2 To-Business / Self-retained), Upstream chain step.

**Measures:** Total cost, Own cost, Inflows, Distributed out (to other entities), Distributed out (to business), Self-retained, Effective cost at destination, Count of contributing entities.

#### Computation strategy

Two-layer cache:

1. Stage 1 effective costs per (year, version) — invalidate on writes to `Distribution` rows or underlying total cost.
2. Stage 2 location totals per (year, version) — invalidate on writes to BTC profiles or to Stage 1 cache.

Filtered/sliced views compute on demand from the cache. What-If scenarios fork the cache lazily — only entities the scenario actually mutates get recomputed.

#### Scenario overlay

**Out of scope for Cluster F.** Scenario comparisons live in the What-If Simulator (Cluster B). Cluster F's views are single-state — they show whatever version the user has selected. The simulator consumes the same data layer to render its scenario comparisons using its own mechanics.

### Workflow integration

#### Project lifecycle (Cluster A)

- DoI 2 → DoI 3 gate: BTC profile required if the project will carry a To-Business cost share. Validated by the Pitch Board approval workflow.
- Profile editable post-gate by the responsible person, audit-trailed.
- Year rollover: auto-creates draft profile from prior year. Responsible edits before the new year's first charges land.

#### Offering lifecycle

- Offering creation: BTC profile required. Validated at the create form.
- Profile editable throughout the offering's lifetime by the responsible.
- Year rollover: same mechanism as projects.

#### Internal service lifecycle

- Internal service creation: distribution profile required (where it sends its cost). BTC profile required only if the service has a To-Business share.
- Same edit and rollover mechanics as offerings.

### Demo data strategy

v5 reconstructs the seed data from scratch to express the v5 data model coherently. The v4 project/service distinction is retired. The v5 seed targets:

- 8–10 projects (including 2–3 in the Run stage with full BTC profiles)
- 5–8 offerings with S-code linkage and BTC profiles (mix of manual and automatic mode)
- 15–20 internal services with realistic Stage 1 distribution graphs (~30–50 distribution edges including multi-step paths)
- All 90 charging locations and ~120 legal entities seeded (most non-zero in any given profile, but the master data is complete)
- A real-shape subset of the UM matrix
- One designated **demo flagship entity** walked end-to-end across every dimension (a fictional offering with realistic cost magnitudes, a complete distribution graph upstream and downstream, an automatic-mode BTC profile with a UM-derived distribution, multi-year forecast, one historical year of actuals, and a documented What-If scenario)

#### Fictionalization scheme

KB has strict data protection rules. The seed retains real WBS structural patterns (`<prefix>-64-<role>[-<LOC>]`) but fictionalizes all KB-confidential identifiers and names: PPM IDs, S-codes, ITF numbers, charging code numbers, legal entity numbers, and KB legal entity names. Real geographic names (countries, cities) are retained. Generic IT service category descriptions ("PDM/PLM Author", "SAP Maintenance & Licenses") are retained as they are not KB-confidential. Existing v4 fictional persona names (Priya Sharma, Anna Meier, Thomas Brenner, Klaus Weber) are reused as responsibles for Run-stage entities.

Hierarchy attachment uses Cluster D's configurable hierarchy — no hardcoded LoB list. The existing 4-LoB structure in the v4 demo (TBS, RVS, Corporate IT, Digital & Data) is the demo-time configuration of that hierarchy, not a Cluster F concept.

### Not in scope for Cluster F

- **Actual SAP postings.** Cluster F emits the data shape SAP needs but does not post to SAP. The handoff is data only.
- **Ledger reconciliation.** Comparing CRETA-computed vs SAP-actual location costs is a future concern, not v5.
- **Multi-currency.** All amounts in € for v5. Currency handling is separate.
- **Audit log mechanics.** Reuse Cluster D's existing audit log infrastructure; no parallel log for Cluster F changes.
- **Editing of UM values inside CRETA.** UM is read-only from CRETA's perspective. v5 supports import only.
- **Hard scenario cap on simulator scenarios touching Cluster F lever 12.** Same as Cluster B's overall position — no hard limit.
- **Multi-step path tracing as a default view.** Available as a drill-down on cell click in the rollup table, not a primary view.
- **Editing of the ~90 charging code list itself in v5.** The list is seeded as master data and can be deactivated or extended via Cluster D's standard activation-date mechanics, but the list is not expected to churn during v5.

### Open questions for Cluster F

- `[F-OQ-01]` — **Blocking.** Where does User Measurement data originate at KB? Who maintains it? What is the production refresh cadence? Affects the import mechanism (API vs file vs manual) and the prototype's stubbed-button tooltip wording. Internal data model is unaffected.
- `[F-OQ-02]` — **Blocking.** Confirm that when an entity distributes <100% of its rolled-up cost, the residual stays as self-retained cost on the entity's own books rather than implicitly going To-Business. Working assumption from controller workshop: self-retained.
- `[F-OQ-03]` — What additional roles need edit access to BTC profiles or distribution rules beyond the responsible + controller default? Affects admin permission defaults pre-configured at install.
- `[F-OQ-04]` — Is "Run Portfolio" the right KB-aligned term for the steady-state portfolio sub-module, or is there a different KB-popular phrasing? Provisional based on KB's "Change/Run" framing being popular internally.
- `[F-OQ-05]` — Is `-64-` truly a constant company-code marker in the WBS structure, or does it vary by region, division, or year? If it varies, the WBS generator needs an extra input. Working assumption: constant.
- `[F-OQ-06]` — How often does the 90-charging-code list change in practice? Informs admin master-data refresh expectations.
- `[F-OQ-07]` — Are BTC templates currently generated from a central master at KB, or maintained as 240+ independent files? Working assumption: central master. Material for the migration story.
- `[F-OQ-08]` — Does Stage 1 ever have multi-step path tracing the user cares about today (informal need vs. formal requirement)? Confirms whether drill-down should be more discoverable than designed.
- `[F-OQ-09]` — For decimal-value UM entries (notably SAP services), are the values raw or already weighted? Currently design-irrelevant — CRETA uses values as given — but worth confirming for documentation.
- `[F-OQ-10]` — What approval / authorisation workflow exists today at KB for changing BTC % or inter-service %? Informs admin permissions configuration defaults.

---

## Cluster D — Admin & Master Data

**Scope:** Complete redesign of the Admin module to support v5's expanded configuration needs. Introduces a two-level navigation structure with five sections, a master data browser with unified entity management, reference catalogues for all admin-managed lookup tables, a workflow template editor for configurable business processes, effective-dated master data changes with second-admin review, a tree GUI for hierarchy assignment, cross-system ID reconciliation, inter-project dependencies, and enhanced access control and audit capabilities.

### Design principles (locked)

- **Configuration over code.** Operational parameters, ranking weights, workflow behaviour, and reference data are admin-configurable without development changes. Structural system concepts (pipeline stages, recomputation triggers) remain hardcoded.
- **Activation-date governance.** All master data changes support optional future-dated activation with mandatory second-admin review. The common case (immediate changes) stays fast; scheduled changes add governance without friction.
- **Deactivation, never deletion.** Master data entities and catalogue entries referenced by existing records are deactivated (hidden from selection, retained on existing records), never deleted. Consistent audit trail preservation.
- **Browse first, then drill.** The master data browser provides a unified entry point. Entity-type-specific detail views are reached through browsing, not through memorising which tab to click.

### Admin module structure & navigation

The v4 admin module's flat tab layout is replaced by a two-level navigation structure with a left sidebar listing five top-level sections. Each section uses the sidebar pattern established by the Report Builder (collapsible left panel with contextual main panel).

**Section 1 — Master Data.** Entity browser, entity management, rate tables, hierarchy (lightweight operating mode). Landing view is the master data browser.

**Section 2 — Reference Catalogues.** All admin-managed lookup tables: Demand Types, Value Streams, Requesting Business Units, Milestone Type Library, Pipeline Stage definitions (read-only), Tech Navigator rubric definitions, Dependency Types, Workflows, Project Type Templates (placeholder — deferred from v5).

**Section 3 — Planning & Ranking Configuration.** Three sub-sections: Planning Parameters, Backlog & Ranking Configuration, Tech Navigator Weights. Settings-card pattern throughout.

**Section 4 — Portfolio Hierarchy.** Full structural configuration: Entity Types, Hierarchies, Grouping Entities, Hierarchy Assignment (tree GUI). Multi-hierarchy editing for preparing inactive hierarchies before activation.

**Section 5 — System.** Access control (user roles, permission flags), Audit Log, Demo Reset (removed in production).

### Master data browser

The master data browser is the landing view for Section 1. It provides unified search-and-browse access to all entity types.

#### Sidebar

A fixed-width collapsible sidebar lists entity types as top-level nodes, each with a count badge:

- Cost Centres (n)
- Competence Centres (n)
- Workforce Locations (n) *(formerly "Locations" — renamed for v5 to disambiguate from Charging Locations)*
- People (n)
- Roles (n)
- Rate Tables
- Hierarchy
- *— v5 additions (Cluster F) —*
- Charging Locations (n) *(the ~90 KB charging codes for SAP intercompany posting)*
- Legal Entities (n) *(the ~120 KB registered companies, each rolling up to one Charging Location)*
- Regions (n) *(small lookup: EU, AP, AM, etc.)*
- Countries (n) *(lookup of country codes used by Charging Locations and Legal Entities)*
- User Measurement *(matrix viewer; admin-only import via CSV or stubbed automatic refresh)*

The sidebar stays at entity-type level — no instance expansion. Instance browsing happens in the main panel.

#### Main panel states

**Landing state (no entity type selected):** Compact overview dashboard showing entity counts, a "recently modified" feed (who changed what, when — scoped to master data), data quality flags (e.g., "3 people have no competence centre assignment," "2 cost centres have no manager"), and a Scheduled Changes panel showing upcoming activation-dated changes pending review.

**Entity type selected:** Filterable, sortable table of all instances. Columns are type-specific. Standard table interactions: column sort, text search, filter chips for categorical fields. Each row has inline edit affordance plus a detail button.

**Entity detail view:** Full panel replacement with back-to-list breadcrumb (not modal, not slide-in). Shows all fields, related entities (e.g., a Cost Centre's assigned people, its competence centre, its location, its rate history), and an entity-scoped audit trail at the bottom.

#### Rate Tables

Rate Tables don't follow the list-of-instances pattern. Clicking "Rate Tables" in the sidebar opens a dedicated matrix view (role × location → rate) with an effective date dimension — the v4 rate table editor model. Rate tables cover internal rates only; external rates are per-project data (per `[A-RM-03]`).

#### Hierarchy (lightweight mode)

Clicking "Hierarchy" shows the currently active hierarchy as an interactive tree. Supports two operations only: (1) add/rename/deactivate grouping entities within the existing structure (right-click context menu), and (2) reassign projects across grouping entities (drag-and-drop or "Move to…" action with confirmation dialog). Single-parent assignment enforced. A "Configure hierarchy structure →" link bridges to Section 4 for structural changes. Does not support hierarchy switching or multi-hierarchy editing — those live in Section 4.

### Master data entity model (v5 evolution)

#### Cost Centres

v4 fields retained: code, description, manager, location, competence centre, delegate. v5 adds: cross-system identifiers section (generic key-value pattern), active/inactive flag with effective dating.

#### Competence Centres

v4 fields retained. v5 adds: formal code field (separate from name), description (text), lead/owner (explicit named field), cross-system identifiers, active/inactive flag with effective dating.

#### Workforce Locations *(formerly "Locations")*

The v4 master, retained for workforce planning. v4 fields retained: code (3-char), name, hours per FTE (default 1850). v5 adds: country, timezone, currency, cross-system identifiers, active/inactive flag with effective dating.

**Renamed in v5** from "Locations" to "Workforce Locations" to disambiguate from the new Charging Locations master introduced by Cluster F. The two are deliberately separate entity types — see Charging Locations below.

#### Charging Locations *(new in v5 — Cluster F)*

The ~90 KB charging codes used for SAP intercompany posting of IT costs. Distinct from Workforce Locations.

Fields: code (3-digit numeric), name, country (FK to Countries lookup), region (FK to Regions lookup), division, active/inactive flag with effective dating, cross-system identifiers.

Resolves `[D-OQ-01]`: Charging Locations are a **separate entity type** from Workforce Locations, not a unified model with type classification. Both masters coexist; both are accessible from the master data browser.

#### Legal Entities *(new in v5 — Cluster F)*

The ~120 KB registered companies. Each Legal Entity has a many-to-one rollup to a Charging Location. Fields: code, name, country (own country attribute, may differ from the parent Charging Location's country in shared-services arrangements), FK to Charging Location, active/inactive flag with effective dating.

Effective-dated rollup mapping changes follow Cluster D's standard pattern.

#### Regions and Countries *(new in v5 — Cluster F lookups)*

Small lookup masters for clean labels and consistent rollup grouping. Regions: code, name, sort order (EU, AP, AM, etc.). Countries: ISO code, name. Both consumable as FKs from Charging Locations and (for Country) from Legal Entities.

#### User Measurement *(new in v5 — Cluster F)*

Read-only matrix viewer. Year/quarter selector at top, ~99 services × ~90 charging locations matrix. Read-visible to all CRETA users; admin-only import. Import surfaces:

1. **CSV upload** — admin selects year and quarter, uploads a CSV. System validates schema and creates a new versioned snapshot.
2. **Stubbed "automatic" import button** — clickable, opens an explanatory dialog ("Not connected — this is a prototype demonstration") with tooltip *"In production, this would call the SAP UM API to refresh values automatically. For the demo, please use the CSV import."*

Versioned snapshots, no overwrites. Each import creates a new version visible in the version dropdown.

#### People

v4 fields retained: name, cost centre, competence centre, active/inactive. v5 adds:

- **Role assignments** — one or more roles from the global Roles catalogue. Each assignment carries: role reference, allocation percentage (must sum to 100% across all assignments), primary flag (one role marked as primary for compact display contexts), effective dates (role assignments are schedulable).
- **Employment type** — internal employee or external contractor.
- **Location** — explicit, independent of cost centre's administrative location.
- **Manager** — reference to another Person entity. Used for escalation workflows.
- **Start date / end date** — employment period. Supports temporal capacity calculations and planned departures.
- **Cross-system identifiers** — SAP personnel number, AD username, etc.

People and Users are separate but linked entities. A Person is a master data entity (name, cost centre, roles, capacity data). A User is a system access entity (login credentials, CRETA role, permission flags). Not every Person is a User; not every User maps to a Person. A User has an optional foreign key to a Person. People are managed in Section 1 (Master Data); Users are managed in Section 5 (System). The Simulator Tier 3 permission flag (`[D-13]`) lives on the User entity.

#### Roles

Decoupled from cost centres in v5. Roles are defined globally and assigned to cost centres or competence centres through relationships, not owned by a single cost centre. Fields: code, name, role category (grouping level for reporting rollups), job role, specialization, description, active/inactive flag, cross-system identifiers. Role detail view shows current internal rates across all locations (read-only reference from the rate table).

### Effective dating mechanics

All master data changes support an optional activation date. Default behaviour (saving without specifying a date) applies the change immediately (activation date = today). A calendar affordance on the save action allows scheduling for a future date. Activation dates are today-or-future only — no retroactive scheduling. Past corrections are immediate edits with audit trail notation.

#### Scheduled changes model

Each master data entity has a current record (live state), a scheduled changes queue (pending future-dated changes), and a change log (audit trail of applied changes). No full temporal table — current state plus audit history is sufficient. Rate tables are the exception (see below).

Scheduled change states:

1. **Pending Review** — created by first admin, awaiting second-admin approval
2. **Approved** — second admin approved, waiting for activation date
3. **Activated** — activation date arrived, change applied to current record
4. **Rejected** — second admin rejected, returned to scheduling admin with comments
5. **Cancelled** — scheduling admin withdrew the change before activation

All five states are visible in the entity's detail view under a "Scheduled Changes" section, and in the global Scheduled Changes panel on the browser landing page.

#### Daily activation job

A daily job (or admin-configured time) applies pending changes whose activation date has arrived and whose review status is Approved. All users see the same state at the same time.

#### Impact propagation

Scheduled master data changes that affect capacity or cost calculations flag the next forecast cycle with a "master data has changed" notification, prompting PLs to review their resource plans. Propagation affects forecast data only, not actuals.

#### Rate effective dating

Rate changes use a layered model. Approval gates (second-admin review) control whether a rate change is legitimate. Effective dates control when the rate applies to financial calculations. Both mechanisms apply. The system picks the most recent rate whose valid-from date ≤ the calculation period. Rate changes do not create table-level versions — individual cells are changed independently, each with its own effective date, tracked in the change log.

#### Expiry dates

Expiry dates (temporary changes that auto-revert, using valid-from/valid-to range model) are deferred from v5. Activation dates only.

### Cross-system ID reconciliation

Each entity type has an **External IDs** section in its detail view containing key-value pairs: system name + external identifier. The list of available external systems is a reference catalogue entry in Section 2 — the admin defines which systems CRETA maps to (SAP FI-CO, SAP PPM, ServiceNow, Jira, Boost, etc.) and which entity types each system applies to. Extensible without schema changes.

Reconciliation is surfaced through data quality flags on the browser landing page ("X entities have no SAP mapping," "Y entities have duplicate external IDs"). No dedicated reconciliation workflow in v5 — the admin sees gaps and fixes them through entity detail views.

### Reference catalogues

All admin-managed lookup tables grouped under Section 2, organized into four tiers by complexity.

#### Tier 1 — Simple lists

**Demand Types** (`[D-08]`), **Value Streams** (`[D-09]`), **Requesting Business Units** (`[D-10]`). Flat catalogues: name, optional short code, active/inactive flag, display order. Inline-editable tables with add-row, drag-to-reorder, and active/inactive toggle. No detail view needed. Changes are immediate with standard audit logging — no activation-date scheduling required.

#### Tier 2 — Enriched lists

**Milestone Type Library** (`[D-04]`): name, default colour (colour picker), suggested ordering, visual indicator for MilestoneStrip rendering. Table view with accordion-style row expansion for attribute editing.

**Dependency Types** (from `[D-12]`): name, type code (finish-to-start, start-to-start, finish-to-finish, start-to-finish), constraint semantics description, lag/lead offset support flag. Same accordion-expansion pattern.

Activation-date scheduling with second-admin review applies to Tier 2 changes.

#### Tier 3 — Structured reference content

**Tech Navigator rubric definitions** (`[D-03]`): dedicated matrix editor. Rows are sub-criteria grouped by dimension (Complexity, Value Creation). Five columns for score levels 1–5, each cell containing rubric text. Sub-criterion weights displayed for reference but edited in Section 3 (Planning & Ranking Configuration). The two reserved Value Creation slots visible in disabled state with a note pointing to Section 3 for activation.

Activation-date scheduling with second-admin review applies to Tier 3 changes.

#### Tier 4 — Project Type Templates

**Project Type Templates** (`[D-05]`): entire feature deferred from v5, both admin surface and consumption point. Placeholder entry in the Reference Catalogues sidebar ("Project Type Templates — coming soon"). No data model, no admin UI, no project-creation integration in v5.

#### Pipeline stage definitions

Pipeline stages appear as a **read-only reference view** in Section 2. Admin can see all stages, their DoI mappings, backlog membership rules, and envelope consumption behaviour. Admin can configure display labels (CRETA working names vs. KB canonical names) and per-stage colour coding. Admin cannot add, remove, or reorder stages — stages are system-defined.

### Workflow Template Editor

Each of CRETA's business processes is represented as a predefined workflow template — a fixed sequence of steps that the admin cannot structurally rearrange, but where each step exposes configurable touchpoints.

#### Configurable touchpoints per step

- **Required or skippable** — toggle a step between active and disabled; disabled steps are skipped during execution
- **Participant roles** — who performs this step (default assignments can be adjusted)
- **Data gates** — fields or completeness criteria required before step completion (DoI gate pattern)
- **Notifications** — who is notified on step start, overdue, and completion (email, in-app, or both)
- **Time constraints** — per-phase deadlines or open-ended
- **Escalation actions** — what happens on missed deadlines (from a predefined set: reminder, escalation to manager, etc.)

#### Configurable workflows in v5

1. **Forecast cycle** — five-phase: cycle opens, retrospective acknowledgment, forecast editing, review, acceptance
2. **Intake / pipeline progression** — Proposed → Under Evaluation → Approved, including AI Council and Pitch Board governance gates
3. **Change Request** — submission → review → approval/rejection
4. **Send Back** — controller requests changes → PL revises → resubmission
5. **Milestone baseline override** — request → review → audited approval
6. **Scheduled master data activation** — creation → second-admin review → activation

Additional workflows can be added in future versions.

#### Editor UX

Vertical step visualization (card stack): each step is a card showing step name, type (action/review/gate/notification), and configuration summary. Clicking a card expands it to reveal configurable touchpoints. Visual flow context without graph-editor complexity. Listed under a "Workflows" entry in the Reference Catalogues sidebar.

Workflow configuration changes use activation-date scheduling with second-admin review. Changes are scheduled for cycle boundaries to avoid disrupting in-flight workflow instances. In-flight instances continue under their original configuration.

### Planning & Ranking Configuration

Section 3 is organized into three sub-sections, all using a settings-card pattern: parameters grouped into cards, displayed read-only by default, "Edit" action switches to edit mode, save is a discrete audited event.

#### Sub-section 1: Planning Parameters

| Parameter | Source | Notes |
|---|---|---|
| Fiscal year start month | v4 | Anchors all calendar logic |
| Total planning horizon | `[D-07]` / Cluster C | e.g., 36 months. Controls forecast grid length |
| Granularity boundary | `[D-06]` / Cluster C | e.g., 12 months. Monthly zone vs. quarterly zone split |
| Rolling forecast cadence | `[D-02]` / Cluster A+C | Monthly (every 1 month), quarterly (every 3 months), or custom (every N months). Must be regular and periodic. |
| Cycle due day | New | Calendar day within the month by which forecast submissions are due. Workflow phase deadlines derive backward from this date. |
| RAG thresholds | v4 | Red/amber/green boundaries for budget and timeline variance |

#### Sub-section 2: Backlog & Ranking Configuration

| Parameter | Source | Notes |
|---|---|---|
| Ranking formula axis weights | `[A-BK-04]` | Default 70/30 (Value Creation / Complexity). Must sum to 100. |
| Tie-breaking criteria | `[A-BK-06]` | Ordered list. Positions 1–2 fixed (composite score, DoI ascending). Additional criteria drag-and-drop from pool: budget, submission date, pipeline stage. |
| Cutoff line display mode | `[A-BK-10/11]` | Both lines (reality + should-be) or single. Default: both. |
| T-shirt size budget thresholds | `[D-11]` | XS/S/M/L/XL boundaries. Working defaults per `[A-OQ-09]`. |
| Primary backlog horizon | `[A-BK-12]` | 12 months — window over which cutoff lines are calculated. |

Total available budget is displayed read-only in this sub-section. The edit point is in the Backlog module where the controller sets it operationally. Budget change impact preview (cutoff line shift, affected projects) is a Backlog module UX concern.

Recomputation triggers (`[A-BK-14]`) are hardcoded system behaviour, not admin-configurable.

#### Sub-section 3: Tech Navigator Weights

| Parameter | Source | Notes |
|---|---|---|
| Complexity sub-criterion weights | `[A-TN-03]` | Standardization 40%, Usage 40%, Maintenance 20%. Must sum to 100%. |
| Value Creation sub-criterion weights | `[A-TN-04]` | Financial benefit 50%, Payback 40%, Competitive advantage 10%. Must sum to 100%. |
| Reserved Value Creation slots | `[A-TN-05]` | Two slots at 0% weight, shown disabled in v5. Activation is future-version. |

Weight changes trigger a preview panel showing top projects that would change rank position and new cutoff line positions before the admin confirms.

All parameter changes across all three sub-sections support activation-date scheduling with second-admin review.

### Portfolio Hierarchy & Tree GUI

The v4 four-layer hierarchy model is retained: Entity Types, Hierarchies, Grouping Entities, Hierarchy Assignment. Single-parent project assignment (`ADM-01`) remains in force.

#### Tree GUI

The Hierarchy Assignment sub-tab is replaced by an interactive tree GUI.

**Left panel — hierarchy tree.** Expandable/collapsible nodes, each showing name, entity type (subtle label), project count, and aggregated budget rollup from assigned projects. Root level shows top-tier grouping entities.

**Right panel — assignment workspace.** Context-sensitive: shows assigned projects when a node is selected (name, ID, pipeline stage, budget, ranking score per project), shows unassigned projects when nothing is selected. Search bar finds projects across the system regardless of current assignment.

**Assignment operations:** Drag-and-drop from workspace to tree node, drag within the tree to reassign, bulk move via checkboxes + "Move to…" tree picker. All reassignments show confirmation dialog ("Move Project X from [old parent] to [new parent]?").

#### Multi-hierarchy editing

The tree GUI works on any hierarchy, not just the active one. A hierarchy selector dropdown at the top lets the admin switch between hierarchies. The active hierarchy is marked with a badge but not privileged in editability.

Projects can have different assignments in different hierarchies. Each hierarchy maintains its own independent project-to-node mapping. When the active hierarchy switches, portfolio views, budget rollups, and reporting dimensions switch accordingly. Old hierarchy assignments are preserved for historical reporting.

The unassigned projects list is hierarchy-scoped — when editing an inactive hierarchy, it shows all projects not yet assigned in that hierarchy. A progress indicator ("142 of 200 projects assigned") tracks population completeness.

**"Copy assignments from…"** action on inactive hierarchies populates from another hierarchy's assignments as a starting point.

#### Hierarchy activation preview

Mandatory before switching the active hierarchy. Shows: number of assigned and unassigned projects, which projects are unassigned, budget rollup structure changes. System blocks activation or forces explicit acknowledgment if unassigned projects exist above a configurable threshold.

#### In-tree entity management

Right-click a tree node to: add child entity (creates a new grouping entity in context under the selected parent), rename entity, deactivate entity. Grouping Entities sub-tab remains available for bulk management.

#### Hierarchy comparison

Side-by-side view of two hierarchies showing which projects change position. Lower priority — included in spec but may be deferred in implementation if time is tight.

#### Data quality indicators

Subtle warning icons on tree nodes with anomalies (e.g., total project budgets exceeding planned capacity, zero assigned projects). Expanding the node reveals the specific issue.

#### Relationship to browser hierarchy view

The browser's hierarchy view (`[D-NAV-04]`) shows only the active hierarchy for day-to-day operations. Multi-hierarchy editing lives exclusively in Section 4. "Configure hierarchy structure →" link bridges from browser to Section 4.

#### Activation-date governance

Hierarchy changes (project reassignments, structural changes, hierarchy activation) support activation-date scheduling with second-admin review. A pending hierarchy switch is surfaced as a visible banner in both the Section 4 tree GUI and the browser's hierarchy view.

### Access control & permissions

#### Role model

Four roles retained for v5: Controller, Project Lead (PL), Cost Centre Owner (CC Owner), Executive. No custom permission profiles or generic permission engine.

**Controller:** Full read/write across all modules. Backlog management (approve, reject, send back). Forecast cycles (initiate, review, accept). Admin module full access. Simulator: create, edit, compare, promote. Tier 3 access if permission flag is set.

**Project Lead:** Workbench full edit on own projects. Backlog full visibility, edit own projects only. Forecast submit/edit own projects. Simulator: create, edit, compare, apply-to-forecast for own projects. No promote. No admin access. Tier 3 access if permission flag is set.

**CC Owner:** Capacity Management full visibility, confirm resource assignments on own cost centre. Read-only on Workbench (projects drawing from their cost centre), Backlog, Portfolio. Simulator: read-only access to published scenarios. No admin access.

**Executive:** Full read-only across all modules. Simulator: create, edit, compare. No promote. No admin access. Tier 3 access if permission flag is set.

#### Permission flags on the User entity

- **Tier 3 permission** (`[D-13]`) — boolean controlling access to sensitive simulator surfaces (people master data, rate tables, capacity parameters, restructuring bulk actions). Independent of role.
- **Change reviewer permission** — boolean for Controllers only. Controls whether a Controller can approve scheduled master data changes as the second-admin reviewer. Not all Controllers are automatically change reviewers.

Users and permissions are managed in Section 5 (System).

#### Cluster F edit permissions configuration *(new in v5)*

Per-entity-type role permission configuration for BTC profile edits and inter-service distribution edits. The system ships with a default of "responsible owns + controller override (audit-trailed)". Admins can extend the defaults to grant additional roles edit access. Configuration matrix per role × per Cluster F entity type:

| Role × entity type | Project | Offering | Internal Service |
|---|---|---|---|
| Responsible | Edit (default ON) | Edit (default ON) | Edit (default ON) |
| Controller | Edit override (default ON, audit-trailed) | Edit override (default ON, audit-trailed) | Edit override (default ON, audit-trailed) |
| Cost Centre Owner | Off (default) — admin-configurable | Off (default) — admin-configurable | Off (default) — admin-configurable |
| LoB / hierarchy node owner | Off (default) — admin-configurable | Off (default) — admin-configurable | Off (default) — admin-configurable |

Configured in Section 5 (System) alongside Tier 3 and change reviewer flags. Open question `[F-OQ-03]` will inform the shipped defaults.

### Inter-project dependencies

#### Data model

A dependency is a directed relationship between two projects:

| Field | Description |
|---|---|
| Predecessor project | The project that must reach a certain point |
| Successor project | The project that depends on the predecessor |
| Dependency type | From Reference Catalogue: finish-to-start, start-to-start, finish-to-finish, start-to-finish |
| Lag/lead offset | Optional. Days or months. Positive = successor waits; negative = successor can start early |
| Constraint strength | Soft only in v5. System warns on conflict; controller decides. No auto-blocking. |
| Notes | Free text explaining the rationale |
| Created by, date, active/inactive | Standard audit fields |

Consistent with the design principle: "ranking supports decisions, does not make them." Hard constraints (auto-blocking) are deferred.

#### Entry points

**Project detail view:** In the Backlog module's project detail (`[A-BK-19]`), a Dependencies section shows both predecessor and successor relationships. PL and Controller can add dependencies.

**Portfolio dependency map:** Read-only network/graph visualisation in the Portfolio module showing all dependency relationships. Surfaces dependency chains, circular dependency flags, and critical path clusters. Editing happens in project detail, not on the map.

#### Validation

Circular dependency prevention: system validates on save that adding a dependency does not create a cycle. Circular dependencies are blocked with a clear error message showing the chain.

#### Simulator consumption

The What-If Simulator (Cluster B) surfaces dependency conflicts when a predecessor's timeline shifts in the sandbox. Automatic cascade rescheduling is deferred — the simulator flags the conflict; the user resolves it manually.

### Audit log enhancement

v4 audit log foundation retained (who, what, when, old value, new value). Three v5 enhancements:

**1. Categorised entries.** Audit events categorised for filtering: master data changes, configuration changes, hierarchy changes, forecast actions, pipeline transitions, simulator events, access control changes, scheduled change lifecycle. Category filter on the audit log view.

**2. Entity-scoped audit trails.** Each entity's detail view shows its own change history — a filtered view of the global audit log scoped to that entity. Same data, no additional storage.

**3. Export and retention.** Exportable (CSV/Excel) for compliance and external review. Indefinite retention, no pruning — consistent with CRETA audit philosophy. Audit analytics are not a feature of the audit log; audit-based reporting is a Report Builder concern.

#### Demo Reset

Remains in Section 5 (System). Removed when CRETA moves to production. No design changes.

### Not in scope for Cluster D

- **Custom permission profiles / generic permission engine.** Four roles plus Tier 3 and change reviewer flags are sufficient. Additional roles added in future versions if needed.
- **Expiry dates on master data changes.** No valid-from/valid-to range model. Activation dates only.
- **Hard dependency constraints.** No auto-blocking of successor projects. Soft constraints (warnings) only.
- **Auto-rescheduling of successor projects from dependency conflicts.** Simulator flags conflicts; users resolve manually.
- **Audit log analytics or dashboards.** Audit-based reporting is a Report Builder concern.
- **Project Type Templates.** Full feature deferred (both admin surface and consumption point).
- **Global vendor rate table for external rates.** External rates are per-project in v5.
- **Multi-parenting in hierarchy.** Single-parent assignment retained.
- **Pipeline stage structural editing.** Stages are system-defined. Admin configures labels and colours only.
- **Freeform/calendar-based forecast cycle scheduling.** Cadence must be regular and periodic.
- **Retroactive activation dates.** Past corrections are immediate edits with audit notation. Scheduled changes are today-or-future only.
- **Recomputation trigger configuration.** Backlog recomputation triggers are hardcoded system behaviour.

### Open questions for Cluster D

- `[D-OQ-01]` — ~~Are Operate-stage cost allocation destinations the same entity type as CRETA Locations (unified model with type classification), or a separate entity type?~~ **Resolved (2026-04-28):** Separate entity types. The v4 `Location` master is renamed to `Workforce Location` and stays unchanged. Two new masters introduced via Cluster F: `ChargingLocation` (~90 KB charging codes, used for SAP intercompany posting) and `LegalEntity` (~120 KB registered companies, with many-to-one rollup to Charging Location). All three coexist as distinct entity types in the master data browser.

---

## Cluster E — UI Restyling

**Scope:** Comprehensive UI refresh covering the Workbench Overview tile grid, Launchpad redesign with role-personalized dashboards, the new Progress vs. Burn chart, Portfolio module project detail rework, external cost/vendor detail view (new surface), and cross-module visual consistency alignment. Editing surfaces (Forecast & Planning, Change History) remain unchanged.

**v5 extension (April 28, 2026):** Cluster E adds three Cluster F-related UI surfaces:
- A new top-level "Charging & Allocations" module in the navigation pattern established by Cluster D.
- A Workbench tile (BTC summary) and a Workbench tab (BTC profile editor + per-entity rollup) on every chargeable entity that has a To-Business cost share.
- The Portfolio module restructures into two sub-modules: **Change Portfolio** (transformation entities) and **Run Portfolio** (steady-state entities — DoI 5 projects + offerings + internal services).

### Design principles (locked)

- **Tiles are navigation cards, not dense data panels.** Each tile shows a headline metric or compact visual and acts as an entry point to a deeper view. The user scans and clicks, not analyses in place.
- **Role personalization drives the Launchpad.** Different roles see different tile sets, different KPIs, and different navigation targets. The Launchpad answers "what needs my attention" for each role specifically.
- **Progress tracking is milestone-anchored.** Qualitative progress is grounded in the milestone framework rather than being an abstract percentage, connecting progress signals to project structure.
- **Visual consistency comes from shared components, not identical layouts.** Modules have different information architecture needs; consistency is achieved through shared header bars, tab components, card types, sidebar patterns, and badge vocabularies rather than uniform page layouts.

### E-01: Rename ProjectPhase → ProjectMilestone

Purely a terminology change throughout backend and frontend to eliminate collision with the Pipeline Stage concept introduced in Cluster A. Implementation is straightforward find-and-replace plus test updates. The editable-milestones feature itself is scoped to Cluster A, not Cluster E, because it requires API and model work.

### E-02: Milestone strip cosmetic extension

When a project has entered the Hyper-maintenance or Operate pipeline stages, the timeline milestone strip can optionally extend past the final milestone with a solid-colour continuation to visually communicate the project's current lifecycle position. Purely a rendering enhancement, low priority.

### E-03: Portfolio module project detail view rework

Replace the current slide-in summary panel with a full-page detail view with back button, consistent with the Backlog module's full-page pattern (`[A-BK-19]`). The tab structure is tailored to portfolio health monitoring context, distinct from the Backlog's scoring and gate assessment tabs.

**Four tabs:**

1. **Overview** — tile grid content from the Workbench Overview rendered in a linear read-only layout: project header, three-point summary, progress vs. burn chart, milestone status, cost mix.
2. **Financial detail** — three-point comparison table with mixed-granularity columns (monthly in near zone, quarterly in outer zone, per Cluster C) and the variance waterfall chart. Read-only for all roles.
3. **Resources & costs** — resource plan summary (FTE by cost centre) and external cost breakdown by category and vendor. Read-only.
4. **History** — forecast version history (cycle and CR labels), CR history, and progress tracker history showing how progress percentage and confidence evolved over time.

**Navigation:** Back button returns to the Portfolio Dashboard preserving scroll position and filter state. Hierarchy breadcrumb (LoB → Programme → Project) visible at the top of the detail view.

### E-04: Workbench Overview tile grid

The Workbench Overview tab is redesigned from a vertical scroll of full-width components to a 3×3 tile grid. Each tile is a clickable action card displaying a summary metric and linking to a detailed view.

**Layout:** 3×3 grid within the workspace panel (right side of the master-detail layout). The project list sidebar remains unchanged on the left. All tiles are equal-sized action cards.

**Tile positions and navigation targets:**

**Row 1:**

| Position | Tile | Content | Click target |
|---|---|---|---|
| 1,1 | Project header | Name, status badge, RAG dot, pipeline stage, DoI level, type badge, budget t-shirt size | — (identity card, no navigation) |
| 1,2 | Three-point summary | Baseline total, forecast total, actuals YTD, plan drift %, execution variance % | Forecast & Planning tab. Expanded view includes variance waterfall (baseline → CRs → rate changes → current forecast). |
| 1,3 | Milestone status | Current milestone name, progress bar (segments per milestone, filled/current/upcoming), next milestone date | Milestone detail view |

**Row 2:**

| Position | Tile | Content | Click target |
|---|---|---|---|
| 2,1 | Resource plan | Total FTEs, top contributing cost centres with FTE counts, utilization indicator | Forecast & Planning tab (resource view) |
| 2,2 | Cost mix | CapEx/OpEx donut with percentages, internal vs. external cost ratio badges | Cost breakdown view |
| 2,3 | Progress tracker | Current milestone name, intra-milestone progress bar with percentage, most recent status narrative, next-milestone confidence indicator | Progress history view |

**Row 3:**

| Position | Tile | Content | Click target |
|---|---|---|---|
| 3,1 | External costs | Total external spend, mini stacked bar by category (consulting, cloud, licenses, etc.), category legend | Vendor detail view (new surface, E-08) |
| 3,2 | Forecast health | Current version number and type (cycle/CR), last submission date, next cycle due date, on-track/overdue status badge | Version history view |
| 3,3 | Tech navigator | Compact 2D scatter (Value Creation × Complexity) with project dot highlighted among portfolio peers, composite scores displayed | Portfolio Backlog (scrolled to this project) |

### E-05: Progress vs. Burn chart and variance waterfall

#### Progress vs. Burn chart

Replaces the v4 trajectory chart as the primary project-level chart. Provides a value-alignment signal by comparing project progress against budget consumption, anchored to the milestone timeline.

**X-axis:** Time (monthly), with milestone boundaries drawn as vertical zone dividers. Each zone is labelled with the milestone name and subtly shaded. Zones reflect actual calendar time per milestone, not equal widths.

**Three lines:**

1. **Cumulative progress (0–100%)** — derived from the progress tracker. Between milestone boundaries, the line moves according to the PL's reported intra-milestone percentage. Milestone completion advances the line to the next anchor point (e.g., completing milestone 3 of 7 ≈ 43%). Creates a stepped-but-smooth curve.
2. **Cumulative budget consumed (0–100% of total forecast)** — derived from actuals. Purely financial.
3. **Baseline planned burn rate (0–100%)** — lighter reference line from the original baseline forecast.

**Insight model:** When progress and burn lines track closely, spending aligns with delivery. Budget ahead of progress indicates overspend relative to delivery. Progress ahead of budget indicates efficient delivery. The gap between lines at any point is the value alignment signal. The baseline reference provides the planned-pace comparison.

**Milestone markers:** Completed milestones get solid vertical markers, the current milestone gets a highlighted marker, future milestones get dashed markers. All are labelled.

**Version context:** Clicking any point on the timeline shows which forecast version was active at that moment and the forecast-at-completion at that point. Contextual, not a full version overlay.

**Data availability constraint:** For projects predating v5 or without progress data, only the burn line is shown. The progress line starts from the first reported value. No backfilling.

**Tile integration:** The Workbench Overview tile (position 2,3 — Progress Tracker) shows a sparkline preview of this chart — two lines with the gap visible. Clicking opens the full chart with milestone zones, baseline reference, and drill-down.

#### Progress tracking system

Milestone-anchored qualitative progress tracking with optional deliverable enrichment. All fields are live-editable (not gated to forecast cycles). Snapshots are taken at each forecast cycle for versioned history.

**Core fields (per project):**

1. **Intra-milestone progress** — percentage estimate of how far through the current milestone. Resets to 0% when advancing to the next milestone. When deliverable checklist items exist, auto-computed from checklist completion (e.g., 4 of 6 = 67%) but manually overridable.
2. **Status narrative** — free-text, one to two sentences. Mandatory during forecast cycle submission. Describes current state in the PL's own words.
3. **Next milestone confidence** — three values: on track, at risk, or blocked. If at risk or blocked, a brief reason is required (one line).

**Optional deliverable checklist:**

Each milestone can carry a short deliverable checklist (max 10 items per milestone). Items are free-text, PL-defined (e.g., "API integration complete," "UAT sign-off received"). The PL checks items off as they are completed — this happens live, outside the forecast cycle. When deliverables exist, the intra-milestone progress percentage auto-computes from checklist completion but the PL can override manually if the checklist doesn't tell the full story. When no deliverables are defined, the percentage is purely manual.

**Portfolio-level visibility:** Progress data is visualized in the Backlog and Portfolio module views as an inline indicator: compact progress bar with percentage and next-milestone confidence dot (green/amber/red using the distinct confidence shape per `[E-07g]`). Not a filterable or sortable dimension.

#### Variance waterfall

Accessed as the expanded detail view behind the three-point summary tile. Shows a bridge chart illustrating how the project's forecast total moved from baseline through a sequence of changes to the current forecast. Grouping by change category (scope CRs, rate changes, resource changes). Clickable bars drill into individual CR details.

### E-06: Launchpad redesign

Complete redesign of the Launchpad as a role-personalized operational dashboard. Three-zone layout with role-specific KPI tile grids.

#### Zone 1 — Header (slim, always visible)

Greeting line with user name and role. Current date and forecast cycle status (e.g., "Cycle Q2-2026 — 8 days until submission deadline"). Replaces the animated CRETA acronym expansion.

#### Zone 2 — Action strip

Pending actions redesigned as a compact horizontal strip of action cards (replacing the vertical list). Each card shows action type (approve intake, review CR, submit forecast, confirm resource request), the project or entity name, and time pending. Sorted by urgency. Clicking navigates directly to the relevant surface. If no pending actions, the zone collapses to a single line: "No pending actions."

#### Zone 3 — KPI tile grid (role-personalized)

Tile grid with role-appropriate summary cards. Tile counts are role-flexible; the grid wraps naturally. Every tile links to a specific module surface. Every module accessible to the role has at least one tile pointing to it.

#### Access model changes for Launchpad coverage

Two access model changes ensure every role's tile set covers their full module access:

**PL capacity visibility:** PL gains read-only access to Capacity Management via a new view showing role-level availability by location and time period, aggregated without individual names. No access to the full My Team or Organization Overview surfaces. This supports forecast planning and new project scoping.

**CC Owner simulator expansion:** CC Owner can create scenarios but can only modify resources within their own cost centre. Cannot modify budget, timeline, Tech Navigator scores, or other CCs' resources. Published scenario viewing remains read-only as per `[D-AC-04]`. This enables capacity "what-if" modelling within the CC Owner's domain.

**PL simulator access:** PL can view published scenarios and use "Apply to forecast" per `[B-PR-05]` to pre-populate forecast cycle submissions with own-project diffs. No scenario creation or promotion.

#### Project Lead — 7 tiles

| # | Tile | Content | Click target |
|---|---|---|---|
| 1 | My projects summary | Project count by status (active, planned, intake pending), mini RAG distribution bar | Portfolio Backlog (filtered to my projects) |
| 2 | My budget position | Aggregate baseline/forecast/actuals across my projects, plan drift % | Reporting — Programme/Multi-Project Rollup (filtered to my projects) |
| 3 | My progress overview | Progress percentage and confidence per project, flags for at-risk/blocked | Workbench — Overview tab (worst-performing project) |
| 4 | My forecast status | Submission status per project this cycle, days until deadline | Workbench — Forecast & Planning tab (first unsubmitted project) |
| 5 | Recent changes | Latest CRs submitted/approved, latest forecast version changes | Workbench — Change History tab |
| 6 | Scenario explorer | Published scenarios relevant to my projects, apply-to-forecast availability | What-If Simulator — PL view |
| 7 | Resource availability | Role-level capacity availability by location and time period | Capacity Management — PL read-only view |

#### Controller — 9 tiles (3×3)

| # | Tile | Content | Click target |
|---|---|---|---|
| 1 | Portfolio KPIs | Total budget, YTD spend, forecast-at-completion, plan drift, active project count | Portfolio Dashboard |
| 2 | Pipeline summary | Project count by pipeline stage, horizontal funnel | Portfolio Backlog |
| 3 | Budget vs. cutoff | Available budget, pre-funded (Type 3) consumption, ranked consumption, headroom | Portfolio Backlog — cutoff line view |
| 4 | Reporting | Recently generated reports, saved views, quick-report shortcut | Reporting — landing page |
| 5 | Forecast cycle tracker | X of Y projects submitted, outstanding projects listed, days until deadline | Workbench — Forecast & Planning tab (first unsubmitted project) |
| 6 | Pending reviews | Combined count of intake approvals, CR approvals, scheduled master data changes, with direct links | Portfolio Backlog (Under Evaluation filter) / Admin (Scheduled Changes panel) |
| 7 | Capacity overview | Org-wide utilization, hotspots by cost centre | Capacity Management — Organization Overview tab |
| 8 | Scenario activity | Active/published scenarios, headline impact summaries | What-If Simulator — Scenario Manager |
| 9 | Admin & data quality | Scheduled changes pending review, data quality flags | Administration — Master Data browser landing page |

#### CC Owner — 8 tiles

| # | Tile | Content | Click target |
|---|---|---|---|
| 1 | Team utilization | Current month utilization %, mini heatmap showing 3-month trend | Capacity Management — My Team tab |
| 2 | Open resource requests | Pending request count and urgency | Capacity Management — Request Management tab |
| 3 | My team headcount | FTE count, allocation split (project work vs. available) | Capacity Management — My Team tab (person drill-down) |
| 4 | Cost centre budget | My CC budget position, actual vs. plan | Reporting — Cost Center Financial Summary |
| 5 | Portfolio overview | Portfolio-level KPIs and project health summary | Portfolio Dashboard |
| 6 | My CC's projects | Projects consuming my team's capacity, progress/RAG summary | Workbench (filtered to projects involving my CC) |
| 7 | Published scenarios | Scenarios shared with me, impact on my CC | What-If Simulator — read-only published scenarios |
| 8 | CC capacity simulator | My own capacity scenarios, resource modelling within my CC | What-If Simulator — CC-scoped scenario creation |

#### Executive — 7 tiles

| # | Tile | Content | Click target |
|---|---|---|---|
| 1 | Portfolio KPIs | Total budget, YTD spend, forecast-at-completion, plan drift | Portfolio Dashboard |
| 2 | Investment mix | Run/Change ratio, CapEx/OpEx split, by LoB or transformation level | Portfolio Dashboard — charts view |
| 3 | Pipeline health | Funnel visualization, intake velocity | Portfolio Backlog — read-only |
| 4 | Top risks | Projects with amber/red RAG, stalled progress, significant plan drift | Portfolio Dashboard — filtered view |
| 5 | Scenario activity | Active/published scenarios, headline impact summaries | What-If Simulator |
| 6 | Budget trajectory | Portfolio-level burn rate trend, projected year-end position | Reporting — Year-over-Year Comparison |
| 7 | Strategic backlog | Ranked project list with cutoff lines, Tech Navigator cube summary | Portfolio Backlog — ranked view |

### E-07: Cross-module visual consistency

Alignment rules bringing all modules into visual consistency with each other and with patterns introduced in Clusters D and E.

#### Navigation patterns

1. **Module header bar** — consistent across all modules: module name on the left, contextual actions on the right, uniform height and styling.
2. **Tab component** — shared component used wherever a module has tabs (Workbench, Portfolio, Capacity, Reporting): same size, active/inactive treatment, and position (top of workspace area, below module header).
3. **Sidebar pattern** — any module using a sidebar follows the Cluster D Admin pattern: same width, item styling, and collapse behaviour. Applies to the Workbench project list sidebar and the Admin section sidebar.

#### Card types (application-wide)

Three standardized card types used across all modules:

1. **Summary card** — compact, coloured background (using `--color-background-secondary` or semantic variants), no border. For KPI metrics. Used in tile grids and KPI strips.
2. **Surface card** — white background (`--color-background-primary`), subtle border (`--color-border-tertiary`). For content containers. Used in admin settings cards, detail panels, simulator impact tiles.
3. **Action card** — surface card with hover state and click affordance. For navigation. Used in Launchpad tiles, Workbench Overview tiles, pending action items.

#### Detail view pattern

Full-page detail view with back button and breadcrumb is the universal drill-down pattern. No slide-in panels anywhere in the application. Applies to Backlog project detail (`[A-BK-19]`), Portfolio project detail (E-03), and Admin entity detail (Cluster D browser).

#### Empty and loading states

Consistent empty state treatment across all modules: illustration or icon + explanatory text + action button. Consistent loading skeleton pattern across all modules.

#### Status badge and indicator vocabulary

| Status type | Visual treatment |
|---|---|
| Pipeline stages | Configurable per-stage colours, defined in `[D-CAT-06]` |
| RAG indicators | Coloured dots (green/amber/red) |
| DoI levels | Neutral numeric badges (grey family) — DoI is progression, not status |
| Forecast cycle states | Semantic-colour badges (submitted = green, pending = amber, overdue = red) |
| Confidence indicators (progress tracker) | Distinct shape (diamond or triangle) to differentiate from RAG dots, using green/amber/red |
| Workflow and activation states | Semantic-colour text badges (Pending Review = amber, Approved = blue, Activated = green, Rejected = red, Cancelled = grey) |

### E-08: External cost / vendor detail view

Dedicated surfaces for external cost analysis at both project level (Workbench) and portfolio level (Portfolio module). Currently external costs are embedded as line items inside the Forecast & Planning grid, making isolated analysis difficult. E-08 provides vendor-centric and category-centric views of external spend.

#### External cost category taxonomy

External cost categories are admin-configurable master data, managed in the Admin module alongside existing entities (Locations, Roles, Cost Centres, etc.) using the standard Cluster D browser pattern (CRUD with search, breadcrumb navigation, audit logging).

**Default set for demo:** Consulting, Cloud/Infrastructure, Licenses, Hardware, Other.

**Production expectation:** Category taxonomy would be seeded from SAP/Ariba data. The configurable approach allows KB to extend or restructure categories without code changes.

#### Project-level view — Workbench "External costs" tab

Fourth Workbench tab alongside Overview, Forecast & Planning, and Change History. Project-scoped — shows vendor and external cost analysis for the selected project.

**Section 1 — Summary strip:**

Four KPI summary cards (horizontal row, using the standard summary card pattern per `[E-07d]`):

- Total external spend (current forecast)
- Actuals YTD
- Plan drift (external costs only)
- External share of total project budget (percentage)

**Section 2 — Vendor table:**

One row per vendor engaged on the project.

| Column | Content |
|---|---|
| Vendor name | Vendor entity name |
| Category | External cost category (consulting, cloud, etc.) |
| Contracted/forecast | Total forecast amount for this vendor |
| Actuals YTD | Year-to-date actuals |
| Remaining forecast | Forecast minus actuals |
| Variance | Deviation from baseline or prior version |

Sortable by any column. Clicking a vendor row expands inline to show the individual line items from the F&P grid that belong to that vendor — description, monthly amounts, and the standard three-point values (baseline, forecast, actuals). This is the same data as the F&P grid, reorganised with vendor as the primary grouping dimension.

**Section 3 — Category breakdown:**

Visual rollup by category — horizontal stacked bar or category cards showing total spend per category with vendor composition within each. Clicking a category filters the vendor table (Section 2) to that category only. A "Clear filter" action restores the full view.

#### Portfolio-level view — Portfolio module "External spend" tab

New tab within the Portfolio module. Cross-project vendor analysis surface for controllers.

**Section 1 — Portfolio external spend KPIs:**

Four summary cards (same pattern as project-level):

- Total external spend across all projects (current forecast)
- Actuals YTD (portfolio-wide)
- Forecast-at-completion (external costs only)
- External share of total portfolio budget (percentage)

**Section 2 — Vendor summary table:**

One row per vendor across the entire portfolio.

| Column | Content |
|---|---|
| Vendor name | Vendor entity name |
| Project count | Number of projects engaging this vendor |
| Total forecast | Aggregate forecast across all projects |
| Actuals YTD | Aggregate year-to-date actuals |
| Remaining | Aggregate remaining forecast |
| Top project | The project consuming the most from this vendor |

Sortable by any column. Clicking a vendor row expands to show the project-by-project breakdown — how much each project is spending with this vendor, with per-project forecast, actuals, and variance.

**Section 3 — Category analysis:**

Portfolio-level category rollup with the same visual treatment as the project-level category breakdown but aggregated across all projects. Optionally includes a trend view showing how external spend by category has evolved across forecast cycles (cycle-over-cycle comparison).

**Section 4 — Project × vendor matrix:**

Cross-tab view with vendors as columns and projects as rows (or vice versa), cell values showing forecast amounts. Power-user view for controllers who need the full picture at once. Rendered as an expandable section (collapsed by default) to avoid overwhelming the primary view.

#### Cascading updates from E-08

- **Workbench Overview tile** (`[E-04b]`, position 3,1 — External Costs): click target updated from "vendor detail view" to the new External Costs tab.
- **Portfolio detail Resources & Costs tab** (`[E-03e]`): external cost breakdown section pulls from the same data structure that powers the portfolio-level External Spend view.

### E-09: Workbench tile and tab for BTC profile *(new — Cluster F integration)*

Each chargeable entity (project, offering, internal service) gains a BTC summary tile on the Workbench Overview and a dedicated BTC tab in the Workbench. This makes the Cluster F engine discoverable from the place project leads work daily.

#### BTC Workbench tile

A new tile in the Workbench Overview tile grid, scoped to the entity. Displays:

- The entity's To-Business total for the current year (€ amount or "No business charging" state for entities distributing entirely to other services or self-retained)
- A tiny visualization of where the cost lands — top 3 charging locations with percentage bars
- A "+ N more" link revealing the rest of the profile in the BTC tab

Tile size and position match other Workbench Overview tiles. For entities without a To-Business share, the tile shows "No business charging — costs distribute internally" with a link to the inter-service distribution view.

#### BTC Workbench tab

A new tab on every chargeable entity's Workbench, alongside Overview, F&P, Change History, and (for projects) External Costs. Three sections:

1. **Profile editor** — manual or automatic mode. For automatic mode: read-only preview of UM-driven percentages with S-code link and refresh action. For manual mode: add-only list editor with searchable charging-location picker and sum-to-100 validation. Mode-switch UX per Cluster F. Copy-distribution-from action available.

2. **Allocation breakdown** — per-charging-location allocation amount in € for the current fiscal year, sortable by location name, region, division, percentage, or absolute amount. Drill-down to legal entity level on click.

3. **Audit history** — chronological list of profile changes with who/what/when/old/new, scoped to this entity's BTC profile. Renders the standard CRETA audit log component filtered to this entity.

For internal services that have no To-Business share but distribute fully to other services, the tab displays a Stage 1 distribution editor instead — the same edit component used in the Charging & Allocations module's inter-service distribution editor, scoped to this entity.

### E-10: Charging & Allocations module navigation entry *(new — Cluster F integration)*

The new top-level "Charging & Allocations" module is added to the application navigation pattern. Module placement: after the Portfolio module, before the Capacity Management module in the main navigation. Visible to all roles by default; admin can configure per-role visibility through the standard role configuration mechanism.

The module follows the established left-sidebar pattern (Cluster D admin precedent, Cluster E `[E-07c]`):

- Sidebar lists four primary surfaces: Inter-service Distribution, BTC Profiles, Location Cost Rollup (with Map and Table sub-views), and a "Reporting" section linking to the Report Builder with Cluster F's data layer pre-selected.
- Each surface uses the standard module header bar (`[E-07a]`), tab component (`[E-07b]`), card types (`[E-07d]`), and full-page detail pattern (`[E-07e]`).
- Hover tooltips on the three location-related labels (Workforce Location, Charging Location, Legal Entity) follow the pattern locked in Cluster F — tooltip combines a short definition with what the entity is used for.

### E-11: Portfolio module restructure into Change/Run sub-modules *(new — Cluster F integration)*

The existing Portfolio module restructures into two sibling sub-modules sharing common module-level navigation but maintaining separate dashboards, KPIs, and entity lists.

#### Change Portfolio sub-module

Holds entities currently in transformation: projects in DoI 0–4. Inherits the existing Portfolio module's dashboards, KPIs, project detail views, dependency map, and external spend tab. The Backlog ranking surfaces (Cluster A) remain accessible from this sub-module.

#### Run Portfolio sub-module *(replaces the deferred "Operate Portfolio" placeholder)*

Holds entities currently in steady-state operation: projects in DoI 5, all offerings, and all internal services. Single unified entity list with type filter (Project / Offering / Internal Service) at the top. Type-aware columns: identifier (PPM/S-code/ITF), responsible, total annual running cost, To-Business percentage, primary charging-location distribution summary, termination date (where applicable).

Per-entity drill-down lands on the Workbench, where the BTC tile and tab (`[E-09]`) provide the per-entity view. Run Portfolio dashboards expose:

- **Run Portfolio KPIs** — total annual cost across all run-stage entities, To-Business vs internal vs self-retained breakdown, count by entity type
- **By-region / by-division / by-country rollups** — embedded panels from Cluster F's Location Cost Rollup, scoped to Run Portfolio entities
- **Outsourcing ratio for the Run Portfolio** — same metric concept as the existing Change Portfolio's outsourcing ratio, scoped here

#### Module navigation

A sub-module switcher appears at the top of the Portfolio module — two pill buttons (Change / Run) sharing module-level navigation but otherwise behaving as independent sub-modules. The user's last-selected sub-module persists across sessions.

### Not in scope for Cluster E

- **Typography, spacing scales, or colour palette changes.** These are established in the branding system and do not require Cluster E changes.
- **Forecast & Planning tab redesign.** The two-zone layout (monthly/quarterly) is specified in Cluster C. No additional visual changes.
- **Change History tab redesign.** Remains unchanged.
- **Capacity Management module redesign.** The new PL read-only view is a scoped addition, not a redesign of existing CC Owner and Controller capacity surfaces.
- **Reporting module visual changes.** No changes beyond the standard report additions already specified in Cluster C (Forecast Version Comparison report).
- **Simulator workspace visual changes.** The simulator workspace design is specified in Cluster B. No additional visual changes beyond CC Owner scoped access.

### Open questions for Cluster E

- `[E-OQ-01]` — Milestone detail view: is this a new dedicated view or a filtered state of an existing surface? If new, where does it live — fifth Workbench tab, or a sub-view within the Overview tab? Working assumption: sub-view accessible from the milestone tile.
- `[E-OQ-02]` — Version history view: same question as E-OQ-01. Working assumption: sub-view accessible from the forecast health tile.
- `[E-OQ-03]` — ~~External cost / vendor detail view: full design deferred (E-08). Project-level placement (fourth Workbench tab vs. sub-view) and portfolio-level placement to be determined.~~ **Resolved** — fourth Workbench tab at project level, new Portfolio module tab at portfolio level. External cost categories are admin-configurable master data.

---

## Cross-cluster dependencies

- **Cluster A → Cluster D:** Backlog & Ranking Configuration admin section (`[D-01]`) and rolling forecast cadence parameter (`[D-02]`) must be implemented before or alongside the backlog module, since the backlog depends on configurable ranking weights and recomputation triggers. *(Addressed — `[D-PRC-05]` and `[D-PRC-03]` cover these.)*
- **Cluster A → Cluster B:** Long-term sustainability analysis is deferred to the What-If Simulator. The simulator needs access to backlog ranking data and out-year forecasts to model multi-year budget impact. *(Addressed — Cluster B impact dimension 7 covers long-term running cost projections, and dimension 2 covers backlog ranking impact.)*
- **Cluster C → Cluster A:** DoI gate definitions for DoI 2 and DoI 3 have been updated in Cluster A to reflect the forecast grid at DoI 3 and rough external cost estimates at DoI 2. *(Applied — no longer a pending dependency.)*
- **Cluster C → Cluster D:** Granularity boundary (monthly zone length) and total planning horizon are new admin-configurable parameters in Planning Parameters. Forecast cycle cadence (`[D-02]`) drives horizon advancement and version creation. *(Addressed — `[D-PRC-02]` places all three parameters in Planning Parameters sub-section.)*
- **Cluster C → Cluster B:** The What-If Simulator operates on versioned forecast data and respects the mixed-granularity model. Scenarios are anchored to specific forecast cycle versions. Sandbox forecast grids show the same monthly/quarterly zone split as the real system. *(Addressed — scenario anchor model and sandbox grid design incorporate Cluster C versioning and granularity.)*
- **Cluster B → Cluster D:** The simulator requires the Tier 3 permission flag (`[D-13]`) to be admin-configurable per user. Inter-project dependencies (`[D-12]`) are a data model enhancement that the simulator will consume for cascade rescheduling when available. *(Addressed — `[D-AC-02]` covers Tier 3 on the User entity; `[D-AC-05]` covers the dependency data model.)*
- **Cluster B → Cluster A:** The simulator's backlog sandbox is a full replica of the Backlog module. Implementation of the simulator's ranking impact dimension depends on the Backlog module's ranking engine and cutoff line calculation being available as a callable service.
- **Cluster D → Cluster A:** Workflow Template Editor (`[D-CAT-07]`) governs the forecast cycle, intake, CR, and Send Back workflows that Cluster A's backlog and pipeline mechanics depend on. Workflow templates should be configured before or alongside Cluster A implementation.
- **Cluster D → Cluster B:** The simulator consumes dependency data (`[D-AC-05]`) and respects Tier 3 permission flags (`[D-AC-02]`). CC Owner read-only simulator access (`[D-AC-04]`) extends the simulator's audience beyond the three roles defined in Cluster B.
- **Cluster D → Cluster E:** Admin module navigation structure (`[D-NAV-01]`) and master data browser landing page (`[D-NAV-05]`) introduce UI patterns that Cluster E aligns with during restyling. *(Addressed — `[E-07c]` adopts Admin sidebar pattern; `[E-07a]` standardizes header bar; `[E-07d]` codifies card types.)*
- **Cluster E → Cluster D:** CC Owner simulator scope expanded from read-only to CC-scoped creation (`[E-06b]`), updating `[D-AC-04]`. PL gains read-only capacity access (`[E-06a]`), requiring a new aggregated view in Capacity Management.
- **Cluster E → Cluster A:** Progress tracking system (`[E-05b]`) adds new per-project fields (intra-milestone progress, status narrative, next-milestone confidence, optional deliverable checklist) that integrate with the milestone framework from Cluster A and are snapshotted during forecast cycles.
- **Cluster E → Cluster C:** Progress vs. Burn chart (`[E-05a]`) consumes forecast version data from Cluster C's versioning model. Variance waterfall (`[E-05c]`) consumes CR history.
- **Cluster E → Cluster B:** PL simulator access (`[E-06c]`) and CC Owner scoped creation (`[E-06b]`) extend the simulator's audience and require scoped access controls beyond what Cluster B originally defined.
- **Cluster F → Cluster A:** Cluster F provides the polymorphic `ChargeableEntity` model and the engine for post-launch cost allocation. Cluster A's `[A-PL-02]` placeholder is resolved by Cluster F. The Run Portfolio sub-module (`[E-11]`) consumes Cluster F's data layer for entity lists and per-entity drill-down. The DoI 2 → DoI 3 gate validates the existence and 100% sum of a current-year BTC profile when the project carries a To-Business cost share.
- **Cluster F → Cluster B:** Cluster F provides the data layer consumed by simulator lever 12 (cost allocation rules), now widened to cover both Stage 1 distribution and Stage 2 BTC across all chargeable entity types. Mutation lives in the simulator sandbox; Cluster F's editors only modify live data. *(Addressed — lever 12 description widened, `[B-OQ-01]` updated.)*
- **Cluster D → Cluster F:** Cluster D hosts the new master data entities required by Cluster F (`ChargingLocation`, `LegalEntity`, `Region`, `Country`, `UserMeasurement`) plus the per-entity-type role permission configuration that governs Cluster F edit access. Cluster F also consumes the existing configurable hierarchy (Cluster D `[D-NAV-04]` and the Section 4 hierarchy editor) without introducing a parallel concept. *(Addressed — Cluster D master data section extended, permissions configuration added.)*
- **Cluster F → Cluster D:** Cluster F's permission requirements drove the addition of per-entity-type role permission configuration in Cluster D. `[D-OQ-01]` is resolved by Cluster F's three-master decision (Workforce Location, Charging Location, Legal Entity as separate entity types). The User Measurement matrix viewer is a new admin module sub-view consuming Cluster F's UM data.
- **Cluster F → Cluster E:** Cluster F drives three Cluster E additions: the new Charging & Allocations top-level module (`[E-10]`), the new Workbench tile and tab for BTC profiles (`[E-09]`), and the Portfolio module restructure into Change/Run sub-modules (`[E-11]`). All three follow Cluster E's established UI patterns (`[E-07a]` through `[E-07g]`).
- **Cluster F (cross-cluster) → Seed reconstruction:** v5 reconstructs the seed data from scratch to express the v5 data model coherently across all clusters, retiring the v4 project/service distinction. This is a cross-cluster implementation deliverable, sequenced after schema work in all clusters and before frontend work that depends on data presence. The seed expresses the polymorphic ChargeableEntity model, the configurable hierarchy from Cluster D, and the demo flagship narrative from Cluster F.

---

## Decisions log

| Tag | Decision | Date |
|---|---|---|
| `[A-TN-01]` | Tech Navigator profiles apply to all projects regardless of status or type | 2026-04-13 |
| `[A-TN-02]` | Y-axis "Complexity" score is inverted in meaning: higher score = simpler/better. Retain KB terminology in the UI. | 2026-04-13 |
| `[A-TN-03]` | Complexity sub-criterion weights: Standardization 40%, Usage 40%, Maintenance and support 20% | 2026-04-13 |
| `[A-TN-04]` | Value creation sub-criterion weights: Financial benefit 50%, Payback 40%, Competitive advantage 10% | 2026-04-13 |
| `[A-TN-05]` | Two additional Value creation criteria slots reserved in the data model at 0% weight, not surfaced in UI | 2026-04-13 |
| `[A-TN-06]` | All Tech Navigator weights are admin-configurable but global at KB level, not per-LoB | 2026-04-13 |
| `[A-TN-07]` | Transformation level is a self-assessed categorical value: T0, T1, or T2 | 2026-04-13 |
| `[A-TN-08]` | Project Type (1/2/3) determines prioritization treatment; type 3 (legal/compliance/security/lifecycle) is exempt from the cutoff and funded off the top of the budget | 2026-04-13 |
| `[A-TN-09]` | Budget t-shirt size is derived automatically from the project's approved budget; thresholds are admin-configurable and global | 2026-04-13 |
| `[A-PRI-01]` | The Tech Navigator score ranks projects; it does not automatically act on them. The cutoff line is for visibility only. Humans decide cancellation, descoping, or overrun. | 2026-04-13 |
| `[A-PRI-02]` | In-flight projects that fall below the cutoff are flagged, not auto-cancelled. The decision is supported by the What-If Simulator. | 2026-04-13 |
| `[A-PRI-03]` | DoI is a switching-cost signal separate from the ranking score. It informs cancellation decisions, not rank order. | 2026-04-13 |
| `[A-PRI-04]` | The backlog uses two cutoff lines on a unified ranked list: a reality line (what is active) and a should-be line (what would be active given pure Tech Navigator ranking and budget envelope). The gap between them is the misalignment zone. | 2026-04-13 |
| `[A-PRI-05]` | The Backlog is its own module in CRETA, distinct from Portfolio. | 2026-04-13 |
| `[A-PS-01]` | Pipeline Stage is a globally-defined KB-wide concept. Every project carries exactly one stage from a fixed set. | 2026-04-13 |
| `[A-PS-02]` | Pipeline stages for v5: CRETA uses working names (Proposed, Under Evaluation, Approved, Active, Hyper-maintenance, Operate, Retired, Paused, Cancelled). KB canonical names now confirmed: Evaluate, Assess (PoC), Assess (Business Case), Integrate, Manage, Scale. | 2026-04-13 |
| `[A-PS-03]` | ~~DoI is a linear maturity scale for on-path stages, numbered 1–7.~~ *Superseded by `[A-DOI-01]`: DoI range is 0–5.* Paused and Cancelled are off-path stages without their own DoI digit; they carry a frozen reference to the DoI held when the project left the main path. | 2026-04-13 |
| `[A-PS-04]` | DoI functions as a data completeness gate in addition to a stage/progress label. Specific field-to-DoI mappings are deferred (see `[A-OQ-04]`). | 2026-04-13 |
| `[A-PS-05]` | Approved stage consumes the budget envelope. Baseline is created at approval. | 2026-04-13 |
| `[A-PS-06]` | Approved projects carry a dynamic `within_cutoff` flag, recomputed on every rebalancing event. The flag is not a separate stage. | 2026-04-13 |
| `[A-PS-07]` | Auto-activation: an Approved project transitions to Active at its planned launch date if `within_cutoff == true`. If `within_cutoff == false`, the controller is notified and must explicitly decide the next step. | 2026-04-13 |
| `[A-PS-08]` | Manual override: controller can activate an Approved project at any time regardless of launch date or cutoff status. | 2026-04-13 |
| `[A-PS-09]` | Hyper-maintenance is a distinct on-path stage between Active and Operate. It is manually planned, adjustable, and terminable per project. It has no separate budget bucket in v5; spend rolls up under project budget. | 2026-04-13 |
| `[A-PS-10]` | Paused and Cancelled are distinct stages. Paused is reversible; Cancelled is nearly one-way (un-cancel is an audited explicit override). | 2026-04-13 |
| `[A-PS-11]` | Stage transitions can move backwards. The system does not enforce monotonic progression. | 2026-04-13 |
| `[A-PS-12]` | Operate-stage projects do not appear in the main ranked backlog. They sit in the Run Portfolio sub-module of the Portfolio module (renamed from "Operate Portfolio" in the 2026-04-28 spec update — see `[A-PL-07]` and `[E-11]`). | 2026-04-13 |
| `[A-PS-13]` | The v4 intake queue and CR Approvals flow will not be retrofitted onto the new pipeline. Intake is rewritten from scratch in the backlog mechanics design. | 2026-04-13 |
| `[A-MS-01]` | Rename `ProjectPhase` → `ProjectMilestone` throughout backend and frontend. Terminology-only, no behaviour change from the rename itself. | 2026-04-13 |
| `[A-MS-02]` | Milestones become first-class editable objects with new CRUD API endpoints. Editable at project creation and throughout project life. | 2026-04-13 |
| `[A-MS-03]` | Milestone baseline dates are immutable after first save. Only forecast dates are freely editable by the PL. Baseline edits require an explicit audited controller override. | 2026-04-13 |
| `[A-MS-04]` | Projects may have zero milestones. Zero-milestone projects continue to render the timeline strip gracefully as in v4. | 2026-04-13 |
| `[A-PL-01]` | Projects do not transform into Services at Run phase. Running costs are tracked on the project itself throughout the Operate stage. | 2026-04-13 |
| `[A-PL-02]` | Post-launch cost allocation distributes running costs across geographic destinations (~100 possible). Allocation is project-level, not per forecast line. | 2026-04-13 |
| `[A-PL-03]` | Working assumption: cost allocation only applies at the Operate stage, not during Active or Hyper-maintenance. To be confirmed with KB colleagues (`[A-OQ-03]`). | 2026-04-13 |
| `[A-PL-04]` | Each project has an optional termination date for its Operate stage. Empty means the project runs indefinitely until explicit retirement. | 2026-04-13 |
| `[A-BK-01]` | Backlog membership: Proposed, Under Evaluation, Approved, Active, and Paused projects appear in the backlog. Hyper-maintenance, Operate, Retired, and Cancelled are excluded. Active projects are interleaved by score with pre-flight projects. | 2026-04-17 |
| `[A-BK-02]` | Hyper-maintenance budget is committed overhead, deducted from the available envelope before the ranking competition begins (same treatment as type 3 projects). | 2026-04-17 |
| `[A-BK-03]` | Paused projects appear in the backlog at their score-based position with a Paused badge. They are not demoted to the bottom of the list. | 2026-04-17 |
| `[A-BK-04]` | Ranking score is a configurable weighted sum: `(w₁ × Value Creation) + (w₂ × Complexity)`. Default weights: 70/30. Formula and weights subject to KB confirmation (`[A-OQ-06]`). | 2026-04-17 |
| `[A-BK-05]` | Transformation level (T0/T1/T2) is a visual decorator and filter dimension. It does not factor into the ranking score. | 2026-04-17 |
| `[A-BK-06]` | Tie-breaking: (1) composite score descending, (2) DoI ascending (hardcoded), (3) additional configurable criteria from admin (available: budget, submission date, pipeline stage). | 2026-04-17 |
| `[A-BK-07]` | Backlog & Ranking Configuration is a dedicated sub-section in the Admin module, separate from Planning Parameters. | 2026-04-17 |
| `[A-BK-08]` | Each project in the backlog displays: composite ranking score, individual Complexity score, individual Value Creation score, and Transformation level. | 2026-04-17 |
| `[A-BK-09]` | Contestable envelope = Total available budget − Type 3 project spend − Hyper-maintenance committed spend. Total available budget is set by the controller in the Backlog & Ranking Configuration admin section. | 2026-04-17 |
| `[A-BK-10]` | Should-be cutoff line: walk ranked list top-to-bottom in pure score order, accumulating budget until contestable envelope is exhausted. Projects above the line are within the envelope. | 2026-04-17 |
| `[A-BK-11]` | Reality cutoff line: accumulate budgets of currently committed projects (Approved with `within_cutoff == true` + Active) in their ranked positions. Gap between reality and should-be lines is the misalignment zone. | 2026-04-17 |
| `[A-BK-12]` | Primary horizon is 12 months using accurate monthly forecast data. The two cutoff lines operate on this horizon. | 2026-04-17 |
| `[A-BK-13]` | Long-term sustainability is a summary-level indicator (KPI/banner), not a second set of cutoff lines. Detail-level multi-year analysis deferred to What-If Simulator (Cluster B). | 2026-04-17 |
| `[A-BK-14]` | Recomputation triggers: new project enters backlog, Tech Navigator scores change, project budget changes, total available budget changes, pipeline stage changes, type 3 or Hyper-maintenance budget changes, rolling forecast cycle completion. | 2026-04-17 |
| `[A-BK-15]` | Pre-approval budget consumption for Proposed and Under Evaluation projects uses an estimated/requested budget field entered during intake (not yet baselined). | 2026-04-17 |
| `[A-BK-16]` | Backlog module has two toggle-switched views: Ranked List (default) and Tech Navigator Cube. | 2026-04-17 |
| `[A-BK-17]` | Cutoff lines are rendered as visual bands (not thin lines) spanning the full table width, each containing a one-sentence explanation of what it represents. Jump buttons allow navigation directly to each band. | 2026-04-17 |
| `[A-BK-18]` | Type 3 projects are shown in a separate "Pre-funded" section above the ranked list, collapsed/hidden by default. Section header shows summary (project count, total pre-funded budget) even when collapsed. | 2026-04-17 |
| `[A-BK-19]` | Project detail is a full-page view with back button (not a slide-in panel). Four tabs: Scores & Ranking, Financial Overview, Master Data, Milestones. | 2026-04-17 |
| `[A-BK-20]` | Master Data tab shows all project fields with filled/unfilled distinction relative to the current DoI level, functioning as a DoI-aware completeness checklist. | 2026-04-17 |
| `[A-BK-21]` | Tech Navigator Cube is an interactive 3D scatter (X: Value Creation, Y: Complexity, Z/colour: T-level, bubble size: budget t-shirt, ring colour: Type). Click opens full-page project detail. | 2026-04-17 |
| `[A-BK-22]` | Filters affect visibility only, never cutoff line calculation. Cutoff lines always reflect the full portfolio. If a cutoff band falls in a filtered-out zone, the jump button still works with a contextual note. | 2026-04-17 |
| `[A-BK-23]` | Filter dimensions: pipeline stage, type, transformation level, LoB, budget t-shirt size, score range, `within_cutoff` toggle. | 2026-04-17 |
| `[A-BK-24]` | Sort override: controller can temporarily re-sort by any column. Custom sort is visually marked. Cutoff positions remain score-based. "Reset to ranking" button restores default. | 2026-04-17 |
| `[A-BK-25]` | Role access: Controller has full read/write. PL has full backlog visibility but can only edit own projects. Executive and CC Owner have full read-only visibility. | 2026-04-17 |
| `[A-BK-26]` | Intake is handled within the backlog — no separate intake queue view. The controller filters to "Under Evaluation" to see their review queue in full portfolio context. The v4 Intake Queue tab in the Portfolio module is deprecated. | 2026-04-17 |
| `[A-BK-27]` | Controller actions on Under Evaluation projects: Approve (→ Approved, creates baseline), Send Back (→ Proposed with "Changes Requested" status and comments), Reject (→ Cancelled, requires reason and confirmation). | 2026-04-17 |
| `[A-BK-28]` | Controller cannot freely edit Tech Navigator scores or master data on other people's projects. Send Back is the standard correction mechanism. Controller override edits are possible as an audited exception (same pattern as baseline overrides). | 2026-04-17 |
| `[A-BK-29]` | Diff view carries over from v4: when a project is sent back and resubmitted, the project detail shows before/after comparison of what changed. | 2026-04-17 |
| `[A-BK-30]` | DoI gate requirements are working definitions (subject to KB confirmation per `[A-OQ-04]`). Gates are enforced as validation checks with controller-audited override capability. | 2026-04-17 |
| `[A-BK-31]` | Zero milestones is valid at DoI 0, DoI 1, and DoI 2. From DoI 3 onward, at least one milestone is required (overridable by controller). | 2026-04-17 |
| `[A-BK-32]` | DoI 3 gate requires milestone breakdown defining major execution phases with baseline dates, in addition to complete Tech Navigator profile, budget breakdown, resource plan, and project timeline. | 2026-04-17 |
| `[A-BK-33]` | ~~DoI 4 gate requires detailed 12-month monthly forecast plus rough quarterly forecast for periods beyond 12 months, and named resource assignments confirmed by CC Owners.~~ *Superseded by `[A-DOI-08]` and `[A-DOI-09]`: forecast grid moved to DoI 3; named resource assignments moved to DoI 3→4 gate.* | 2026-04-17 |
| `[A-BK-34]` | Milestone Type Library: admin-managed global catalogue of available milestone types (name, default colour, suggested ordering). Default set includes Planning, Requirements & Analysis, Development, Testing/QA, UAT, Pilot, Rollout, Data Migration, Training/Change Management, Hyper-maintenance. | 2026-04-17 |
| `[A-BK-35]` | Per-project milestone selection: PL picks from the library and assigns dates. Not all types required; ordering is flexible. | 2026-04-17 |
| `[A-BK-36]` | Project Type Templates (optional, nice-to-have): pre-populated milestone sets based on project Type or Tech Navigator profile. Suggestions only, not enforcement. Not a v5 requirement. | 2026-04-17 |
| `[C-FG-01]` | Storage grain is always monthly. No quarterly storage entity. Mixed granularity is a UI/entry concern only. | 2026-04-21 |
| `[C-FG-02]` | Entry UI shows monthly columns inside the boundary, quarterly buckets outside. PLs can optionally expand a quarterly bucket to edit individual months. | 2026-04-21 |
| `[C-FG-03]` | Quarterly entry distributes equally across three constituent months (floor division, cent remainder to month 3). | 2026-04-21 |
| `[C-FG-04]` | Boundary default is 12 months from current period, admin-configurable in Planning Parameters (global, not per-project). | 2026-04-21 |
| `[C-FG-05]` | Rolling horizon shift is purely a display change. Auto-distributed values are already stored as monthly — no data transformation as months cross the boundary. | 2026-04-21 |
| `[C-FG-06]` | Forecast cycle operates on both zones in a single unified pass. No separate quarterly planning cycle. | 2026-04-21 |
| `[C-FG-07]` | Each monthly value carries an `is_provisional` flag, set to `true` when system-generated (quarterly distribution, DoI 2 prepopulation, copy-from-project), cleared to `false` on manual edit. Zone-independent. | 2026-04-21 |
| `[C-FG-08]` | Cells with `is_provisional == true` display a visual provenance marker with tooltip. Single visual treatment regardless of source. Marker clears on manual edit. | 2026-04-21 |
| `[C-RH-01]` | Horizon boundary advances only when a new forecast cycle is initiated, not on a calendar basis. Stays in sync with planning cadence. | 2026-04-21 |
| `[C-RH-02]` | Total planning horizon is admin-configured. Fixed-length rolling window — quarterly zone shrinks at near edge as boundary advances, does not auto-extend at far edge. | 2026-04-21 |
| `[C-RH-03]` | Copy-from-project: PL can populate a new project's forecast grid from an existing project. One-time snapshot, no live link. All copied values marked `is_provisional == true`. | 2026-04-21 |
| `[C-RH-04]` | DoI 2 rough quarterly plan prepopulates the full forecast grid — internal resource lines and external cost lines. Values distributed equally (divide-by-3) and marked `is_provisional == true`. | 2026-04-21 |
| `[C-RH-05]` | Forecast grid is a DoI 3 artifact, not DoI 4. Controller needs to see forecast before approval creates baseline. Cluster A DoI gate definitions to be updated accordingly. | 2026-04-21 |
| `[C-FV-01]` | Forecast cycles are synchronized company-wide. All projects update in the same cycle window. Cadence set by controllers/leadership, admin-configured. | 2026-04-21 |
| `[C-FV-02]` | Each completed forecast cycle produces a portfolio-wide version — one snapshot per project, all at the same cycle boundary. | 2026-04-21 |
| `[C-FV-03]` | CRs can be processed between cycles and produce interim project-level versions. Next synchronized cycle captures post-CR state. Subject to KB confirmation (`[C-OQ-01]`). | 2026-04-21 |
| `[C-FV-04]` | Version numbering is sequential per project (v1, v2, v3…). Metadata: sequence number, type (`cycle`/`cr`), timestamp, cycle/CR reference, accepting user. | 2026-04-21 |
| `[C-FV-05]` | Every project receives a new version at each cycle completion, even if no values changed. Portfolio snapshots are always complete. | 2026-04-21 |
| `[C-FV-06]` | Version snapshots capture complete monthly forecast grid plus `is_provisional` flags. Baseline and actuals are not versioned. | 2026-04-21 |
| `[C-FV-07]` | All versions retained indefinitely. No pruning policy. | 2026-04-21 |
| `[C-VC-01]` | Workbench Overview trajectory chart: version overlay deferred — chart is being replaced. | 2026-04-21 |
| `[C-VC-02]` | Workbench Overview three-point comparison: "FC Version" dropdown column added. Table: Baseline \| FC Version [selected] \| Current Forecast \| Actuals with variance columns. | 2026-04-21 |
| `[C-VC-03]` | Workbench FC & Planning tab: version selector at top of grid. Prior version selected shows per-cell delta indicators. Prior version data read-only, current forecast editable. | 2026-04-21 |
| `[C-VC-04]` | Portfolio Dashboard: cycle-over-cycle comparison mode. Select two cycles, see aggregate forecast delta by LoB/programme/project with drill-down. | 2026-04-21 |
| `[C-VC-05]` | Report Builder: "Forecast Version" added as dimension in the semantic layer. Historical version data queryable in custom reports. | 2026-04-21 |
| `[C-VC-06]` | Standard Reports: new report #6 — Forecast Version Comparison. Two-cycle/version selection, project-level deltas, monthly and cost line drill-down, filterable and exportable. | 2026-04-21 |
| `[C-VC-07]` | No standalone version history module. Version comparison accessed in context within Workbench, Portfolio, and Reporting. | 2026-04-21 |
| `[C-WB-01]` | Overview tab three-point comparison: monthly columns in near zone, quarterly in outer zone. Mixed view is canonical and only representation. | 2026-04-21 |
| `[C-WB-03]` | FC & Planning grid: monthly columns in near zone, expandable quarterly columns in outer zone, visual boundary marker between zones. | 2026-04-21 |
| `[C-WB-04]` | Retrospective acknowledgment (forecast cycle phase 2) enhanced to show prior cycle forecast vs. actuals delta for the retrospective period. | 2026-04-21 |
| `[C-WB-05]` | Change History tab unchanged. CR approval creates interim versions per C-FV-03 but version tracking not surfaced on this tab. | 2026-04-21 |
| `[A-DOI-01]` | DoI range is 0–5, aligned with KB reference model (April 2026). Replaces working set 1–7. Three macro phases: Demand Funnel (0–2), Change Execution (3–4), Operation (4–5). | 2026-04-23 |
| `[A-DOI-02]` | DoI does not map 1:1 to pipeline stages. DoI is a maturity indicator; multiple pipeline stages can share a DoI level (e.g., Approved and Active both at DoI 3). | 2026-04-23 |
| `[A-DOI-03]` | Two governance gates: AI Council (DoI 0→1, modelled as flag + document attachment, not a workflow) and Pitch Board (DoI 2→3, maps to controller Approve action). | 2026-04-23 |
| `[A-DOI-04]` | DoI 0 (Evaluate) minimum fields: project name, structured description (Problem Statement, Business Driver, Expected Outcome, Current State), proposing person, LoB, requesting business unit, demand type, Type (1/2/3), value stream, Wave ID (optional), document attachments (OneDrive links). No budget, no scoring. | 2026-04-23 |
| `[A-DOI-05]` | DoI 0→1 gate: initial Tech Navigator composite scoring, t-shirt budget estimate, transformation level, strategic alignment statement, AI Council flag + confirmation document. | 2026-04-23 |
| `[A-DOI-06]` | DoI 1→2 gate: complete Tech Navigator sub-criteria, euro budget with CapEx/OpEx split, rough quarterly resource plan (internal + external), rough quarterly external cost estimate, high-level timeline, assessment recommendation. | 2026-04-23 |
| `[A-DOI-07]` | DoI 2→3 gate (Pitch Board): two-step baseline process — approval on macro data, baseline registered after detailed forecast entry. Exact timing subject to KB confirmation (`[A-OQ-07]`). | 2026-04-23 |
| `[A-DOI-08]` | DoI 3 requires: detailed forecast grid (monthly near zone, quarterly outer), milestone breakdown with baseline dates, resource plan with internal/external sourcing split. | 2026-04-23 |
| `[A-DOI-09]` | DoI 3→4 gate: named resource assignments (internal confirmed by CC Owners, external vendor recorded), final delivery milestone complete, hyper-maintenance scope defined if applicable. | 2026-04-23 |
| `[A-DOI-10]` | DoI 4→5 gate: cost allocation destinations, running cost estimate, optional termination date, platform management model documented. Not all projects reach DoI 5. | 2026-04-23 |
| `[A-DOI-11]` | DoI 4 sub-transitions (Hyper-maintenance to early Operate) managed through project milestones, not DoI change. Project remains at DoI 4 throughout. | 2026-04-23 |
| `[A-DA-01]` | Document attachments are OneDrive links, not file uploads. Each attachment: URL, label, upload date, DoI level at which added, uploading user. Available at every DoI level. | 2026-04-23 |
| `[A-DA-02]` | Project description uses structured sections with guiding placeholder text (Problem Statement, Business Driver, Expected Outcome, Current State). Not AI-assisted. | 2026-04-23 |
| `[A-DA-03]` | New project fields: requesting business unit (separate from LoB), demand type (4 categories from KB model), value stream, Wave ID (optional). | 2026-04-23 |
| `[A-RM-01]` | Forecast grid resource section renamed from "Internal Resources" to "Resource Plan." Each role line carries internal/external source split with separate hours and rates. | 2026-04-23 |
| `[A-RM-02]` | Three forecast grid categories: (1) Resource Plan by role (internal + external hours), (2) External Deliverables (euro-based vendor contracts, no hours), (3) Non-labour Costs (unchanged from v4). | 2026-04-23 |
| `[A-RM-03]` | External hourly rates are per-project, per-role, per-vendor entry in v5. No global vendor rate table. | 2026-04-23 |
| `[A-RM-04]` | Capacity Management views remain internal-only. Outsourcing ratio (internal vs. external hours and cost) added as portfolio-level reporting dimension. | 2026-04-23 |
| `[B-WS-01]` | Single unified workspace, no modes. All use cases (rebalancing, multi-year projection, exogenous shock modelling) served from one workspace with one action catalogue and one impact dashboard. | 2026-04-23 |
| `[B-WS-02]` | Two interaction layers: direct cell manipulation on sandbox copies of real CRETA surfaces (Layer 1), plus a catalogue of bulk actions as power-user shortcuts (Layer 2). Both produce the same underlying diff data structure. | 2026-04-23 |
| `[B-WS-03]` | Workspace layout: scenario header (Zone 1), impact summary strip with expandable detail panels (Zone 2), collapsible sidebar + editing surface (Zone 3), change summary bottom drawer. | 2026-04-23 |
| `[B-WS-04]` | Sidebar follows the Report Builder pattern (collapsible left panel). Tree structure: Projects (searchable, per-project sub-surfaces), Backlog, Portfolio Settings, Resources (Tier 3 gated), Bulk Actions. | 2026-04-23 |
| `[B-WS-05]` | Sandbox surfaces are full replicas of real CRETA surfaces (forecast grid, backlog, rate tables, etc.) with a diff layer. Visual sandbox indicator (persistent coloured border/tint) across the entire workspace. | 2026-04-23 |
| `[B-WS-06]` | Sandbox forecast grids show current month forward only — historical actuals truncated. Baseline visible as a read-only summary reference row. Monthly/quarterly zone split per Cluster C. | 2026-04-23 |
| `[B-AC-01]` | Three-role access: Controller, PL, Executive. All three roles can create, edit, and compare scenarios. | 2026-04-23 |
| `[B-AC-02]` | Three access tiers. Tier 1 (project-scope) for all users. Tier 2 (portfolio-scope) for Controller + Executive. Tier 3 (sensitive/structural) gated by admin-configurable permission flag per user, not by role hierarchy. | 2026-04-23 |
| `[B-AC-03]` | Tier 3 surfaces (people master data, rate tables, capacity parameters, restructuring bulk actions) hidden entirely for users without Tier 3 permission. | 2026-04-23 |
| `[B-ES-01]` | Seventeen-plus editable surfaces in the sandbox: forecast grids, rate tables, resource assignments, people master data, pipeline stage, Tech Navigator scores, total available budget, project timeline/milestones, vendor contracts, sourcing mix, CapEx/OpEx classification, cost allocation rules, capacity parameters, escalation/inflation factors, running costs and termination dates, hypothetical project injection, hierarchy reassignment. | 2026-04-23 |
| `[B-CA-01]` | Twenty-one catalogue bulk actions across three categories: 10 project-level, 7 portfolio-level (plus 2 target-setters), 4 restructuring decisions (Tier 3). | 2026-04-23 |
| `[B-CA-02]` | Escalation factors scoped by cost category (all/internal/external/non-labour) AND/OR by role AND/OR by hierarchy node. Scoping options combinable. | 2026-04-23 |
| `[B-CA-03]` | Target-setters (outsourcing target, investment mix target) show gaps without auto-adjusting. Consistent with "ranking supports decisions, does not make them." | 2026-04-23 |
| `[B-CA-04]` | Restructuring actions use analytical framing (Remove role, Reduce headcount, Relocate team, Hire block) — not workforce-specific terminology. | 2026-04-23 |
| `[B-SL-01]` | Scenario anchored to a specific forecast cycle version. Default at creation: latest completed cycle. Anchor version visibly displayed on scenario header and in Scenario Manager. | 2026-04-23 |
| `[B-SL-02]` | Rebase: manual, explicit re-anchoring to a newer forecast cycle version. System carries forward diffs and flags conflicts for user resolution. Never automatic. | 2026-04-23 |
| `[B-SL-03]` | Publish with Tier 3 content gating (Option C): system detects Tier 3 diffs and defaults visibility to "Tier 3 users only." Publisher can override to "All simulator users" (audited). Tier 3 diff details redacted for users without permission even on published-to-all scenarios. | 2026-04-23 |
| `[B-SL-04]` | No hard scenario cap. Soft warning at a threshold if storage becomes a concern, no hard limit enforced. | 2026-04-23 |
| `[B-SL-05]` | Archive is soft — read-only, hidden from active list, clonable, never hard-deleted. Consistent with CRETA audit philosophy. | 2026-04-23 |
| `[B-PR-01]` | Two commit paths out of the simulator: Controller Promote (selective diff application through native workflows) and PL Apply-to-forecast (pre-populates forecast cycle submission with own-project diffs). | 2026-04-23 |
| `[B-PR-02]` | Promote requires the scenario's anchor to match the latest completed forecast cycle. Stale scenarios must be rebased before promoting. | 2026-04-23 |
| `[B-PR-03]` | Promote is selective — per-diff checkboxes with per-category select-all, no global select-all. Each diff is routed through its native system workflow (forecast changes → forecast submissions, stage transitions → gate checks, Tech Navigator changes → Send Back or audited override, people changes → action items). | 2026-04-23 |
| `[B-PR-04]` | Partial promotion supported. Scenario remains intact post-promotion. Promoted diffs marked with badge and timestamp. Un-promoted diffs remain editable. | 2026-04-23 |
| `[B-PR-05]` | PL Apply-to-forecast: available during active forecast cycle on any scenario (including pre-existing ones). Only own-project forecast diffs carried forward. Scenario-originated values marked with provenance indicator. Scenario not consumed by this action. | 2026-04-23 |
| `[B-PR-06]` | Promote is Controller-only. Executives cannot promote. PLs use Apply-to-forecast. | 2026-04-23 |
| `[B-ID-01]` | Eight impact dimensions: financial, backlog ranking, capacity, people (Tier 3 only), outsourcing ratio, investment mix, running cost/long-term sustainability, change summary. | 2026-04-23 |
| `[B-ID-02]` | On-demand recalculation triggered by explicit Recalculate button. Server-side atomic operation — all dimensions update together. Change summary (dimension 8) updates in real time as edits happen (local append, no computation). | 2026-04-23 |
| `[B-ID-03]` | Impact summary strip: compact tiles always visible, stale indicator when edits pending recalculation. Click to expand detail panel below the strip; one panel open at a time. | 2026-04-23 |
| `[B-CV-01]` | Comparison requires shared anchor version. Stale scenarios must rebase before comparison. Deltas computed against the current state column. | 2026-04-23 |
| `[B-CV-02]` | Three-level drill in comparison: Level 1 portfolio summary (eight impact dimension rows), Level 2 project comparison (month-by-month forecast grid, milestones, scores per scenario), Level 3 line-level detail (single forecast line across scenarios). | 2026-04-23 |
| `[B-CV-03]` | Per-scenario colour coding on structural elements (column headers, background tint). Directional indicators on values via inline arrows and +/- prefixes, not colour. Accessible design. | 2026-04-23 |
| `[B-CV-04]` | Toggle: "Show values" vs. "Show changes from anchor" at Level 2 and Level 3. | 2026-04-23 |
| `[B-CV-05]` | Interactive jump from comparison view into a scenario's workspace. Back button returns to comparison. | 2026-04-23 |
| `[B-AI-01]` | AI Advisor designed (two-mode: goal-directed planning + scenario analysis, slide-over drawer, dual-layer architecture) but deferred from v5 implementation. Design preserved in spec for future activation. | 2026-04-23 |
| `[B-DEP-01]` | Inter-project dependencies seeded to Cluster D as a data model enhancement. Simulator will consume dependency data when available. Not a Cluster B deliverable. | 2026-04-23 |
| `[D-NAV-01]` | Admin module uses two-level navigation with five sections: (1) Master Data, (2) Reference Catalogues, (3) Planning & Ranking Configuration, (4) Portfolio Hierarchy, (5) System. Left sidebar pattern consistent with Report Builder. | 2026-04-23 |
| `[D-NAV-02]` | Master Data section uses a browser pattern: sidebar lists entity types with count badges (Cost Centres, Competence Centres, Locations, People, Roles, Rate Tables, Hierarchy). Main panel: landing dashboard → instance table → entity detail view (panel replacement with breadcrumb). Entity detail views include related entities and entity-scoped audit trail. | 2026-04-23 |
| `[D-NAV-03]` | Rate Tables surface as a dedicated matrix view (role × location → rate with effective date dimension) rather than list-of-records. Internal rates only. | 2026-04-23 |
| `[D-NAV-04]` | Hierarchy node in browser operates in lightweight mode: add/rename/deactivate entities, reassign projects (drag-and-drop or "Move to…" with confirmation). No structural changes — those remain in Section 4. Single-parent enforced. "Configure hierarchy structure →" link bridges to Section 4. | 2026-04-23 |
| `[D-NAV-05]` | Browser landing page: entity counts, "recently modified" feed, data quality flags, Scheduled Changes panel (upcoming activation-dated changes pending review, doubles as review queue). | 2026-04-23 |
| `[D-NAV-06]` | All master data changes support optional activation date. Default is immediate. Calendar affordance for future scheduling. Today-or-future only — no retroactive scheduling. Daily activation job applies approved pending changes. | 2026-04-23 |
| `[D-NAV-07]` | Scheduled changes require second-admin review. States: Pending Review → Approved → Activated (or Rejected/Cancelled). Audit trail captures both scheduling and review actions. | 2026-04-23 |
| `[D-NAV-08]` | Expiry dates (temporary changes that auto-revert) deferred from v5. Activation dates only — no valid-from/valid-to range model. | 2026-04-23 |
| `[D-NAV-09]` | Impact propagation: scheduled master data changes affecting capacity/cost flag the next forecast cycle with "master data has changed" notification. Affects forecast data only, not actuals. | 2026-04-23 |
| `[D-CAT-01]` | Reference catalogues organized into four tiers. Universal rule: deactivation, never deletion. Deactivated entries hidden from dropdowns, retained on existing records, greyed out in admin tables. | 2026-04-23 |
| `[D-CAT-02]` | Tier 1 — Simple lists (Demand Types, Value Streams, Requesting Business Units): name, short code, active/inactive, display order. Inline-editable tables. Immediate changes with audit logging, no activation-date scheduling. | 2026-04-23 |
| `[D-CAT-03]` | Tier 2 — Enriched lists (Milestone Type Library, Dependency Types): table with accordion row expansion. Milestone types: name, colour, ordering, visual indicator. Dependency types: name, code, semantics, lag/lead flag. Activation-date scheduling with second-admin review applies. | 2026-04-23 |
| `[D-CAT-04]` | Tier 3 — Tech Navigator rubric definitions: dedicated matrix editor. Sub-criteria rows × 5 score-level columns with rubric text. Weights displayed read-only (edited in Section 3). Reserved Value Creation slots visible disabled. Activation-date scheduling with second-admin review applies. | 2026-04-23 |
| `[D-CAT-05]` | Tier 4 — Project Type Templates: entire feature deferred from v5 (admin and consumption). Placeholder in sidebar only. | 2026-04-23 |
| `[D-CAT-06]` | Pipeline stage definitions: read-only reference view. Admin can configure display labels and per-stage colours. Cannot add, remove, or reorder stages — system-defined. | 2026-04-23 |
| `[D-CAT-07]` | Workflow Template Editor: predefined workflow templates with fixed step sequence. Steps not reorderable. Each step exposes configurable touchpoints: required/skippable toggle, participant roles, data gates, notifications, time constraints, escalation actions. Disabled steps skipped during execution. | 2026-04-23 |
| `[D-CAT-08]` | Six configurable workflows in v5: (1) Forecast cycle, (2) Intake/pipeline progression, (3) Change Request, (4) Send Back, (5) Milestone baseline override, (6) Scheduled master data activation. | 2026-04-23 |
| `[D-CAT-09]` | Workflow editor UX: vertical step card stack. Each card shows name, type, config summary. Click expands to reveal touchpoints. Listed under "Workflows" in Reference Catalogues sidebar. | 2026-04-23 |
| `[D-CAT-10]` | Workflow config changes use activation-date scheduling with second-admin review. Scheduled for cycle boundaries. In-flight instances continue under original configuration. | 2026-04-23 |
| `[D-PRC-01]` | Section 3 organized into three sub-sections: Planning Parameters, Backlog & Ranking Configuration, Tech Navigator Weights. All use settings-card pattern (read-only default, discrete edit actions). | 2026-04-23 |
| `[D-PRC-02]` | Planning Parameters: fiscal year start, total planning horizon, granularity boundary, rolling forecast cadence, cycle due day, RAG thresholds. Capacity targets and available hours not included — those remain on entities in Master Data. | 2026-04-23 |
| `[D-PRC-03]` | Rolling forecast cadence: monthly (every 1 month), quarterly (every 3 months), or custom (every N months). Regular and periodic only — no freeform calendar scheduling. | 2026-04-23 |
| `[D-PRC-04]` | Cycle due day: configurable calendar day for forecast submission deadline. Workflow phase deadlines derive backward from this date per workflow template configuration. | 2026-04-23 |
| `[D-PRC-05]` | Backlog & Ranking Configuration: ranking formula weights (default 70/30, sum to 100), tie-breaking criteria (positions 1–2 fixed, rest drag-and-drop), cutoff line display mode, t-shirt size thresholds, primary backlog horizon. | 2026-04-23 |
| `[D-PRC-06]` | Total available budget displayed read-only in admin. Edit point is Backlog module. Budget change impact preview is a Backlog module UX concern. | 2026-04-23 |
| `[D-PRC-07]` | Tech Navigator Weights: Complexity and Value Creation sub-criterion weights (each sum to 100%). Two reserved slots shown disabled. Weight changes trigger preview panel (rank position changes, cutoff line impact) before confirmation. | 2026-04-23 |
| `[D-PRC-08]` | All parameter changes across all three sub-sections support activation-date scheduling with second-admin review. No exceptions. | 2026-04-23 |
| `[D-MD-01]` | Cost Centres: v4 fields retained. v5 adds cross-system identifiers, active/inactive with effective dating. | 2026-04-23 |
| `[D-MD-02]` | Competence Centres: v4 fields retained. v5 adds formal code, description, lead/owner, cross-system identifiers, active/inactive with effective dating. | 2026-04-23 |
| `[D-MD-03]` | Locations: v4 fields retained. v5 adds country, timezone, currency, cross-system identifiers, active/inactive with effective dating. Allocation destinations unresolved (`[D-OQ-01]`). | 2026-04-23 |
| `[D-MD-04]` | People: v4 fields retained. v5 adds: multi-role assignments (each with role reference, allocation %, primary flag, effective dates — must sum to 100%), employment type, explicit location, manager reference, start/end dates, cross-system identifiers. | 2026-04-23 |
| `[D-MD-05]` | People and Users are separate but linked. Person = master data (name, CC, roles, capacity). User = system access (credentials, CRETA role, permissions incl. Tier 3). Optional FK from User to Person. People in Section 1; Users in Section 5. | 2026-04-23 |
| `[D-MD-06]` | Roles decoupled from cost centres. Globally defined, assigned to CCs/competence centres via relationships. Fields: code, name, role category, job role, specialization, description, active/inactive, cross-system IDs. Detail view shows current rates across locations. | 2026-04-23 |
| `[D-MD-07]` | Effective dating: current record + scheduled changes queue + change log. Five states: Pending Review, Approved, Activated, Rejected, Cancelled. Visible in entity detail and global Scheduled Changes panel. No full temporal table (rate tables excepted). | 2026-04-23 |
| `[D-MD-08]` | Rate tables cover internal rates only. External rates are per-project data (per A-RM-03), not master data. | 2026-04-23 |
| `[D-MD-09]` | Rate effective dating: layered model — approval gates (second-admin review) for legitimacy, effective dates for financial calculation timing. No table-level versioning; individual cells tracked independently. | 2026-04-23 |
| `[D-MD-10]` | Cross-system IDs: generic key-value pairs (system name + external ID) per entity. Available systems defined in Reference Catalogue. Extensible without schema changes. Reconciliation via data quality flags on browser landing page. | 2026-04-23 |
| `[D-PH-01]` | v4 four-layer hierarchy model retained: Entity Types, Hierarchies, Grouping Entities, Hierarchy Assignment. Single-parent (ADM-01) enforced. | 2026-04-23 |
| `[D-PH-02]` | Tree GUI replaces Hierarchy Assignment sub-tab. Left panel: interactive tree (name, entity type, project count, budget rollup). Right panel: context-sensitive assignment workspace. | 2026-04-23 |
| `[D-PH-03]` | Assignment operations: drag-and-drop, drag within tree, bulk move (checkboxes + "Move to…"), search bar. All reassignments show confirmation dialog. | 2026-04-23 |
| `[D-PH-04]` | Tree GUI works on any hierarchy, not just active. Hierarchy selector dropdown at top. Active hierarchy badged but not privileged in editability. | 2026-04-23 |
| `[D-PH-05]` | Projects can have different assignments in different hierarchies. Each hierarchy maintains independent mappings. Switching active hierarchy switches portfolio views, rollups, and reporting. Old assignments preserved. | 2026-04-23 |
| `[D-PH-06]` | Unassigned projects list is hierarchy-scoped. Progress indicator tracks population completeness for inactive hierarchies. | 2026-04-23 |
| `[D-PH-07]` | "Copy assignments from…" action on inactive hierarchies populates from another hierarchy's mappings as starting point. | 2026-04-23 |
| `[D-PH-08]` | Hierarchy activation preview mandatory. Shows assigned/unassigned counts, which projects unassigned, rollup changes. Blocks or forces acknowledgment if unassigned projects exceed threshold. | 2026-04-23 |
| `[D-PH-09]` | In-tree entity management: right-click → add child, rename, deactivate. Grouping Entities sub-tab remains for bulk management. | 2026-04-23 |
| `[D-PH-10]` | Hierarchy comparison: side-by-side view of two hierarchies showing project position changes. Lower priority — may be deferred in implementation. | 2026-04-23 |
| `[D-PH-11]` | Data quality indicators on tree nodes: warning icons for anomalies (budget exceedance, zero assignments). Expand node for details. | 2026-04-23 |
| `[D-PH-12]` | Browser hierarchy view (D-NAV-04) shows active hierarchy only. Multi-hierarchy editing exclusively in Section 4. | 2026-04-23 |
| `[D-PH-13]` | Hierarchy changes support activation-date scheduling with second-admin review. Pending hierarchy switch surfaced as banner in tree GUI and browser. | 2026-04-23 |
| `[D-AC-01]` | Four-role model retained: Controller, PL, CC Owner, Executive. No custom profiles. Additional roles added in future versions if needed. | 2026-04-23 |
| `[D-AC-02]` | Tier 3 permission flag (D-13): boolean on User entity, independent of role. Managed in Section 5. Controls sensitive simulator surface access. | 2026-04-23 |
| `[D-AC-03]` | "Change reviewer" permission: additional boolean on User entity for Controllers. Controls second-admin review authorization. Not all Controllers are automatic reviewers. | 2026-04-23 |
| `[D-AC-04]` | CC Owner simulator access: read-only access to published scenarios. Can view but not create, edit, or promote. | 2026-04-23 |
| `[D-AC-05]` | Inter-project dependency data model: predecessor, successor, type (from catalogue), optional lag/lead (days/months), soft constraint only (warn, don't block), notes, audit fields. | 2026-04-23 |
| `[D-AC-06]` | Dependency entry: project detail view in Backlog module (Dependencies section, both predecessor and successor views). PL and Controller can add. | 2026-04-23 |
| `[D-AC-07]` | Portfolio dependency map: read-only network/graph in Portfolio module. Shows chains, circular dependency flags, critical path clusters. Editing in project detail only. | 2026-04-23 |
| `[D-AC-08]` | Circular dependency prevention: validated on save. Cycles blocked with error message showing the chain. | 2026-04-23 |
| `[D-AC-09]` | Audit log: categorised entries with filter (8 categories), entity-scoped trails (filtered views, no extra storage), export (CSV/Excel), indefinite retention. No audit dashboards — use Report Builder. | 2026-04-23 |
| `[D-AC-10]` | Demo Reset remains in Section 5. Removed in production. No design changes. | 2026-04-23 |
| `[E-01]` | Rename ProjectPhase → ProjectMilestone throughout backend and frontend. Terminology change only; feature work scoped to Cluster A. | 2026-04-27 |
| `[E-02]` | Milestone strip cosmetic extension into Hyper-maintenance and Operate stages. Solid-colour continuation past the final milestone. Low priority rendering enhancement. | 2026-04-27 |
| `[E-03a]` | Portfolio module project detail replaces slide-in summary panel with full-page view and back button, consistent with Backlog's `[A-BK-19]`. | 2026-04-27 |
| `[E-03b]` | Portfolio detail tabs tailored to health monitoring (distinct from Backlog scoring/gate tabs): Overview, Financial Detail, Resources & Costs, History. | 2026-04-27 |
| `[E-03c]` | Portfolio detail Overview tab: tile grid content in linear read-only layout (project header, three-point summary, progress vs. burn chart, milestone status, cost mix). | 2026-04-27 |
| `[E-03d]` | Portfolio detail Financial Detail tab: three-point comparison table (mixed-granularity per Cluster C) and variance waterfall. Read-only. | 2026-04-27 |
| `[E-03e]` | Portfolio detail Resources & Costs tab: resource plan summary and external cost breakdown by category and vendor. Read-only. | 2026-04-27 |
| `[E-03f]` | Portfolio detail History tab: forecast version history (cycle/CR labels), CR history, progress tracker history (progress and confidence evolution). | 2026-04-27 |
| `[E-03g]` | Portfolio detail navigation: back button preserves Dashboard scroll/filter state. Hierarchy breadcrumb (LoB → Programme → Project) at top. | 2026-04-27 |
| `[E-04a]` | Workbench Overview tab adopts 3×3 tile grid layout. Tiles are clickable action cards with summary content and navigation links. | 2026-04-27 |
| `[E-04b]` | Nine tiles: Row 1 — Project Header, Three-Point Summary (→ F&P), Milestone Status (→ milestone detail). Row 2 — Resource Plan (→ F&P), Cost Mix (→ cost breakdown), Progress Tracker (→ progress history). Row 3 — External Costs (→ vendor detail), Forecast Health (→ version history), Tech Navigator (→ Backlog). | 2026-04-27 |
| `[E-04c]` | Progress Tracker: milestone-anchored with three core fields (intra-milestone %, status narrative, next-milestone confidence) plus optional deliverable checklist (max 10 per milestone). Auto-computes % from checklist when present, with manual override. Live-editable; snapshotted at forecast cycles. | 2026-04-27 |
| `[E-04d]` | Progress data visualized at portfolio level (Backlog and Portfolio views) as inline indicator — compact bar with % and confidence dot. Not filterable/sortable. | 2026-04-27 |
| `[E-04e]` | External cost / vendor detail view is a new dedicated surface at project level (Workbench) and portfolio level (Portfolio module). Design deferred to E-08. | 2026-04-27 |
| `[E-05a]` | Trajectory chart replaced by Progress vs. Burn chart. X-axis: monthly with milestone zone dividers. Two primary lines: cumulative progress (%) and cumulative budget consumed (% of forecast). Baseline burn rate as lighter third line. Gap = value alignment signal. | 2026-04-27 |
| `[E-05b]` | Progress vs. Burn milestone markers: solid for completed, highlighted for current, dashed for future. Zones labelled and shaded. | 2026-04-27 |
| `[E-05c]` | Variance waterfall: expanded detail view behind three-point summary tile. Bridge chart: baseline → CRs → rate changes → current forecast. Grouped by change category, clickable bars drill into CR detail. | 2026-04-27 |
| `[E-05d]` | For projects without progress data (pre-v5 or not yet reported), chart shows burn line only. Progress line starts at first reported value. No backfilling. | 2026-04-27 |
| `[E-06a]` | PL gains read-only Capacity Management access: role-level availability by location and time period, aggregated without individual names. New view, not the full My Team/Org Overview surface. | 2026-04-27 |
| `[E-06b]` | CC Owner simulator scope expanded: can create scenarios but only modify resources within own CC. Cannot modify budget, timeline, Tech Navigator scores, or other CCs' resources. Updates `[D-AC-04]`. | 2026-04-27 |
| `[E-06c]` | PL simulator access: can view published scenarios, can use "Apply to forecast" per `[B-PR-05]`. No scenario creation or promotion. | 2026-04-27 |
| `[E-06d]` | Launchpad redesigned: three zones — header (greeting, cycle status), action strip (horizontal pending-action cards sorted by urgency), role-personalized KPI tile grid. | 2026-04-27 |
| `[E-06e]` | Launchpad tile counts are role-flexible: PL 7, Controller 9 (3×3), CC Owner 8, Executive 7. Grid wraps naturally. | 2026-04-27 |
| `[E-06f]` | Every Launchpad tile links to a specific module surface. Tile-to-module mapping ensures every accessible module has at least one tile pointing to it per role. | 2026-04-27 |
| `[E-06g]` | PL Launchpad tiles: My Projects Summary (→ Backlog), My Budget Position (→ Reporting), My Progress Overview (→ Workbench Overview), My Forecast Status (→ Workbench F&P), Recent Changes (→ Workbench Change History), Scenario Explorer (→ Simulator PL view), Resource Availability (→ Capacity read-only). | 2026-04-27 |
| `[E-06h]` | Controller Launchpad tiles: Portfolio KPIs (→ Dashboard), Pipeline Summary (→ Backlog), Budget vs. Cutoff (→ Backlog cutoff), Reporting (→ Reporting landing), Forecast Cycle Tracker (→ Workbench), Pending Reviews (→ Backlog Under Evaluation / Admin Scheduled Changes), Capacity Overview (→ Capacity Org Overview), Scenario Activity (→ Simulator), Admin & Data Quality (→ Admin browser). | 2026-04-27 |
| `[E-06i]` | CC Owner Launchpad tiles: Team Utilization (→ Capacity My Team), Open Resource Requests (→ Capacity Requests), My Team Headcount (→ Capacity drill-down), Cost Centre Budget (→ Reporting CC Summary), Portfolio Overview (→ Dashboard), My CC's Projects (→ Workbench filtered), Published Scenarios (→ Simulator read-only), CC Capacity Simulator (→ Simulator CC-scoped). | 2026-04-27 |
| `[E-06j]` | Executive Launchpad tiles: Portfolio KPIs (→ Dashboard), Investment Mix (→ Dashboard charts), Pipeline Health (→ Backlog), Top Risks (→ Dashboard filtered), Scenario Activity (→ Simulator), Budget Trajectory (→ Reporting YoY), Strategic Backlog (→ Backlog ranked). | 2026-04-27 |
| `[E-07a]` | Consistent module header bar across all modules: module name left, contextual actions right, uniform height and styling. | 2026-04-27 |
| `[E-07b]` | Shared tab component: same size, active/inactive treatment, position across all tab-using modules (Workbench, Portfolio, Capacity, Reporting). | 2026-04-27 |
| `[E-07c]` | Sidebar pattern: any sidebar follows Cluster D Admin pattern (width, item styling, collapse behaviour). Applies to Workbench project list and Admin section sidebar. | 2026-04-27 |
| `[E-07d]` | Three card types standardized application-wide: summary card (coloured bg, no border — KPIs), surface card (white bg, subtle border — content containers), action card (surface card + hover/click — navigation tiles). | 2026-04-27 |
| `[E-07e]` | Full-page detail view with back button and breadcrumb is the universal drill-down pattern. No slide-in panels anywhere. | 2026-04-27 |
| `[E-07f]` | Consistent empty states (illustration/icon + text + action button) and loading skeletons across all modules. | 2026-04-27 |
| `[E-07g]` | Status badge vocabulary: pipeline stages = configurable colours, RAG = coloured dots, DoI = neutral numeric badges, forecast cycle = semantic-colour badges, confidence = distinct shape (diamond/triangle) in green/amber/red, workflow states = semantic-colour text badges. | 2026-04-27 |
| `[E-08a]` | External costs is a fourth Workbench tab alongside Overview, F&P, and Change History. Project-scoped vendor and external cost analysis. | 2026-04-27 |
| `[E-08b]` | Workbench External Costs tab: three sections — summary strip (4 KPI cards: total forecast, actuals YTD, plan drift, external share %), vendor table (per-vendor rows expandable to F&P line items grouped by vendor), category breakdown (visual rollup, clickable to filter vendor table). | 2026-04-27 |
| `[E-08c]` | Portfolio module gets a dedicated "External spend" tab. Cross-project vendor analysis surface for controllers. | 2026-04-27 |
| `[E-08d]` | Portfolio External Spend tab: four sections — portfolio KPIs, vendor summary table (per-vendor across portfolio, expandable to per-project breakdown), category analysis (portfolio rollup with optional cross-cycle trend), project × vendor matrix (cross-tab, collapsed by default). | 2026-04-27 |
| `[E-08e]` | External cost category taxonomy is admin-configurable master data. Default demo set: Consulting, Cloud/Infrastructure, Licenses, Hardware, Other. Production: seeded from SAP/Ariba. | 2026-04-27 |
| `[E-08f]` | External cost category added to Admin module master data browser with standard CRUD and Cluster D browser pattern. | 2026-04-27 |
| `[A-PL-05]` | Post-launch cost tracking applies to all chargeable entity types (Project, Offering, Internal Service) via Cluster F's polymorphic `ChargeableEntity` model. Projects are tracked at Operate stage only; offerings and internal services are always in steady state. | 2026-04-28 |
| `[A-PL-06]` | BTC profile required at the DoI 2 → DoI 3 gate (Pitch Board) for projects that will carry a To-Business cost share. Validated by the gate workflow. Editable post-gate by the responsible person. | 2026-04-28 |
| `[A-PL-07]` | Operate Portfolio renamed to Run Portfolio. Restructure of the Portfolio module into Change Portfolio + Run Portfolio sub-modules (`[E-11]`). The Run Portfolio sub-module hosts all chargeable entities currently in steady-state operation. | 2026-04-28 |
| `[E-09]` | New Workbench tile (BTC summary) and Workbench tab (BTC profile editor + per-entity rollup) on every chargeable entity. Tile shows To-Business total + top 3 charging locations. Tab provides full profile editor, allocation breakdown, audit history. For entities with no To-Business share, tab shows the Stage 1 distribution editor instead. | 2026-04-28 |
| `[E-10]` | New top-level "Charging & Allocations" module added to the application navigation, placed after Portfolio and before Capacity Management. Four primary surfaces: Inter-service Distribution editor, BTC Profiles editor, Location Cost Rollup (map + table sub-views), and Reporting integration via Report Builder. Follows Cluster D admin module sidebar pattern and Cluster E `[E-07a]`–`[E-07g]` design tokens. | 2026-04-28 |
| `[E-11]` | Portfolio module restructured into Change Portfolio and Run Portfolio sub-modules with a sub-module switcher at module top. Change Portfolio holds DoI 0–4 projects (existing portfolio dashboards and surfaces). Run Portfolio holds DoI 5 projects + offerings + internal services with type filter, type-aware columns, and embedded rollup panels from Cluster F. | 2026-04-28 |
| `[F-DM-01]` | Polymorphic `ChargeableEntity` root with three subtypes: Project, Offering, Internal Service. Identical cost-allocation logic; only the WBS prefix differs (`IT0<PPM>`, `IT00<S-code>`, `ITF<NNNNN>`). | 2026-04-28 |
| `[F-DM-02]` | `to_business_pct` is a field on `ChargeableEntity`, not a row in the distribution table. Distribution rows are pure entity-to-entity edges. Self-retained percentage is derived: `100% − to_business_pct − sum(distribute_to %)`. | 2026-04-28 |
| `[F-DM-03]` | WBS Elements are algorithmic, never stored. Generated at SAP export time as `<prefix>-64-99-<location_code>`. Working assumption: `64-` is KB's IT company-code marker. | 2026-04-28 |
| `[F-DM-04]` | Cluster F entities attach to Cluster D's configurable hierarchy via the same `hierarchy_node_id` mechanism existing projects use. No parallel LoB/Division concept introduced. | 2026-04-28 |
| `[F-S1-01]` | Stage 1 inter-service distribution: storage is sparse (edges-as-list). One row per actually-flowing edge in the `Distribution` table. | 2026-04-28 |
| `[F-S1-02]` | Stage 1 sum rule: strict ≤100%. Residual stays as self-retained cost on the entity's own books — the entity "charges itself". Confirmed by controller workshop. | 2026-04-28 |
| `[F-S1-03]` | Stage 1 edit interaction: edges-as-list editor. Entity owner edits `to_business_pct` plus a list of `(destination_entity, %)` rows. Self-retained percentage shown as derived. | 2026-04-28 |
| `[F-S1-04]` | Stage 1 versioning: tied to CRETA's standard baseline/forecast/actuals model. Annual lifecycle cadence; within-year edits captured as forecast versions. What-If scenarios fork the current forecast version. | 2026-04-28 |
| `[F-S1-05]` | Stage 1 cycle detection: hard-block at save time. Adding a destination that creates a cycle is rejected with an error message showing the chain. | 2026-04-28 |
| `[F-S2-01]` | Stage 2 BTC profile: storage is sparse (only non-zero `BTCProfileLine` rows). Full-matrix presentation only at SAP export time, where all 90 charging locations are enumerated. | 2026-04-28 |
| `[F-S2-02]` | Stage 2 manual mode UX: add-only list editor with searchable charging-location picker. Sum-to-100 validation gate on save. | 2026-04-28 |
| `[F-S2-03]` | Stage 2 automatic mode UX: pick S-code → read-only preview of UM-driven percentages → save snapshots values into `BTCProfileLine` rows. No inline override; mode-switch is the override path. Provenance metadata (`s_code`, `um_snapshot_at`) stored on the profile. | 2026-04-28 |
| `[F-S2-04]` | Stage 2 UM refresh: snapshot at save; explicit "Refresh from UM" action with diff preview. UM updates between snapshots do not silently change profile percentages. | 2026-04-28 |
| `[F-S2-05]` | Stage 2 mode change: symmetric snapshotting. Automatic→Manual inherits values verbatim. Manual→Automatic shows values-visible warning dialog before discard. | 2026-04-28 |
| `[F-S2-06]` | Stage 2 year rollover: auto-creates draft profile from prior year. Manual values inherit verbatim; automatic re-snapshots from the new year's UM matrix. Responsible can edit before charges land. | 2026-04-28 |
| `[F-S2-07]` | "Copy distribution from" feature: unified mechanic with three triggers (year rollover, "Copy from..." picker on a blank profile, automatic mode snapshot on save). | 2026-04-28 |
| `[F-S2-08]` | Profile-required rules: required when `to_business_pct > 0`. Projects validated at DoI 2 → 3 gate. Offerings validated at creation. For mixed-shape entities, the BTC profile applies only to the To-Business share. | 2026-04-28 |
| `[F-UM-01]` | UM master: normalized table `(year, quarter, service_code, location_code, value, source, imported_at)`. Sparse — only non-zero cells stored. | 2026-04-28 |
| `[F-UM-02]` | UM origin: read-only import. CRETA is consumer, not master. Production target: SAP-side API. Prototype: CSV upload + stubbed automatic-refresh button. | 2026-04-28 |
| `[F-UM-03]` | UM cadence: quarterly versioned snapshots in prototype. Production cadence to be confirmed. No overwrites — every import creates a new version. | 2026-04-28 |
| `[F-UM-04]` | UM visibility: read-visible to all CRETA users; admin-only import. Read-only matrix viewer in admin module's master data browser. | 2026-04-28 |
| `[F-MD-01]` | Three distinct location masters: `WorkforceLocation` (existing v4, renamed for clarity), `ChargingLocation` (~90 KB charging codes), `LegalEntity` (~120 KB registered companies with many-to-one rollup to ChargingLocation). UI never uses the bare word "Location"; always qualified. Hover tooltips disambiguate the three. | 2026-04-28 |
| `[F-MD-02]` | `ChargingLocation` carries division, region, and country attributes directly for fast rollups. `LegalEntity` carries its own country attribute for divergence cases. `Region` and `Country` are small lookup masters. No `Division` lookup — division is a property of the charging location, distinct from Cluster D's configurable hierarchy. | 2026-04-28 |
| `[F-MD-03]` | Legal-entity-to-charging-location mapping is editable in the admin module with effective-dating, following Cluster D's standard pattern. | 2026-04-28 |
| `[F-RV-01]` | Cluster F provides four primary UI surfaces: Inter-service Distribution editor, BTC Profile editor, Location Cost Rollup (map + table), and Report Builder integration. Plus the per-entity Workbench tile and tab (specified in Cluster E `[E-09]`). | 2026-04-28 |
| `[F-RV-02]` | Computation strategy: two-layer cache. Stage 1 effective costs per (year, version) cached and invalidated on writes. Stage 2 location totals per (year, version) cached and invalidated on writes. Filtered/sliced views compute on demand from cache. | 2026-04-28 |
| `[F-RV-03]` | Map view: static SVG world map (no tile-based map service). Bubbles at country level by default; click to drill into charging locations within a country. Bubble size = cost magnitude; bubble color = division. | 2026-04-28 |
| `[F-RV-04]` | Tree-table view: three pre-built rollup paths (Region → Country → Charging Location, Division → Charging Location, Country → Charging Location). Pivot direction toggleable. Cell click drills into entity contributions and upstream chains. | 2026-04-28 |
| `[F-RV-05]` | Scenario overlay is OUT of Cluster F scope. Scenario comparisons live in the simulator (Cluster B). Cluster F's views are single-state; the simulator consumes the same data layer for scenario rendering. | 2026-04-28 |
| `[F-RV-06]` | Time granularity in rollup views: annual default, quarterly drill-down where supported, no monthly. | 2026-04-28 |
| `[F-AC-01]` | Per-entity-type role permission configuration for BTC profile edits and inter-service distribution edits. Default: responsible owns + controller override (audit-trailed). Admin can grant additional roles via Cluster D Section 5. | 2026-04-28 |
| `[F-DG-01]` | Demo data is reconstructed from scratch for v5. The v4 project/service distinction is retired. Seed expresses the polymorphic `ChargeableEntity` model, the configurable hierarchy from Cluster D, and the demo flagship narrative end-to-end. | 2026-04-28 |
| `[F-DG-02]` | Fictionalization scheme: real WBS structural patterns retained; KB-confidential identifiers and names fictionalized (PPM IDs, S-codes, ITF numbers, charging codes, legal entity numbers, KB legal entity names). Real geographic names retained. Generic IT service category descriptions retained. Existing v4 fictional persona names reused. | 2026-04-28 |
| `[F-DG-03]` | Seed volume targets: 8–10 projects (incl. 2–3 in Run stage), 5–8 offerings, 15–20 internal services, ~30–50 distribution edges, all 90 charging locations and ~120 legal entities seeded as master data. One designated demo flagship entity walked end-to-end across every dimension. | 2026-04-28 |

---

## Open questions log

| Tag | Question | Raised | Status |
|---|---|---|---|
| `[A-OQ-01]` | Exact DoI values and their mapping to pipeline stages | 2026-04-13 | **Resolved** — KB uses DoI 0–5. Mapping confirmed from KB reference slides (April 2026). |
| `[A-OQ-02]` | Canonical KB names for pipeline stages | 2026-04-13 | **Partially resolved** — KB names confirmed (Evaluate, Assess, Integrate, Manage, Scale). CRETA internal labels remain as working names. |
| `[A-OQ-03]` | Cost allocation timing — only at Operate stage (DoI 4–5), or also during Active (DoI 3)? | 2026-04-13 | **Resolved (2026-04-28)** — For projects, allocation applies only at the Operate stage (DoI 5 in CRETA pipeline terms). Offerings and internal services always carry allocation profiles since they are always in steady state. |
| `[A-OQ-04]` | Specific DoI-to-required-field mappings for the data completeness gate pattern | 2026-04-13 | Substantially resolved — detailed field lists for DoI 0–5 now in spec, subject to KB confirmation |
| `[A-OQ-05]` | Operate Portfolio view placement — sub-view of Backlog module or part of Portfolio module? | 2026-04-13 | **Resolved (2026-04-28)** — Portfolio module restructured into Change Portfolio + Run Portfolio sub-modules (`[E-11]`). Run Portfolio holds DoI 5 projects + offerings + internal services with type filter at top. |
| `[A-OQ-06]` | Ranking formula shape (weighted sum) and default axis weights (70/30 Value Creation / Complexity) — to be confirmed with KB colleagues | 2026-04-17 | Open — working defaults in place |
| `[A-OQ-07]` | Baseline detail timing: does the detailed forecast need to exist before the Pitch Board decision, or is a two-step flow acceptable? Working assumption: two-step. | 2026-04-23 | Open — to confirm with KB colleagues |
| `[A-OQ-08]` | Value stream: does KB have a defined catalogue of value streams, or is this a free-text field initially? | 2026-04-23 | Open — to confirm with KB colleagues |
| `[A-OQ-09]` | T-shirt size budget ranges: confirm working thresholds (XS <100k, S 101–250k, M 251–500k, L 501–1.000k, XL >1.000k) | 2026-04-23 | Open — working defaults in place |
| `[A-OQ-10]` | AI Council: how formalized is this process? Does it need any workflow beyond a flag and document attachment in CRETA? | 2026-04-23 | Open — to confirm with KB colleagues |
| `[C-OQ-01]` | Should CRs be processable between forecast cycles (producing interim versions), or restricted to cycle windows only? Working assumption: CRs can happen at any time. | 2026-04-21 | Open — to confirm with KB colleagues |
| `[B-OQ-01]` | Should the Promote workflow support promoting diffs that affect cost allocation rules (BTC profiles or inter-service distribution edges, per Cluster F)? Working assumption: promote is supported. Permission model: per-entity-type admin-configurable role grants (Cluster F `[F-AC-01]`) determine who can edit; the simulator uses the same permissions for promote-eligibility. | 2026-04-23 | Open — to confirm during implementation |
| `[B-OQ-02]` | When a PL uses "Apply to forecast," should the provenance note in the forecast submission be visible to the controller, or only stored in audit metadata? Working assumption: visible to the controller. | 2026-04-23 | Open — to confirm during implementation |
| `[D-OQ-01]` | Are Operate-stage cost allocation destinations the same entity type as CRETA Locations (unified model with type classification), or a separate entity type? Working assumption: unresolved — awaiting additional information from KB colleagues. | 2026-04-23 | **Resolved (2026-04-28)** — Separate entity types. Three distinct location masters introduced: `WorkforceLocation` (existing v4 master, renamed for clarity), `ChargingLocation` (~90 KB charging codes), `LegalEntity` (~120 KB registered companies, with many-to-one rollup to ChargingLocation). |
| `[E-OQ-01]` | Milestone detail view: is this a new dedicated view or a filtered state of an existing surface? If new, where does it live — fifth Workbench tab, or a sub-view within the Overview tab? Working assumption: sub-view accessible from the milestone tile. | 2026-04-27 | Open — to be resolved during implementation |
| `[E-OQ-02]` | Version history view: same placement question as E-OQ-01. Working assumption: sub-view accessible from the forecast health tile. | 2026-04-27 | Open — to be resolved during implementation |
| `[E-OQ-03]` | External cost / vendor detail view (E-08): ~~full design deferred. Project-level placement (fourth Workbench tab vs. sub-view) and portfolio-level placement to be determined in a follow-up session.~~ | 2026-04-27 | **Resolved** — fourth Workbench tab at project level, new Portfolio module tab at portfolio level. Categories are admin-configurable master data. |
| `[F-OQ-01]` | Where does User Measurement data originate at KB? Who maintains it? What is the production refresh cadence? | 2026-04-28 | **Blocking** — affects the import mechanism (API vs file vs manual) and the prototype's stubbed-button tooltip wording. Internal data model is unaffected. To be confirmed with KB colleagues. |
| `[F-OQ-02]` | Confirm that when an entity distributes <100% of its rolled-up cost, the residual stays as self-retained cost on the entity's own books rather than implicitly going To-Business. | 2026-04-28 | **Blocking** — working assumption from controller workshop is "self-retained". Spec built on this assumption. To be verified with KB. |
| `[F-OQ-03]` | What additional roles need edit access to BTC profiles or distribution rules beyond the responsible + controller default? | 2026-04-28 | Open — affects admin permission defaults pre-configured at install. |
| `[F-OQ-04]` | Is "Run Portfolio" the right KB-aligned term for the steady-state portfolio sub-module, or is there a different KB-popular phrasing? | 2026-04-28 | Open — provisional based on KB's "Change/Run" framing being popular internally. |
| `[F-OQ-05]` | Is `-64-` truly a constant company-code marker in the WBS structure, or does it vary by region, division, or year? | 2026-04-28 | Open — working assumption: constant. If it varies, the WBS generator needs an extra input. |
| `[F-OQ-06]` | How often does the 90-charging-code list change in practice? | 2026-04-28 | Open — informs admin master-data refresh expectations. |
| `[F-OQ-07]` | Are BTC templates currently generated from a central master at KB, or maintained as 240+ independent files? | 2026-04-28 | Open — working assumption: central master. Material for the migration story. |
| `[F-OQ-08]` | Does Stage 1 ever have multi-step path tracing the user cares about today (informal need vs. formal requirement)? | 2026-04-28 | Open — confirms whether drill-down should be more discoverable than designed. |
| `[F-OQ-09]` | For decimal-value UM entries (notably SAP services), are the values raw or already weighted? | 2026-04-28 | Open — currently design-irrelevant (CRETA uses values as given) but worth confirming for documentation. |
| `[F-OQ-10]` | What approval / authorisation workflow exists today at KB for changing BTC % or inter-service %? | 2026-04-28 | Open — informs admin permissions configuration defaults. |
