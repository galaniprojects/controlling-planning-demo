# What-If Simulator — Module Overview (context document)

> **Purpose of this document:** a comprehensive, self-contained summary of the What-If Simulator
> module in the VIPER/VIPER demo app, written to hand to an LLM (Claude chat) as context for
> discussing and deciding changes. It captures the *current* status: architecture, data model,
> levers, workflows, permissions, seed data, tests, and known quirks/ambiguities. No repo access is
> assumed — file paths are included so code can be pasted in later if needed.

App context: an internal **financial-planning demo** (not production). Backend = FastAPI + SQLAlchemy
ORM + SQLite; Frontend = React (Vite) + shadcn/ui + Tailwind + Recharts. EUR, English, demo date =
**April 2026**, demo year = **2026**. Four demo personas: **Controller** (Anna Meier), **Executive**
(Dr. Klaus Weber), **CC Owner** (Thomas Brenner), **Project Lead** (Priya Sharma). Route: `/simulator`.

---

## 1. What the Simulator is (one paragraph)

A **scenario sandbox** for modelling portfolio + cost-allocation changes *before* committing them to
the live forecast. A scenario is a named, ordered list of **actions** (levers) layered on top of an
**anchored** forecast version. All edits are **isolated from canonical state** — they live in
scenario-scoped tables/overlays and only materialise to live data when a Controller explicitly
**Promotes** them (each diff routed through its native system workflow) or a Project Lead **Applies
to forecast** (carries their own-project diffs into the next cycle as provisional cells). An
**8-dimension impact dashboard** shows the modelled effect; scenarios can be **compared** side by
side and **published** to other users (with Tier-3 gating). An optional **AI Advisor** turns a
natural-language goal into ready-made action paths.

**Core design invariants (do not break these when changing the module):**
1. Scenarios never touch live state until **Promote** or **Apply-to-forecast**.
2. Cost-allocation edits fork into **per-scenario sandbox** storage; live `BTCProfile`/production
   `DistributionVersion` rows are never mutated.
3. The forecast anchor (and the Stage-1 distribution anchor) are **pinned at scenario creation** so
   later reactivations don't silently shift the impact deltas.
4. **Partial promote** is supported — unpromoted actions stay in the scenario for later.
5. All impact computation is **server-side**; the frontend renders ready-made numbers.
6. **CC Owner** scenarios are scoped to their cost centre; **Project Leads can author** scenarios
   scoped to their own projects (and can apply published scenarios to their own forecast).

---

## 2. ⚠️ Naming & taxonomy notes (read this before discussing "levers")

There are **three overlapping ways** the codebase talks about levers. This matters a lot when
proposing changes, because the same word means different things in different places:

- **The conceptual numbered lever list** — older documentation described a curated catalogue of
  12 numbered levers (delay, reduce hours, remove, accelerate, add scope, sourcing mix, rate table,
  Tech Navigator, capacity allocation, Stage-1 distribution edge, Stage-2 BTC line,
  pipeline/DoI/milestone). **At project scope this catalogue is retired as an input surface.** Direct
  grid editing is now the primary surface (see §4 and §7). The numbered list survives only as
  historical context; prefer the `lever_category` vocabulary for any new discussion.
- **17 `lever_category` surfaces** — the *implementation's* real taxonomy. `ScenarioAction.lever_category`
  is one of **17** values (see §4), and the frontend has **~17 surface components**. This is the
  code-true list.
- **A 23-entry action catalogue** — `frontend/.../catalogue/catalogueDef.ts` defines ~23 concrete
  `ActionDefinition`s (the forms users fill in for portfolio-scope and macro actions), which map to
  `action_type` + `lever_category` + `tier`. So there are more *actions* than *lever_category* values.

**"Lever 12" naming — retired.** The backend service was historically called `scenario_lever12.py`
(now `scenario_cost_allocation.py`) and its endpoints used a `/lever12/` prefix (now `/cost-allocation/`).
In docs and user-facing prose, always use **"cost-allocation sandbox"** or
**`lever_category = cost_allocation`** — never "Lever 12." The reason: in the old numbered list those
were levers #10 and #11, not #12 (which was pipeline/DoI/milestone), so the name was doubly confusing.

