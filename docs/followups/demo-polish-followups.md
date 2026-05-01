# Demo Polish Follow-ups

Five caveats surfaced during the v5 S1 seed reconstruction + workflow catalogue effort that warrant separate sessions to fix. Each is medium-to-deep work that didn't fit the "5 quick fixes" set committed alongside S1.

**Context** for the agent picking these up:
- Both `v5/session-s1/foundation` (S1 seed + cutover) and `docs/workflow-catalogue` (workflow docs + in-app fixture refresh) are merged to `main`. Live demo at `localhost:5173` runs against the v5 seed (34 chargeable entities, 39 distribution edges, 27 BTC profiles, 312 UM cells, 4 personas, 3 scenarios).
- The flagship throughout the demo is **Master Data Hub** (`off-mdh`, S-code S042, identifier `IT00S042`).
- Personas: Anna Meier (Controller / `p-meier`), Priya Sharma (PL / `p-sharma`), Thomas Brenner (CC Owner / `p-brenner`), Dr. Klaus Weber (Executive / `p-weber`).
- See `docs/workflows/` for end-to-end workflow walkthroughs of every demo surface; each step is documented as Action → Expected UI → Verification Cue.

---

## Status (2026-05-01)

Items 6, 8, 9 implemented in parallel via three sub-agents on isolated branches off `main`. Item 7 closed by design. Item 10 still open.

| Item | Status | Branch / disposition |
|---|---|---|
| 6 — BTC year-rollover UI + scope filter | Implemented (5 commits, +13 backend tests, 1296 passing). Backend extended with optional `entity_types` / `entity_ids` mutually-exclusive filters; new `YearRolloverDialog.tsx` with All / By type / Specific entities scope tabs and live count strip. | `feature/btc-year-rollover-ui` |
| 7 — Tech Nav rubric labels for levels 2/3/4 | Closed by design. The placeholders in `frontend/src/modules/backlog/data/rubricLabels.ts` are intentional — they showcase that the rubric matrix will be admin-editable via `[D-CAT-04]`. | n/a |
| 8 — Lever-12 impact-tile bug | Implemented (4 commits, +2 tests, 1285 passing). **Reframed**: the MDH BTC Rebalance scenario *was* seeded as id=1 but with `action_type='btc_profile_change'` (not the lever-12-recognised `'btc_profile_line_change'`) and a deltas-style `parameters_json`. Action converted to the lever-12 schema. **Bonus real bug found and fixed**: `compute_effective_cost` walking only `version='scenario-N'` Distribution rows misses upstream inflows for BTC-only scenarios; new `_compute_scenario_effective_cost` helper in `services/scenario_lever12.py` walks a union of scenario edges + anchor edges where the source wasn't forked. Cost Allocation tile now shows DE-Munich -283k / PL-Poznan +141k / CZ-Prague +141k (anchor=scenario=2.83M EUR, delta=0). | `fix/mdh-btc-rebalance-seed-and-impact` |
| 9 — Scheduled Changes Create UI | Implemented (3 commits, no backend changes, build clean). New `CreateScheduledChangeDialog.tsx` with type-aware inputs, parameter autocomplete, justification min-20 char counter, inline error display (no toast lib in project). | `feature/scheduled-changes-create-ui` |
| 10 — Rollup map deeper drill-down | Open. Needs product input on the level-4 view before any code work. See item detail below. | n/a |

**Schema corrections discovered during implementation** (this doc was inaccurate):

- Item 9: `pending_values` for planning_parameter activation must be `{"current_value": <value>}`, **not** `{"value": <value>}`. The activation handler in `services/scheduled_change_activation.py::_apply_planning_parameter` raises `ValueError` if `current_value` is missing. The schema accepts arbitrary dicts so the create call would succeed silently with `{"value": ...}`, but Apply-due-changes would fail. The dialog uses the correct field.
- Item 9: date field is `activation_date`, not `effective_date`.
- Item 9: `tshirt_xs_max_eur` is not exposed via `/api/admin/parameters` (it lives under `param_group='tech_navigator'`). Only 6 parameters are exposed: `fiscal_year_start`, `planning_horizon`, `forecast_deadline`, `rag_amber_threshold`, `rag_red_threshold`, `max_utilization`.
- Item 8: scenario id=1 was already named "MDH BTC Rebalance — DE/PL/CZ" on `main`; the original "scenario was never seeded" framing was incorrect.
- Item 9: persona id used by the demo is `persona-controller`, not `p-meier` (`p-meier` is the `person_id` underneath).

