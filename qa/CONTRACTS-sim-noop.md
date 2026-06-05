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
def _uplift_forecast_by_category(db, working, project_ids: list[str],
                                 category: str | None, pct: float, from_month: str) -> None:
    """For each pid in project_ids ∩ working: sum Forecast.amount_eur where
    (category is None or Forecast.category == category) and month >= from_month,
    add sum * pct/100 to working[pid]['adjusted_budget'], set is_affected=True."""

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
| `adjust_rate_table` | portfolio | `rate_table_scope` ("internal"/"external"), `location_id?`, `role_type_id?`, `percentage`, `effective_month` |
| `change_budget_envelope` | portfolio | `mode` ("percent"/"absolute"), `value` (number), `year` (number) |
| `inject_hypothetical_project` | portfolio | `name`, `total_budget`, `project_type` (int), `transformation_level` |
| `reassign_hierarchy` | project | `hierarchy_node_id` |
| `rate_escalation` (surfaces) | portfolio | EITHER `{pct, rate_scope}` OR `{pct, from_month, category, hierarchy_node_id?}` |
| `rate_escalation` (catalogue, KEEP working) | portfolio | `scope_type, scope_values, increase_pct, effective_month` |

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