**Tier of the cost-allocation lever is data-driven, not fixed.** The manual calls Stage-1/Stage-2
edits "Tier 3," but `ScenarioAction.tier` is set per action — the seeded MDH rebalance action is
tagged **Tier 1**. Tier is whatever the action row says; the Tier-3 *content flag* is separately
derived (see §8).

---

## 3. Data model — the Scenarios family

Six tables (`backend/models/scenarios.py`; canonical reference `docs/data-model.md` §Scenarios).

### `scenarios` (Scenario)
The scenario header.
- Core: `id` (PK), `name`, `description`, `author_id`→people, `status` ∈ **{`private`, `published`}**,
  `headline_impact` (JSON text), `created_at`, `modified_at`.
- Anchoring: `anchor_forecast_version_id`→forecast_versions (diffs computed vs this), and
  `rebased_from_version_id` (audit of prior anchor).
- Visibility & Tier-3: `visibility` ∈ **{`private`, `tier3_only`, `all_users`}** (default `private`);
  `tier3_content_flag` (bool, auto-set when the scenario contains Tier-3 content).
- Lifecycle: `archived` + `archived_at` (soft archive); `tags` (JSON array of strings);
  `last_recalculated_at` (drives the **stale** indicator: stale ⇔ `modified_at > last_recalculated_at`).
- Scoping: `cc_owner_scope_cc_id`→cost_centers (CC-Owner scenarios scoped to one CC).
- Cost-allocation anchor: `anchor_distribution_version_id`→distribution_versions (Stage-1 anchor
  **pinned at creation**; NULL ⇒ legacy resolve-by-date fallback).
- Relationships: `author`, `actions` (ordered), `states`, `capacity_impacts`, `promotions`
  (ordered desc), `anchor_version`, `anchor_distribution_version`.

### `scenario_actions` (ScenarioAction)
One ordered lever application within a scenario.
- `id`, `scenario_id`, `action_order`, `scope` ∈ **{`project`, `portfolio`}**, `action_type` (str),
  `project_id` (nullable), `parameters_json` (action-specific), `impact_delta_json` (pre-computed
  delta for published scenarios), `group_label` (for AI Advisor grouping), `created_at`.
- Promote tracking: `promoted_at`, `promoted_by_id` (set when *that action's* diff is promoted —
  enables partial promote).
- Classification: `lever_category` (str, one of 17 — see §4), `tier` ∈ **{1,2,3}** (default 1).

### `scenario_states` (ScenarioState)
Pre-computed per-project snapshot (for **published** scenarios, so Compare/detail render without live
recompute): `original/adjusted/delta` budget, `original/adjusted_rag`, `original/adjusted_start/end`
(YYYY-MM), `is_affected`.

### `scenario_capacity_impacts` (ScenarioCapacityImpact)
Pre-computed per-cost-centre × month capacity snapshot: `original/adjusted_utilization_pct`,
`fte_delta`.

### `scenario_promotions` (ScenarioPromotion)
Audit row per Promote click: `promoted_at`, `promoted_by_id`, `routing_summary_json` (list of
`{action_id, routing_type, status, message, target_id}`), `promoted_count`, `skipped_count`, `notes`.

### `scenario_apply_to_forecast_events` (ScenarioApplyToForecastEvent)
Audit row per PL Apply-to-forecast: `applied_by_id`, `applied_at`, `cycle_id`, `cycle_label`,
`diffs_carried_forward`, `diffs_skipped`, `summary_json`. Resulting forecast cells are marked
`Forecast.is_provisional = True`.

**Module constants** (`scenarios.py`):
- `SCENARIO_VISIBILITIES = ("private", "tier3_only", "all_users")`
- `SCENARIO_ROUTING_TYPES = (direct_forecast_update, change_request, doi_gate_check,
  tech_navigator_direct, tech_navigator_send_back, rate_table_update, people_action_item,
  budget_envelope_update, hypothetical_to_proposed, hierarchy_update, cost_allocation_update,
  capacity_param_update, no_route)` — the promote routing vocabulary.

**No schema migrations** (no Alembic): changing these models means deleting `backend/viper_demo.db`
and re-seeding.

---

## 4. The lever system

### 4.1 Project scope: WYSIWYG grid is the primary surface

At project scope the simulator is no longer form-driven. The user works directly in the
**editable forecast grid** — the same grid as the Workbench forecast cycle — to edit cells, add/remove
role lines, add/remove/edit external-cost line items, adjust milestones/DoI/stage, and move project
dates. A **macro strip** provides four configurable bulk helpers (delay, accelerate, pause, remove)
that operate as curve transforms and coexist with direct cell edits.

