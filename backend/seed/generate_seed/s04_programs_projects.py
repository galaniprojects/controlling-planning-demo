"""Generate programmes, projects/services, planning parameters, and KPI definitions."""

from .config import PROGRAMMES, PROJECTS, CREATED_AT, sql_str


def generate() -> str:
    lines = []

    # --- Programmes ---
    lines.append("-- =============================================================================")
    lines.append("-- 10. Programmes")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO programs (id, name, lob_id, description, created_at) VALUES")
    rows = []
    for prog in PROGRAMMES:
        rows.append(f"({sql_str(prog['id'])}, {sql_str(prog['name'])}, {sql_str(prog['lob_id'])}, NULL, '{CREATED_AT}')")
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- Projects & Services ---
    lines.append("-- =============================================================================")
    lines.append("-- 11. Projects & Services (32)")
    lines.append("-- =============================================================================")
    lines.append("")

    # Group by LoB for readability
    by_lob: dict[str, list] = {}
    for p in PROJECTS:
        by_lob.setdefault(p["lob"], []).append(p)

    for lob_id, projs in by_lob.items():
        lines.append(f"-- {lob_id}")
        lines.append("INSERT INTO projects (id, name, description, lob_id, program_id, status, rag_status, capex_opex, start_month, end_month, projected_end_month, pl_person_id, is_service, annual_budget, total_budget, last_forecast_submitted_month, is_active, created_at, modified_at) VALUES")
        rows = []
        for p in projs:
            is_svc = 1 if p["type"] == "service" else 0
            annual = p["budget"] if is_svc else None
            total = p["budget"] if not is_svc else None

            # last_forecast_submitted_month: set for specific projects to drive pending actions
            # These will be updated in s08_workflow.py — for now set reasonable defaults
            last_fc = None
            if p["status"] == "active" and not is_svc:
                last_fc = "2026-02"  # Default: submitted through Feb 2026

            # Specific overrides for pending action triggers
            if p["id"] == "proj-erp2":
                last_fc = "2026-01"  # Overdue — Feb not submitted
            elif p["id"] in ("proj-sensor", "proj-predmaint"):
                last_fc = "2026-02"  # Due — March not yet submitted

            projected_end = p.get("end")
            if p["id"] == "proj-erp2":
                projected_end = "2026-09"  # Extended timeline

            rows.append(
                f"({sql_str(p['id'])}, {sql_str(p['name'])}, NULL, "
                f"{sql_str(p['lob'])}, {sql_str(p.get('prog'))}, {sql_str(p['status'])}, "
                f"{sql_str(p['rag'])}, {sql_str(p['capex_opex'])}, "
                f"{sql_str(p['start'])}, {sql_str(p.get('end'))}, {sql_str(projected_end)}, "
                f"{sql_str(p.get('pl'))}, {is_svc}, "
                f"{sql_str(annual)}, {sql_str(total)}, "
                f"{sql_str(last_fc)}, 1, '{CREATED_AT}', '{CREATED_AT}')"
            )
        lines.append(",\n".join(rows) + ";")
        lines.append("")

    # --- Planning Parameters ---
    lines.append("-- =============================================================================")
    lines.append("-- 12. Planning Parameters")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO planning_parameters (key, name, description, current_value, default_value, data_type, param_group, created_at, modified_at) VALUES")
    params = [
        ("fiscal_year_start",  "Fiscal Year Start",     "Month when fiscal year begins",        "01",      "01",      "month",      "fiscal"),
        ("planning_horizon",   "Planning Horizon",      "Number of months to plan ahead",       "36",      "36",      "integer",    "planning"),
        ("forecast_deadline",  "Forecast Deadline",     "Day of month when forecast is due",    "15",      "15",      "integer",    "planning"),
        ("rag_amber_threshold","RAG Amber Threshold",   "Budget variance % for amber status",   "5",       "5",       "percentage", "thresholds"),
        ("rag_red_threshold",  "RAG Red Threshold",     "Budget variance % for red status",     "10",      "10",      "percentage", "thresholds"),
        ("max_utilization",    "Max Utilization",       "Maximum person utilization percentage", "100",     "100",     "percentage", "limits"),
    ]
    rows = []
    for key, name, desc, cur, dflt, dtype, group in params:
        rows.append(
            f"({sql_str(key)}, {sql_str(name)}, {sql_str(desc)}, "
            f"{sql_str(cur)}, {sql_str(dflt)}, {sql_str(dtype)}, {sql_str(group)}, "
            f"'{CREATED_AT}', '{CREATED_AT}')"
        )
    lines.append(",\n".join(rows) + ";")
    lines.append("")

    # --- KPI Definitions ---
    lines.append("-- =============================================================================")
    lines.append("-- 13. KPI Definitions")
    lines.append("-- =============================================================================")
    lines.append("")
    lines.append("INSERT INTO kpi_definitions (name, description, formula, display_format, target_value, is_built_in, is_active, created_at) VALUES")
    kpis = [
        ("Total Baseline",       "Sum of all project baselines",            "SUM(baseline.amount_eur)",          "currency",   None, 1, 1),
        ("Current Forecast",     "Sum of all project forecasts",            "SUM(forecast.amount_eur)",          "currency",   None, 1, 1),
        ("YTD Actuals",          "Year-to-date recorded costs",             "SUM(actuals.amount_eur) WHERE year=current", "currency", None, 1, 1),
        ("Plan Drift",           "Forecast minus Baseline",                 "forecast_total - baseline_total",   "currency",   "0", 1, 1),
        ("Portfolio Utilization", "Average resource utilization",            "AVG(person_utilization_pct)",        "percentage", "85", 1, 1),
        ("Run/Change Ratio",     "Services vs Projects budget split",       "services_budget / projects_budget",  "ratio",      None, 1, 1),
        ("CapEx/OpEx Ratio",     "Capital vs Operating expenditure split",  "capex_total / opex_total",          "ratio",      None, 1, 1),
    ]
    rows = []
    for name, desc, formula, fmt, target, builtin, active in kpis:
        rows.append(
            f"({sql_str(name)}, {sql_str(desc)}, {sql_str(formula)}, "
            f"{sql_str(fmt)}, {sql_str(target)}, {builtin}, {active}, '{CREATED_AT}')"
        )
    lines.append(",\n".join(rows) + ";")

    return "\n".join(lines)
