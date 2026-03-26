"""
Generate What-If scenarios with actions, states, and capacity impacts.
"""
from .config import SCENARIO_DEFS, PROJECTS, COST_CENTRES, sql_str


def _headline_impact(scenario_def: dict) -> str:
    """Build a JSON headline impact string from scenario actions."""
    total_delta = sum(
        int(a["impact"].split('"budget_delta": ')[1].rstrip('}"'))
        for a in scenario_def["actions"]
    )
    return f'{{"total_budget_delta": {total_delta}, "action_count": {len(scenario_def["actions"])}}}'


def generate() -> str:
    parts = []
    parts.append("-- =============================================================================")
    parts.append("-- What-If Scenarios")
    parts.append("-- =============================================================================")

    proj_lookup = {p["id"]: p for p in PROJECTS}

    # --- Scenarios ---
    scenario_rows = []
    for s in SCENARIO_DEFS:
        headline = _headline_impact(s)
        scenario_rows.append(
            f"({s['id']}, {sql_str(s['name'])}, {sql_str(s['description'])}, "
            f"{sql_str(s['author'])}, {sql_str(s['status'])}, {sql_str(headline)}, "
            f"{sql_str(s['created'])}, {sql_str(s['created'])})"
        )

    parts.append("\nINSERT INTO scenarios (id, name, description, author_id, status, headline_impact, created_at, modified_at) VALUES\n"
                 + ",\n".join(scenario_rows) + ";")

    # --- Scenario Actions ---
    action_rows = []
    action_id = 0
    for s in SCENARIO_DEFS:
        for a in s["actions"]:
            action_id += 1
            action_rows.append(
                f"({action_id}, {s['id']}, {a['order']}, {sql_str(a['scope'])}, "
                f"{sql_str(a['type'])}, {sql_str(a.get('proj'))}, "
                f"{sql_str(a['params'])}, {sql_str(a['impact'])}, "
                f"{sql_str(a.get('label'))}, {sql_str(s['created'])})"
            )

    parts.append("\nINSERT INTO scenario_actions (id, scenario_id, action_order, scope, action_type, project_id, parameters_json, impact_delta_json, group_label, created_at) VALUES\n"
                 + ",\n".join(action_rows) + ";")

    # --- Scenario States (per project for each scenario) ---
    state_rows = []
    for s in SCENARIO_DEFS:
        affected_proj_ids = {a["proj"] for a in s["actions"] if a.get("proj")}
        for proj in PROJECTS:
            pid = proj["id"]
            if proj["type"] == "service":
                continue  # scenarios don't affect services
            budget = proj["budget"]
            is_affected = pid in affected_proj_ids

            if is_affected:
                # Find the budget delta from the matching action
                delta = 0
                for a in s["actions"]:
                    if a.get("proj") == pid:
                        delta_str = a["impact"].split('"budget_delta": ')[1].rstrip('}"')
                        delta += int(delta_str)
                adjusted = budget + delta
                adj_rag = proj.get("rag") or "green"
                adj_start = proj["start"]
                adj_end = proj["end"]

                # Adjust timeline for delay/accelerate/remove
                for a in s["actions"]:
                    if a.get("proj") == pid:
                        if a["type"] == "delay_project":
                            # Parse delay months from params
                            import json
                            params = json.loads(a["params"])
                            dm = params.get("delay_months", 0)
                            # Shift start
                            sy, sm = int(adj_start[:4]), int(adj_start[5:7])
                            sm += dm
                            while sm > 12:
                                sm -= 12
                                sy += 1
                            adj_start = f"{sy:04d}-{sm:02d}"
                            if adj_end:
                                ey, em = int(adj_end[:4]), int(adj_end[5:7])
                                em += dm
                                while em > 12:
                                    em -= 12
                                    ey += 1
                                adj_end = f"{ey:04d}-{em:02d}"
                        elif a["type"] == "remove_project":
                            adjusted = 0
                            adj_rag = None
                        elif a["type"] == "accelerate_project":
                            import json
                            params = json.loads(a["params"])
                            am = params.get("advance_months", 0)
                            sy, sm = int(adj_start[:4]), int(adj_start[5:7])
                            sm -= am
                            while sm < 1:
                                sm += 12
                                sy -= 1
                            adj_start = f"{sy:04d}-{sm:02d}"
            else:
                delta = 0
                adjusted = budget
                adj_rag = proj.get("rag")
                adj_start = proj["start"]
                adj_end = proj["end"]

            state_rows.append(
                f"({s['id']}, {sql_str(pid)}, {budget:.2f}, {adjusted:.2f}, "
                f"{delta:.2f}, {sql_str(proj.get('rag'))}, {sql_str(adj_rag)}, "
                f"{sql_str(proj['start'])}, {sql_str(adj_start)}, "
                f"{sql_str(proj['end'])}, {sql_str(adj_end)}, "
                f"{1 if is_affected else 0})"
            )

    parts.append(f"\n-- Scenario States ({len(state_rows)} rows)")
    parts.append(
        "INSERT INTO scenario_states (scenario_id, project_id, original_budget, adjusted_budget, "
        "budget_delta, original_rag, adjusted_rag, original_start, adjusted_start, "
        "original_end, adjusted_end, is_affected) VALUES\n"
        + ",\n".join(state_rows) + ";"
    )

    # --- Scenario Capacity Impacts (simplified — key cost centres) ---
    # Generate for scenarios 1 and 3 (published) for a few key months
    impact_rows = []
    key_months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]
    key_ccs = ["cc-muc-apd", "cc-muc-inf", "cc-bud-apd", "cc-bud-dda", "cc-muc-dda", "cc-pun-apd"]

    for s in SCENARIO_DEFS:
        if s["status"] != "published":
            continue
        for cc in key_ccs:
            for mo in key_months:
                # Simplified: estimate utilization change based on whether the scenario
                # removes/reduces projects that use this CC's roles
                orig_util = 82.0  # reasonable average
                adj_util = orig_util
                fte_delta = 0.0

                if s["id"] == 1:  # Budget Pressure
                    if cc == "cc-muc-dda" and mo >= "2026-04":
                        adj_util = 65.0  # AI/ML Lab cancelled
                        fte_delta = -0.5
                    elif cc == "cc-muc-inf" and mo >= "2026-07":
                        adj_util = 70.0  # Cloud Migration reduced
                        fte_delta = -0.3
                elif s["id"] == 3:  # Conservative
                    if cc in ("cc-bud-apd", "cc-muc-apd", "cc-pun-apd"):
                        adj_util = 72.0  # Future projects frozen
                        fte_delta = -0.4

                if adj_util != orig_util:
                    impact_rows.append(
                        f"({s['id']}, {sql_str(cc)}, {sql_str(mo)}, "
                        f"{orig_util:.1f}, {adj_util:.1f}, {fte_delta:.2f})"
                    )

    if impact_rows:
        parts.append(f"\n-- Scenario Capacity Impacts ({len(impact_rows)} rows)")
        parts.append(
            "INSERT INTO scenario_capacity_impacts (scenario_id, cost_center_id, month, "
            "original_utilization_pct, adjusted_utilization_pct, fte_delta) VALUES\n"
            + ",\n".join(impact_rows) + ";"
        )

    return "\n".join(parts)
