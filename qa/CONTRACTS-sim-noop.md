# CONTRACTS — Simulator no-op lever fix (fix/sim-noop-levers)

Single source of truth for the agent team. Do NOT diverge from these names/signatures without
messaging the team lead. Plan file: `~/.claude/plans/effervescent-petting-anchor.md`.

## Shared branch
`fix/sim-noop-levers` (off `origin/main` @ 3e16194). Everyone commits here, atomic commits, tight granularity.

## Working-state fields (A0) — added in `recalculate_scenario`, ~scenario_engine.py:279
Each `working[pid]` dict gains:
- `transformation_level: str | None`  # "T0" / "T1" / "T2" / None  (from `Project.transformation_level`)
- `project_type: int | None`          # 1 / 2 / 3 / None            (from `Project.project_type`)

Existing fields (unchanged, for reference): `name, original_budget, adjusted_budget, baseline, rag,
lob_id, is_service, is_affected, start, end, status`.

## Engine helper signatures (A1/A3/A6/A7) — in scenario_engine.py
```python
def _uplift_forecast_by_category(db, working, project_ids: list[str] | None,
                                 category: str | None, pct: float, from_month: str,
                                 sub_categories: list[str] | None = None) -> None:
    """For each pid in (project_ids or all working pids) ∩ working: sum Forecast.amount_eur
    where (category is None or Forecast.category == category) and
    (sub_categories is None or Forecast.sub_category in sub_categories) and
    month >= from_month; add sum * pct/100 to working[pid]['adjusted_budget'],
    set is_affected=True. project_ids=None means 'all projects in working'."""

def _resolve_top_level_node(db, node_id: str, top_type: str) -> str:
    """Walk GroupingEntity.parent_entity_id up until entity_type_id == top_type;
    return that ancestor's id. If node_id is already top-level, return node_id.
    Mirrors the parent walk in portfolio_service.py:110-127."""
```
Reuse (already imported in scenario_engine.py):
`_get_projects_for_entity_recursive(db, entity_id) -> list[str]` (portfolio_service.py:184),
`_get_year_scoped_forecast(db, pid, target_years) -> float` (scenario_engine.py:102),
`get_top_level_entity_type_id(db)`.

## action_type → exact param keys (verbatim from the FE payloads)
| action_type | scope | params (keys the engine MUST read) |
|---|---|---|
| `cut_by_hierarchy` | portfolio | `hierarchy_node_id`, `percentage` (+ optional `target_years`) |
| `cut_by_transformation` | portfolio | `transformation_level` ("T0"/"T1"/"T2"), `percentage` (+ `target_years`) |
| `adjust_rate_table` | portfolio | `rate_table_scope` ("internal"/"external"), `location_id?`, `role_type_id?`, `percentage`, `effective_month` (see CORRECTED semantics below) |
| `change_budget_envelope` | portfolio | `mode` ("percent"/"absolute"), `value` (number), `year` (number) |
| `inject_hypothetical_project` | portfolio | `name`, `total_budget`, `project_type` (int), `transformation_level` |
| `reassign_hierarchy` | project | `hierarchy_node_id` |
| `rate_escalation` (surfaces) | portfolio | EITHER `{pct, rate_scope}` OR `{pct, from_month, category, hierarchy_node_id?}` |
| `rate_escalation` (catalogue, KEEP working) | portfolio | `scope_type, scope_values, increase_pct, effective_month` |

## A3 adjust_rate_table — CORRECTED scoping (supersedes earlier allocation-based clause)
Data model (models/financial.py:29,40; report_builder_catalog.py:90/105): for `category='internal'`
forecast rows the **role_type_id lives in `Forecast.sub_category`**; for `external` rows
sub_category is the cost_type_id. So scope precisely on forecast rows, NOT via allocations:
- `rate_table_scope` → `category` ("internal"/"external").
- `role_type_id` present → `sub_categories=[role_type_id]` passed to `_uplift_forecast_by_category`
  (precise, on the forecast rows). No allocation join.
- `location_id` present → forecast rows carry no location, so derive the **project set** via
  CostCenter.location_id → Person.cost_center_id → that person's allocated projects (allocation
  path); pass as `project_ids`. (Over-approximation is acceptable here — no finer signal exists.)
- both → `project_ids` = location-derived set AND `sub_categories=[role_type_id]`.
- neither → `project_ids=None` (all working), `sub_categories=None`.
Tests: the role-filter test correctly tags via `Forecast.sub_category` and needs NO allocations;
add a separate location-filter test that exercises the cost-centre→person→allocation project-set path.

## Lever semantics (locked decisions)
- `change_budget_envelope` percent: per-project `adjusted_budget += scoped_year_€ * (value/100)`.
  absolute (pro-rata): `ratio = value / sum(scoped_year_€ over all projects)`; per project
  `adjusted_budget += scoped * (ratio - 1)` so the year envelope sums to `value`.
- `inject_hypothetical_project`: synthetic working key `f"hypo-{slug(name)}"`, suffix `-2/-3` on
  collision (deterministic on recalc replay). `original_budget=0, adjusted_budget=total_budget,
  baseline=0, rag="green", lob_id="", is_service=False, is_affected=True, start=None, end=None,
  status="Proposed"`, plus `project_type`, `transformation_level`. (slug = name.lower(), non-alnum → '-')
- `reassign_hierarchy`: NO budget change. Set `state["reassigned_node_id"] = _resolve_top_level_node(...)`,
  `is_affected=True`.
- `rate_escalation` surface path: `category` from `rate_scope` (internal/external; "all"→None) or
  `category` ("all"→None); `from_month`/`effective_month` default `DEMO_DATE`; optional
  `hierarchy_node_id` restricts project set via `_get_projects_for_entity_recursive`, else all projects.

## project_states output field (A6) — scenario_engine.py:384 append + scenario_impact.py
- Add `"reassigned_node_id": state.get("reassigned_node_id")` to each `project_states` dict.
- `compute_investment_mix_dimension` (scenario_impact.py:285-293): bucket `anchor_total` by the
  CANONICAL node (`get_project_entity_info`), but `scenario_total` by
  `ps.get("reassigned_node_id") or canonical_node_id`. Everything else unchanged.

## Verification anchor (lead)
Dimension delta read at `dimensions.financial.total_delta`. Control action `across_the_board_cut`
is known-good. 6 levers must move `financial.total_delta`; `reassign_hierarchy` must move
investment-mix per-node totals while `financial.total_delta` stays 0.
