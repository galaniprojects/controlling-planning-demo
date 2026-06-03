# 06 — What-If Simulator

Scenario sandbox for evaluating portfolio + cost-allocation changes before committing to the live forecast. The simulator is **isolated from canonical state**: edits live in scenario-versioned tables (`DistributionVersion` with `scenario_id=N` for Stage-1, `ScenarioAction` overlays for Stage-2 BTC) and only materialise via Promote (`[B-PR-01..05]`) or Apply-to-forecast.

**Editing surfaces by scope:**

At **project scope** the primary surface is the directly-editable forecast grid (WYSIWYG). Users edit cells, add/remove role lines, add/remove/edit external-cost line items, adjust milestones/DoI/stage, and move project dates directly. A macro strip provides four configurable bulk helpers: Delay by N months, Accelerate by N months, Pause for N months, Remove. The seniority/sourcing mix control is the only Tier-3 project-scope control.

At **portfolio scope** a fixed bulk-lever catalogue remains the right tool. `lever_category` values cover `forecast_grid`, `rate_table`, `people`, `pipeline_stage`, `tech_navigator`, `cost_allocation`, `capacity_param`, `hierarchy`, `budget_envelope`, `milestone`, `vendor_contract`, `sourcing_mix`, `capex_opex`, `escalation`, `running_cost`, `hypothetical_project`, `restructuring`.

**Cost-allocation sandbox** (`lever_category='cost_allocation'`, Tier 3): Stage 1 distribution edges and Stage 2 BTC profile lines are fully editable in sandbox mode — Stage 1 supports adding new destinations; Stage 2 BTC lines are freely editable (sum-to-100 enforced). Edits fork into a per-scenario `DistributionVersion` (Stage 1) or `ScenarioAction` overlays (Stage 2) — canonical rows are never touched until Promote.

**Tier 3 gating** (`[B-SL-03]`): scenarios containing `cost_allocation` edits flag `tier3_content_flag=true`. Publishing a Tier 3 scenario is restricted to users with `tier3_flag=true`.

**Visibility** (`[B-SL-03]`):
- `private` — author only
- `tier3_only` — Tier 3 users
- `all_users` — anyone authenticated

---

## W06.1: Create a blank scenario