The old project-scope action forms (`reduce_budget`, `adjust_budget`, `cut_consulting`,
`adjust_external_cost`, etc.) are **retired as inputs** — that work is done directly in the grid.
The macro action types (`delay_project`, `accelerate_project`, `pause_project`, `remove_project`)
survive as ordered transforms stored in `ScenarioAction` rows (`scope='project'`,
`action_type ∈ PROJECT_MACRO_ACTION_TYPES`).

The cost-allocation sandbox (Stage-1 + Stage-2 editing) is fully WYSIWYG at the `cost_allocation`
surface — Stage 1 now supports adding new destinations in addition to editing percentages and
deleting edges; Stage 2 BTC lines are fully editable.

**Portfolio scope is unchanged.** Bulk levers (across-the-board cut, cut-by-LoB, cut-by-type,
freeze-new-starts, cap-cost-category, rate-escalation) remain form-driven at portfolio scope — the
right paradigm when dozens of projects move at once.

### 4.2 The 17 `lever_category` surfaces (code-true taxonomy)
`forecast_grid`, `rate_table`, `people`, `pipeline_stage`, `tech_navigator`, `cost_allocation`,
`capacity_param`, `hierarchy`, `budget_envelope`, `milestone`, `vendor_contract`, `sourcing_mix`,
`capex_opex`, `escalation`, `running_cost`, `hypothetical_project`, `restructuring`.

### 4.3 Frontend surfaces (~17, in `frontend/src/modules/simulator/surfaces/`)
ForecastGrid, RateTable, BacklogSandbox, **CostAllocation (the cost-allocation sandbox)**, BudgetEnvelope,
CapacityParameters (T3), PeopleMaster (T3), EscalationFactors, HierarchyReassign, CapExOpEx,
ResourceAssignment, Milestones, VendorContracts, SourcingMix, RunningCosts, HypotheticalProject,
TechNavigatorScore. All wrapped by a shared `SurfaceCard`. Several embed real module components in
"sandbox mode" (e.g. ForecastGrid embeds the workbench `MixedGranularityGrid`; CostAllocation embeds
the charging `EntityDistributionEditor` / `EntityBTCProfileEditor`).

### 4.4 The action catalogue (~23 `action_type`s)
The engine (`services/scenario_engine.py`) recognises (with v4 aliases normalised, e.g.
`defer_project`→`delay_project`):
- **Project-scope macros:** `remove_project`, `delay_project`, `accelerate_project`, `pause_project`.
  (The old project-scope forms `reduce_budget`/`adjust_budget`/`increase_budget`/`cut_consulting`/
  `adjust_external_cost` are retired as user-facing inputs — replaced by direct grid editing.)
- **Overlay types (project scope):** `change_allocation` (seniority/sourcing mix — Tier-3).
- **Portfolio-scope:** `across_the_board_cut`, `reduce_lob`/`cut_by_lob`, `cut_by_type`,
  `freeze_new_starts`, `cap_cost_category`, `rate_escalation`.
- **Cost-allocation sandbox:** `distribution_edge_change`, `to_business_pct_change`,
  `btc_profile_line_change`.
- Many support a `target_years` parameter for year-scoped variants.

### 4.5 Tiers
`tier` is stored per action (1/2/3). Tier-3 is the gated band. Categories that always count as Tier-3
content: **`{people, rate_table, capacity_param, restructuring}`** (see §8). A scenario's
`tier3_content_flag` becomes true if any action is `tier == 3` **or** in one of those categories.

---

## 5. Backend architecture

Router: `backend/routers/scenarios.py` (prefix `/api/scenarios`, ~28–30 endpoints). Services in
`backend/services/`. Schemas in `backend/schemas/scenarios.py`.

### 5.1 Services (the engine)
- **`scenario_engine.py`** — recompute core. `recalculate_scenario(db, scenario, actions)` applies
  actions sequentially (`_apply_project_action` / `_apply_portfolio_action`) against the anchored
  portfolio state and returns the **full recalculated state** (`{metadata, actions,
  impact_dashboard, project_states, capacity_impacts}`). `get_scenario_state()` returns from
  pre-computed snapshots when present, else recalculates.
