"""Generate baselines + forecasts + allocations + milestones for the five
backlog projects promoted to Approved/DoI 3 in the seed.

The static seed SQL (``seed.sql``) only carries the projects, chargeable
entities, grouping assignments, Tech Navigator scores, and pipeline-stage
UPDATEs for ``proj-bk01``..``proj-bk16``. To make the five projects we
promoted to Approved render correctly across the Workbench, Capacity, and
Reporting surfaces, they also need monthly baseline/forecast lines,
allocation rows, and project milestones.

Rather than hand-authoring ~1500 SQL rows or invoking the full v5 seed
generator (which would rewrite the whole seed.sql against a fixed roster
that doesn't include the bk* additions), this helper emits the data via
SQLAlchemy ORM after ``load_seed_sql()`` completes.

Called from ``backend/seed/loader.py`` in both ``seed_database()`` (cold
start) and ``reset_database()`` (``POST /api/admin/reset-demo``).

Determinism: row counts and exact amounts are functions of each project's
``total_budget``, ``start_month``, ``end_month``, and ``capex_opex`` — no
random state. Reseeds are byte-identical.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Iterable

from sqlalchemy.orm import Session

# Five promoted projects — must match the Approved/DoI 3 UPDATEs in seed.sql.
PROMOTED_PROJECT_IDS: tuple[str, ...] = (
    "proj-bk01",
    "proj-bk02",
    "proj-bk03",
    "proj-bk08",
    "proj-bk09",
)

# Hourly rates pulled from rate_table seed (matches lines 432-443 in seed.sql).
# The forecast/baseline service-layer code does NOT call rate_table to compute
# amount_eur — it stores the materialised amount per row. We mirror the rates
# here so each emitted (hours, amount_eur) pair is self-consistent.
ROLE_HOURLY_RATE: dict[str, float] = {
    "role-sr-arch": 115.0,
    "role-sr-dev": 100.0,
    "role-dev": 82.0,
    "role-jr-dev": 65.0,
    "role-qa": 75.0,
    "role-cloud": 105.0,
    "role-ba": 90.0,
    "role-data-eng": 100.0,
    "role-data-sci": 108.0,
    "role-network": 85.0,
    "role-sysadmin": 80.0,
    "role-sap": 110.0,
}

# Per-project role mix + external cost type, sized to the project's narrative
# and to roughly consume ~75% internal + ~25% external of total_budget after
# the 19/14/18/11/14-month spreads. Weights sum to 1.0 within internal.
# Picked deterministically — no randomness.
ROLE_MIX: dict[str, dict] = {
    "proj-bk01": {  # AI Customer Service Assistant — €1.85M, 19 months
        "internal_roles": {
            "role-sr-arch": 0.20,
            "role-sr-dev": 0.30,
            "role-data-sci": 0.20,
            "role-dev": 0.20,
            "role-qa": 0.10,
        },
        "external": ("ext-consulting", "ML Advisory & Model Tuning", "OpenAI Partners"),
        "external_ratio": 0.20,
        "internal_ratio": 0.80,
        "milestones": [
            ("Discovery", "mt-requirements", "blue", 0.15),
            ("Pilot", "mt-pilot", "indigo", 0.30),
            ("Build", "mt-development", "emerald", 0.35),
            ("Rollout", "mt-rollout", "violet", 0.20),
        ],
    },
    "proj-bk02": {  # Mobile Workforce Application — €680K, 14 months
        "internal_roles": {
            "role-sr-dev": 0.30,
            "role-dev": 0.40,
            "role-qa": 0.20,
            "role-ba": 0.10,
        },
        "external": ("ext-sw-licenses", "Mobile MDM Licenses", "Microsoft"),
        "external_ratio": 0.15,
        "internal_ratio": 0.85,
        "milestones": [
            ("Planning", "mt-planning", "blue", 0.20),
            ("Build", "mt-development", "emerald", 0.50),
            ("Pilot", "mt-pilot", "indigo", 0.20),
            ("Rollout", "mt-rollout", "violet", 0.10),
        ],
    },
    "proj-bk03": {  # Cybersecurity Hardening Programme — €1.2M, 18 months
        "internal_roles": {
            "role-sr-arch": 0.30,
            "role-network": 0.25,
            "role-cloud": 0.20,
            "role-sysadmin": 0.15,
            "role-qa": 0.10,
        },
        "external": ("ext-consulting", "Penetration Testing & Audit", "KPMG"),
        "external_ratio": 0.30,
        "internal_ratio": 0.70,
        "milestones": [
            ("Assessment", "mt-requirements", "blue", 0.20),
            ("Design", "mt-planning", "teal", 0.20),
            ("Implementation", "mt-development", "emerald", 0.40),
            ("Validation", "mt-testing", "amber", 0.20),
        ],
    },
    "proj-bk08": {  # API Gateway Consolidation — €480K, 11 months
        "internal_roles": {
            "role-sr-arch": 0.25,
            "role-sr-dev": 0.40,
            "role-dev": 0.25,
            "role-qa": 0.10,
        },
        "external": ("ext-cloud", "Kong Enterprise Subscription", "Kong Inc."),
        "external_ratio": 0.15,
        "internal_ratio": 0.85,
        "milestones": [
            ("Planning", "mt-planning", "blue", 0.20),
            ("Build", "mt-development", "emerald", 0.50),
            ("Cutover", "mt-rollout", "violet", 0.30),
        ],
    },
    "proj-bk09": {  # Customer Identity Federation — €760K, 14 months
        "internal_roles": {
            "role-sr-arch": 0.25,
            "role-sr-dev": 0.30,
            "role-dev": 0.25,
            "role-sysadmin": 0.10,
            "role-qa": 0.10,
        },
        "external": ("ext-sw-licenses", "Okta Identity Cloud", "Okta"),
        "external_ratio": 0.25,
        "internal_ratio": 0.75,
        "milestones": [
            ("Discovery", "mt-requirements", "blue", 0.20),
            ("Integration", "mt-development", "emerald", 0.50),
            ("Pilot", "mt-pilot", "indigo", 0.20),
            ("Rollout", "mt-rollout", "violet", 0.10),
        ],
    },
}

# Deterministic person assignment per role — picks the first N people whose
# role_type_id matches. Stable across reseeds because seed.sql inserts
# people in alphabetical order by id.
PEOPLE_PER_ROLE: int = 2

# Granularity boundary — last monthly month before quarterly bucketing.
# Mirrors the default `granularity_boundary_months` planning parameter (12)
# from DEMO_DATE 2026-04. Months ≤ 2027-03 are monthly; the rest are
# quarterly with is_provisional=1.
INNER_BOUNDARY: str = "2027-03"

# Planning horizon — last quarter to emit in forecasts (mirrors default 60).
HORIZON_END: str = "2031-03"


# ---------------------------------------------------------------------------
# Month range helpers
# ---------------------------------------------------------------------------


def _month_range(start: str, end: str) -> list[str]:
    """Inclusive month range, YYYY-MM strings."""
    sy, sm = int(start[:4]), int(start[5:7])
    ey, em = int(end[:4]), int(end[5:7])
    out: list[str] = []
    y, m = sy, sm
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            m = 1
            y += 1
    return out


def _quarter_range(start_year_q: tuple[int, int], end_year_q: tuple[int, int]) -> list[str]:
    """Inclusive quarter range, YYYY-Qn strings."""
    out: list[str] = []
    y, q = start_year_q
    ey, eq = end_year_q
    while (y, q) <= (ey, eq):
        out.append(f"{y:04d}-Q{q}")
        q += 1
        if q == 5:
            q = 1
            y += 1
    return out


def _month_to_quarter(month: str) -> tuple[int, int]:
    """Return (year, quarter) for a YYYY-MM string."""
    y, m = int(month[:4]), int(month[5:7])
    return y, (m - 1) // 3 + 1


# ---------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------


def _generate_internal_lines(
    project_id: str,
    months: list[str],
    capex_opex: str,
    role_weights: dict[str, float],
    target_internal_amount: float,
) -> list[tuple]:
    """Build internal (hours, amount) lines so that totals match target.

    Returns a list of tuples shaped for both Baseline and Forecast rows
    (without the trailing forecast-only columns — caller fills those).
    Shape: (month, category, sub_category, hours, amount_eur, description,
    capex_opex, vendor, ext_status, role_type_id).
    """
    rows: list[tuple] = []
    month_count = len(months)
    for role_id, weight in role_weights.items():
        rate = ROLE_HOURLY_RATE[role_id]
        role_total_amount = target_internal_amount * weight
        amount_per_month = round(role_total_amount / month_count, 2)
        hours_per_month = round(amount_per_month / rate, 2)
        for month in months:
            rows.append(
                (
                    month,
                    "internal",
                    role_id,
                    hours_per_month,
                    amount_per_month,
                    None,  # description
                    capex_opex,
                    None,  # vendor
                    None,  # ext_status
                    None,  # role_type_id (only used for external rows)
                )
            )
    return rows


def _generate_external_lines(
    months: list[str],
    capex_opex: str,
    cost_type_id: str,
    description: str,
    vendor: str,
    target_external_amount: float,
) -> list[tuple]:
    """Single external line item across all months."""
    rows: list[tuple] = []
    if target_external_amount <= 0:
        return rows
    amount_per_month = round(target_external_amount / len(months), 2)
    for month in months:
        rows.append(
            (
                month,
                "external",
                cost_type_id,
                None,  # hours
                amount_per_month,
                description,
                capex_opex,
                vendor,
                "accrued",
                None,  # external rows store cost_type_id in sub_category;
                # role_type_id stays NULL for these.
            )
        )
    return rows


def _seed_baselines_and_forecasts(db: Session, project) -> tuple[int, int]:
    """Emit baseline + forecast rows for a single project.

    Forecast rows mirror baseline for the monthly inner zone (project active
    months that fall within ``INNER_BOUNDARY``), then quarterly buckets out to
    ``HORIZON_END`` for any future planning capacity (zero amounts since the
    project doesn't extend that far — these are the standard "provisional"
    forward-looking placeholders the F&P grid renders as `—`).
    """
    from models.financial import Baseline, Forecast

    config = ROLE_MIX[project.id]
    months = _month_range(project.start_month, project.end_month)
    capex_opex = project.capex_opex or "capex"
    total_budget = float(project.total_budget or 0)
    target_internal = total_budget * config["internal_ratio"]
    target_external = total_budget * config["external_ratio"]
    ext_cost_type_id, ext_description, ext_vendor = config["external"]

    internal_lines = _generate_internal_lines(
        project.id, months, capex_opex, config["internal_roles"], target_internal,
    )
    external_lines = _generate_external_lines(
        months, capex_opex, ext_cost_type_id, ext_description, ext_vendor,
        target_external,
    )
    all_lines = internal_lines + external_lines

    n_baselines = 0
    for (
        month, category, sub_category, hours, amount, description,
        cap_opex, vendor, ext_status, role_type_id,
    ) in all_lines:
        db.add(
            Baseline(
                project_id=project.id,
                month=month,
                category=category,
                sub_category=sub_category,
                hours=hours,
                amount_eur=Decimal(str(amount)),
                description=description,
                capex_opex=cap_opex,
                vendor=vendor,
                ext_status=ext_status,
                role_type_id=role_type_id,
            )
        )
        n_baselines += 1

    n_forecasts = 0
    # Forecast: copy baseline through the monthly inner zone.
    for (
        month, category, sub_category, hours, amount, description,
        cap_opex, vendor, ext_status, role_type_id,
    ) in all_lines:
        is_provisional = month > INNER_BOUNDARY
        db.add(
            Forecast(
                project_id=project.id,
                month=month,
                category=category,
                sub_category=sub_category,
                hours=hours,
                amount_eur=Decimal(str(amount)),
                description=description,
                capex_opex=cap_opex,
                vendor=vendor,
                ext_status=ext_status,
                role_type_id=role_type_id,
                is_provisional=is_provisional,
            )
        )
        n_forecasts += 1

    return n_baselines, n_forecasts


def _people_for_role(db: Session, role_type_id: str, limit: int) -> list:
    """Return the first ``limit`` Persons with the given role_type_id."""
    from models.people import Person
    return (
        db.query(Person)
        .filter(Person.role_type_id == role_type_id, Person.is_active.is_(True))
        .order_by(Person.id)
        .limit(limit)
        .all()
    )


def _seed_allocations(db: Session, project) -> int:
    """Emit allocation rows: per internal role × per month, assign to N people.

    Each allocation row has hours = (baseline_hours_for_month / num_people)
    so the per-role hours roughly match the baseline's role line.
    """
    from models.capacity import Allocation

    config = ROLE_MIX[project.id]
    months = _month_range(project.start_month, project.end_month)
    total_budget = float(project.total_budget or 0)
    target_internal = total_budget * config["internal_ratio"]

    n = 0
    for role_id, weight in config["internal_roles"].items():
        rate = ROLE_HOURLY_RATE[role_id]
        role_total_amount = target_internal * weight
        amount_per_month = role_total_amount / len(months)
        hours_per_month = amount_per_month / rate

        people = _people_for_role(db, role_id, PEOPLE_PER_ROLE)
        if not people:
            continue
        hours_per_person = round(hours_per_month / len(people), 2)
        for person in people:
            for month in months:
                db.add(
                    Allocation(
                        person_id=person.id,
                        project_id=project.id,
                        chargeable_entity_id=project.id,
                        # Project's ChargeableEntity has the same id as the project.
                        month=month,
                        hours=hours_per_person,
                        is_confirmed=True,
                    )
                )
                n += 1
    return n


def _seed_milestones(db: Session, project, demo_date: str = "2026-04") -> int:
    """Emit project_milestones for a project + set current_milestone_id.

    Milestone date ranges partition the project's active range by the
    weights in ROLE_MIX[<id>]["milestones"]. baseline_start/forecast_start
    pair (and end pair) align — no drift, since these are freshly approved.
    """
    from models.projects import Project, ProjectMilestone

    config = ROLE_MIX[project.id]
    months = _month_range(project.start_month, project.end_month)
    month_count = len(months)
    locked_at = datetime(2024, 1, 15, 10, 0, 0)

    cursor = 0
    created_ms: list[ProjectMilestone] = []
    for seq, (name, mt_id, color, weight) in enumerate(config["milestones"], start=1):
        span_count = max(1, round(month_count * weight))
        start_idx = cursor
        end_idx = min(cursor + span_count - 1, month_count - 1)
        baseline_start = months[start_idx]
        baseline_end = months[end_idx]
        ms = ProjectMilestone(
            project_id=project.id,
            sequence_number=seq,
            name=name,
            milestone_type_id=mt_id,
            baseline_start=baseline_start,
            baseline_end=baseline_end,
            forecast_start=baseline_start,
            forecast_end=baseline_end,
            color=color,
            baseline_locked_at=locked_at,
        )
        db.add(ms)
        created_ms.append(ms)
        cursor = end_idx + 1

    db.flush()  # materialise IDs

    # Pick current milestone = the one whose [forecast_start, forecast_end]
    # window contains demo_date, else the first whose forecast_start is in
    # the future. Falls back to the first milestone for projects starting
    # after the demo date.
    current_ms = None
    for ms in created_ms:
        if ms.forecast_start <= demo_date <= ms.forecast_end:
            current_ms = ms
            break
    if current_ms is None:
        for ms in created_ms:
            if ms.forecast_start > demo_date:
                current_ms = ms
                break
    if current_ms is None:
        current_ms = created_ms[0]

    project.current_milestone_id = current_ms.id

    return len(created_ms)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def seed_promoted_plans(db: Session, demo_date: str = "2026-04") -> dict:
    """Generate plan + assignment data for all five promoted Approved projects.

    Idempotent: skips a project if it already has baseline rows (covers the
    case where a reset is triggered against an already-fully-seeded database).
    """
    from models.financial import Baseline
    from models.projects import Project

    totals = {"baselines": 0, "forecasts": 0, "allocations": 0, "milestones": 0,
              "skipped": 0}

    for project_id in PROMOTED_PROJECT_IDS:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project is None:
            print(f"[seed] WARNING: {project_id} not found, skipping plan generation")
            continue

        # Skip if baselines already exist (idempotency / re-entry safety).
        has_baseline = (
            db.query(Baseline.id).filter(Baseline.project_id == project_id).first()
        )
        if has_baseline is not None:
            totals["skipped"] += 1
            continue

        n_b, n_f = _seed_baselines_and_forecasts(db, project)
        n_a = _seed_allocations(db, project)
        n_m = _seed_milestones(db, project, demo_date=demo_date)
        totals["baselines"] += n_b
        totals["forecasts"] += n_f
        totals["allocations"] += n_a
        totals["milestones"] += n_m

    db.commit()
    return totals