**Purpose**: Start a new sandbox to test "what if" portfolio changes without affecting the canonical forecast.
**When to use**: Anytime a stakeholder asks "what would happen if…" — answer it with a scenario rather than spreadsheets.
**Personas involved**: Controller / Executive / CC Owner / Project Lead. (PL scenarios are scoped to the projects they lead; CC Owner scenarios are CC-scoped per `[F-AC-01]`.)
**Pre-conditions**: At least one published forecast cycle exists (anchor source).
**Estimated walk-time**: 3 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/simulator` | Scenario manager loads with two sections: "My Scenarios" (rows for own scenarios) and "Published Scenarios" (rows where `visibility != private` and not authored by current user) | Heading "What-If Simulator"; ≥ 2 seeded scenarios visible (`MDH BTC Rebalance — DE/PL/CZ` and `Budget Pressure: 15% Reduction`) |
| 2 | Controller | Click **+ Create New Scenario** in the page header | Modal opens: "Create scenario" with fields Name, Description, Tags (free text, comma-separated), Anchor forecast version dropdown | Modal heading visible. Anchor defaults to "Latest cycle" |
| 3 | Controller | Fill: Name "Q3 capacity stress test"; Description "Model what happens if APD CC gets 15% fewer FTE next quarter"; Tags "capacity, stress-test" | Form validates inline | Create button enabled when Name + Anchor set |
| 4 | Controller | Click **Create** | Modal closes; navigates to `/simulator/scenarios/{newId}` | Toast "Scenario created"; Scenario workspace opens with empty action list and "Recalculated just now" indicator |

### Alternative paths

- **CC Owner scenario**: As CC Owner (Thomas), the create modal automatically scopes the scenario to `cc_owner_scope_cc_id=<their CC>` per `[F-AC-01]`. The scenario will only be visible to that CC's owners + controllers.
- **From a goal**: Step 2 alternative — use the AI Advisor entry point (see [W06.7](#w067-ai-advisor-goal-driven-planning)).

### Post-conditions

- New `scenarios` row, `status='private'`, `visibility='private'`, `anchor_forecast_version_id` set, `last_recalculated_at=now()`.

### Cross-references

- **Decision tags**: `[B-SL-01..05]`, `[F-AC-01]`
- **Backend endpoint**: `routers/scenarios.py::create_scenario()`
- **In-app manual**: `whatif_simulator.json § Scenario Manager`

---

## W06.2: Clone an existing scenario

**Purpose**: Duplicate a published scenario as a starting point — useful for "yes, but with one change" walks.
**When to use**: Iterating on a published scenario that you don't own, or branching from an old scenario you want to revise without losing history.
**Personas involved**: Any user with simulator access.
**Pre-conditions**: A published scenario exists (e.g., seeded `Budget Pressure: 15% Reduction`).
**Estimated walk-time**: 2 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | Open `/simulator` | Scenario manager loads | Published scenarios table populated |
| 2 | Any | Right-click (or click ⋯) on `Budget Pressure: 15% Reduction` row → **Clone** | Confirmation prompt: "Clone scenario as new private draft?" | Prompt visible |
| 3 | Any | Confirm | New scenario row appears in My Scenarios with name "Budget Pressure: 15% Reduction (copy)"; redirects to its workspace | Toast "Scenario cloned"; URL changes |

### Post-conditions

- New `scenarios` row with all `scenario_actions` copied; `status='private'`; clone metadata recorded in `description` ("Cloned from <id>").

### Cross-references

- **Backend endpoint**: `routers/scenarios.py::clone_scenario()`

---

## W06.3: Edit a scenario at project scope (WYSIWYG grid + macros)

**Purpose**: Model changes to a single project using the directly-editable forecast grid and macro strip. This is the primary project-scope editing surface — there are no separate action forms at project scope.
**When to use**: After creating an empty scenario, before checking the impact dashboard. Use direct grid editing for any cell- or line-level change; use the macro strip for bulk curve operations (delay/accelerate/pause/remove).
**Personas involved**: Scenario owner (Controller / Executive / CC Owner / Project Lead scoped to own projects).
**Pre-conditions**: Empty or partially-built scenario open in workspace.
**Estimated walk-time**: 8 min.

### Direct cell edits

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Owner | In the scenario workspace left rail, expand **Projects** → click "Master Data Hub Rollout" | Project forecast grid loads on the right, fully editable | Grid header shows project name + DoI / status; future cells are white/editable, actuals are shaded read-only |
| 2 | Owner | Click a future-month cell on the "Senior Developer" row and type a new hours value | Cell updates inline; row total and project budget delta update immediately | Project financial summary (line totals, delta-vs-anchor, RAG) refreshes live without needing Recalculate |
| 3 | Owner | Click **+ Add role line** in the grid footer | Role-picker dialog opens; select role and cost centre | New line appears in the grid with zero hours; add values cell by cell |
| 4 | Owner | Click the trash icon on a role line | Confirmation prompt; confirm → line removed from the scenario's overlay | Line disappears; project budget delta updates |

### External-cost line items

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 5 | Owner | Switch to the **External Costs** section of the project grid | External-cost lines shown; each line has vendor, category, description, and monthly € cells | Lines marked as actual are read-only |
| 6 | Owner | Edit a future-month € cell on an existing external-cost line | Cell updates; line total updates | Project financial summary updates live |
| 7 | Owner | Click **+ Add external cost** | Dialog: vendor, category, description, capex/opex | New line appears in the grid |

### Project dates and metadata

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 8 | Owner | Click the **Edit project dates** control in the project header | Date pickers for start and end month | Grid window shifts to reflect the new date range after save |
| 9 | Owner | Edit milestone or DoI via the plan edit controls | Milestone updated in the scenario overlay | Stage/DoI/milestone changes route through the DoI gate check at Promote |

### Macro strip (bulk curve operations)

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 10 | Owner | In the macro strip above the grid, click **Delay** | Parameterised input: "Delay by N months"; enter 3 | Macro stored as a `delay_project` `ScenarioAction`; the resolved grid reflects the curve shifted 3 months |
| 11 | Owner | Observe a hand-edited cell (step 2 above) | The edited cell stays on its absolute month; it does not travel with the delay shift | This is expected: macros apply first, then hand edits win on the cells they touch |

### Cost-allocation sandbox (Stage 1 + Stage 2) — Tier 3

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 12 | Owner | Left rail → expand **Bulk Actions** → **Cost Allocation Sandbox** | Sandbox surface loads showing distribution graph; Stage 1 editor shows add-destination option | Banner "Tier 3 content — promote requires elevated permissions" |
| 13 | Owner | Edit edge `svc-ident-auth → off-mdh` from 30% to 35%; or click **+ Add destination** to add a new Stage-1 edge | Edge value updates; sum-rule auto-revalidates; add-destination opens entity picker | If sum rule violated (>100%), Save is blocked |
| 14 | Owner | Switch to the Stage 2 (BTC) tab; edit a BTC line percentage | Line value updates; sum indicator turns amber if not 100% | BTC overlay stored as a `ScenarioAction` with `lever_category='cost_allocation'`; scenario `tier3_content_flag` flips to `true` |

### Post-conditions

- Cell edits land in `ScenarioForecastCellEdit` overlay rows. Line adds/removes land in `ScenarioLineEdit`. Plan edits in `ScenarioPlanEdit`. Mix changes in `ScenarioMixChange`. Macros in `ScenarioAction` rows (`scope='project'`, `action_type ∈ PROJECT_MACRO_ACTION_TYPES`).
- Cost-allocation edits: Stage 1 forks into a scenario `DistributionVersion`; Stage 2 lives as `ScenarioAction` overlays — canonical rows untouched.
- `tier3_content_flag=true` if any cost-allocation or other Tier-3 action is present.
- `last_recalculated_at` updated after Recalculate; `headline_impact_json` populated with summarised impact.

### Cross-references

- **Decision tags**: `[B-AC-01..02]`, `[B-ES-01]` (lever surfaces)
- **Backend endpoints**: `routers/scenarios.py` — `PUT /{id}/projects/{pid}/cells`, `POST /{id}/projects/{pid}/lines`, `PUT /{id}/projects/{pid}/plan`, `PUT /{id}/projects/{pid}/mix`, `POST /{id}/projects/{pid}/external-costs`, `POST /{id}/actions` (macros + cost-allocation)
- **In-app manual**: `whatif_simulator.json § Editing surfaces: project scope vs portfolio scope`

---

## W06.4: Compare 2-5 scenarios side-by-side

**Purpose**: Put scenarios next to each other to support a Pitch Board / executive readout decision.
**When to use**: When choosing between competing portfolio responses to the same constraint (e.g., "15% budget cut: Option A vs Option B").
**Personas involved**: Any user with simulator access.
**Pre-conditions**: ≥ 2 scenarios visible to current user.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | Navigate to `/simulator` | Scenario manager loads | At least 2 scenarios visible |
| 2 | Any | Click **Compare Scenarios** in the page header | Modal: "Pick 2-5 scenarios to compare" with a checkbox list | All accessible scenarios listed |
| 3 | Any | Tick `MDH BTC Rebalance` and `Budget Pressure: 15% Reduction` | Compare button enables | Counter shows "2 selected" |
| 4 | Any | Click **Compare** | Navigates to `/simulator/compare?ids=...` | Comparison view with side-by-side cards: financial impact, capacity impact, KPI deltas |
| 5 | Any | Click any individual scenario card | Drills into that scenario's workspace | URL changes to `/simulator/scenarios/{id}` |

### Post-conditions

- No state change; comparison is read-only.

### Cross-references

- **Backend endpoint**: `services/scenario_impact.py::compare_scenarios()`
- **In-app manual**: `whatif_simulator.json § Comparison`

---

## W06.5: Cost-allocation sandbox (Stage 1 + Stage 2) — sandbox → impact preview → promote

**Purpose**: The flagship demo for cost-allocation simulation. Walk through a Tier 3 scenario that mutates the demo flagship's (`off-mdh`) BTC profile (Stage 2) and promotes the change to canonical state. Optionally also demonstrates adding a Stage-1 distribution destination.
**When to use**: Showcase the F-cluster cost-allocation sandbox wiring; demonstrate fully-editable Stage 1 and Stage 2 editing and the sandbox-to-canonical handoff.
**Personas involved**: Controller (must have `tier3_flag=true` to promote).
**Pre-conditions**: Seeded `MDH BTC Rebalance — DE/PL/CZ` scenario exists. Controller has Tier 3 access.
**Estimated walk-time**: 9 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/simulator` | Scenario manager loads | "MDH BTC Rebalance — DE/PL/CZ" listed as Private with tags `cost-allocation / btc / flagship` |
| 2 | Controller | Click the row | Workspace opens with description "Cost-allocation sandbox demo. Rebalance Master Data Hub BTC: shift 10pp from DE-Munich onto PL-Poznan (+5pp) and CZ-Prague (+5pp)." | Recalculated indicator (e.g. "Recalculated 36d ago") |
| 3 | Controller | Click **Recalculate** | Recalculation runs (~5-10s); 9 dimension tiles populate | Tiles: Financial / Ranking / Capacity / People / Outsourcing / Investment Mix / Running Cost / Cost Allocation / Change Summary |
| 4 | Controller | Open **Cost Allocation** dimension panel | Per-charging-location table shows shifts: DE-Munich -10pp, PL-Poznan +5pp, CZ-Prague +5pp | Headline impact: "Rebalances ~€228k of annual Stage-2 charge from DE legal entity to PL+CZ legal entities" |
| 5 | Controller | In the left rail → **Bulk Actions** → **Cost Allocation Sandbox** → Stage 2 (BTC) tab, edit a BTC line percentage directly | Line value updates; sum indicator turns amber if not at 100% | New or updated `ScenarioAction` row with `lever_category='cost_allocation'`; UM-refresh and mode-switch buttons are hidden (canonical-only) |
| 6 | Controller | (Optional) Switch to Stage 1 tab; click **+ Add destination** to add a new distribution edge | Entity picker opens; select destination, enter percentage, click Add | New edge stored in the scenario-scoped `DistributionVersion`; sum-rule and cycle check enforced |
| 7 | Controller | Click **Change summary** in the bottom-right pill | Modal listing all actions in the scenario with categorisation | Lists actions at Tier 3 |
| 8 | Controller | Click **Promote** in the page header (⋯ menu) | Permission check: must have `tier3_flag=true` AND `RolePermissionGrant` for `entity_type='btc_profile'`. Confirmation modal: "Materialise overlay onto canonical BTCProfile?" | Modal visible; per `[F-AC-01]` controllers default-have permission |
| 9 | Controller | Click **Confirm & promote** | Scenario action applied to live `BTCProfileLine` rows for off-mdh year=2026; `ScenarioPromotion` audit row created | Toast "Promoted 1 action"; scenario status updates with `promoted_at` timestamp |
| 10 | Controller | Navigate to `/charging?section=btc`, find off-mdh, click **Edit** | BTC line table shows DE-Munich at 18% (was 28%), PL-Poznan at 8% (was 3%), CZ-Prague at 7% (was 2%) | Canonical BTC profile reflects the promoted shift |
| 11 | Controller | (Cleanup) Navigate back to scenario, click **Archive** | Archived flag set | Scenario disappears from Active list; visible under "Show archived" |

