"""
Generate baselines, forecasts, and actuals for all 32 entities.
Largest seed module — produces ~15K-20K rows.
"""
import random

from .config import (
    PROJECTS, PROJECT_STAFFING, PROJECT_EXTERNALS, FORECAST_ADJUSTMENTS,
    CREATED_AT, DEMO_DATE, month_range, sql_str, get_rate,
)

random.seed(42)  # Deterministic output

# Actuals exist through Feb 2026; March 2026 gets partial (~50%)
ACTUALS_FULL_END = "2026-02"
ACTUALS_PARTIAL = "2026-03"

# Service financial window
SVC_START = "2024-01"
SVC_END = "2026-12"

BATCH_SIZE = 100  # rows per INSERT statement


def _ext_status(month: str) -> str:
    """Procurement lifecycle status based on temporal position relative to demo date."""
    if month < "2025-12":
        return "accrued"
    if month <= "2026-02":
        return "invoiced"
    if month == "2026-03":
        return "delivered"
    if month <= "2026-06":
        return "committed"
    return "requested"


def _actuals_variance(narrative: str, is_external: bool = False) -> float:
    """Return a multiplier for actuals variance based on project narrative."""
    if narrative == "troubled":
        if is_external:
            return random.uniform(1.02, 1.15)
        return random.uniform(1.03, 1.12)
    if narrative == "scope_change":
        return random.uniform(0.98, 1.08)
    # well_managed, nearing_completion, steady_service, completed
    return random.uniform(0.96, 1.04)


def _get_active_months(proj: dict) -> list[str]:
    """Return the list of active months for a project/service."""
    start = proj["start"]
    if proj["type"] == "service":
        end = SVC_END
        start = max(start, SVC_START)
    else:
        end = proj["end"]
    return month_range(start, end)


def _get_forecast_value(proj_id: str, category: str, key: str, month: str,
                         base_hours: float | None, base_amount: float,
                         loc: str | None = None) -> tuple[float | None, float]:
    """Apply forecast adjustments if any. Returns (hours, amount)."""
    adj = FORECAST_ADJUSTMENTS.get(proj_id, {})
    hours = base_hours
    amount = base_amount

    if category == "internal" and "internal" in adj:
        for a in adj["internal"]:
            if a["role"] == key and (loc is None or a.get("loc") == loc) and month >= a["from"]:
                hours = a["hours"]
                rate = get_rate(key, loc) if loc else 0
                amount = hours * rate
                break
    elif category == "external" and "external" in adj:
        for a in adj["external"]:
            if a["desc"] == key and month >= a["from"]:
                amount = a["amount"]
                break

    return hours, amount


def _should_have_actuals(month: str, proj: dict) -> bool:
    """Determine if this month should have actuals rows."""
    if proj["status"] == "planned" or proj["status"] == "pending_approval":
        return False
    if proj["status"] == "completed":
        return True  # completed projects have actuals for their full range
    return month <= ACTUALS_FULL_END


def _should_have_partial_actuals(month: str, proj: dict) -> bool:
    """March 2026 gets partial actuals for active projects."""
    if proj["status"] in ("planned", "pending_approval", "completed"):
        return False
    return month == ACTUALS_PARTIAL


