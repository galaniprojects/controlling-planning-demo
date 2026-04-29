"""Portfolio Overview endpoints (Section 10.3) — 14 endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import DEMO_DATE
from database import get_db
from dependencies import get_current_user, require_role
from models.change_requests import ChangeRequest, CRChangeDetail, CRSubmissionSnapshot
from models.financial import Actuals, Baseline, Forecast
from models.projects import Project
from models.users import DemoPersona
from schemas.common import CurrentUser
from schemas.portfolio import (
    ApprovalAction,
    ApprovalItem,
    BudgetSnapshot,
    CRChangeDetailResponse,
    CRDetailResponse,
    DetailViewGridData,
    DetailViewKPISchema,
    DetailViewLineItemSchema,
    DetailViewMonthValue,
    ForecastEditEntry,
    IntakeDetail,
    IntakeItem,
    ProjectSummary,
    RejectAction,
    RequestChangesAction,
    ResubmitAction,
    SendBackAction,
    TimelineInfo,
)
from services.portfolio_service import (
    build_portfolio_tree,
    compute_portfolio_kpis,
    compute_project_financials,
)

router = APIRouter(prefix="/api/portfolio", tags=["Portfolio Overview"])


# ---------------------------------------------------------------------------
# Dashboard (4 endpoints)
# ---------------------------------------------------------------------------

@router.get("/kpis")
def get_portfolio_kpis(
    lob: str | None = None,
    grouping_entity: str | None = None,
    status: str | None = None,
    rag: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get portfolio-level KPI summary (optionally filtered)."""
    filters = {}
    if grouping_entity:
        filters["grouping_entity"] = grouping_entity
    elif lob:
        filters["lob"] = lob
    if status:
        filters["status"] = status
    if rag:
        filters["rag"] = rag
    if type:
        filters["type"] = type

    kpis = compute_portfolio_kpis(db, filters)

    # Build project filter for CapEx/OpEx split
    proj_filter = [Project.is_active.is_(True)]
    entity_filter = grouping_entity or lob
    if entity_filter:
        from services.portfolio_service import _get_projects_for_entity_recursive
        ge_pids = _get_projects_for_entity_recursive(db, entity_filter)
        if ge_pids:
            proj_filter.append(Project.id.in_(ge_pids))
    if status:
        proj_filter.append(Project.status == status)
    if rag:
        proj_filter.append(Project.rag_status == rag)
    if type:
        if type == "service":
            proj_filter.append(Project.is_service.is_(True))
        elif type == "project":
            proj_filter.append(Project.is_service.is_(False))

    # CY-scoped CapEx/OpEx split
    cy_start, cy_end = "2026-01", "2026-12"
    total_forecast = (
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .join(Project, Forecast.project_id == Project.id)
        .filter(*proj_filter, Forecast.month >= cy_start, Forecast.month <= cy_end)
        .scalar()
    )

    capex_forecast = (
        db.query(func.coalesce(func.sum(Forecast.amount_eur), 0))
        .join(Project, Forecast.project_id == Project.id)
        .filter(*proj_filter, Project.capex_opex == "capex",
                Forecast.month >= cy_start, Forecast.month <= cy_end)
        .scalar()
    )
    opex_forecast = float(total_forecast) - float(capex_forecast)

    capex_val = round(float(capex_forecast), 2)
    opex_val = round(opex_forecast, 2)
    total_co = capex_val + opex_val
    capex_pct = round(capex_val / total_co * 100) if total_co > 0 else 0
    opex_pct = 100 - capex_pct

    return {
        "baseline": kpis["baseline"],
        "current_forecast": kpis["current_forecast"],
        "ytd_actuals": kpis["ytd_actuals"],
        "plan_drift_amount": kpis["plan_drift_amount"],
        "plan_drift_pct": kpis["plan_drift_pct"],
        "capex_total": capex_val,
        "opex_total": opex_val,
        "capex_pct": capex_pct,
        "opex_pct": opex_pct,
        "run_total": kpis["run_total"],
        "change_total": kpis["change_total"],
        "run_pct": kpis["run_pct"],
        "change_pct": kpis["change_pct"],
        "lifetime_baseline": kpis["lifetime_baseline"],
        "lifetime_forecast": kpis["lifetime_forecast"],
        "lifetime_actuals": kpis["lifetime_actuals"],
        "active_project_count": kpis["active_project_count"],
    }