- **`scenario_impact.py`** — the **8-dimension impact dashboard**:
  `financial, backlog_ranking, capacity, people (Tier-3), outsourcing_ratio, investment_mix,
  running_cost, change_summary` (+ a `cost_allocation` dimension from cost-allocation sandbox edits). `compute_impact_dashboard(...)`
  orchestrates; `has_tier3_diffs()` / `_is_stale()` / `mark_recalculated()` helpers.
- **`scenario_cost_allocation.py`** — the **cost-allocation sandbox** engine (~1300 lines).
  Lazy-fork pattern: on first mutation, copies the relevant anchor-version edges into a
  **per-scenario `DistributionVersion`** (`scenario_id=N`, `status='draft'` permanently). Stage 1
  supports adding new destinations in addition to editing percentages and deleting edges. Stage-2 BTC
  + `to_business_pct` changes are stored as **`ScenarioAction` overlays** (canonical BTC rows never
  touched), applied at impact-calc time. Stage-2 BTC lines are fully editable. Cycle-detection +
  sum-rule (`to_business + Σ distribute ≤ 100`) enforced.
  `compute_cost_allocation_impact(db, scenario_id, year)` returns per-charging-location
  anchor-vs-scenario deltas. `cleanup_cost_allocation_state()` removes the sandbox version on
  scenario delete.
- **`scenario_promote.py`** — Promote workflow (controller-only). `decide_routing(action)` maps each
  diff to a routing type (forecast_grid own→`direct_forecast_update`, other→`change_request`;
  pipeline→`doi_gate_check`; tech_navigator own/other→direct/send_back; rate_table→`rate_table_update`;
  people/restructuring→`people_action_item`; cost_allocation→`cost_allocation_update`; etc.).
  `preview_promote()` / `execute_promote()` support **partial** promotion; cost-allocation promotion
  gated by `RolePermissionGrant.can_edit`. `assert_anchor_is_latest_cycle()` blocks promote if the
  anchor is stale (hint: rebase).
- **`scenario_apply_forecast.py`** — PL Apply-to-forecast. Eligible categories:
  `{forecast_grid, milestone, people(own project), sourcing_mix}`. Marks resulting `Forecast` cells
  `is_provisional=True`; writes an audit event; scenario is **not** consumed (can apply repeatedly).
- **`advisor.py`** — AI Advisor (pattern-matched seeded goals by default; Claude-powered when
  `ANTHROPIC_API_KEY` is set).

### 5.2 Endpoints (grouped)
- **Manager/lifecycle:** `GET /` (list: my/published/archived + tags), `POST /` (create; clone via
  `clone_from`; max 10/user), `DELETE /{id}`, `PUT /{id}/publish|unpublish|archive|rebase`.
- **Workspace:** `GET /{id}` (detail, Tier-3 redacted for non-Tier-3 users), `PUT /{id}/metadata`,
  `GET /{id}/drill-down`, `POST /compare` (1–3 scenarios, must share anchor).
- **Actions:** `POST /{id}/actions` (apply, returns full state), `DELETE /{id}/actions/{actionId}`,
  `PUT /{id}/actions/reorder`.
- **Impact:** `GET /{id}/impact?year=` (8-dim), `POST /{id}/recalculate` (stamp fresh).
- **Cost-allocation sandbox:** `POST/PUT/DELETE /{id}/cost-allocation/distributions[/{edgeId}]`,
  `POST /{id}/cost-allocation/to-business`, `POST /{id}/cost-allocation/btc-lines`,
  `GET /{id}/cost-allocation/cost-allocation-impact?year=`.
- **Promote (controller):** `POST /{id}/promote/preview`, `POST /{id}/promote`, `GET /{id}/promotions`.
- **Apply-to-forecast (PL):** `POST /{id}/apply-to-forecast`.
- **AI Advisor:** `POST /{id}/advisor/query`, `POST /{id}/advisor/apply`.

Auth: `get_current_user` via `X-Current-User` header → role; `require_role(...)` per endpoint
(create excludes PL; promote = controller only; apply-to-forecast = PL only). Owner checks on
mutating lifecycle/action endpoints.

---

## 6. Frontend architecture

Root: `frontend/src/modules/simulator/`. Router `SimulatorRouter.tsx`.