def generate() -> str:
    parts = []
    parts.append("-- =============================================================================")
    parts.append("-- Baselines, Forecasts, Actuals")
    parts.append("-- =============================================================================")

    baseline_rows = []
    forecast_rows = []
    actuals_rows = []
    budget_updates = []

    proj_lookup = {p["id"]: p for p in PROJECTS}

    for proj in PROJECTS:
        pid = proj["id"]
        narrative = proj["narrative"]
        months = _get_active_months(proj)
        staffing = PROJECT_STAFFING.get(pid, [])
        externals = PROJECT_EXTERNALS.get(pid, [])

        baseline_total = 0.0
        forecast_total = 0.0

        for mo in months:
            # --- Internal line items ---
            for staff in staffing:
                role = staff["role"]
                loc = staff["loc"]
                base_hours = staff["hours"]
                co = staff["co"]
                rate = get_rate(role, loc)
                if rate is None:
                    continue
                base_amount = base_hours * rate

                # Baseline
                baseline_rows.append(
                    f"({sql_str(pid)}, {sql_str(mo)}, 'internal', {sql_str(role)}, "
                    f"{base_hours}, {base_amount:.2f}, NULL, {sql_str(co)}, NULL, NULL)"
                )
                baseline_total += base_amount

                # Forecast (may differ for troubled projects)
                f_hours, f_amount = _get_forecast_value(
                    pid, "internal", role, mo, base_hours, base_amount, loc
                )
                forecast_rows.append(
                    f"({sql_str(pid)}, {sql_str(mo)}, 'internal', {sql_str(role)}, "
                    f"{f_hours}, {f_amount:.2f}, NULL, {sql_str(co)}, NULL, NULL)"
                )
                forecast_total += f_amount

                # Actuals
                if _should_have_actuals(mo, proj):
                    var = _actuals_variance(narrative)
                    a_hours = round(f_hours * var)
                    a_amount = a_hours * rate
                    actuals_rows.append(
                        f"({sql_str(pid)}, {sql_str(mo)}, 'internal', {sql_str(role)}, "
                        f"{a_hours}, {a_amount:.2f}, NULL, {sql_str(co)}, NULL, NULL)"
                    )
                elif _should_have_partial_actuals(mo, proj):
                    partial = random.uniform(0.40, 0.60)
                    a_hours = round(f_hours * partial)
                    a_amount = a_hours * rate
                    actuals_rows.append(
                        f"({sql_str(pid)}, {sql_str(mo)}, 'internal', {sql_str(role)}, "
                        f"{a_hours}, {a_amount:.2f}, NULL, {sql_str(co)}, NULL, NULL)"
                    )

            # --- External line items ---
            for ext in externals:
                desc = ext["desc"]
                cat = ext["cat"]
                vendor = ext.get("vendor")
                co = ext["co"]
                base_amount = ext["base"]
                status = _ext_status(mo)

                # Baseline
                baseline_rows.append(
                    f"({sql_str(pid)}, {sql_str(mo)}, 'external', {sql_str(cat)}, "
                    f"NULL, {base_amount:.2f}, {sql_str(desc)}, {sql_str(co)}, {sql_str(vendor)}, {sql_str(status)})"
                )
                baseline_total += base_amount

                # Forecast
                _, f_amount = _get_forecast_value(
                    pid, "external", desc, mo, None, base_amount
                )
                forecast_rows.append(
                    f"({sql_str(pid)}, {sql_str(mo)}, 'external', {sql_str(cat)}, "
                    f"NULL, {f_amount:.2f}, {sql_str(desc)}, {sql_str(co)}, {sql_str(vendor)}, {sql_str(status)})"
                )
                forecast_total += f_amount

                # Actuals
                if _should_have_actuals(mo, proj):
                    var = _actuals_variance(narrative, is_external=True)
                    a_amount = round(f_amount * var, 2)
                    actuals_rows.append(
                        f"({sql_str(pid)}, {sql_str(mo)}, 'external', {sql_str(cat)}, "
                        f"NULL, {a_amount:.2f}, {sql_str(desc)}, {sql_str(co)}, {sql_str(vendor)}, {sql_str(status)})"
                    )
                elif _should_have_partial_actuals(mo, proj):
                    partial = random.uniform(0.40, 0.60)
                    a_amount = round(f_amount * partial, 2)
                    actuals_rows.append(
                        f"({sql_str(pid)}, {sql_str(mo)}, 'external', {sql_str(cat)}, "
                        f"NULL, {a_amount:.2f}, {sql_str(desc)}, {sql_str(co)}, {sql_str(vendor)}, {sql_str(status)})"
                    )

        # Update project total_budget / annual_budget to match computed baseline
        if proj["type"] == "service":
            # Annual budget = baseline_total / years covered
            year_count = max(1, len(months) / 12)
            annual = round(baseline_total / year_count, 2)
            budget_updates.append(
                f"UPDATE projects SET annual_budget = {annual:.2f} WHERE id = {sql_str(pid)};"
            )
        else:
            budget_updates.append(
                f"UPDATE projects SET total_budget = {baseline_total:.2f} WHERE id = {sql_str(pid)};"
            )

    # Emit batched INSERT statements
    cols_bl = "(project_id, month, category, sub_category, hours, amount_eur, description, capex_opex, vendor, ext_status)"

    def _emit_batched(table: str, cols: str, rows: list[str]) -> list[str]:
        stmts = []
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i:i + BATCH_SIZE]
            stmts.append(f"INSERT INTO {table} {cols} VALUES\n" + ",\n".join(batch) + ";")
        return stmts

    parts.append(f"\n-- Baselines ({len(baseline_rows)} rows)")
    parts.extend(_emit_batched("baselines", cols_bl, baseline_rows))

    parts.append(f"\n-- Forecasts ({len(forecast_rows)} rows)")
    parts.extend(_emit_batched("forecasts", cols_bl, forecast_rows))

    parts.append(f"\n-- Actuals ({len(actuals_rows)} rows)")
    parts.extend(_emit_batched("actuals", cols_bl, actuals_rows))

    parts.append("\n-- Budget reconciliation")
    parts.extend(budget_updates)

    return "\n".join(parts)
