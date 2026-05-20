"""Module card subtitle KPI service per [v5.1 W6 C-01].

The Launchpad shows one card per visible module. Each card now carries
1–2 short subtitle KPI strings that are role-differentiated. This module
owns the entire computation surface so the router can stay thin.

The strings follow CRETA's European number formatting (dot-thousands +
comma-decimals) and are rendered as a single combined line per the spec
table (lines 175–234 of ``guides/CRETA_v5_1_Change_Specification.md``).
A ``None``/empty list is returned for module/role combinations that
should be hidden — defensive only, since the router already filters by
``MODULE_VISIBILITY`` before calling here.

The previous role-tile surface (``/api/launchpad/tiles``) was retired in
the same wave. ``_format_currency`` was lifted from there into this
module so the helper survives the deletion.
"""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from config import DEMO_DATE
from models.capacity import Allocation, ResourceRequest
from models.change_requests import ChangeRequest
from models.charging import BTCProfile, Distribution
from models.financial import Forecast
from models.people import Person
from models.projects import Project
from models.reporting import SavedReport
from models.scenarios import Scenario
from models.scheduled_changes import ScheduledChange
from schemas.common import CurrentUser
from services.calculations import FTE_HOURS
from services.forecast_cycle import derive_cycle_label
from services.portfolio_service import compute_portfolio_kpis


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def _format_currency(value: float) -> str:
    """European-style currency: dot thousands + comma decimals (€14.400,00).

    Negative values prefixed with '-'. Lifted from the retired tile surface
    so existing call sites keep their formatting verbatim.
    """
    sign = "-" if value < 0 else ""
    abs_val = abs(value)
    integer_part = int(abs_val)
    decimal_part = int(round((abs_val - integer_part) * 100))
    int_str = f"{integer_part:,}".replace(",", ".")
    return f"{sign}€{int_str},{decimal_part:02d}"


def _format_currency_millions(value: float) -> str:
    """Compact currency for the Portfolio card subtitle (€X,Xm).

    Spec line 179: ``Forecast: €X.Xm``. Uses comma as decimal separator
    per CRETA's European formatting rule (dot/comma swap).
    """
    millions = value / 1_000_000.0
    return f"€{millions:,.1f}m".replace(",", "_").replace(".", ",").replace("_", ".")


# ---------------------------------------------------------------------------
# Forecast cycle status — shared across Workbench card variants
# ---------------------------------------------------------------------------

def _forecast_cycle_status_label() -> str:
    """Human-readable forecast cycle label keyed off the demo date.

    e.g. "Q2 2026 Cycle". Used as the [status] token in the Workbench
    subtitle row across Controller / PL / CC Owner cards.
    """
    return derive_cycle_label(DEMO_DATE)


# ---------------------------------------------------------------------------
# Per-module computers — each returns a list of 1–2 subtitle strings
# ---------------------------------------------------------------------------

def _portfolio_subtitle(db: Session) -> list[str]:
    """Identical across all roles per spec line 179."""
    kpis = compute_portfolio_kpis(db)
    forecast = float(kpis.get("current_forecast", 0) or 0)
    run_pct = int(kpis.get("run_pct", 50) or 50)
    change_pct = int(kpis.get("change_pct", 50) or 50)
    drift_pct = float(kpis.get("plan_drift_pct", 0) or 0)
    sign = "+" if drift_pct >= 0 else ""
    return [
        (
            f"Forecast: {_format_currency_millions(forecast)} "
            f"· Run/Change: {run_pct}%/{change_pct}% "
            f"· Plan drift: {sign}{drift_pct:.1f}%"
        )
    ]


def _backlog_subtitle(db: Session, user: CurrentUser) -> list[str]:
    """Spec lines 183–187. CC Owner is hidden via MODULE_VISIBILITY."""
    if user.role == "project_lead":
        from dependencies import pl_project_filter
        in_pipeline = (
            db.query(func.count(Project.id))
            .filter(
                pl_project_filter(user),
                Project.is_active.is_(True),
                Project.pipeline_stage.in_(["Proposed", "Under Evaluation"]),
            )
            .scalar()
        ) or 0
        within_cutoff = (
            db.query(func.count(Project.id))
            .filter(
                pl_project_filter(user),
                Project.is_active.is_(True),
                Project.within_cutoff.is_(True),
            )
            .scalar()
        ) or 0
        return [f"Your {in_pipeline} projects in pipeline · {within_cutoff} within cutoff"]

    in_pipeline = (
        db.query(func.count(Project.id))
        .filter(
            Project.is_active.is_(True),
            Project.pipeline_stage.in_(["Proposed", "Under Evaluation"]),
        )
        .scalar()
    ) or 0
    within_cutoff = (
        db.query(func.count(Project.id))
        .filter(Project.is_active.is_(True), Project.within_cutoff.is_(True))
        .scalar()
    ) or 0
    return [f"{in_pipeline} projects in pipeline · {within_cutoff} within cutoff"]


