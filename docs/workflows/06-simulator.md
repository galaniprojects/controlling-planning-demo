# 06 — What-If Simulator

Scenario sandbox for evaluating portfolio + cost-allocation changes before committing to the live forecast. The simulator is **isolated from canonical state**: edits live in scenario-versioned tables (`Distribution.version='scenario-{id}'`, `ScenarioAction` overlays for BTC) and only materialise via Promote (`[B-PR-01..05]`).

**Twelve action levers** per `[B-AC-02]`:

| # | Lever | Category | Tier |
|---|---|---|---|
| 1 | Delay project start | `forecast_grid` | 1 |
| 2 | Reduce project hours | `forecast_grid` | 1 |
| 3 | Remove project (cancel) | `forecast_grid` | 1 |
| 4 | Accelerate project | `forecast_grid` | 1 |
| 5 | Add scope (new line items) | `forecast_grid` | 1 |
| 6 | Sourcing mix (int/ext) | `people` | 2 |
| 7 | Rate table change | `rate_table` | 2 |
| 8 | Tech Navigator profile edit | `tech_navigator` | 1 |
| 9 | Capacity allocation change | `forecast_grid` | 2 |
| 10 | Distribution edge (Stage 1) | `cost_allocation` | 3 |
| 11 | BTC profile line shift (Stage 2) | `cost_allocation` | 3 |
| 12 | Pipeline / DoI / milestone shift | `pipeline_stage` / `milestone` | 1-2 |

**Tier 3 gating** (`[B-SL-03]`): scenarios touching levers 10 / 11 (cost_allocation) flag `tier3_content_flag=true`. Publishing a Tier 3 scenario is restricted to users with `tier3_flag=true`.

**Visibility** (`[B-SL-03]`):
- `private` — author only
- `tier3_only` — Tier 3 users
- `all_users` — anyone authenticated

---

## W06.1: Create a blank scenario

**Purpose**: Start a new sandbox to test "what if" portfolio changes without affecting the canonical forecast.
**When to use**: Anytime a stakeholder asks "what would happen if…" — answer it with a scenario rather than spreadsheets.
**Personas involved**: Controller / Executive / CC Owner. (PL can apply existing scenarios but not author per `[E-06c]`; CC Owner scenarios are CC-scoped per `[F-AC-01]`.)
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

## W06.3: Apply scenario actions (4 lever types walked)

**Purpose**: Add concrete actions to a scenario. This walk demonstrates 4 representative levers; the same UX pattern handles the remaining 8.
**When to use**: After creating an empty scenario, before checking the impact dashboard.
**Personas involved**: Scenario owner.
**Pre-conditions**: Empty or partially-built scenario open in workspace.
**Estimated walk-time**: 8 min (~2 min per lever).

### Lever 1 (delay project start) — type 1

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1.1 | Owner | In the scenario workspace left rail, expand **Projects** → click "Master Data Hub Rollout" | Project sandbox surface loads on the right | Surface header shows project name + DoI / status |
| 1.2 | Owner | Click **Delay start** action button | Inline form: "Delay by X months" with a numeric stepper | Stepper defaults to "1 month" |
| 1.3 | Owner | Set "3 months" and click **Apply** | Action appears in the right-side action list with label "Delay proj-mdh-rollout by 3 months" | Action list count increments; the dimension tiles top-right show "Recalculating…" then settle with new values |

### Lever 2 (reduce hours) — type 2

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 2.1 | Owner | From the same project surface, click **Reduce hours** | Inline form: select role, %, period | Role dropdown lists roles with current allocations |
| 2.2 | Owner | Select "Senior Developer", reduce 20%, period "2026-09 to 2026-12" | Form validates | Action preview shows "Reduce Senior Developer Sep-Dec 2026 by 20%" |
| 2.3 | Owner | Click **Apply** | Action added; impact recalculates | Action list now has 2 items |

### Lever 5 (add scope) — type 5

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 5.1 | Owner | Click **Add scope** action | Form: scope description, role required, monthly hours, start month | Free text scope description |
| 5.2 | Owner | Fill: "Add data steward FTE for steady-state operations", role "Data Engineer", 80h/mo, start 2027-01 | Form validates | Apply enabled |
| 5.3 | Owner | Click **Apply** | Action stored; portfolio cost increases | Impact tiles update; Action list = 3 |