@router.get("/projects")
def get_portfolio_tree(
    lob: str | None = None,
    grouping_entity: str | None = None,
    status: str | None = None,
    rag: str | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get hierarchical portfolio tree (LoB -> Program -> Project)."""
    filters = {}
    if grouping_entity:
        filters["grouping_entity"] = grouping_entity
    elif lob:
        filters["lob"] = lob
    if status:
        filters["status"] = status
    if rag:
        filters["rag"] = rag
    if type:
        filters["type"] = type

    tree = build_portfolio_tree(db, filters)
    return {"items": tree, "total": len(tree)}


@router.get("/projects/{project_id}/summary")
def get_project_summary(
    project_id: str,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get project summary panel data."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    fins = compute_project_financials(db, project_id)

    # Last CR summary
    last_cr = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.project_id == project_id)
        .order_by(ChangeRequest.submission_timestamp.desc())
        .first()
    )
    last_cr_summary = None
    if last_cr:
        last_cr_summary = f"{last_cr.change_category}: {last_cr.summary} ({last_cr.status})"

    # Forecast sparkline (monthly forecast amounts)
    sparkline_rows = (
        db.query(Forecast.month, func.sum(Forecast.amount_eur).label("total"))
        .filter(Forecast.project_id == project_id)
        .group_by(Forecast.month)
        .order_by(Forecast.month)
        .all()
    )
    sparkline = [{"month": r.month, "amount": round(float(r.total), 2)} for r in sparkline_rows]

    return ProjectSummary(
        id=project.id,
        name=project.name,
        rag=project.rag_status,
        budget_snapshot=BudgetSnapshot(
            baseline=fins["baseline_total"],
            forecast=fins["forecast_total"],
            actuals_ytd=fins["actuals_ytd"],
            plan_drift_pct=fins["plan_drift_pct"],
        ),
        timeline=TimelineInfo(
            start=project.start_month,
            end=project.end_month,
            projected_end=project.projected_end_month,
        ),
        last_cr_summary=last_cr_summary,
        forecast_sparkline=sparkline,
    )


@router.get("/charts")
def get_dashboard_charts(
    lob: str | None = None,
    grouping_entity: str | None = None,
    status: str | None = None,
    rag: str | None = None,
    cost_center: str | None = None,
    project_type: str | None = None,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(get_current_user),
):
    """Get chart data for portfolio dashboard."""
    from models.organization import GroupingEntity, GroupingHierarchy, ProjectGroupingAssignment
    from models.people import Person
    from models.capacity import Allocation
    from services.portfolio_service import _get_projects_for_entity_recursive, get_top_level_entity_type_id

    # Build set of project IDs matching all filters
    pq = db.query(Project.id).filter(Project.is_active.is_(True))
    entity_filter = grouping_entity or lob
    if entity_filter:
        ge_pids = _get_projects_for_entity_recursive(db, entity_filter)
        if ge_pids:
            pq = pq.filter(Project.id.in_(ge_pids))
        else:
            pq = pq.filter(False)
    if status:
        pq = pq.filter(Project.status == status)
    if rag:
        pq = pq.filter(Project.rag_status == rag)
    if project_type:
        pq = pq.filter(Project.project_type == project_type)
    if cost_center:
        person_ids = [r[0] for r in db.query(Person.id).filter(Person.cost_center_id == cost_center).all()]
        if person_ids:
            alloc_pids = [r[0] for r in db.query(Allocation.project_id).filter(Allocation.person_id.in_(person_ids)).distinct().all()]
            pq = pq.filter(Project.id.in_(alloc_pids))
        else:
            pq = pq.filter(False)  # no matches
    filtered_pids = [r[0] for r in pq.all()]

    # Forecast by top-level entity (current fiscal year)
    cy_prefix = "2026"
    top_type_id = get_top_level_entity_type_id(db)
    top_entities = []
    if top_type_id:
        top_entities = db.query(GroupingEntity).filter(
            GroupingEntity.entity_type_id == top_type_id,
            GroupingEntity.is_active.is_(True),
        ).all()
    forecast_by_lob = []
    for ent in top_entities:
        ent_pids = _get_projects_for_entity_recursive(db, ent.id)
        # Intersect with filtered project IDs
        ent_pids = [pid for pid in ent_pids if pid in set(filtered_pids)]
        if not ent_pids:
            forecast_by_lob.append({"lob_id": ent.id, "lob_name": ent.name, "forecast": 0, "baseline": 0})
            continue
        fc_total = float(db.query(func.coalesce(func.sum(Forecast.amount_eur), 0)).filter(
            Forecast.project_id.in_(ent_pids),
            func.substr(Forecast.month, 1, 4) == cy_prefix,
        ).scalar())
        bl_total = float(db.query(func.coalesce(func.sum(Baseline.amount_eur), 0)).filter(
            Baseline.project_id.in_(ent_pids),
            func.substr(Baseline.month, 1, 4) == cy_prefix,
        ).scalar())
        forecast_by_lob.append({"lob_id": ent.id, "lob_name": ent.name, "forecast": round(fc_total, 2), "baseline": round(bl_total, 2)})

    # Forecast trajectory (cumulative baseline + forecast + actuals)
    fc_q = db.query(Forecast.month, func.sum(Forecast.amount_eur).label("total")).filter(Forecast.project_id.in_(filtered_pids)).group_by(Forecast.month).order_by(Forecast.month)
    bl_q = db.query(Baseline.month, func.sum(Baseline.amount_eur).label("total")).filter(Baseline.project_id.in_(filtered_pids)).group_by(Baseline.month).order_by(Baseline.month)
    ac_q = db.query(Actuals.month, func.sum(Actuals.amount_eur).label("total")).filter(Actuals.month <= DEMO_DATE, Actuals.project_id.in_(filtered_pids)).group_by(Actuals.month).order_by(Actuals.month)
    fc_map = {r.month: float(r.total) for r in fc_q.all()}
    bl_map = {r.month: float(r.total) for r in bl_q.all()}
    ac_map = {r.month: float(r.total) for r in ac_q.all()}
    all_months = sorted(set(fc_map) | set(bl_map) | set(ac_map))
    cum_bl = cum_fc = cum_ac = 0.0
    forecast_trajectory = []
    for m in all_months:
        cum_bl += bl_map.get(m, 0)
        cum_fc += fc_map.get(m, 0)
        point = {"month": m, "baseline": round(cum_bl, 2), "forecast": round(cum_fc, 2)}
        if m in ac_map:
            cum_ac += ac_map[m]
            point["actuals"] = round(cum_ac, 2)
        else:
            point["actuals"] = None
        forecast_trajectory.append(point)

    # RAG distribution
    rag_dist = (
        db.query(Project.rag_status, func.count(Project.id))
        .filter(Project.id.in_(filtered_pids), Project.rag_status.isnot(None))
        .group_by(Project.rag_status)
        .all()
    )
    rag_distribution = {status: count for status, count in rag_dist}

    return {
        "forecast_by_lob": forecast_by_lob,
        "forecast_trajectory": forecast_trajectory,
        "rag_distribution": rag_distribution,
    }


# ---------------------------------------------------------------------------
# Intake Queue (5 endpoints) — DEPRECATED in v5 [A-PS-13] [A-BK-26]
# ---------------------------------------------------------------------------
# All ``/api/portfolio/intake*`` endpoints below are 410 Gone in v5 per
# [A-BK-26] / [A-PS-13]. The intake queue is replaced by the backlog filter
# (``GET /api/portfolio/backlog?pipeline_stage=Under Evaluation``) and the
# greenfield ``/api/intake/*`` API in ``routers/intake.py``. Bodies are
# kept as stubs so OpenAPI surfaces the deprecation rather than dropping
# the routes silently — a frontend running against an old client gets a
# clear 410 with a pointer to the replacement endpoint.

_V4_INTAKE_REMOVED_DETAIL = {
    "error": "v4_intake_removed",
    "message": (
        "The v4 intake queue is removed in CRETA v5 per [A-BK-26]/[A-PS-13]. "
        "Use the backlog filtered to 'Under Evaluation' for the review queue, "
        "and the /api/intake/* endpoints for project creation and controller "
        "actions."
    ),
    "replacements": {
        "list_review_queue": "GET /api/intake/queue",
        "create_project": "POST /api/intake/projects",
        "approve": "POST /api/intake/projects/{id}/approve",
        "send_back": "POST /api/intake/projects/{id}/send-back",
        "reject": "POST /api/intake/projects/{id}/reject",
        "resubmit": "POST /api/intake/projects/{id}/resubmit",
        "diff": "GET /api/intake/projects/{id}/diff",
    },
}


def _gone_v4_intake() -> "HTTPException":
    """Build the standard 410 Gone response for the deprecated v4 routes."""
    return HTTPException(status_code=410, detail=_V4_INTAKE_REMOVED_DETAIL)


@router.get("/intake", deprecated=True)
def get_intake_queue():
    """[REMOVED in v5] Use GET /api/intake/queue per [A-BK-26]."""
    raise _gone_v4_intake()


@router.get("/intake/{project_id}", deprecated=True)
def get_intake_detail(project_id: str):  # noqa: ARG001
    """[REMOVED in v5] Use GET /api/intake/projects/{id}/diff or the
    project's backlog detail view per [A-BK-19]."""
    raise _gone_v4_intake()



@router.put("/intake/{project_id}/approve", deprecated=True)
def approve_intake_legacy(project_id: str):  # noqa: ARG001
    """[REMOVED in v5] Use POST /api/intake/projects/{id}/approve per [A-BK-27]."""
    raise _gone_v4_intake()


@router.put("/intake/{project_id}/reject", deprecated=True)
def reject_intake_legacy(project_id: str):  # noqa: ARG001
    """[REMOVED in v5] Use POST /api/intake/projects/{id}/reject per [A-BK-27]."""
    raise _gone_v4_intake()


@router.put("/intake/{project_id}/send-back", deprecated=True)
def send_back_intake_legacy(project_id: str):  # noqa: ARG001
    """[REMOVED in v5] Use POST /api/intake/projects/{id}/send-back per [A-BK-27]."""
    raise _gone_v4_intake()


@router.put("/intake/{project_id}/resubmit", deprecated=True)
def resubmit_intake_legacy(project_id: str):  # noqa: ARG001
    """[REMOVED in v5] Use POST /api/intake/projects/{id}/resubmit per [A-BK-29]."""
    raise _gone_v4_intake()


@router.get("/intake/{project_id}/diff", deprecated=True)
def diff_intake_legacy(project_id: str):  # noqa: ARG001
    """[REMOVED in v5] Use GET /api/intake/projects/{id}/diff per [A-BK-29]."""
    raise _gone_v4_intake()


@router.put("/intake/{project_id}/accept-changes", deprecated=True)
def accept_changes_legacy(project_id: str):  # noqa: ARG001
    """[REMOVED in v5] Controller cannot edit forecasts on Send Back per
    [A-BK-28]; PL revises and Resubmits via POST /api/intake/projects/{id}/resubmit."""
    raise _gone_v4_intake()


@router.get("/intake/{project_id}/editable-grid", deprecated=True)
def editable_grid_legacy(project_id: str):  # noqa: ARG001
    """[REMOVED in v5] Forecast editing happens in workbench / forecast cycle,
    not in the controller's intake review surface per [A-BK-28]."""
    raise _gone_v4_intake()


# ---------------------------------------------------------------------------
# Approvals (5 endpoints)
# ---------------------------------------------------------------------------

def _build_cr_grid_data(cr: ChangeRequest, db: Session) -> DetailViewGridData | None:
    """Transform CR change details into detail view grid data.

    Identifies numeric value changes by checking that line_item_type and month
    are set and old_value/new_value are parseable as numbers. Groups changes by
    line_item_type to produce one DetailViewLineItem per affected line item.
    """
    from collections import defaultdict
    from models.people import RoleType, RateTable
    from models.financial import ExternalCostType

    # Filter to numeric monthly value changes only
    value_changes = [
        d for d in cr.change_details
        if d.line_item_type and d.month and _is_numeric(d.old_value, d.new_value)
    ]
    if not value_changes:
        return None

    # Group by line_item_type for multi-line-item CRs
    groups: dict[str, list] = defaultdict(list)
    for d in value_changes:
        groups[d.line_item_type].append(d)

    # Cache label lookups
    role_names: dict[str, str] = {}
    ext_names: dict[str, str] = {}

    all_months: set[str] = set()
    line_items: list[DetailViewLineItemSchema] = []
    total_current_eur = 0.0
    total_proposed_eur = 0.0

    for lit, details in groups.items():
        is_resource = lit.startswith("role-")

        # Resolve display name
        if is_resource:
            if lit not in role_names:
                role = db.query(RoleType).filter(RoleType.id == lit).first()
                role_names[lit] = role.name if role else lit.replace("role-", "").replace("-", " ").title()
            label = role_names[lit]
        else:
            if lit not in ext_names:
                ct = db.query(ExternalCostType).filter(ExternalCostType.id == lit).first()
                ext_names[lit] = ct.name if ct else lit.replace("ext-", "").replace("-", " ").title()
            label = ext_names[lit]

        # Look up hourly rate for resource line items
        hourly_rate = 120.0
        if is_resource:
            rate_row = (
                db.query(RateTable)
                .filter(RateTable.role_type_id == lit)
                .order_by(RateTable.effective_date.desc())
                .first()
            )
            if rate_row:
                hourly_rate = float(rate_row.hourly_rate)

        # Build month values for this line item
        month_values: list[DetailViewMonthValue] = []
        for d in details:
            old_v = _parse_numeric(d.old_value)
            new_v = _parse_numeric(d.new_value)
            all_months.add(d.month)

            if is_resource:
                month_values.append(DetailViewMonthValue(
                    month=d.month,
                    proposed=new_v,
                    proposed_eur=new_v * hourly_rate,
                    current=old_v,
                    current_eur=old_v * hourly_rate,
                    is_changed=old_v != new_v,
                ))
            else:
                month_values.append(DetailViewMonthValue(
                    month=d.month,
                    proposed=new_v,
                    proposed_eur=new_v,
                    current=old_v,
                    current_eur=old_v,
                    is_changed=old_v != new_v,
                ))

        month_values.sort(key=lambda mv: mv.month)

        proposed_total = sum(mv.proposed for mv in month_values)
        current_total = sum((mv.current or 0) for mv in month_values)
        proposed_total_eur = sum(mv.proposed_eur for mv in month_values)
        current_total_eur = sum((mv.current_eur or 0) for mv in month_values)

        total_current_eur += current_total_eur
        total_proposed_eur += proposed_total_eur

        line_items.append(DetailViewLineItemSchema(
            id=lit,
            name=label,
            category="internal" if is_resource else "external",
            unit="hours" if is_resource else "eur",
            months=month_values,
            proposed_total=round(proposed_total, 1),
            proposed_total_eur=round(proposed_total_eur, 2),
            current_total=round(current_total, 1),
            current_total_eur=round(current_total_eur, 2),
        ))

    # KPIs
    delta_eur = total_proposed_eur - total_current_eur
    delta_color = "#059669" if delta_eur < 0 else "#dc2626" if delta_eur > 0 else "#334155"
    delta_pct = (
        round((delta_eur / total_current_eur) * 100, 1)
        if total_current_eur != 0 else 0.0
    )
    kpis = [
        DetailViewKPISchema(
            label="Affected Lines (Current)",
            value=round(total_current_eur, 2),
            format="currency",
            color="#334155",
        ),
        DetailViewKPISchema(
            label="Affected Lines (Proposed)",
            value=round(total_proposed_eur, 2),
            format="currency",
            color="#1e40af",
        ),
        DetailViewKPISchema(
            label="Total Impact",
            value=round(delta_eur, 2),
            format="currency_delta",
            color=delta_color,
            secondary_label=f"{'+' if delta_pct > 0 else ''}{str(delta_pct).replace('.', ',')}%",
        ),
    ]

    sorted_months = sorted(all_months)
    return DetailViewGridData(
        months=sorted_months,
        line_items=line_items,
        kpis=kpis,
    )


def _is_numeric(old_val: str | None, new_val: str | None) -> bool:
    """Check if at least one of old/new values is parseable as a number."""
    for v in (old_val, new_val):
        if v and v != "NULL":
            try:
                float(v.replace("€", "").replace(",", "").replace(" ", "").strip())
                return True
            except (ValueError, AttributeError):
                continue
    return False


def _parse_numeric(val: str | None) -> float:
    """Parse a string value to float, handling common formats."""
    if not val or val == "NULL":
        return 0.0
    try:
        cleaned = val.replace("€", "").replace(",", "").replace(" ", "").strip()
        return float(cleaned)
    except (ValueError, AttributeError):
        return 0.0


def _build_cr_detail(cr: ChangeRequest, db: Session | None = None) -> CRDetailResponse:
    """Build a full CR detail response."""
    grid_data = _build_cr_grid_data(cr, db) if db else None
    return CRDetailResponse(
        id=cr.id,
        project_id=cr.project_id,
        project_name=cr.project.name if cr.project else "",
        status=cr.status,
        change_category=cr.change_category,
        summary=cr.summary,
        justification=cr.justification,
        is_system_suggested=cr.is_system_suggested,
        submitted_by=cr.submitted_by.name if cr.submitted_by else "",
        submission_date=str(cr.submission_timestamp),
        cc_owner=cr.cc_owner.name if cr.cc_owner else None,
        cc_status=cr.cc_status,
        cc_comments=cr.cc_comments,
        controller=cr.controller.name if cr.controller else None,
        controller_status=cr.controller_status,
        controller_comments=cr.controller_comments,
        controller_feedback=cr.controller_feedback,
        changes=[
            CRChangeDetailResponse(
                field_changed=d.field_changed,
                old_value=d.old_value,
                new_value=d.new_value,
                delta=d.delta,
                line_item_type=d.line_item_type,
                month=d.month,
            )
            for d in cr.change_details
        ],
        grid_data=grid_data,
    )


@router.get("/approvals")
def get_pending_approvals(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Get CRs pending controller approval (Stage 2 only)."""
    crs = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.status == "pending_controller_approval")
        .order_by(ChangeRequest.submission_timestamp.desc())
        .all()
    )

    from routers.workbench import _compute_cr_impact_eur

    items = []
    for cr in crs:
        items.append(
            ApprovalItem(
                cr_id=cr.id,
                project_id=cr.project_id,
                project_name=cr.project.name if cr.project else "",
                summary=cr.summary,
                submitted_by=cr.submitted_by.name if cr.submitted_by else "",
                confirmed_by_cc_owner=cr.cc_owner.name if cr.cc_owner else None,
                impact_eur_delta=_compute_cr_impact_eur(cr, db),
                submission_date=str(cr.submission_timestamp),
                system_suggested=cr.is_system_suggested,
            )
        )
    return {"items": items, "total": len(items)}


@router.get("/approvals/{cr_id}")
def get_approval_detail(
    cr_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Get full CR detail for approval."""
    cr = db.query(ChangeRequest).filter(ChangeRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(404, "Change request not found")
    return _build_cr_detail(cr, db)


@router.put("/approvals/{cr_id}/approve")
def approve_cr(
    cr_id: int,
    body: ApprovalAction | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Approve a change request (updates forecast)."""
    cr = db.query(ChangeRequest).filter(ChangeRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status != "pending_controller_approval":
        raise HTTPException(409, f"CR status is '{cr.status}', expected 'pending_controller_approval'")

    cr.controller_id = user.person_id
    cr.controller_status = "approved"
    cr.controller_approval_timestamp = datetime.utcnow()
    if body and body.comments:
        cr.controller_comments = body.comments

    # Controller approval is the final step — apply changes to forecast
    cr.status = "approved"
    _apply_cr_changes_to_forecast(cr, db)

    db.commit()

    # === C1 hook [C-FV-02] — capture forecast version on CR approval (6 lines) ===
    from services.forecast_versioning import capture_version as _capture_fv
    try:
        _capture_fv(db, cr.project_id, user, version_type="cr_approval", change_request_id=cr.id)
        db.commit()
    except Exception as e:  # don't break CR flow on snapshot failure
        import logging as _logging
        _logging.getLogger(__name__).warning("Forecast version capture failed: %s", e)
    # ============================================================================

    # [A-BK-14] CR approval changes forecast/budget → recompute within_cutoff.
    try:
        from services.ranking import recompute_within_cutoff_for_backlog
        recompute_within_cutoff_for_backlog(db)
    except Exception:  # noqa: BLE001 — defensive: trigger best-effort.
        db.rollback()

    return _build_cr_detail(cr, db)


@router.put("/approvals/{cr_id}/reject")
def reject_cr(
    cr_id: int,
    body: RejectAction,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Reject a change request."""
    cr = db.query(ChangeRequest).filter(ChangeRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status != "pending_controller_approval":
        raise HTTPException(409, f"CR status is '{cr.status}', expected 'pending_controller_approval'")

    cr.status = "rejected"
    cr.controller_id = user.person_id
    cr.controller_status = "rejected"
    cr.controller_approval_timestamp = datetime.utcnow()
    cr.controller_comments = body.reason
    db.commit()
    return _build_cr_detail(cr, db)


@router.get("/approvals/{cr_id}/editable-grid")
def get_cr_editable_grid(
    cr_id: int,
    db: Session = Depends(get_db),
    _user: CurrentUser = Depends(require_role("controller")),
):
    """Return current forecast data for a CR's affected project in editable format."""
    from collections import defaultdict
    from models.people import RoleType, RateTable
    from models.financial import ExternalCostType

    cr = db.query(ChangeRequest).filter(ChangeRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(404, "Change request not found")

    # Scope grid to only the line items and months referenced in the CR
    cr_line_items = set()
    cr_months = set()
    for d in cr.change_details:
        if d.line_item_type:
            cr_line_items.add(d.line_item_type)
        if d.month:
            cr_months.add(d.month)

    project_id = cr.project_id
    query = db.query(Forecast).filter(Forecast.project_id == project_id)
    if cr_line_items:
        query = query.filter(Forecast.sub_category.in_(cr_line_items))
    if cr_months:
        query = query.filter(Forecast.month.in_(cr_months))
    forecasts = query.all()
    all_months = sorted(cr_months) if cr_months else sorted(set(f.month for f in forecasts))

    groups: dict[tuple[str, str], list] = defaultdict(list)
    for f in forecasts:
        groups[(f.category, f.sub_category)].append(f)

    role_names = {r.id: r.name for r in db.query(RoleType).all()}
    cost_type_names = {c.id: c.name for c in db.query(ExternalCostType).all()}

    rows = []
    for (category, sub_cat), items in groups.items():
        is_internal = category == "internal"
        name = role_names.get(sub_cat, sub_cat) if is_internal else cost_type_names.get(sub_cat, sub_cat)

        month_map = {f.month: f for f in items}
        months_data = []
        total = 0.0
        total_eur = 0.0
        for m in all_months:
            f = month_map.get(m)
            if f:
                val = float(f.hours or 0) if is_internal else float(f.amount_eur or 0)
                val_eur = float(f.amount_eur or 0)
            else:
                val = 0.0
                val_eur = 0.0
            months_data.append({"month": m, "value": val, "value_eur": val_eur})
            total += val
            total_eur += val_eur

        rows.append({
            "id": f"{category}:{sub_cat}",
            "name": name,
            "category": category,
            "sub_category": sub_cat,
            "unit": "hours" if is_internal else "eur",
            "months": months_data,
            "total": round(total, 2),
            "total_eur": round(total_eur, 2),
        })

    return {"months": all_months, "rows": rows}


@router.put("/approvals/{cr_id}/send-back")
def send_back_cr(
    cr_id: int,
    body: SendBackAction,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller")),
):
    """Send a change request back for revision, optionally with edited forecast values."""
    import json

    cr = db.query(ChangeRequest).filter(ChangeRequest.id == cr_id).first()
    if not cr:
        raise HTTPException(404, "Change request not found")
    if cr.status != "pending_controller_approval":
        raise HTTPException(409, f"CR status is '{cr.status}', expected 'pending_controller_approval'")

    cr.status = "sent_back_by_controller"
    cr.controller_id = user.person_id
    cr.controller_status = "sent_back"
    cr.controller_comments = body.comments
    cr.controller_feedback = body.comments

    # If controller provided edited forecast data, save snapshots
    if body.changes:
        # Ensure "original" snapshot exists (captures current forecast before edits)
        existing_original = (
            db.query(CRSubmissionSnapshot)
            .filter(
                CRSubmissionSnapshot.change_request_id == cr_id,
                CRSubmissionSnapshot.snapshot_type == "original",
                CRSubmissionSnapshot.is_active.is_(True),
            )
            .first()
        )
        if not existing_original:
            # Save current forecast as original snapshot
            forecasts = db.query(Forecast).filter(Forecast.project_id == cr.project_id).all()
            original_data = []
            for f in forecasts:
                original_data.append({
                    "category": f.category,
                    "sub_category": f.sub_category,
                    "month": f.month,
                    "hours": float(f.hours) if f.hours is not None else None,
                    "amount_eur": float(f.amount_eur) if f.amount_eur is not None else 0,
                })
            snapshot = CRSubmissionSnapshot(
                change_request_id=cr_id,
                snapshot_type="original",
                created_by_id=cr.submitted_by_id,
                forecast_data_json=json.dumps(original_data),
            )
            db.add(snapshot)

        # Deactivate previous controller_proposed snapshots
        db.query(CRSubmissionSnapshot).filter(
            CRSubmissionSnapshot.change_request_id == cr_id,
            CRSubmissionSnapshot.snapshot_type == "controller_proposed",
            CRSubmissionSnapshot.is_active.is_(True),
        ).update({"is_active": False})

        # Build FULL proposed snapshot by merging delta with current forecast
        forecasts = db.query(Forecast).filter(Forecast.project_id == cr.project_id).all()
        full_snapshot: dict[tuple, dict] = {}
        for f in forecasts:
            key = (f.category, f.sub_category, f.month)
            full_snapshot[key] = {
                "category": f.category,
                "sub_category": f.sub_category,
                "month": f.month,
                "hours": float(f.hours) if f.hours is not None else None,
                "amount_eur": float(f.amount_eur) if f.amount_eur is not None else 0,
            }
        # Apply controller's delta
        for c in body.changes:
            key = (c.category, c.sub_category, c.month)
            full_snapshot[key] = {
                "category": c.category,
                "sub_category": c.sub_category,
                "month": c.month,
                "hours": c.hours,
                "amount_eur": c.amount_eur,
            }
        proposed = CRSubmissionSnapshot(
            change_request_id=cr_id,
            snapshot_type="controller_proposed",
            created_by_id=user.person_id,
            forecast_data_json=json.dumps(list(full_snapshot.values())),
            comments=body.comments,
        )
        db.add(proposed)

    db.commit()
    return _build_cr_detail(cr, db)


# ---------------------------------------------------------------------------
# CR Workflow Helpers
# ---------------------------------------------------------------------------


def _apply_cr_changes_to_forecast(cr: ChangeRequest, db: Session) -> None:
    """Apply CR change details to forecast rows (used on direct approval)."""
    from models.people import RateTable

    for detail in cr.change_details:
        if detail.month and detail.new_value:
            row = (
                db.query(Forecast)
                .filter(
                    Forecast.project_id == cr.project_id,
                    Forecast.month == detail.month,
                    Forecast.sub_category == detail.line_item_type,
                )
                .first()
            )
            if row:
                try:
                    new_val = float(detail.new_value.replace("€", "").replace(",", "").strip())
                    is_internal = detail.line_item_type and detail.line_item_type.startswith("role-")
                    if is_internal:
                        row.hours = new_val
                        rate_row = (
                            db.query(RateTable)
                            .filter(RateTable.role_type_id == detail.line_item_type)
                            .order_by(RateTable.effective_date.desc())
                            .first()
                        )
                        rate = float(rate_row.hourly_rate) if rate_row else 120.0
                        row.amount_eur = new_val * rate
                    else:
                        row.amount_eur = new_val
                    # C1 [C-FG-07]: manual CR write clears provisional flag
                    row.is_provisional = False
                except (ValueError, AttributeError):
                    pass

    # After updating forecast, ensure allocations match
    from services.allocation_service import ensure_project_allocations
    ensure_project_allocations(cr.project_id, db)


def _create_resource_requests_from_cr(cr: ChangeRequest, db: Session) -> None:
    """Create ResourceRequest rows from a CR's internal resource change details.

    Groups by role type, computes period and average hours, creates one request
    per role directed to cc-rail-systems.
    """
    from collections import defaultdict
    from models.capacity import ResourceRequest

    # Delete any existing pending CR-linked requests
    db.query(ResourceRequest).filter(
        ResourceRequest.change_request_id == cr.id,
        ResourceRequest.status == "pending",
    ).delete()

    CC_ID = "cc-muc-apd"

    # Group change details by role type (internal resources only)
    groups: dict[str, list] = defaultdict(list)
    for detail in cr.change_details:
        if detail.line_item_type and detail.line_item_type.startswith("role-") and detail.month:
            groups[detail.line_item_type].append(detail)

    for role_id, details in groups.items():
        sorted_details = sorted(details, key=lambda d: d.month)
        delta_values = []
        old_values = []
        for d in sorted_details:
            try:
                new_val = float(d.new_value.replace("€", "").replace(",", "").strip()) if d.new_value else 0.0
                old_val = float(d.old_value.replace("€", "").replace(",", "").strip()) if d.old_value else 0.0
                delta_values.append(new_val - old_val)
                old_values.append(old_val)
            except (ValueError, AttributeError):
                delta_values.append(0)
                old_values.append(0)

        avg_delta = sum(delta_values) / len(delta_values) if delta_values else 0
        avg_old = sum(old_values) / len(old_values) if old_values else 0

        # Skip if no actual change
        if abs(avg_delta) < 0.01:
            continue

        direction = "increase" if avg_delta > 0 else "decrease"

        req = ResourceRequest(
            project_id=cr.project_id,
            change_request_id=cr.id,
            cost_center_id=CC_ID,
            request_type="resource",
            role_type_id=role_id,
            hours_or_amount_per_month=round(abs(avg_delta), 2),
            original_hours_per_month=round(avg_old, 2),
            change_direction=direction,
            period_start=sorted_details[0].month,
            period_end=sorted_details[-1].month,
            priority="medium",
            status="pending",
        )
        db.add(req)