### Alternative paths

- **No Tier 3 access**: Step 8 confirmation modal is replaced with "Insufficient permissions — Tier 3 promotion of cost allocation scenarios requires the `tier3_flag` user attribute. Contact your administrator."
- **Partial promote**: in scenarios with mixed-tier actions, Promote only applies actions the user has permission for; non-promoted actions stay in the scenario for future Promote.
- **Impact preview is unbalanced or empty**: indicates the scenario action's `parameters_json` schema does not match what `services/scenario_cost_allocation.py::_collect_btc_overlay()` expects — the engine wants the COMPLETE post-rebalance `lines` array (sum=100), not a deltas-style `changes` array. Check the action's `action_type` is `btc_profile_line_change` (not the v4 `btc_profile_change`).

### Post-conditions

- Live `BTCProfileLine` rows for `(off-mdh, 2026)` updated.
- `ScenarioPromotion` audit row with routing summary JSON.
- `RollupCache` entries for stage2_location invalidated for off-mdh year=2026.
- `audit_log` row in `simulator` category.

### Cross-references

- **Decision tags**: `[B-PR-03..05]`, `[F-AC-01]`, `[F-S1-*]`, `[F-S2-*]`
- **Backend endpoint**: `routers/scenarios.py::promote_scenario()` → `services/scenario_promote.py`; cost-allocation edits via `POST/PUT/DELETE /{id}/cost-allocation/...`
- **In-app manual**: `whatif_simulator.json § Cost-allocation sandbox (Stage 1 + Stage 2)`