### Lever 10 (distribution edge mutation) — type 10, **Tier 3**

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 10.1 | Owner | Left rail → expand **Bulk Actions** → **Cost Allocation Sandbox** | Sandbox surface loads showing distribution graph | Banner "Tier 3 content — promote requires elevated permissions" |
| 10.2 | Owner | Edit edge `svc-ident-auth → off-mdh` from 30% to 35% | Edge value updates; sum-rule auto-revalidates | If sum rule violated (>100%), Apply is blocked |
| 10.3 | Owner | Click **Apply** | Action stored as `lever_category='cost_allocation'`, `tier=3`; scenario `tier3_content_flag` flips to `true` | Tier 3 indicator appears on scenario header |

### Post-conditions (after all 4 actions)

- 4 `scenario_actions` rows linked to scenario, with mixed `lever_category` values.
- One action with `tier=3` flips `tier3_content_flag=true` on `scenarios`.
- `last_recalculated_at` updated; `headline_impact_json` populated with summarised impact.

### Cross-references

- **Decision tags**: `[B-AC-01..02]`, `[B-ES-01]` (lever surfaces)
- **Backend endpoint**: `routers/scenarios.py::add_action()`
- **In-app manual**: `whatif_simulator.json § Action Panel`

### Known issues / caveats

- The "Cost Allocation Sandbox" surface (lever 10/11) shows distribution edges and BTC lines as editable inputs, but the impact preview's Cost Allocation dimension tile may show "No allocation changes" even after edits — this is a known issue; the underlying `ScenarioAction` is stored correctly and Promote materialises the change.

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

## W06.5: Lever 12 BTC rebalance — sandbox → impact preview → promote

**Purpose**: The flagship demo for cost-allocation simulation. Walk through a Tier 3 scenario that mutates the demo flagship's (`off-mdh`) BTC profile and promotes the change to canonical state.
**When to use**: Showcase the F-cluster + B1 lever-12 wiring; demonstrate the sandbox-to-canonical handoff.
**Personas involved**: Controller (must have `tier3_flag=true` to promote).
**Pre-conditions**: Seeded `MDH BTC Rebalance — DE/PL/CZ` scenario exists. Controller has Tier 3 access.
**Estimated walk-time**: 9 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | Controller | Navigate to `/simulator` | Scenario manager loads | "MDH BTC Rebalance — DE/PL/CZ" listed as Private with tags `lever-12 / btc / flagship` |
| 2 | Controller | Click the row | Workspace opens with description "Lever 12 demo. Rebalance Master Data Hub BTC: shift 10pp from DE-Munich onto PL-Poznan (+5pp) and CZ-Prague (+5pp)." | Recalculated indicator (e.g. "Recalculated 36d ago") |
| 3 | Controller | Click **Recalculate** | Recalculation runs (~5-10s); 9 dimension tiles populate | Tiles: Financial / Ranking / Capacity / People / Outsourcing / Investment Mix / Running Cost / Cost Allocation / Change Summary |
| 4 | Controller | Open **Cost Allocation** dimension panel | Per-charging-location table shows shifts: DE-Munich -10pp, PL-Poznan +5pp, CZ-Prague +5pp | Headline impact: "Rebalances ~€228k of annual Stage-2 charge from DE legal entity to PL+CZ legal entities" |
| 5 | Controller | (Optional) Edit BTC line directly in the sandbox surface | Line value updates; scenario action stored | New `ScenarioAction` row with `lever_category='cost_allocation'` |
| 6 | Controller | Click **Change summary** in the bottom-right pill | Modal listing all actions in the scenario with categorisation | Lists 1 action (BTC profile mutation) at Tier 3 |
| 7 | Controller | Click **Promote** in the page header (⋯ menu) | Permission check: must have `tier3_flag=true` AND `RolePermissionGrant` for `entity_type='btc_profile'`. Confirmation modal: "Materialise overlay onto canonical BTCProfile?" | Modal visible; per `[F-AC-01]` controllers default-have permission |
| 8 | Controller | Click **Confirm & promote** | Scenario action applied to live `BTCProfileLine` rows for off-mdh year=2026; `ScenarioPromotion` audit row created | Toast "Promoted 1 action"; scenario status updates with `promoted_at` timestamp |
| 9 | Controller | Navigate to `/charging?section=btc`, find off-mdh, click **Edit** | BTC line table shows DE-Munich at 18% (was 28%), PL-Poznan at 8% (was 3%), CZ-Prague at 7% (was 2%) | Canonical BTC profile reflects the promoted shift |
| 10 | Controller | (Cleanup) Navigate back to scenario, click **Archive** | Archived flag set | Scenario disappears from Active list; visible under "Show archived" |

