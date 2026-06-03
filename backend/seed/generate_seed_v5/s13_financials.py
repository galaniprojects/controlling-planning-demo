"""Stage 13 — Baselines, Forecasts, Actuals [C-FG-07] [C-FV-01..07].

Emits per-project monthly inner-zone + quarterly outer-zone financial cells:
- ``baselines`` — immutable approved plan, monthly across project active range.
- ``forecasts`` — living plan; monthly through 2027-03, quarterly Apr 2027 –
  Mar 2029. Outer-zone rows carry ``is_provisional=1`` per [C-FG-07].
- ``actuals`` — historical recorded costs through 2026-03 (full), partial
  Apr 2026 (~50%). No future-month actuals.

Baselines / forecasts / actuals use ``project_id`` as the keying FK; they are
populated for the 11 Project subtypes only. Offering and InternalService
own-costs live on ``ChargeableEntity.annual_cost`` (seeded in s06).

Determinism: ``random.seed(42)`` mirrors v4. Variance multipliers + partial-
April fractions are sampled from this seeded random.
"""
from __future__ import annotations

import random

from _utils import month_range, sql_str
from generate_seed_v5.config.entities import PROJECTS
from generate_seed_v5.config.financials import (
    FORECAST_ADJUSTMENTS,
    PROJECT_EXTERNALS,
    PROJECT_STAFFING,
)
from generate_seed_v5.config.master import get_rate

random.seed(42)

DEMO_DATE = "2026-04"
ACTUALS_FULL_END = "2026-03"
ACTUALS_PARTIAL = "2026-04"
INNER_ZONE_END = "2027-03"     # monthly inner-zone last month [C-FG-07]
OUTER_ZONE_END = "2029-03"     # quarterly outer-zone last anchor month
RUN_HORIZON_END = "2029-03"    # cap forecast/baseline horizon for Run-stage projects

BATCH_SIZE = 100  # rows per multi-row INSERT statement


# ---------------------------------------------------------------------------
# Month / quarter helpers
# ---------------------------------------------------------------------------