- **Routes:** `/` ScenarioManagerPage; `/scenarios/:id` ScenarioWorkspacePage; `.../surface/:surfaceKey/:entityId?`
  (deep-link a lever surface); `/scenarios/:id/promote` PromoteReviewPage (controller);
  `/compare` CompareSelectionPage; `/compare/:idA/:idB[/:idC][/project/:projectId[/line/:lineKey]]`
  ComparePage (L1 portfolio → L2 project → L3 line drill-down).
- **Workspace layout (3 zones):** `ScenarioHeader` (name, status badge, **stale** indicator,
  Recalculate, lifecycle menu, Promote (controller) / Apply-to-forecast (PL) / AI Advisor) +
  left **WorkspaceSidebar** (Projects, Backlog, PortfolioSettings, Resources [T3], BulkActions
  catalogue) + centre (selected **surface**, **ImpactSummaryStrip** of 8 tiles, **ImpactDetailPanel**,
  change-summary feed).
- **State:** a single **`ScenarioContext`** (reducer + ~625 lines) holds `detail`, `impact`,
  `loading/error`, **`stale`**, derived flags (`isOwner`, `canPromote`, `canApplyToForecast`,
  `tier3Visible`, `ccOwnerScopeCcId`, `visibility`, `archived`), and an in-memory optimistic
  **change-summary feed**. Mutations are **optimistic + server-authoritative**: applying an action
  marks `stale=true`; the impact dashboard only refreshes on an explicit **Recalculate**
  (`POST /recalculate` then `GET /impact`).
- **API layer:** `frontend/src/modules/simulator/api/scenariosApi.ts` — ~40+ typed wrappers over the
  endpoints above (including cost-allocation sandbox and project-scope grid endpoints). Uses the
  shared `@/api/client` (injects `X-Current-User`, throws on non-2xx).
- **Types:** cross-module scenario types in `frontend/src/types/api.ts`; narrow 8-dimension impact
  types in `.../simulator/lib/impactTypes.ts`; catalogue action schema in `.../catalogue/types.ts`.
- **Permissions hooks:** `useCanCreateScenario` (not PL), `useCanPromote` (controller),
  `useCanApplyToForecast` (PL), `useTier3` (from role flag). Tier-3 surfaces (PeopleMaster,
  CapacityParameters) render **null** (hidden DOM) when not Tier-3.
- **UI:** shadcn/ui only; light + dark mode via semantic Tailwind classes; impact tiles, comparison
  columns, RAG colour coding.

---

## 7. Key workflows

1. **Create** (Controller/Exec/CC-Owner/PL) — pick name + **anchor forecast version** (+ tags;
   optional clone). New scenario is `private`. CC-Owner scenarios auto-scope to their CC. PL scenarios
   are scoped to the projects they lead.
2. **Edit** — at **project scope**, work directly in the editable forecast grid: edit cells, add/remove
   role lines, add/remove/edit external-cost items, adjust milestones/DoI/stage, move dates, or apply
   a macro (delay/accelerate/pause/remove) from the macro strip. At **portfolio scope**, fill the
   bulk-lever catalogue forms. Cost-allocation sandbox edits (Stage-1 edges and Stage-2 BTC lines)
   use the dedicated sandbox surface (Bulk Actions → Cost Allocation Sandbox). Each change lands in
   the scenario's overlay and marks the scenario **stale**.
3. **Recalculate** — explicit button → 8-dimension impact dashboard refreshes; stale clears.
4. **Compare** — select 1–3 same-anchor scenarios; first column is always **Current State**; drill
   L1 portfolio → L2 project → L3 line.
5. **Publish / archive** — publish makes it visible to others (visibility defaults to `tier3_only` if
   it has Tier-3 content, else `all_users`); archive soft-hides.
6. **Promote** (Controller) — preview routes each selected diff through its native path; partial
   promotion allowed; cost-allocation diffs need a Tier-3 permission grant; writes a `ScenarioPromotion`
   audit row; blocked if the anchor isn't the latest cycle (must **Rebase** first).
7. **Apply-to-forecast** (PL) — carries the PL's own-project eligible diffs into the next forecast
   cycle as **provisional** cells; writes an audit event; doesn't auto-submit.
8. **AI Advisor** — natural-language goal → 2–3 ranked action paths → apply path → recalculates.

---

## 8. Tier-3 gating & permissions

- **Tier-3 content** = any action with `tier == 3` **or** `lever_category ∈ {people, rate_table,
  capacity_param, restructuring}`. Sets `tier3_content_flag` on the scenario.
