# 11 — Tech Navigator & Backlog

The Tech Navigator (per `[A-TN-01..09]`) is the scoring rubric that ranks the Backlog. Each project's profile produces a `composite_score` from sub-criteria scores × per-axis weights × per-axis ranking weight. The Backlog at `/backlog` is the ranked list with cutoff-line analysis per `[A-BK-14..29]`.

For lifecycle gates (DoI 0→5 transitions, Send-back, Pitch Board approval), see [02-project-lifecycle](./02-project-lifecycle.md). This doc is the **deep dive** into scoring + ranking.

**Counterintuitive convention** per `[A-TN-02]`: a *higher* Complexity score means *lower* real-world complexity. The 5-end of every Complexity sub-criterion is "best for KB". This makes both axes mono-directional ("higher is better") so the composite computation is straightforward.

---

## W11.1: Edit Tech Navigator subscores

**Purpose**: Score a project's Tech Navigator profile end-to-end — Project Type + Transformation Level + 3 Complexity sub-criteria + 3 Value Creation sub-criteria + (2 reserved slots, inactive in v5) — and watch the composite ranking land.
**When to use**: PL onboarding a new project; controller correcting a scored project. The lifecycle-touch shorthand is in [W02.3](./02-project-lifecycle.md#w023-score-tech-navigator-lifecycle-touch); this is the full walk.
**Personas involved**: Project Lead (own projects); Controller (any project).
**Pre-conditions**: Project at DoI ≥ 1 with metadata populated.
**Estimated walk-time**: 5 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | PL | Navigate to `/backlog/<project-id>` (or `/backlog` → click row) | Project detail page with 4 tabs: **Scores & Ranking** / **Financial Overview** / **Master Data** / **Milestones** | Default tab is Scores & Ranking |
| 2 | PL | Inspect the **Score Summary Card** at the top: Complexity (—), Value Creation (—), Composite (—), T-shirt size (e.g. "S") | All scores blank for unscored project | T-shirt size derives from `total_budget` per `PlanningParameter` thresholds (XS ≤ 100k €, S ≤ 250k €, M ≤ 500k €, L ≤ 1M €, XL above) |
| 3 | PL | In the **Profile selector row**, set **Project Type**: pick one of three radio options | Selected radio highlights with semantic ring colour (Type 3 ring red) | Type 3 (Legal / compliance / security / lifecycle) is exempt from the cutoff line per `[A-TN-08]` |
| 4 | PL | Set **Transformation level**: T0 (just better) / T1 (paper to software) / T2 (new business) | Selected radio highlights | Per `[A-TN-07]`. Transformation level is a categorical decorator only — does NOT factor into the composite score |
| 5 | PL | In the **Complexity** rubric block, score the 3 sub-criteria: **Standardization** (40%), **Usage** (40%), **Maintenance and support** (20%). Each row offers 5 buttons (1 → 5) with a headline label and tooltip with full description | Click each on level 4 (e.g.) | Complexity score recomputes inline: e.g. `(4 × 40 + 4 × 40 + 4 × 20) / 100 = 4.00` |
| 6 | PL | In the **Value Creation** rubric block, score 3 sub-criteria: **Financial benefit** (50%), **Payback** (40%), **Competitive advantage** (10%) | Click 5 / 4 / 3 (e.g.) | Value Creation score recomputes: `(5 × 50 + 4 × 40 + 3 × 10) / 100 = 4.40` |
| 7 | PL | Inspect the Composite (Value × 0.7 + Complexity × 0.3) with default ranking weights | Composite = 4.40 × 0.7 + 4.00 × 0.3 = 4.28 | Number rendered to 2 dp |
| 8 | PL | (No explicit Save button — saves on every input) | Each click triggers a PATCH to the project's TN fields with debouncing | Toast "Saved" on each settle; backlog ranking updates if user returns to `/backlog` |
| 9 | PL | (Reserved slots) The Value Creation block hints at "Two reserved slots are inactive in v5." | Hint visible | Reserved slots are stored in the DB but not surfaced as inputs in v5 |

### Alternative paths

- **Read-only mode**: An exec viewing the page sees the rubrics in read-only mode (no clickable level buttons). The composite is still visible.
- **Score reset**: Clicking the same level twice does not toggle to null in v5 — to reset a sub-criterion, the controller must edit via the API (PATCH with `null`).

### Post-conditions

- `Project.tn_standardization`, `tn_usage`, `tn_maintenance`, `tn_financial_benefit`, `tn_payback`, `tn_competitive_advantage` (Integer 1-5).
- Denormalised `complexity_score`, `value_creation_score`, `composite_score` (Numeric(4,2)) recomputed.
- `Project.project_type` (1/2/3), `Project.transformation_level` (T0/T1/T2).
- `tshirt_size` recomputed from `total_budget` per active thresholds.
- Backlog re-ranks; cutoff line may shift.

### Cross-references

- **Decision tags**: `[A-TN-01..09]`, `[A-BK-14..16]`
- **Backend endpoints**:
  - `routers/tech_navigator.py::update_scores` (PATCH `/api/projects/{id}/tech-navigator`)
  - `routers/tech_navigator.py::get_rubric_config` (GET `/api/projects/tech-navigator/config` — returns weights, thresholds, label dictionary)
- **In-app manual**: `portfolio_overview.json § Backlog Tab`
- **FAQ overlap**: faq-v5-02 ("How do I score a project's Tech Navigator profile?")

### Known issues / caveats

- Rubric labels for levels 2, 3, 4 are interpolated placeholders per the v5 spec note; only level 1 and level 5 endpoint definitions are spec-canonical. The Cluster D Admin Tech Navigator rubric matrix editor (`[D-CAT-04]`) is the long-term home of these labels — a follow-on session.

---

## W11.2: Adjust ranking weights / t-shirt thresholds

**Purpose**: Recalibrate the Tech Navigator scoring system: the Value × Complexity ranking weight and the t-shirt size budget thresholds. Editing any `tn_*` planning parameter triggers a portfolio-wide score recompute.
**When to use**: Annual review of scoring rubric; demoing the system's tunability.
**Personas involved**: Controller.
**Pre-conditions**: Planning Parameters section accessible (controller-only).
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/admin?section=parameters` | PlanningParameters loads with 6 group cards | "Tech Navigator Weights" hint mentioned in the panel description |
| 2 | Controller | Locate the rows belonging to `param_group='tech_navigator'` (in the Thresholds or a dedicated group depending on layout) | Rows visible: e.g. `tn_ranking_value_weight=0.7`, `tn_ranking_complexity_weight=0.3`, `tn_complexity_standardization_weight=0.4`, `tn_value_payback_weight=0.4`, `tshirt_xs_max_eur=100000`, `tshirt_s_max_eur=250000`, etc. | All `tn_*` and `tshirt_*` keys |
| 3 | Controller | Edit the Value vs Complexity ranking weight: change `tn_ranking_value_weight` from 0.7 → 0.6, `tn_ranking_complexity_weight` from 0.3 → 0.4 (must sum to 1.0) | Each save triggers a portfolio-wide composite recompute server-side | All projects' `composite_score` updates; Backlog re-ranks |
| 4 | Controller | (Optional) Adjust a t-shirt threshold: `tshirt_xs_max_eur` 100000 → 120000 | Save triggers re-derivation of `tshirt_size` for every project | Projects with `total_budget` between 100k and 120k flip from S to XS |
| 5 | Controller | Verify by navigating to `/backlog` | Cutoff bands and rank ordering reflect the new weights | KPI strip refreshes |

### Alternative paths

- **Sub-criterion weights**: Same flow, but for `tn_complexity_standardization_weight`, etc. The 3 weights within each axis must sum to 1.0; backend rejects out-of-range writes with 422.
- **Reset to Defaults**: Each Planning Parameters group has a Reset button; resetting Tech Navigator group restores the default 70/30 ranking and 40/40/20, 50/40/10 sub-criterion weights.

### Post-conditions

- `PlanningParameter.value` updated for each edited row.
- All `Project` rows recompute `composite_score` server-side.
- All `Project.tshirt_size` rows recompute if a threshold changed.
- `audit_log` rows in `configuration` category (one per param edit).

### Cross-references

- **Decision tags**: `[A-TN-09]`, `[A-PRI-01..04]`, `[A-BK-22]`
- **Backend endpoints**:
  - `routers/admin.py::update_planning_parameter` (PUT `/api/admin/planning-parameters/{key}`)
  - `services/tech_navigator.py::recompute_portfolio_scores` (called from update hook)
- **In-app manual**: `administration.json § Tech Navigator Weights`, `§ Planning Parameters`
- **FAQ overlap**: faq-12

---

## W11.3: Read the cutoff line + reorder backlog

**Purpose**: Interpret the Backlog's cutoff bands — Should-be cutoff (rank-derived from contestable envelope) vs Reality cutoff (additional override band) per `[A-BK-14..17]` — and use the **Within cutoff** filter / sort overrides to focus the view.
**When to use**: Pitch Board prep; "what gets funded if we close the envelope today" walks.
**Personas involved**: Controller; PL (read-only on backlog list); Executive (read-only).
**Pre-conditions**: ≥ 5 projects in the Backlog with composite scores set; Type 3 pre-funded total > 0 (at least one Type 3 project).
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/backlog` | Page loads with Backlog header, **CutoffSummaryStrip** (KPI strip), Filter bar, and ranked list | Subtitle: "Ranked IT project backlog with composite scoring and cutoff analysis." |
| 2 | Controller | Inspect the CutoffSummaryStrip — 6 KPI cells separated by dividers: **Budget envelope** (`€NM`), **Contestable** (`€NM` — "After €X Type 3 pre-funded"), **Should-be cutoff** (Rank N or "All fit" + Jump button), **Reality cutoff** (Rank N or "All fit" + Jump button), **Misaligned projects** (count, amber, only when zone exists), **Horizon** (N months) | All cells populated | Should-be uses the contestable envelope; Reality reflects override decisions in the seed |
| 3 | Controller | Click the **Jump** button next to "Should-be cutoff" | Page scrolls to the rank where the should-be line falls; a horizontal divider band visualises the cutoff position | Visual band between the funded and unfunded sections |
| 4 | Controller | Click the **Jump** button next to "Reality cutoff" | Page scrolls to the reality line; if the two lines differ, a misalignment zone (amber band) renders between them | Misalignment zone visible if `should_be_cutoff_rank ≠ reality_cutoff_rank` |
| 5 | Controller | Use the **Within cutoff** toggle in the Filter bar | List narrows to projects with `within_cutoff=true` (above the reality line OR Type 3 pre-funded) | Counter at top updates |
| 6 | Controller | Sort by a non-rank column (e.g. by Composite score descending) | Cutoff bands disappear (sort override suppresses bands per `[A-BK-15]`) | Sort hint message: "Cutoff bands are hidden when sorting by a non-rank column" |
| 7 | Controller | Reset sort to **Rank** | Bands re-appear at their original positions | View returns to the canonical ranked state |

### Alternative paths

- **Override a project's `within_cutoff`**: From a project's Backlog detail (Scores & Ranking tab), a controller can toggle `within_cutoff` true/false explicitly per `[A-BK-15]`. This shifts the Reality cutoff but not the Should-be.
- **Type 3 entry**: A new Type 3 project (legal / compliance) is automatically pre-funded off the top of the budget — it shows above the ranked list rather than competing within it.
- **No misalignment**: When Should-be == Reality, the Misalignment KPI cell is hidden (the strip has 5 cells instead of 6).

### Post-conditions

No state change unless step 6 alternative path is used. The cutoff lines are computed server-side per `services/ranking.py` and rendered client-side.

### Cross-references

- **Decision tags**: `[A-BK-14..17]`, `[A-PRI-01..04]`, `[A-TN-08]`
- **Backend endpoints**:
  - `routers/ranking.py::get_backlog` (GET `/api/portfolio/backlog`)
  - `routers/ranking.py::get_cutoff_lines` (GET `/api/portfolio/backlog/cutoff`)
  - `routers/ranking.py::set_within_cutoff_override`
- **In-app manual**: `portfolio_overview.json § Backlog Tab`, `backlog.json` if separated
- **FAQ overlap**: faq-v5-15 ("What's the cutoff line in the Backlog?")

### Known issues / caveats

- The contestable envelope = `total_available_budget − Σ(Type 3 budgets)`. If a Type 3 project's budget changes, the envelope shifts and every below-line ranking can re-rank. Controllers can mitigate by locking budgets during ranking sessions (Cluster D follow-on).
- The Should-be cutoff is purely budget-derived; the Reality cutoff captures "what we'd actually fund" including override decisions. The misalignment zone is the visible gap between strategy (Should-be) and reality (Reality) and is the controller's primary attention surface.

---

## Cross-workflow notes

- **Tech Navigator drives Backlog ranking**: composite_score determines rank (descending) within the contestable envelope. Type 3 projects are pre-funded; Type 1 / Type 2 compete on score.
- **DoI gating interacts with Backlog**: Only DoI 0-3 projects appear in the Backlog ranker. DoI 4 (Hyper-maintenance) and DoI 5 (Operate) projects move to the Run Portfolio (see [W02.8](./02-project-lifecycle.md#w028-transition-to-run-doi-45)) and are no longer ranked.
- **Score weighting drift**: changing `tn_*` weights mid-cycle is permitted; controllers should communicate with PLs and document the rationale because the resulting recompute can cause significant Backlog re-ranks.
- **Off-path stages**: Projects in Paused / Cancelled stages have their DoI frozen in `frozen_doi`; their composite score is preserved but excluded from the cutoff calculation per `[A-DOI-03]`.

## Related FAQ entries

- faq-v5-01 "How does a project move through the DoI lifecycle (0→5)?"
- faq-v5-02 "How do I score a project's Tech Navigator profile?"
- faq-v5-03 "What's the difference between Change Portfolio and Run Portfolio?"
- faq-v5-15 "What's the cutoff line in the Backlog?"
