"""Pure calculation functions for variance, RAG, utilization, and month math.

All functions take plain numeric/string inputs and return computed values.
No database access — these are called by routers and services.
The get_standard_hours helper is the one exception (needs DB access).
"""

from __future__ import annotations

FTE_HOURS = 160.0


def get_standard_hours(db, location_id: str | None = None) -> float:
    """Look up configurable standard hours from planning_parameters.

    Checks for a location-specific override first, then falls back to
    the global default, then to the hardcoded FTE_HOURS constant.
    """
    from models.system import PlanningParameter

    if location_id:
        loc_param = db.query(PlanningParameter).filter(
            PlanningParameter.key == f"standard_hours_{location_id}"
        ).first()
        if loc_param:
            return float(loc_param.current_value)

    global_param = db.query(PlanningParameter).filter(
        PlanningParameter.key == "standard_hours_global"
    ).first()
    if global_param:
        return float(global_param.current_value)

    return FTE_HOURS


# ---------------------------------------------------------------------------
# Month utilities
# ---------------------------------------------------------------------------

def parse_month(ym: str) -> tuple[int, int]:
    """Parse 'YYYY-MM' into (year, month)."""
    parts = ym.split("-")
    return int(parts[0]), int(parts[1])


def month_to_str(year: int, month: int) -> str:
    """Convert (year, month) to 'YYYY-MM'."""
    return f"{year:04d}-{month:02d}"


def month_diff(a: str, b: str) -> int:
    """Return number of months from a to b (b - a). Positive if b is later."""
    ay, am = parse_month(a)
    by, bm = parse_month(b)
    return (by - ay) * 12 + (bm - am)


def add_months(ym: str, n: int) -> str:
    """Add n months to 'YYYY-MM'. n can be negative."""
    y, m = parse_month(ym)
    total = (y * 12 + m - 1) + n
    new_y = total // 12
    new_m = total % 12 + 1
    return month_to_str(new_y, new_m)


def generate_month_range(start: str, end: str) -> list[str]:
    """Generate list of 'YYYY-MM' strings from start to end (inclusive)."""
    months = []
    current = start
    while current <= end:
        months.append(current)
        current = add_months(current, 1)
    return months


# ---------------------------------------------------------------------------
# Variance calculations (Section 4.2)
# ---------------------------------------------------------------------------

def compute_plan_drift(forecast: float, baseline: float) -> float:
    """(Forecast - Baseline) / Baseline * 100. Returns percentage."""
    if baseline == 0:
        return 0.0
    return ((forecast - baseline) / baseline) * 100


def compute_execution_variance(actuals: float, forecast: float) -> float:
    """Actuals - Forecast for elapsed periods. Returns EUR amount."""
    return actuals - forecast


def compute_total_variance(actuals: float, baseline: float) -> float:
    """Actuals - Baseline for elapsed periods. Returns EUR amount."""
    return actuals - baseline


# ---------------------------------------------------------------------------
# RAG status calculation (Section 4.3)
# ---------------------------------------------------------------------------

def compute_budget_rag(plan_drift_pct: float) -> str:
    """Budget RAG from plan drift percentage."""
    abs_var = abs(plan_drift_pct)
    if abs_var < 5:
        return "green"
    elif abs_var <= 10:
        return "amber"
    return "red"


def compute_timeline_rag(
    projected_end: str | None,
    baseline_end: str | None,
    start_month: str,
) -> str:
    """Timeline RAG: (Projected End - Baseline End) / Planned Duration * 100.

    Scales proportionally by project length.
    """
    if not projected_end or not baseline_end:
        return "green"
    planned_duration = month_diff(start_month, baseline_end)
    if planned_duration <= 0:
        return "green"
    slippage = month_diff(baseline_end, projected_end)
    if slippage <= 0:
        return "green"
    slippage_pct = (slippage / planned_duration) * 100
    if slippage_pct < 5:
        return "green"
    elif slippage_pct <= 10:
        return "amber"
    return "red"


def compute_combined_rag(budget_rag: str, timeline_rag: str) -> str:
    """Combined RAG = worst of budget and timeline."""
    priority = {"green": 0, "amber": 1, "red": 2}
    return max([budget_rag, timeline_rag], key=lambda r: priority.get(r, 0))


# ---------------------------------------------------------------------------
# Utilization (Section 9 — Capacity Management)
# ---------------------------------------------------------------------------

def compute_utilization_pct(allocated_hours: float) -> float:
    """Returns utilization as percentage: 100% = fully utilized (160 hrs/month)."""
    return round((allocated_hours / FTE_HOURS) * 100, 1)


def utilization_color_bucket(pct: float) -> str:
    """Returns color bucket for heatmap cell styling.

    Thresholds per v4 spec CM-06:
    - < 70%: amber (under-utilized)
    - 70-90%: green (healthy)
    - 90-100%: amber (near capacity)
    - > 100%: red (over-allocated)
    """
    if pct > 100:
        return "red"
    if pct >= 90:
        return "amber"
    if pct >= 70:
        return "green"
    return "amber"


# ---------------------------------------------------------------------------
# Financial aggregation helpers
# ---------------------------------------------------------------------------

def aggregate_financial_rows(
    rows: list[dict],
    demo_date: str = "2026-02",
) -> dict:
    """Aggregate financial row dicts into totals.

    Each row should have: month, category, sub_category, hours (optional), amount_eur.

    Returns dict with:
    - total: sum of all amount_eur
    - by_category: {internal: X, external: Y}
    - ytd: sum of amount_eur for months <= demo_date
    - remaining: sum for months > demo_date
    """
    total = 0.0
    by_category: dict[str, float] = {}
    ytd = 0.0
    remaining = 0.0

    for row in rows:
        amt = float(row.get("amount_eur", 0) or 0)
        total += amt
        cat = row.get("category", "unknown")
        by_category[cat] = by_category.get(cat, 0.0) + amt
        if row.get("month", "") <= demo_date:
            ytd += amt
        else:
            remaining += amt

    return {
        "total": round(total, 2),
        "by_category": {k: round(v, 2) for k, v in by_category.items()},
        "ytd": round(ytd, 2),
        "remaining": round(remaining, 2),
    }