- **Visibility** ∈ {`private`, `tier3_only`, `all_users`}. Publishing a Tier-3 scenario without the
  `tier3_flag` (on the user) is blocked.
- **Promote of cost-allocation diffs** requires `tier3_flag` **and** a
  `RolePermissionGrant.can_edit` for the relevant entity type; controllers have grants by default.
- **CC-Owner** scenarios are scoped to `cc_owner_scope_cc_id`; visible only to that CC's owners +
  controllers; the CC-Owner author cannot self-promote.
- **Project Lead** can author scenarios scoped to their own projects (private, owner-visible). PLs
  cannot promote; their path to live is **Apply-to-forecast** (pre-populates the next forecast cycle
  as provisional cells). PLs can also apply published scenarios that touch their own projects — only
  their own project slice is shown.

---

## 9. Seed data (3 pre-built scenarios)

Defined in `backend/seed/generate_seed_v5/config/scenarios.py`; emitted by `s19_scenarios.py`. Anchor
FKs are NULL at seed time and snap to the latest cycle on first open.

1. **`scn-mdh-rebalance` — "MDH BTC Rebalance — DE/PL/CZ"** (Controller, private, flagship). One
   `btc_profile_line_change` action (`lever_category=cost_allocation`, **tier=1**) shifting Master Data
   Hub Stage-2 BTC −10pp from DE-Munich → +5pp PL-Poznan / +5pp CZ-Prague. Impact totals balance
   (≈ −€283k / +€141.6k / +€141.6k). Tags `["cost-allocation","btc","flagship"]`.
2. **`scn-budget-pressure-15` — "Budget Pressure: 15% Reduction"** (Controller, **published**). 3
   actions (delay proj-connveh 6mo; descope proj-dwh 30%; accelerate proj-railsafety). Carries 3
   pre-computed `ScenarioState`s + 3 `ScenarioCapacityImpact`s + 1 **partial** `ScenarioPromotion`
   (accelerate promoted, other two skipped). Tags `["budget","cross-portfolio","executive-readout"]`.
3. **`scn-cco-mdh-staffing` — "MDH Staffing Mix — MUC/APD"** (CC-Owner Thomas Brenner, private,
   scoped to `cc-muc-apd`, **tier3_content_flag=true**). One `change_allocation` (people/sourcing-mix,
   tier 3) swapping senior→mid dev hours.

AI Advisor seeds ~5 goals (find ~€2M savings; teams below 95% util; prioritise Rail Systems; eliminate
Red RAG; MDH BTC rebalance).

---

## 10. Tests (guaranteed invariants)

`backend/tests/`: `test_scenario_engine.py`, `test_scenario_impact.py`, `test_scenario_cost_allocation.py`,
`test_scenario_promote.py`, `test_scenario_apply_forecast.py`, `test_router_scenarios*.py` (~91+ tests
from the original build). They lock: action semantics + aliases + timeframe breakdowns; cost-allocation
sandbox lazy-fork into a scenario `DistributionVersion`, BTC overlays leaving canonical rows untouched,
union-aware effective cost, cross-version cycle detection; promote routing + partial promote +
permission gating; PL apply-to-forecast eligibility + provisional marking; project-scope WYSIWYG
grid overlay writes + macro application + revert semantics.

---

## 11. Known quirks, ambiguities & things to watch when changing

- **"Lever 12" naming — fully retired** (see §2) — use "cost-allocation sandbox" in all new prose.
  The backend service is now `scenario_cost_allocation.py` and routes are `/cost-allocation/...`.
  Any residual "lever12" or "Lever 12" text in non-archived files is a documentation bug.
- **Project-scope editing is WYSIWYG, not form-driven** — at project scope the editable grid + macro
  strip are the inputs. The old project-scope catalogue action forms are retired. If something seems
  to be missing a project-scope form, the answer is to use the grid directly.
- **"17 surfaces" is the code-true taxonomy** — the old "12 levers" number is historical narrative
  and should not appear in new docs. The `lever_category` vocabulary is authoritative.
- **Recalculate is split-cost** — project-own financials (line totals, delta-vs-anchor, RAG) update
  live on each cell edit; expensive cross-portfolio dimensions (capacity, backlog ranking, investment
  mix) debounce ~1s after editing pauses. A manual Recalculate is still available. The scenario shows
  **stale** until a full recalculation completes.