### Known issues / caveats

- None. (The Cost Allocation impact tile bug — empty deltas for BTC-only scenarios — was resolved by the union-aware effective-cost rewrite in `services/scenario_cost_allocation.py::_compute_scenario_effective_cost`. The seeded MDH BTC Rebalance now shows balanced totals and three non-zero per-location deltas.)

---

## W06.6: Apply scenario to forecast (PL)

**Purpose**: A PL pre-populates their next forecast cycle submission with diffs from a scenario — either one they authored themselves or a published scenario that touches their projects.
**When to use**: After a PL has authored a sandbox scenario they want to feed into their real forecast cycle, or after Pitch Board endorses a published scenario and asks PLs to re-baseline against it.
**Personas involved**: Project Lead.
**Pre-conditions**: Either a PL-authored scenario with project-scope edits, or a published scenario whose actions touch ≥ 1 project the PL owns.
**Estimated walk-time**: 4 min.

### Steps — from a PL-authored scenario

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | PL | From `/simulator`, click one of your own scenarios (your authored scenarios are visible in the My Scenarios list) | Scenario workspace opens in edit mode | Scenario header shows author = you |
| 2 | PL | Click **Apply to forecast** in the page header | Modal: "Apply scenario diffs to your next forecast cycle for: <list of your projects in the scenario>" | Modal lists ≥ 1 of the PL's projects |
| 3 | PL | Click **Confirm apply** | `ScenarioApplyToForecastEvent` row created; PL's forecast cycle for those projects has the scenario diffs pre-loaded with `Forecast.is_provisional=true` for outer-zone cells | Toast "Applied to forecast"; navigate to Workbench Forecast tab; cells show provisional badge |