def _workbench_subtitle(db: Session, user: CurrentUser) -> list[str]:
    """Spec lines 191–195. Executive is hidden via MODULE_VISIBILITY."""
    cycle = _forecast_cycle_status_label()

    if user.role == "controller":
        overdue = (
            db.query(func.count(Project.id))
            .filter(
                Project.is_active.is_(True),
                Project.status == "active",
                Project.is_service.is_(False),
                (Project.last_forecast_submitted_month.is_(None))
                | (Project.last_forecast_submitted_month < DEMO_DATE),
            )
            .scalar()
        ) or 0
        return [f"Forecast cycle: {cycle} · {overdue} projects overdue"]

    if user.role == "project_lead":
        from dependencies import pl_project_filter
        own = (
            db.query(func.count(Project.id))
            .filter(pl_project_filter(user), Project.is_active.is_(True))
            .scalar()
        ) or 0
        return [f"Forecast cycle: {cycle} · Your {own} projects"]

    if user.role == "cost_center_owner":
        cc_id = user.cost_center_id
        cc_project_count = 0
        if cc_id:
            cc_person_ids = [
                r[0] for r in db.query(Person.id)
                .filter(Person.cost_center_id == cc_id).all()
            ]
            if cc_person_ids:
                cc_project_count = (
                    db.query(func.count(func.distinct(Allocation.project_id)))
                    .filter(Allocation.person_id.in_(cc_person_ids))
                    .scalar()
                ) or 0
        return [f"Forecast cycle: {cycle} · {cc_project_count} projects in your CC"]

    return []


def _capacity_subtitle(db: Session, user: CurrentUser) -> list[str]:
    """Spec lines 199–203. Executive is hidden via MODULE_VISIBILITY."""
    if user.role == "project_lead":
        # PL cannot scope "their" cost-centre utilisation — spec downgrades
        # the row to a static availability label + open-request count.
        from dependencies import pl_project_filter
        owned_project_ids = [
            r[0] for r in db.query(Project.id)
            .filter(pl_project_filter(user), Project.is_active.is_(True)).all()
        ]
        open_reqs = 0
        if owned_project_ids:
            open_reqs = (
                db.query(func.count(ResourceRequest.id))
                .filter(
                    ResourceRequest.project_id.in_(owned_project_ids),
                    ResourceRequest.status == "pending",
                )
                .scalar()
            ) or 0
        return [f"Role availability · {open_reqs} open requests"]

    # Controller + CC Owner share the "My team / Org / open requests" line.
    cc_id = user.cost_center_id
    my_team_pct = _avg_utilization_pct(db, cc_id) if cc_id else 0.0
    org_pct = _avg_utilization_pct(db, cost_center_id=None)

    open_req_query = db.query(func.count(ResourceRequest.id)).filter(
        ResourceRequest.status == "pending",
    )
    if user.role == "cost_center_owner" and cc_id:
        open_req_query = open_req_query.filter(ResourceRequest.cost_center_id == cc_id)
    open_reqs = open_req_query.scalar() or 0

    return [
        (
            f"My team: {my_team_pct:.0f}% "
            f"· Org: {org_pct:.0f}% "
            f"· {open_reqs} open requests"
        )
    ]


def _avg_utilization_pct(db: Session, cost_center_id: str | None) -> float:
    """Average current-month utilisation across people in scope."""
    person_q = db.query(Person.id).filter(Person.is_active.is_(True))
    if cost_center_id:
        person_q = person_q.filter(Person.cost_center_id == cost_center_id)
    person_ids = [r[0] for r in person_q.all()]
    if not person_ids:
        return 0.0

    total_hours = float(
        db.query(func.coalesce(func.sum(Allocation.hours), 0))
        .filter(
            Allocation.person_id.in_(person_ids),
            Allocation.month == DEMO_DATE,
        )
        .scalar()
    )
    avg_hours = total_hours / len(person_ids)
    return round((avg_hours / FTE_HOURS) * 100, 1)