- **Two "shapes" of impact** — the legacy `impact_dashboard` embedded in `GET /{id}` detail
  (budget/RAG/timeframe) vs the richer **8-dimension** `GET /{id}/impact`. The frontend `narrowImpact`
  adapter bridges them. Be careful which one a change targets.
- **Cost-allocation impact historically fragile** — a prior bug showed empty Cost-Allocation deltas
  for BTC-only scenarios; fixed via a union-aware `_compute_scenario_effective_cost` and by switching
  the seed action to `btc_profile_line_change` with a full post-rebalance line set. Any change to the
  cost-allocation sandbox effective-cost math should re-verify the MDH rebalance totals still balance.
- **Anchor pinning** — both the forecast anchor and `anchor_distribution_version_id` are pinned at
  creation; stale anchors block Promote and Apply-to-forecast (both require Rebase first). Changing
  anchor logic ripples into both paths.
- **No Alembic** — any model/seed change needs a DB delete + reseed to take effect.
- **AI Advisor** is optional/flagged (`VITE_ENABLE_AI_ADVISOR`; `ANTHROPIC_API_KEY` for live Claude).
- **Endpoint count** is ~28–30 (plus project-scope grid endpoints) depending on how helper/advisor
  routes are counted; treat the grouped list in §5.2 as authoritative over any single number.

---

## 12. Key file map

**Backend**
- `backend/models/scenarios.py` — the 6 models + constants.
- `backend/routers/scenarios.py` — all `/api/scenarios` endpoints.
- `backend/schemas/scenarios.py` — request/response Pydantic models.
- `backend/services/scenario_engine.py` — recompute + action application.
- `backend/services/scenario_impact.py` — 8-dimension dashboard.
- `backend/services/scenario_cost_allocation.py` — cost-allocation sandbox engine.
- `backend/services/scenario_promote.py` — promote routing/execution.
- `backend/services/scenario_apply_forecast.py` — PL apply-to-forecast.
- `backend/services/advisor.py` — AI Advisor.
- `backend/seed/generate_seed_v5/config/scenarios.py` + `s19_scenarios.py` — seed scenarios.

**Frontend** (`frontend/src/modules/simulator/`)
- `SimulatorRouter.tsx`, `ScenarioContext.tsx`, `useScenarioContext.ts`.
- `manager/ScenarioManagerPage.tsx`, `manager/CreateScenarioModal.tsx`.
- `workspace/ScenarioWorkspacePage.tsx` + `workspace/sidebar/*` + `workspace/header/*` +
  `workspace/impact/*`.
- `surfaces/*` (~17 lever surfaces + `SurfaceCard.tsx`).
- `catalogue/catalogueDef.ts` + `catalogue/ActionForm.tsx` + `catalogue/types.ts`.
- `promote/*` (PromoteReviewPage, DiffSelector, RoutingPreview, PromoteConfirmModal, PromoteAuditDrawer).
- `compare/*` (CompareSelectionPage, ComparePage, L1/L2/L3 levels).
- `api/scenariosApi.ts`, `lib/impactTypes.ts`, `permissions/*`, `advisor/AIAdvisorPanel.tsx`.

**Docs**
- `docs/workflows/06-simulator.md` — workflow spec + decision tags (`[B-AC-*]`, `[B-SL-*]`, `[B-PR-*]`,
  `[B-ES-01]`, `[F-AC-01]`, `[F-S1-*]`).
- `docs/data-model.md` — canonical Scenarios-family reference.
- `backend/seed/fixtures/manuals/whatif_simulator.json` — in-app user manual.
- `README.md` (What-If Simulator section); `PROGRESS.md` (build history: Session B1 engine/cost-allocation sandbox,
  B2 frontend rebuild, FD-3 Stage-1 rework, MDH rebalance fix, S4 project-scope WYSIWYG redesign).

---

*Generated as a context document for discussing Simulator changes. Reflects the codebase as of the
end of the VIPER epic (post-Wave-5). If you (the chat) recommend changes, note that this is a demo app
governed by `CLAUDE.md` conventions: SQLAlchemy ORM only, reference data in the DB, server-side
computation, shadcn/ui only, European number formatting, semantic dark-mode classes, no emojis, and
no Alembic (schema changes require a DB reseed).*