### Steps — from a published scenario (leadership handoff)

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | PL | From `/simulator`, locate a published scenario whose tags or description suggests it touches your projects | Scenario manager lists published scenarios | "Budget Pressure: 15% Reduction" visible |
| 2 | PL | Click the scenario row | Workspace opens in read-only mode (PL can't edit a non-owned scenario) | Read-only banner; only the PL's project slice is shown in the apply modal |
| 3 | PL | Click **Apply to forecast** in the page header | Modal: "Apply scenario diffs to your next forecast cycle for: <list of own projects>" | Modal lists ≥ 1 of the PL's projects |
| 4 | PL | Click **Confirm apply** | `ScenarioApplyToForecastEvent` row created; PL's forecast cycle for those projects has the scenario diffs pre-loaded with `Forecast.is_provisional=true` for outer-zone cells | Toast "Applied to forecast"; navigate to Workbench Forecast tab; cells show provisional badge |

### Post-conditions

- `ScenarioApplyToForecastEvent` audit row with `applied_by_id`, `applied_at`, `cycle_id`, `summary_json`.
- Affected `Forecast` rows have `is_provisional=true` for cells outside the granularity boundary per `[B-OQ-02]`.
- The scenario is not consumed — the PL can re-apply after revising to re-seed.

### Cross-references

- **Decision tags**: `[B-PR-05]`, `[B-OQ-02]`, `[C-FG-07]`
- **Backend endpoint**: `routers/scenarios.py::apply_to_forecast()` → `services/scenario_apply_forecast.py`

---

## W06.7: AI Advisor goal-driven planning

**Purpose**: Let the AI Advisor propose 2-3 candidate scenario paths from a natural-language goal.
**When to use**: When a stakeholder asks "what could we do about <constraint>" — the advisor offers fast structured options instead of building from scratch.
**Personas involved**: Any user with simulator access.
**Pre-conditions**: AI Advisor goals fixture seeded (4 goals; after fixture refresh: 5 incl. "Rebalance MDH BTC").
**Estimated walk-time**: 5 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Any | Open a scenario workspace (existing or fresh) | Workspace loads | AI Advisor button visible top-right |
| 2 | Any | Click **AI Advisor** | Side panel opens with goal selector + free-text input | Panel heading "AI Advisor" |
| 3 | Any | Type "find ~2M savings" | The advisor matches against seeded goal patterns; 3 paths surface (Conservative / Moderate / Aggressive) | 3 path cards displayed with headline numbers + actions list |
| 4 | Any | Read the path summaries; pick "Moderate"; click **Apply path** | Path's component actions are bulk-added to the scenario | Action list count jumps by N (number of actions in the path) |
| 5 | Any | Verify impact dashboard recalculates | Dimension tiles refresh | Financial dimension shows the savings target |

### Alternative paths

- **No matching pattern**: If the typed goal doesn't match any seeded pattern (e.g., "make me coffee"), the advisor returns a friendly "I can help with: budget cuts, capacity relief, prioritisation, risk mitigation" hint.
- **Custom goal (no API key)**: If `ANTHROPIC_API_KEY` is not configured, dynamic Claude-based responses are disabled and the advisor only uses the 4-5 seeded goal patterns.

### Post-conditions

- N new `scenario_actions` rows added.
- `last_recalculated_at` updated.

### Cross-references

- **Decision tags**: `[B-AC-03]` (advisor)
- **Backend endpoint**: `routers/scenarios.py::advisor_apply_path()` → `services/advisor.py`
- **In-app manual**: `whatif_simulator.json § AI Advisor`
- **FAQ overlap**: faq.json "How do I use the AI Advisor?"

---

## W06.8: Archive / publish / unpublish + Tier 3 gating

**Purpose**: Manage scenario lifecycle states (private → published, archive, restore).
**When to use**: After a scenario has served its purpose, archive to clean up the manager. Publish to share with peers (subject to Tier 3 gating).
**Personas involved**: Scenario owner.
**Pre-conditions**: At least one private scenario you own.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Owner | Open a private scenario you authored | Workspace loads | Status badge "Private" |
| 2 | Owner | Click ⋯ menu in header → **Publish** | Permission check; if scenario has `tier3_content_flag=true` and you lack `tier3_flag`, the action is blocked with "Tier 3 publish requires elevated permissions" | Modal: "Publish scenario as visible to all users?" |
| 3 | Owner | Click **Confirm publish** | Status badge flips to "Published"; visibility set to `all_users` (or `tier3_only` if Tier 3 content) | Toast "Scenario published"; appears in others' Published list |
| 4 | Owner | Test unpublish: ⋯ → **Unpublish** | Status reverts to Private | Visible to author only again |
| 5 | Owner | Click **Archive** | Confirmation: "Archive this scenario? It will be hidden from active lists but kept for audit." | Archived flag set |
| 6 | Owner | Toggle **Show archived** in the manager | Archived scenarios reappear (greyed) | Filter pill active |
| 7 | Owner | (Optional) Restore: click row → **Unarchive** in the workspace ⋯ menu | Returns to active state | |

### Cross-references

- **Decision tags**: `[B-SL-03..05]` (visibility, archive, Tier 3 gating)
- **Backend endpoints**: `routers/scenarios.py::publish_scenario()`, `unpublish_scenario()`, `archive_scenario()`, `unarchive_scenario()`

### Known issues / caveats

- Tier 3 promotion requires both `tier3_flag=true` on the user AND a `RolePermissionGrant` row covering the relevant `entity_type` (`btc_profile` / `distribution`). Controllers default-have these grants; other roles need explicit admin-issued grants per `[F-AC-01]`.

---

## Cross-workflow notes

- **Scenarios never touch live state** until Promote (W06.5) or Apply-to-forecast (W06.6) is invoked. Editing is always sandbox-only.
- **Project-scope feedback is split by cost**: project-own financials (line totals, delta-vs-anchor, RAG) update live on each cell edit; expensive cross-portfolio dimensions (capacity, backlog ranking, investment mix) debounce ~1s. A manual **Recalculate** is still available. `last_recalculated_at` reflects the last full recalculation.
- **Stale indicator**: if the anchor `ForecastVersion` is superseded by a newer cycle, the scenario shows a "Stale — rebase to latest cycle" indicator. Use the **Rebase** action (⋯ menu) to re-anchor. Rebase is required before both Promote and Apply-to-forecast.
- **Cost-allocation sandbox** is the correct term for Stage-1 + Stage-2 scenario editing. The historical "Lever 12" name is retired.