def _quarter_anchor(month: str) -> str:
    """Return the first month of the quarter the given month belongs to.

    Q1 → 01, Q2 → 04, Q3 → 07, Q4 → 10.
    """
    y, m = int(month[:4]), int(month[5:7])
    q_start_m = ((m - 1) // 3) * 3 + 1
    return f"{y:04d}-{q_start_m:02d}"


def _is_quarter_anchor(month: str) -> bool:
    """True iff month is the first month of its quarter."""
    return _quarter_anchor(month) == month


def _project_active_months(proj: dict) -> list[str]:
    """Return all months a project is active (start through end)."""
    start = proj["start_month"]
    end = proj["end_month"] or RUN_HORIZON_END
    return month_range(start, end)


def _forecast_months(proj: dict) -> list[str]:
    """Return forecast months: monthly inner zone + quarterly outer zone.

    Outer-zone cells are represented by their quarter anchor month.
    """
    months: list[str] = []
    for mo in _project_active_months(proj):
        if mo <= INNER_ZONE_END:
            months.append(mo)
        elif mo <= OUTER_ZONE_END and _is_quarter_anchor(mo):
            months.append(mo)
    return months


# ---------------------------------------------------------------------------
# Procurement lifecycle / variance / partial-April helpers
# ---------------------------------------------------------------------------

def _ext_status(month: str) -> str:
    """External-cost procurement status by demo-date temporal position."""
    if month < "2026-01":
        return "accrued"
    if month <= "2026-03":
        return "invoiced"
    if month == "2026-04":
        return "delivered"
    if month <= "2026-07":
        return "committed"
    return "requested"


def _variance(rag: str | None, is_external: bool = False) -> float:
    """Multiplier applied to forecast amounts to produce actuals."""
    if rag == "red":
        return random.uniform(1.03, 1.12) if not is_external else random.uniform(1.02, 1.15)
    if rag == "amber":
        return random.uniform(0.98, 1.08)
    # green / unset → close to forecast
    return random.uniform(0.96, 1.04)


def _should_have_actuals(month: str, proj: dict) -> bool:
    """True iff this project / month combination should have actuals data."""
    # Skip projects in pre-active states.
    if proj["v4_status"] in ("draft", "planned", "pending_cc_confirmation", "pending_approval"):
        return False
    if month > ACTUALS_FULL_END:
        return False
    return True


def _should_have_partial_actuals(month: str, proj: dict) -> bool:
    """April 2026 carries partial actuals for active projects only."""
    if proj["v4_status"] in ("draft", "planned", "pending_cc_confirmation", "pending_approval"):
        return False
    return month == ACTUALS_PARTIAL


def _adjusted_forecast(
    proj_id: str, category: str, key: str, month: str,
    base_hours: float | None, base_amount: float, loc: str | None = None,
) -> tuple[float | None, float]:
    """Apply FORECAST_ADJUSTMENTS for the given (proj, category, key, month)."""
    adj = FORECAST_ADJUSTMENTS.get(proj_id, {})
    hours = base_hours
    amount = base_amount

    if category == "internal" and "internal" in adj:
        for a in adj["internal"]:
            if a["role"] == key and (loc is None or a.get("loc") == loc) and month >= a["from"]:
                hours = a["hours"]
                rate = get_rate(key, loc) if loc else 0
                amount = hours * (rate or 0)
                break
    elif category == "external" and "external" in adj:
        for a in adj["external"]:
            if a["desc"] == key and month >= a["from"]:
                amount = a["amount"]
                break

    return hours, amount


# ---------------------------------------------------------------------------
# Row emission helpers
# ---------------------------------------------------------------------------

def _emit_internal_rows(
    proj: dict,
    rows_baseline: list[str],
    rows_forecast: list[str],
    rows_actuals: list[str],
) -> None:
    """Emit rows for internal staff line items for one project."""
    pid = proj["id"]
    rag = proj.get("rag_status")
    staffing = PROJECT_STAFFING.get(pid, [])

    baseline_months = _project_active_months(proj)
    forecast_months = _forecast_months(proj)

    for staff in staffing:
        role = staff["role"]
        loc = staff["loc"]
        base_hours = staff["hours"]
        co = staff["co"]
        rate = get_rate(role, loc)
        if rate is None:
            continue  # location/role combo not chargeable
        base_amount = base_hours * rate

        # --- Baselines (monthly, full active range) ---
        for mo in baseline_months:
            rows_baseline.append(
                f"({sql_str(pid)}, {sql_str(mo)}, 'internal', {sql_str(role)}, "
                f"{base_hours}, {base_amount:.2f}, NULL, {sql_str(co)}, NULL, NULL, NULL, "
                f"{sql_str(loc)})"
            )

        # --- Forecasts (monthly inner + quarterly outer) ---
        for mo in forecast_months:
            f_hours, f_amount = _adjusted_forecast(
                pid, "internal", role, mo, base_hours, base_amount, loc,
            )
            is_outer = mo > INNER_ZONE_END
            scale = 3.0 if is_outer else 1.0
            cell_hours = (f_hours * scale) if f_hours is not None else None
            cell_amount = f_amount * scale
            provisional = 1 if is_outer else 0
            rows_forecast.append(
                f"({sql_str(pid)}, {sql_str(mo)}, 'internal', {sql_str(role)}, "
                f"{cell_hours}, {cell_amount:.2f}, NULL, {sql_str(co)}, "
                f"NULL, NULL, NULL, NULL, {provisional}, {sql_str(loc)})"
            )

        # --- Actuals (monthly, through ACTUALS_FULL_END + partial April) ---
        for mo in baseline_months:
            f_hours, f_amount = _adjusted_forecast(
                pid, "internal", role, mo, base_hours, base_amount, loc,
            )
            if _should_have_actuals(mo, proj):
                var = _variance(rag)
                a_hours = round(f_hours * var) if f_hours is not None else None
                a_amount = (a_hours * rate) if a_hours is not None else (f_amount * var)
                rows_actuals.append(
                    f"({sql_str(pid)}, {sql_str(mo)}, 'internal', {sql_str(role)}, "
                    f"{a_hours}, {a_amount:.2f}, NULL, {sql_str(co)}, NULL, NULL, NULL, "
                    f"{sql_str(loc)})"
                )
            elif _should_have_partial_actuals(mo, proj):
                partial = random.uniform(0.40, 0.60)
                a_hours = round(f_hours * partial) if f_hours is not None else None
                a_amount = (a_hours * rate) if a_hours is not None else (f_amount * partial)
                rows_actuals.append(
                    f"({sql_str(pid)}, {sql_str(mo)}, 'internal', {sql_str(role)}, "
                    f"{a_hours}, {a_amount:.2f}, NULL, {sql_str(co)}, NULL, NULL, NULL, "
                    f"{sql_str(loc)})"
                )


def _emit_external_rows(
    proj: dict,
    rows_baseline: list[str],
    rows_forecast: list[str],
    rows_actuals: list[str],
) -> None:
    """Emit rows for external cost line items for one project."""
    pid = proj["id"]
    rag = proj.get("rag_status")
    externals = PROJECT_EXTERNALS.get(pid, [])

    baseline_months = _project_active_months(proj)
    forecast_months = _forecast_months(proj)

    for ext in externals:
        desc = ext["desc"]
        cat = ext["cat"]
        vendor = ext.get("vendor")
        co = ext["co"]
        base_amount = ext["base"]

        # v5.1 C-07: optional role assignment (Teammate B owns the actual
        # assignments; pre-work emits NULL for every row so the column
        # exists once the FK lands).
        role_id = ext.get("role")

        for mo in baseline_months:
            status = _ext_status(mo)
            rows_baseline.append(
                f"({sql_str(pid)}, {sql_str(mo)}, 'external', {sql_str(cat)}, "
                f"NULL, {base_amount:.2f}, {sql_str(desc)}, {sql_str(co)}, "
                f"{sql_str(vendor)}, {sql_str(status)}, {sql_str(role_id)}, NULL)"
            )

        for mo in forecast_months:
            _, f_amount = _adjusted_forecast(
                pid, "external", desc, mo, None, base_amount,
            )
            is_outer = mo > INNER_ZONE_END
            scale = 3.0 if is_outer else 1.0
            cell_amount = f_amount * scale
            provisional = 1 if is_outer else 0
            status = _ext_status(mo)
            rows_forecast.append(
                f"({sql_str(pid)}, {sql_str(mo)}, 'external', {sql_str(cat)}, "
                f"NULL, {cell_amount:.2f}, {sql_str(desc)}, {sql_str(co)}, "
                f"{sql_str(status)}, NULL, {sql_str(vendor)}, {sql_str(role_id)}, "
                f"{provisional}, NULL)"
            )

        for mo in baseline_months:
            _, f_amount = _adjusted_forecast(
                pid, "external", desc, mo, None, base_amount,
            )
            if _should_have_actuals(mo, proj):
                var = _variance(rag, is_external=True)
                a_amount = round(f_amount * var, 2)
                status = _ext_status(mo)
                rows_actuals.append(
                    f"({sql_str(pid)}, {sql_str(mo)}, 'external', {sql_str(cat)}, "
                    f"NULL, {a_amount:.2f}, {sql_str(desc)}, {sql_str(co)}, "
                    f"{sql_str(vendor)}, {sql_str(status)}, {sql_str(role_id)}, NULL)"
                )
            elif _should_have_partial_actuals(mo, proj):
                partial = random.uniform(0.40, 0.60)
                a_amount = round(f_amount * partial, 2)
                status = _ext_status(mo)
                rows_actuals.append(
                    f"({sql_str(pid)}, {sql_str(mo)}, 'external', {sql_str(cat)}, "
                    f"NULL, {a_amount:.2f}, {sql_str(desc)}, {sql_str(co)}, "
                    f"{sql_str(vendor)}, {sql_str(status)}, {sql_str(role_id)}, NULL)"
                )


def _emit_batched(table: str, cols: str, rows: list[str]) -> list[str]:
    stmts: list[str] = []
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        stmts.append(f"INSERT INTO {table} {cols} VALUES\n" + ",\n".join(batch) + ";")
    return stmts


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s13_financials — baselines, forecasts, actuals")
    parts.append("-- Mixed-granularity forecast: monthly through 2027-03; quarterly anchors")
    parts.append("-- 2027-04 .. 2029-03 with is_provisional=1 per [C-FG-07].")
    parts.append("-- random.seed(42) for deterministic variance.")
    parts.append("-- =============================================================================")

    rows_baseline: list[str] = []
    rows_forecast: list[str] = []
    rows_actuals: list[str] = []

    for proj in PROJECTS:
        _emit_internal_rows(proj, rows_baseline, rows_forecast, rows_actuals)
        _emit_external_rows(proj, rows_baseline, rows_forecast, rows_actuals)

    # v5.1 C-07: role_type_id column added to all three financial tables
    # (nullable FK → role_types). Internal rows always emit NULL; external
    # rows pick up role assignments from PROJECT_EXTERNALS[].role.
    # S6 location-aware: location_id is the trailing column on all three tables.
    # Internal rows emit their staffing workforce location; external rows NULL.
    cols_bl = ("(project_id, month, category, sub_category, hours, amount_eur, "
               "description, capex_opex, vendor, ext_status, role_type_id, "
               "location_id)")
    cols_fc = ("(project_id, month, category, sub_category, hours, amount_eur, "
               "description, capex_opex, ext_status, po_number, vendor, "
               "role_type_id, is_provisional, location_id)")
    cols_ac = cols_bl

    parts.append(f"\n-- Baselines ({len(rows_baseline)} rows)")
    parts.extend(_emit_batched("baselines", cols_bl, rows_baseline))

    parts.append(f"\n-- Forecasts ({len(rows_forecast)} rows)")
    parts.extend(_emit_batched("forecasts", cols_fc, rows_forecast))

    parts.append(f"\n-- Actuals ({len(rows_actuals)} rows)")
    parts.extend(_emit_batched("actuals", cols_ac, rows_actuals))

    return "\n".join(parts)