def _simulator_subtitle(db: Session) -> list[str]:
    """Spec line 209 — identical for all roles with simulator access."""
    active = (
        db.query(func.count(Scenario.id))
        .filter(Scenario.status.in_(["private", "published"]))
        .scalar()
    ) or 0
    published = (
        db.query(func.count(Scenario.id))
        .filter(Scenario.status == "published")
        .scalar()
    ) or 0
    return [f"{active} active scenarios · {published} recently published"]


def _charging_subtitle(db: Session, user: CurrentUser) -> list[str]:
    """Spec lines 215–216 — controller/others variants per A-05 read-only rule.

    FD-3 rework: the v4 ``Distribution.version == 'forecast'`` filter became
    a join through ``DistributionVersion``. We count edges on the in-force
    production version per ``resolve_active_version(db, today)``, which is
    the FD-3 equivalent of "what the v4 'forecast' string used to point at".
    Returns 0 if no production version is in force (pre-seed / empty
    chain) — same defensive behaviour the old filter had against an empty
    table.
    """
    from datetime import date

    from services.distribution_service import resolve_active_version

    in_force = resolve_active_version(db, date.today())
    if in_force is None:
        edge_count = 0
    else:
        edge_count = (
            db.query(func.count(Distribution.id))
            .filter(Distribution.version_id == in_force.id)
            .scalar()
        ) or 0

    if user.role == "controller":
        review_count = (
            db.query(func.count(BTCProfile.id))
            .filter(BTCProfile.status == "draft")
            .scalar()
        ) or 0
        return [f"{edge_count} distribution edges · {review_count} BTC profiles needing review"]

    active_count = (
        db.query(func.count(BTCProfile.id))
        .filter(BTCProfile.status == "active")
        .scalar()
    ) or 0
    return [f"{edge_count} distribution edges · {active_count} active BTC profiles"]


def _reporting_subtitle(db: Session) -> list[str]:
    """Spec line 222 — identical across roles."""
    saved = (
        db.query(func.count(SavedReport.id))
        .filter(SavedReport.is_active.is_(True))
        .scalar()
    ) or 0

    last = (
        db.query(func.max(SavedReport.modified_at))
        .filter(SavedReport.is_active.is_(True))
        .scalar()
    )
    last_label = last.strftime("%Y-%m-%d") if last else "never"
    return [f"{saved} saved reports · Last generated: {last_label}"]


def _admin_subtitle(db: Session) -> list[str]:
    """Spec line 228 — controller-only (others hidden via MODULE_VISIBILITY)."""
    pending = (
        db.query(func.count(ScheduledChange.id))
        .filter(ScheduledChange.review_status == "pending_review")
        .scalar()
    ) or 0
    indicator = "OK" if pending == 0 else "review"
    return [f"{pending} pending scheduled changes · Data quality: {indicator}"]


def _documentation_subtitle() -> list[str]:
    """Spec line 234 — static across all roles."""
    return ["Guides, API Reference & FAQ"]


# ---------------------------------------------------------------------------
# Public dispatcher
# ---------------------------------------------------------------------------

def compute_module_subtitle_kpis(
    db: Session,
    role: str,
    module_id: str,
    user: CurrentUser | None = None,
) -> list[str]:
    """Return 1–2 role-differentiated subtitle KPI strings for a module card.

    The router populates ``user`` so per-PL / per-CC scoping can resolve.
    Returns ``[]`` for unknown module ids or for module/role combinations
    that should be hidden — the latter is defensive since the route already
    filters by ``MODULE_VISIBILITY``.
    """
    # PL / CC Owner branches need the persona context. If the caller only
    # passes ``role`` we synthesise a minimal CurrentUser so the role-only
    # branches still work.
    eff_user = user or CurrentUser(
        user_id="", person_id="", name="", role=role,
        cost_center_id=None, project_ids=[],
    )

    if module_id == "portfolio":
        return _portfolio_subtitle(db)

    if module_id == "backlog":
        return _backlog_subtitle(db, eff_user)

    if module_id == "workbench":
        return _workbench_subtitle(db, eff_user)

    if module_id == "capacity":
        return _capacity_subtitle(db, eff_user)

    if module_id == "simulator":
        return _simulator_subtitle(db)

    if module_id == "charging":
        return _charging_subtitle(db, eff_user)

    if module_id == "reporting":
        return _reporting_subtitle(db)

    if module_id == "admin":
        return _admin_subtitle(db)

    if module_id == "documentation":
        return _documentation_subtitle()

    return []