### Alternative paths

- **No Tier 3 access**: Step 7 confirmation modal is replaced with "Insufficient permissions — Tier 3 promotion of cost allocation scenarios requires the `tier3_flag` user attribute. Contact your administrator."
- **Partial promote**: in scenarios with mixed-tier actions, Promote only applies actions the user has permission for; non-promoted actions stay in the scenario for future Promote.
- **Impact preview is unbalanced or empty**: indicates the scenario action's `parameters_json` schema does not match what `services/scenario_lever12.py::_collect_btc_overlay()` expects — the engine wants the COMPLETE post-rebalance `lines` array (sum=100), not a deltas-style `changes` array. Check the action's `action_type` is `btc_profile_line_change` (not the v4 `btc_profile_change`).

### Post-conditions

- Live `BTCProfileLine` rows for `(off-mdh, 2026)` updated.
- `ScenarioPromotion` audit row with routing summary JSON.
- `RollupCache` entries for stage2_location invalidated for off-mdh year=2026.
- `audit_log` row in `simulator` category.

### Cross-references

- **Decision tags**: `[B-LV-12]`, `[B-PR-03..05]`, `[F-AC-01]`, `[F-S2-*]`
- **Backend endpoint**: `routers/scenarios.py::promote_scenario()` → `services/scenario_promote.py`
- **In-app manual**: `whatif_simulator.json § Lever 12 sandbox`

### Known issues / caveats

- None. (The Cost Allocation impact tile bug — empty deltas for BTC-only scenarios — was resolved by the union-aware effective-cost rewrite in `services/scenario_lever12.py::_compute_scenario_effective_cost`. The seeded MDH BTC Rebalance now shows balanced totals and three non-zero per-location deltas.)

---

## W06.6: Apply scenario to forecast (PL)

**Purpose**: A PL takes a published scenario's diffs that affect their projects and pre-populates their next forecast cycle submission with them.
**When to use**: After Pitch Board endorses a published scenario and asks PLs to re-baseline against it.
**Personas involved**: Project Lead.
**Pre-conditions**: Published scenario whose actions touch ≥ 1 project the PL owns.
**Estimated walk-time**: 4 min.

### Steps

| # | Persona | Action | Expected UI Result | Verification Cue |
|---|---|---|---|---|
| 1 | PL | From `/simulator`, locate a published scenario whose tags or description suggests it touches your projects | Scenario manager lists published scenarios | "Budget Pressure: 15% Reduction" visible |
| 2 | PL | Click the scenario row | Workspace opens in read-only mode (PL can't edit a non-owned scenario) | Read-only banner |
| 3 | PL | Click **Apply to forecast** in the page header | Modal: "Apply scenario diffs to your next forecast cycle for: <list of own projects>" | Modal lists ≥ 1 of the PL's projects |
| 4 | PL | Click **Confirm apply** | `ScenarioApplyToForecastEvent` row created; PL's forecast cycle for those projects has the scenario diffs pre-loaded with `Forecast.is_provisional=true` for outer-zone cells | Toast "Applied to forecast"; navigate to Workbench Forecast tab; cells show provisional badge |

### Post-conditions

- `ScenarioApplyToForecastEvent` audit row with `applied_by_id`, `applied_at`, `cycle_id`, `summary_json`.
- Affected `Forecast` rows have `is_provisional=true` for cells outside the granularity boundary per `[B-OQ-02]`.

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

- **Scenarios never touch live state** until Promote (W06.5) or Apply-to-forecast (W06.6) is invoked. Editing actions is always sandbox-only.
- **Recalculation is incremental**: each new action triggers a partial recompute. `last_recalculated_at` reflects the last successful run.
- **Stale indicator**: if the anchor `ForecastVersion` is superseded by a newer cycle, the scenario shows a "Stale — rebase to latest cycle" indicator and recalculation surfaces a warning. Use the **Rebase** action (⋯ menu) to re-anchor.