**Pending decisions**:
- PR strategy (4 PRs vs bundled). All three branches push to `origin` and don't conflict with each other on file ownership.
- Workflow Known Issues callouts in `docs/workflows/06-simulator.md` (W06.5), `docs/workflows/07-charging.md` (W07.6), `docs/workflows/10-administration.md` (W10.6) still describe `main`'s state and should be removed once each branch merges.
- Item 8's seeded `headline_impact_json` says `rebalanced_amount_eur=228000` but the real computed delta after the union-aware fix is ~283k (off-mdh has upstream inflows that lift its 2.4M own-cost to 2.83M effective cost). Either tweak the headline to match (~228k → 283k) or accept the discrepancy.

---

## Item 6: Bulk year-rollover UI button on BTC Profiles page

**Status**: Backend exists, frontend missing.

**Problem**: BTC profiles need to roll over from one year to the next (Stage 2 charging cycle). The endpoint `POST /api/admin/btc-profiles/year-rollover` exists and works (verified during S1 seed authoring — used to seed off-mdh's 2025 + 2026 profiles), but no admin button surfaces it. Today an admin who wants to roll all profiles forward must do it via API client or via N×N manual "Copy from..." in the BTC editor.

**Why fix**: At a typical year-end the IT controller would roll all 25 chargeable Run-Portfolio entities forward. Manual one-by-one copy doesn't scale and is error-prone.

**Where to look**:
- Endpoint: `backend/routers/charging.py` (or `routers/admin.py`) — search for `year-rollover` or `year_rollover`
- Service: `backend/services/btc_service.py::year_rollover` (per CLAUDE.md Data Model Overview reference)
- UI page: `frontend/src/modules/charging/btc/BTCProfileListView.tsx` — add a button to the page header strip
- Modal pattern reference: `frontend/src/modules/charging/btc/EntityBTCProfileEditor.tsx` already has a "Copy from…" tab inside the New BTC profile dialog — repurpose that interaction for a bulk variant

**Suggested approach**:
1. Add a `Year rollover` button in the page header next to `+ New profile`.
2. Click opens a modal: source year (dropdown of years where ≥1 profile exists), target year (dropdown of next available years), entity scope (radio: All / By type [Project / Offering / InternalService] / Specific entities multi-select), confirm button.
3. Submit calls the existing endpoint with the scope filter; backend returns a count of profiles created.
4. Show progress + final summary toast: "Rolled 25 profiles 2026 → 2027 (24 created, 1 skipped — already exists)".

**Effort**: 1-2 hours (modal + integration). No backend work expected.

**Verification**:
- Reset demo (`POST /api/admin/reset-demo`).
- Click Year rollover, source=2026, target=2027, scope=All, confirm.
- Verify 27 new profiles created at year=2027 with `copied_from_profile_id` pointing at 2026 sources.
- Verify `BTCProfileLine` rows mirror source per profile (sum=100).

---

## Item 7: Tech Navigator rubric labels for levels 2/3/4

**Status**: Cosmetic / content authoring.

**Problem**: Tech Navigator scoring uses a 1-5 scale across 6 sub-criteria (3 Complexity + 3 Value Creation per `[A-TN-01..09]`). The scoring UI shows labels for level 1 and level 5 but levels 2/3/4 are blank or interpolated placeholders. This is documented in `docs/workflows/11-tech-navigator-and-backlog.md` Known Issues for W11.1.

**Why fix**: PLs scoring projects need guidance on what "3" means — without level labels they end up clicking 3 by default for ambiguous cases, which collapses the rubric's usefulness. Labels also support demo storytelling: "we score Standardization 4 — it has a clear standard but minor edge cases".

**Where to look**:
- Frontend: `frontend/src/modules/backlog/tech-navigator/...` (or wherever the scoring rubric component lives)
- Look for the existing 1 + 5 labels — they're likely passed in as constants or fetched from a planning_parameter
- Sub-criteria: Complexity (Standardization 40% / Usage 40% / Maintenance 20%), Value Creation (Financial 50% / Payback 40% / Competitive 10%)

**Suggested approach**:
1. Author level descriptors for each of the 6 sub-criteria. Aim for one short sentence per level that grounds the rating. Example for Standardization:
   - 1: "No standard exists; bespoke approach required."
   - 2: "Loose standard; significant adaptation needed."
   - 3: "Standard exists but with major gaps for our use case."
   - 4: "Clear standard with minor edge cases."
   - 5: "Fully standardised; off-the-shelf adoption."
2. Decide storage: hardcoded TS constants (simpler, ships with the build) OR seeded planning_parameters under `param_group='tech_navigator_labels'` (admin-editable). Recommend hardcoded for v5; seeded if admin needs to tune the descriptions.
3. Update the rubric component to render the 5 labels as tooltips or below-the-button hints.

**Effort**: 30-60 min for content authoring + UI wire-up. The 6 sub-criteria × 5 levels = 30 short descriptors total.

**Verification**:
- Open `/backlog/<project-id>` → Scores & Ranking tab.
- Hover (or click) each of the 5 level buttons on each sub-criterion; confirm a label is shown for all 5.

---

## Item 8: Lever-12 impact-tile "No allocation changes" bug

**Status**: Real bug — frontend or service-layer rollup.

**Problem**: When a lever-12 scenario (e.g., the seeded `MDH BTC Rebalance — DE/PL/CZ`) is recalculated, the impact dashboard shows 9 dimension tiles. The Cost Allocation tile says "No allocation changes" even though the underlying `ScenarioAction` is stored correctly with `lever_category='cost_allocation'` and the Promote action correctly materialises the BTC line shifts onto canonical state.

**Reproducer**:
1. Switch to Anna Meier (Controller).
2. Open `/simulator/scenarios/1` (seeded MDH BTC Rebalance scenario).
3. Click **Recalculate**.
4. Observe the 9 dimension tiles populate. The "Cost Allocation" tile shows "No allocation changes" — but the scenario's headline_impact_json explicitly captures `{"total_btc_pct_shift": 10, "affected_locations": 3, ...}` so the action is stored and the impact-summary endpoint sees it.
5. Promote the scenario (W06.5 step 8) — the BTC profile lines DO shift on canonical state, confirming the underlying lever-12 wiring works end-to-end. Only the impact-preview rollup is broken.

**Why fix**: The Cost Allocation dimension is the very dimension lever-12 is designed to affect. Showing "No allocation changes" undercuts demo confidence at the most important moment of the simulator walk.

**Where to look**:
- Service: `backend/services/scenario_lever12.py::compute_cost_allocation_impact()` — likely entry point for the dimension's data.
- Schema: `backend/schemas/scenarios.py` — find the response shape for the scenario impact endpoint and locate the cost_allocation field.
- Frontend dimension panel: `frontend/src/modules/simulator/workspace/impact/dimensions/CostAllocationDimension.tsx`
- Lever-12 sandbox storage pattern: per CLAUDE.md, Stage 1 distribution edges fork into `Distribution.version='scenario-{id}'` rows on first mutation; Stage 2 BTC overlays live as `ScenarioAction` rows. The impact compute must read both the canonical state AND the scenario overlays and return the delta.
- Rollup query: `backend/services/rollup_query.py::query_rollup` — the cost-allocation dimension probably hits this for both canonical + scenario versions.

**Suggested investigation order**:
1. Hit the impact-summary endpoint for scenario 1 directly with `curl`. See whether the `cost_allocation` field in the response is populated. If yes → frontend bug; if no → service-layer bug.
2. If service-layer: trace `compute_cost_allocation_impact()`. Likely either it queries the wrong version key (e.g., reads `version='forecast'` instead of `version='scenario-1'`) or it doesn't apply the BTC ScenarioAction overlays at calc time.
3. If frontend: the `CostAllocationDimension.tsx` may be reading a field that the service returns under a different name.

**Effort**: 1-3 hours investigation + fix.

**Verification**:
- Same reproducer as above; after fix, the Cost Allocation tile shows the per-location deltas (e.g., DE-Munich -10pp / PL-Poznan +5pp / CZ-Prague +5pp) and the scenario's headline impact `~€228k rebalanced` matches the tile's totals.

---

## Item 9: Scheduled Changes Create UI (admin)

**Status**: Real missing feature — backend lifecycle exists, no admin form.

**Problem**: The 5-state Scheduled Changes lifecycle (`pending_review` → `approved` → `activated` / `rejected` / `cancelled`) is fully wired in the backend (`models/scheduled_changes.py`, `services/scheduled_change_activation.py`, `routers/scheduled_changes.py`). The admin UI has the *list / approve / reject / cancel* surfaces but **no Create form**. Today the only way to create a scheduled change is via API. The seed plants 3 sample rows so the queue isn't empty, but the end-to-end "controller schedules a future planning-param change" demo workflow (`docs/workflows/10-administration.md#W10.6`) is currently API-only.

**Why fix**: Closes a documented gap in W10.6, removes "API-only" caveat from the admin manual, gives the demo a clean controller-creates-future-change story.

**Where to look**:
- Model: `backend/models/scheduled_changes.py::ScheduledChange` — see fields: `entity_type`, `entity_id`, `field_name`, `current_value` (JSON), `new_value` (JSON), `effective_date`, `justification`, `state`, `created_by_person_id`, `created_at`, `reviewed_by_person_id`, `reviewed_at`, `activated_at`.
- Backend create: `routers/scheduled_changes.py::create_scheduled_change()` (Controller-only)
- Active entity types per `services/scheduled_change_activation.py`: only `planning_parameter` is currently wired through to the live entity in v5; other types (`rate_table`, `cost_center`, etc.) record activation as a no-op.
- Frontend admin panel: `frontend/src/modules/admin/scheduled-changes/...` — find the existing list + approve/reject/cancel surfaces.
- Suggested form file: new `frontend/src/modules/admin/scheduled-changes/CreateScheduledChangeDialog.tsx`.

**Suggested approach**:
1. Add a `+ New scheduled change` button on the Scheduled Changes admin panel.
2. Open `CreateScheduledChangeDialog`. Fields:
   - **Entity type** dropdown — for v5 demo show `planning_parameter` as the only enabled option; others greyed-out with "Coming soon" hint.
   - **Entity** autocomplete — pulls planning_parameters via `GET /api/admin/parameters` (already exists).
   - **Field** dropdown — for planning_parameter this is just `value` (only field that gets activated).
   - **New value** — type-aware input (numeric for parameter values).
   - **Activation date** — date picker, must be ≥ today.
   - **Justification** — required free-text textarea (≥ 20 chars).
3. Submit calls `POST /api/admin/scheduled-changes`. New row appears in the list at `state='pending_review'`.
4. Demo: switch to a controller-reviewer (e.g., second controller persona if needed, or the same Anna with a comment "approving as reviewer"), approve, then the demo can hit `POST /api/admin/apply-scheduled-changes` to fast-forward activation.

**Effort**: 3-4 hours (form + validation + plumbing). No backend work expected — endpoint already exists.

**Verification**:
- Switch to Anna; navigate to Admin → Scheduled Changes.
- Click + New scheduled change. Pick `planning_parameter` / `tshirt_xs_max_eur` / new value `200000` / activation date 2026-12-01 / justification "Adjust for inflation per board guidance Q4 2026".
- Submit. New row appears in the queue at `pending_review`.
- Approve, click Apply due changes (or wait for the date). Verify the planning_parameter's `value` actually updates in the live state and an audit_log row in `scheduled_change_lifecycle` category is added.

---

## Item 10: Rollup map deeper drill-down (location → ?)

**Status**: Open product question.

**Problem**: The Charging Rollup map (`/charging?section=rollup`) currently drills region → country → charging location. Beyond the location level, there's no UI — but the data model supports going further (a charging location has many legal entities per `[F-MD-02]`, and each legal entity has its own cost flow under it).

**Why this is open**: Unclear what the right level-4 view is.
- Map paradigm doesn't extend naturally below "location" — locations are points on a country map; legal entities aren't geographically distinct.
- A drill into a table view (legal entities under this charging location, with costs) is plausible but is a different pattern.
- A controller might want to see "for Munich charging location, which legal entities pay and how much" — that's a Stage 2 BTC explosion that the existing Workbench BTC tab kind of shows for one entity at a time, but not aggregated.

**Why fix**: The map is one of the demo's strongest visual surfaces; a "click further" affordance would let the demo go deeper. But the wrong choice locks in a UX direction that may not match the intended workflow.

**Where to look**:
- Existing map: `frontend/src/modules/charging/rollup/RollupMapView.tsx`
- Existing tree-table: `frontend/src/modules/charging/rollup/RollupTreeTableView.tsx`
- Drill-down endpoint: `backend/services/rollup_query.py::drill_down_charging_location` — already returns enriched path labels per `[F-RV-04]`. May already expose legal-entity granularity.

**Suggested approach (proposed for product input)**:
1. Click on a charging location pin → opens a side panel (or replaces the map with) a tree-table showing legal entities at that location, with their BTC-weighted Stage-2 amount.
2. Each legal entity row expands to show which chargeable entities (offerings / projects / services) charge through it.
3. Add a "Back to country" breadcrumb so the user can navigate up.

**Effort**: Half-day to design + 1-2 days to build (depends on what level-4 view actually shows).

**Verification**:
- Navigate to `/charging?section=rollup`.
- Drill: Region (e.g., EMEA) → Country (Germany) → Location (DE-Munich).
- Click on DE-Munich → see legal entity breakdown, sums match the location total.
- Verify back-navigation works.

---

## Suggested order

1. **Item 7** (Tech Nav labels) — fastest, content-only, makes the rubric usable.
2. **Item 6** (year-rollover button) — small, no backend work, removes a documented limitation.
3. **Item 8** (lever-12 impact tile) — investigation needed; the priority depends on how often the simulator demos. If this is a recurring demo, fix early.
4. **Item 9** (Scheduled Changes Create) — half-day; closes W10.6.
5. **Item 10** (deeper rollup) — needs product input first; defer until that's resolved.

## Cross-references

- All 5 items are flagged as Known Issues in the affected workflow docs. After fix, search `docs/workflows/*.md` for the relevant caveat text and remove it; replace with the updated behaviour.
- Demo dress-rehearsal script in `docs/workflows/README.md` references W06.5 (lever-12) and W10.6 (scheduled change) — both touch Items 8 and 9.
- Spec decision tags for context: `[F-S2-*]` (BTC), `[A-TN-*]` (Tech Nav), `[B-LV-12]` (lever 12), `[D-CAT-07]` (workflow templates), `[D-NAV-06]` (scheduled changes).

## Five quick fixes already done

Bundled into the S1 PR (`v5/session-s1/foundation`) before this doc was written:
- Tech Nav scores backfilled on the 2 Run-stage projects (proj-cloud3-run, proj-iam-run).
- Summation Integrity drift recalibrated on the 6 affected projects.
- "Cost Centre Owner" → "Cost Center Owner" spelling normalisation.
- Klaus Weber greeting: "Good evening, Klaus" instead of "Good evening, Dr.".
- `svc-data-platform → off-mdh` distribution edge corrected from 20% to plan's 8%.

If these need to be reverted or adjusted, see the relevant commits on `v5/session-s1/foundation`.
