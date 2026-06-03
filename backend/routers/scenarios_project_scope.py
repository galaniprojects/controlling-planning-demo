"""What-If Simulator — project-scope editable-grid endpoints.

Extracted from ``routers/scenarios.py`` (Session 3, Phase 0 scaffold) so the
project-scope edit surface can grow without serialising every contributor on the
1500-line scenarios monolith. Same router prefix (``/api/scenarios``) and tags —
the move is behaviour-preserving; route paths are unchanged.

Layering (see ``services/scenario_project_scope/``, Session 1):
  anchor (live Forecast) -> Layer-1 macros (ScenarioAction) -> Layer-2 hand
  overlay (ScenarioForecastCellEdit / ScenarioLineEdit / ScenarioPlanEdit /
  ScenarioMixChange). This router owns the HTTP surface; resolution + routing
  live in the service package.

SESSION 3 OWNERSHIP (keep edits inside your banner region to avoid collisions):
  - Cells (Session 2) ........ shipped below; do not move.
  - T1: role lines (add/remove) + plan (dates / milestones / stage / DoI) + the
        Tier-3 mix control endpoint.
  - T2: external-cost line items (add / remove / edit: description, vendor,
        category).
  - T3 (cost-allocation) lives in ``routers/scenarios.py`` (lever-12 region) —
        NOT here.
Endpoint-family seam: role lines use ``/projects/{pid}/lines``; external-cost
items use ``/projects/{pid}/external-costs`` — separate families so T1 and T2
never touch the same handler. Both ultimately write ``ScenarioLineEdit`` rows;
the resolver already treats both line kinds uniformly.
"""
from __future__ import annotations
import json
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role, user_has_tier3
from models.projects import Project, ProjectMilestone
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioCapacityImpact,
    ScenarioForecastCellEdit, ScenarioLineEdit, ScenarioMixChange,
    ScenarioPlanEdit, ScenarioState,
    OVERLAY_CELL_FIELDS, OVERLAY_PLAN_TARGETS,
)
from schemas.common import CurrentUser
from schemas.scenarios import (
    CellEditRequest,
    ExternalCostLineCreateRequest, ExternalCostLineItem,
    ExternalCostLineUpdateRequest, ExternalCostListResponse,
    ExternalCostTypeOption, ExternalCostWriteResponse,
    LineAddRequest, MixChangeRequest, PlanEditRequest,
    ScenarioGridCell, ScenarioGridColumn, ScenarioGridResponse,
    ScenarioGridRow, ScenarioGridWriteResponse,
    ScenarioLineWriteResponse,
    ScenarioMixItem, ScenarioMixListResponse, ScenarioMixWriteResponse,
    ScenarioPlanMilestone, ScenarioPlanResponse, ScenarioPlanWriteResponse,
    ScenarioProjectItem, ScenarioProjectsResponse,
)
from services.scenario_engine import recalculate_scenario

# Shared scenario access helpers stay in routers.scenarios — importing them here
# does NOT create a cycle: scenarios.py never imports this module (main.py wires
# both routers independently).
from routers.scenarios import (
    _check_scenario_owner, _get_scenario_or_404, _user_can_view_scenario,
)

router = APIRouter(prefix="/api/scenarios", tags=["What-If Simulator"])


# ---------------------------------------------------------------------------
# Project-scope redesign Session 2 — editable forecast grid
# ---------------------------------------------------------------------------

_GRID_EPS = 0.005


def _grid_to_response(
    db: Session, scenario: Scenario, project_id: str,
) -> ScenarioGridResponse:
    """Build the editable forecast grid for one project under a scenario.

    Resolves ``anchor → macros → overlay`` (adjusted) and joins it cell-by-cell
    with the live anchor grid so each cell carries both its resolved value and
    its pre-overlay anchor value (drives is_changed + per-cell revert). Internal
    lines expose ``hours`` cells with a derived € amount; external lines expose
    ``amount_eur`` cells. See ``services/scenario_project_scope/`` (Session 1).
    """
    from config import DEMO_DATE
    from services.scenario_project_scope.rates import effective_hourly_rate
    from services.scenario_project_scope.resolution import (
        read_anchor_grid, resolve_project_grid,
    )
    from services.scenario_project_scope.types import LINE_KIND_INTERNAL
    from models.people import RoleType

    adjusted = resolve_project_grid(db, scenario, project_id)
    anchor = read_anchor_grid(db, project_id)
    anchor_by_key = {line.line_key: line for line in anchor.lines}

    # (line_key, month) that carry an actual hand-overlay row — drives the
    # revert affordance + changed highlight, distinct from is_changed (which
    # also fires on macro-shifted cells that have no overlay to revert).
    overlay_keys: set[tuple[str, str]] = {
        (row.line_key, row.month)
        for row in db.query(
            ScenarioForecastCellEdit.line_key, ScenarioForecastCellEdit.month
        ).filter(
            ScenarioForecastCellEdit.scenario_id == scenario.id,
            ScenarioForecastCellEdit.project_id == project_id,
        )
    }

    # Columns = sorted union of every month across adjusted + anchor lines.
    months: set[str] = set()
    for line in (*adjusted.lines, *anchor.lines):
        months.update(line.cells.keys())
    sorted_months = sorted(months)
    columns = [ScenarioGridColumn(key=m) for m in sorted_months]

    rows: list[ScenarioGridRow] = []
    for line in adjusted.lines:
        is_internal = line.kind == LINE_KIND_INTERNAL
        field = "hours" if is_internal else "amount_eur"
        anchor_line = anchor_by_key.get(line.line_key)

        # Best-effort display label.
        sub_category_name = line.sub_category or line.line_key
        hourly_rate = None
        if is_internal:
            role_key = line.role_type_id or line.sub_category
            if role_key:
                role = (
                    db.query(RoleType).filter(RoleType.id == role_key).first()
                )
                if role is not None:
                    sub_category_name = role.name
            hourly_rate = effective_hourly_rate(db, line.role_type_id or line.sub_category)
        elif line.vendor:
            sub_category_name = line.vendor

        cells: list[ScenarioGridCell] = []
        for m in sorted_months:
            adj_cell = line.cells.get(m)
            anc_cell = anchor_line.cells.get(m) if anchor_line else None

            if is_internal:
                display_value = float(adj_cell.hours or 0.0) if adj_cell else 0.0
                anchor_value = (
                    float(anc_cell.hours or 0.0) if anc_cell is not None else None
                )
            else:
                display_value = float(adj_cell.amount_eur) if adj_cell else 0.0
                anchor_value = (
                    float(anc_cell.amount_eur) if anc_cell is not None else None
                )
            amount_eur = float(adj_cell.amount_eur) if adj_cell else 0.0
            # The anchor cell's STORED € (Forecast.amount_eur), distinct from
            # anchor_value (which is anchor hours for internal lines). The
            # live-local panel uses this for its anchor/delta so it can't drift
            # from the server when stored € != hours x latest-rate.
            anchor_amount_eur = (
                float(anc_cell.amount_eur) if anc_cell is not None else None
            )

            is_empty = adj_cell is None and anc_cell is None
            # is_changed reflects adjusted-vs-anchor drift INCLUDING macro shifts
            # (diagnostic / asserted in tests); the frontend drives its
            # changed-highlight + revert off has_overlay, not this flag.
            is_changed = (
                not is_empty
                and abs(display_value - (anchor_value or 0.0)) > _GRID_EPS
            )
            cells.append(ScenarioGridCell(
                month=m,
                display_value=round(display_value, 2),
                amount_eur=round(amount_eur, 2),
                anchor_value=(round(anchor_value, 2) if anchor_value is not None else None),
                anchor_amount_eur=(round(anchor_amount_eur, 2) if anchor_amount_eur is not None else None),
                field=field,
                can_edit=(m >= DEMO_DATE),
                is_changed=is_changed,
                has_overlay=((line.line_key, m) in overlay_keys),
                is_empty=is_empty,
            ))

        rows.append(ScenarioGridRow(
            line_key=line.line_key,
            category=line.category,
            kind=line.kind,
            sub_category_name=sub_category_name,
            hourly_rate=hourly_rate,
            cells=cells,
        ))

    return ScenarioGridResponse(
        scenario_id=scenario.id,
        project_id=project_id,
        start_month=adjusted.start_month,
        end_month=adjusted.end_month,
        open_month=DEMO_DATE,
        columns=columns,
        rows=rows,
    )


def _field_kind_coherent(field: str, line_kind: str) -> bool:
    """A ``hours`` edit belongs to an internal line, ``amount_eur`` to external."""
    from services.scenario_project_scope.types import (
        LINE_KIND_EXTERNAL, LINE_KIND_INTERNAL,
    )
    if line_kind == LINE_KIND_INTERNAL:
        return field == "hours"
    if line_kind == LINE_KIND_EXTERNAL:
        return field == "amount_eur"
    return False


def _line_kind_for_key(line_key: str, category: str | None = None) -> str:
    """Derive the overlay line kind from a line_key (or category fallback)."""
    from services.scenario_project_scope.types import (
        LINE_KIND_EXTERNAL, LINE_KIND_INTERNAL,
    )
    if line_key.startswith("new:role:"):
        return LINE_KIND_INTERNAL
    if line_key.startswith("new:ext:"):
        return LINE_KIND_EXTERNAL
    if category:
        return LINE_KIND_INTERNAL if category == "internal" else LINE_KIND_EXTERNAL
    cat = line_key.split("|", 1)[0] if "|" in line_key else line_key
    return LINE_KIND_INTERNAL if cat == "internal" else LINE_KIND_EXTERNAL


def _recalc_after_overlay_write(db: Session, scenario: Scenario) -> dict:
    """Shared tail for cell write/revert — mirrors ``apply_action`` exactly:
    bump modified_at, invalidate snapshot rows, commit, then recalculate."""
    scenario.modified_at = datetime.utcnow()
    db.query(ScenarioState).filter(
        ScenarioState.scenario_id == scenario.id,
    ).delete()
    db.query(ScenarioCapacityImpact).filter(
        ScenarioCapacityImpact.scenario_id == scenario.id,
    ).delete()
    db.commit()
    actions = (
        db.query(ScenarioAction)
        .filter(ScenarioAction.scenario_id == scenario.id)
        .order_by(ScenarioAction.action_order).all()
    )
    return recalculate_scenario(db, scenario, actions)


@router.get(
    "/{scenario_id}/projects/{project_id}/grid",
    response_model=ScenarioGridResponse,
)
def get_project_grid(
    scenario_id: int,
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Resolved, editable forecast grid for one project under a scenario."""
    scenario = _get_scenario_or_404(db, scenario_id)
    has_tier3 = user_has_tier3(db, user)
    if not _user_can_view_scenario(scenario, user, has_tier3):
        raise HTTPException(403, "You do not have access to this scenario.")
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, f"Project {project_id} not found")
    return _grid_to_response(db, scenario, project_id)


@router.get(
    "/{scenario_id}/projects",
    response_model=ScenarioProjectsResponse,
)
def list_scenario_projects(
    scenario_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Projects selectable in the simulator workspace for this scenario.

    Returns EVERY active project (excluding Cancelled), regardless of pipeline
    stage — the simulator is portfolio-wide what-if, so backlog-stage projects
    the scenario edits must be reachable. This is deliberately NOT the Portfolio
    'Change' population (which excludes backlog stages). Run entities are not
    ``Project`` rows, so they are naturally excluded.
    """
    scenario = _get_scenario_or_404(db, scenario_id)
    has_tier3 = user_has_tier3(db, user)
    if not _user_can_view_scenario(scenario, user, has_tier3):
        raise HTTPException(403, "You do not have access to this scenario.")
    rows = (
        db.query(Project)
        .filter(Project.is_active.is_(True), Project.pipeline_stage != "Cancelled")
        .order_by(Project.name)
        .all()
    )
    items = [
        ScenarioProjectItem(
            id=p.id, name=p.name, pipeline_stage=p.pipeline_stage,
        )
        for p in rows
    ]
    return ScenarioProjectsResponse(items=items, total=len(items))


@router.put(
    "/{scenario_id}/projects/{project_id}/cells",
    response_model=ScenarioGridWriteResponse,
)
def write_project_cell(
    scenario_id: int,
    project_id: str,
    body: CellEditRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive",
    )),
):
    """Upsert a single forecast-cell overlay edit, then recalculate.

    CC Owners are intentionally excluded — the scoped PL/CC authoring + access
    layer is Session 4 (see Simulator project-scope redesign guide).
    """
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, f"Project {project_id} not found")

    if body.field not in OVERLAY_CELL_FIELDS:
        raise HTTPException(
            422, f"field must be one of {OVERLAY_CELL_FIELDS}",
        )

    # field ↔ line-kind coherence: derive the line kind from the line_key shape
    # (cheap) rather than resolving the whole grid just to validate.
    line_kind = _line_kind_for_key(body.line_key)
    if not _field_kind_coherent(body.field, line_kind):
        raise HTTPException(
            422,
            f"field '{body.field}' is not valid for an "
            f"{'internal' if line_kind == 'internal_role' else 'external'} line.",
        )

    # Actuals write-guard: cannot edit a month at or before the open boundary's
    # past (months strictly before DEMO_DATE are closed actuals).
    from config import DEMO_DATE
    if body.month < DEMO_DATE:
        raise HTTPException(
            403, f"Cannot edit actuals month {body.month} (< {DEMO_DATE}).",
        )

    existing = (
        db.query(ScenarioForecastCellEdit)
        .filter(
            ScenarioForecastCellEdit.scenario_id == scenario_id,
            ScenarioForecastCellEdit.project_id == project_id,
            ScenarioForecastCellEdit.line_key == body.line_key,
            ScenarioForecastCellEdit.month == body.month,
            ScenarioForecastCellEdit.field == body.field,
        )
        .first()
    )
    if existing is not None:
        existing.value = body.value
    else:
        db.add(ScenarioForecastCellEdit(
            scenario_id=scenario_id,
            project_id=project_id,
            line_key=body.line_key,
            month=body.month,
            field=body.field,
            value=body.value,
        ))

    state = _recalc_after_overlay_write(db, scenario)
    return ScenarioGridWriteResponse(
        state=state,
        grid=_grid_to_response(db, scenario, project_id),
    )


@router.delete(
    "/{scenario_id}/projects/{project_id}/cells",
    response_model=ScenarioGridWriteResponse,
)
def revert_project_cells(
    scenario_id: int,
    project_id: str,
    line_key: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    field: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role(
        "controller", "executive",
    )),
):
    """Revert overlay cell edits at cell / line / clear-all granularity.

    Deletes ONLY ``ScenarioForecastCellEdit`` rows — line/mix/plan overlays and
    macro actions are never touched. Granularity is driven by the query params:
    cell = line_key + month (+ optional field), line = line_key only,
    clear-all = no params. CC Owners are excluded (access layer is Session 4).
    """
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, f"Project {project_id} not found")

    # Guard against an unintended bulk delete: a field/month filter is only
    # meaningful within a single line, so it requires line_key.
    if line_key is None and (field is not None or month is not None):
        raise HTTPException(
            422,
            "line_key is required when filtering revert by month or field "
            "(omit all params to clear the whole project).",
        )

    q = db.query(ScenarioForecastCellEdit).filter(
        ScenarioForecastCellEdit.scenario_id == scenario_id,
        ScenarioForecastCellEdit.project_id == project_id,
    )
    if line_key is not None:
        q = q.filter(ScenarioForecastCellEdit.line_key == line_key)
    if month is not None:
        q = q.filter(ScenarioForecastCellEdit.month == month)
    if field is not None:
        q = q.filter(ScenarioForecastCellEdit.field == field)
    q.delete(synchronize_session=False)

    state = _recalc_after_overlay_write(db, scenario)
    return ScenarioGridWriteResponse(
        state=state,
        grid=_grid_to_response(db, scenario, project_id),
    )


# ===========================================================================
# Session 3 — new edit surfaces. Add endpoints under your banner only.
# ===========================================================================

# --- T1: role lines — add / remove (ScenarioLineEdit, internal_role) --------
#     POST   /{scenario_id}/projects/{project_id}/lines
#     DELETE /{scenario_id}/projects/{project_id}/lines/{line_key}
#     (not Tier-3 — open to all authors per spec §3 item 3)


def _require_project(db: Session, project_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(404, f"Project {project_id} not found")
    return project


@router.post(
    "/{scenario_id}/projects/{project_id}/lines",
    response_model=ScenarioLineWriteResponse,
)
def add_role_line(
    scenario_id: int,
    project_id: str,
    body: LineAddRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Add an internal role line to the project's plan within the scenario.

    Mints a stable ``new:role:<uuid>`` line_key (companion ScenarioLineEdit add
    row) so subsequent cell edits can target the line before it exists live.
    Open to all authors — NOT Tier-3 gated (spec §3 item 3, §8). PL authoring is
    Session 4, so the write role stays controller/executive for now.
    """
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    _require_project(db, project_id)

    if not body.role_type_id:
        raise HTTPException(422, "role_type_id is required to add a role line.")
    from models.people import RoleType
    if db.query(RoleType).filter(RoleType.id == body.role_type_id).first() is None:
        raise HTTPException(422, f"role_type_id '{body.role_type_id}' not found.")

    line_key = f"new:role:{uuid.uuid4().hex[:12]}"
    db.add(ScenarioLineEdit(
        scenario_id=scenario_id,
        project_id=project_id,
        line_key=line_key,
        op="add",
        line_kind="internal_role",
        category="internal",
        sub_category=body.sub_category or body.role_type_id,
        role_type_id=body.role_type_id,
    ))
    state = _recalc_after_overlay_write(db, scenario)
    return ScenarioLineWriteResponse(
        line_key=line_key,
        state=state,
        grid=_grid_to_response(db, scenario, project_id),
    )


@router.delete(
    "/{scenario_id}/projects/{project_id}/lines/{line_key:path}",
    response_model=ScenarioLineWriteResponse,
)
def remove_role_line(
    scenario_id: int,
    project_id: str,
    line_key: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Drop a role line from the scenario's plan.

    For a scenario-added line (``new:role:*``) this deletes the add row and any
    cell overlays under it (a clean undo). For an existing natural line it records
    a ``remove`` ScenarioLineEdit so resolution suppresses it (idempotent upsert).
    """
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    _require_project(db, project_id)

    if line_key.startswith("new:role:") or line_key.startswith("new:ext:"):
        db.query(ScenarioLineEdit).filter(
            ScenarioLineEdit.scenario_id == scenario_id,
            ScenarioLineEdit.project_id == project_id,
            ScenarioLineEdit.line_key == line_key,
        ).delete(synchronize_session=False)
        db.query(ScenarioForecastCellEdit).filter(
            ScenarioForecastCellEdit.scenario_id == scenario_id,
            ScenarioForecastCellEdit.project_id == project_id,
            ScenarioForecastCellEdit.line_key == line_key,
        ).delete(synchronize_session=False)
    else:
        existing = (
            db.query(ScenarioLineEdit)
            .filter(
                ScenarioLineEdit.scenario_id == scenario_id,
                ScenarioLineEdit.project_id == project_id,
                ScenarioLineEdit.line_key == line_key,
            )
            .first()
        )
        if existing is None:
            db.add(ScenarioLineEdit(
                scenario_id=scenario_id,
                project_id=project_id,
                line_key=line_key,
                op="remove",
                line_kind=_line_kind_for_key(line_key),
            ))
        else:
            existing.op = "remove"

    state = _recalc_after_overlay_write(db, scenario)
    return ScenarioLineWriteResponse(
        line_key=line_key,
        state=state,
        grid=_grid_to_response(db, scenario, project_id),
    )


# --- T1: plan — dates / milestones / stage / DoI (ScenarioPlanEdit) ----------
#     PUT/DELETE /{scenario_id}/projects/{project_id}/plan
#     date targets shift the resolved window in resolution._apply_overlay


def _resolve_plan(db: Session, scenario_id: int, project: Project) -> ScenarioPlanResponse:
    """Resolve a project's plan under the scenario: anchor (live Project +
    milestones) overlaid with ScenarioPlanEdit rows, with per-field changed flags
    for the editor's diff rendering."""
    edits = (
        db.query(ScenarioPlanEdit)
        .filter(
            ScenarioPlanEdit.scenario_id == scenario_id,
            ScenarioPlanEdit.project_id == project.id,
        )
        .all()
    )
    by_key = {(e.target, e.milestone_id or ""): e for e in edits}

    def _scalar(target: str) -> Optional[str]:
        e = by_key.get((target, ""))
        return e.value if e is not None else None

    start_v = _scalar("start_month")
    end_v = _scalar("end_month")
    stage_v = _scalar("stage")
    doi_v = _scalar("doi")

    resolved_doi: Optional[int] = project.doi
    if doi_v not in (None, ""):
        try:
            resolved_doi = int(doi_v)
        except (TypeError, ValueError):
            resolved_doi = project.doi

    milestones: list[ScenarioPlanMilestone] = []
    ms_rows = (
        db.query(ProjectMilestone)
        .filter(ProjectMilestone.project_id == project.id)
        .order_by(ProjectMilestone.sequence_number)
        .all()
    )
    for m in ms_rows:
        mid = str(m.id)
        e = by_key.get(("milestone", mid))
        payload = {}
        if e is not None and e.entry_json:
            try:
                payload = json.loads(e.entry_json)
            except (TypeError, ValueError):
                payload = {}
        milestones.append(ScenarioPlanMilestone(
            milestone_id=mid,
            name=payload.get("name") or m.name,
            forecast_start=payload.get("forecast_start") or m.forecast_start,
            forecast_end=payload.get("forecast_end") or m.forecast_end,
            anchor_forecast_start=m.forecast_start,
            anchor_forecast_end=m.forecast_end,
            is_changed=e is not None,
        ))

    return ScenarioPlanResponse(
        project_id=project.id,
        start_month=start_v or project.start_month,
        end_month=end_v or project.end_month,
        stage=stage_v or project.pipeline_stage,
        doi=resolved_doi,
        anchor_start_month=project.start_month,
        anchor_end_month=project.end_month,
        anchor_stage=project.pipeline_stage,
        anchor_doi=project.doi,
        start_changed=start_v is not None,
        end_changed=end_v is not None,
        stage_changed=stage_v is not None,
        doi_changed=doi_v is not None,
        milestones=milestones,
    )


@router.get(
    "/{scenario_id}/projects/{project_id}/plan",
    response_model=ScenarioPlanResponse,
)
def get_project_plan(
    scenario_id: int,
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """The project's resolved plan under the scenario (anchor + plan overlay)."""
    scenario = _get_scenario_or_404(db, scenario_id)
    has_tier3 = user_has_tier3(db, user)
    if not _user_can_view_scenario(scenario, user, has_tier3):
        raise HTTPException(403, "You do not have access to this scenario.")
    project = _require_project(db, project_id)
    return _resolve_plan(db, scenario_id, project)


@router.put(
    "/{scenario_id}/projects/{project_id}/plan",
    response_model=ScenarioPlanWriteResponse,
)
def write_plan_edit(
    scenario_id: int,
    project_id: str,
    body: PlanEditRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Upsert one project-plan overlay target (date / stage / DoI / milestone).

    Date targets feed the resolved window (``resolution._apply_overlay`` shifts
    the curve so the grid reflects the new window); stage / DoI / milestone are
    stored for the editor + the DoI gate at promote. One row per
    (scenario, project, target, milestone_id) via the model's unique constraint.
    """
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    project = _require_project(db, project_id)

    if body.target not in OVERLAY_PLAN_TARGETS:
        raise HTTPException(422, f"target must be one of {OVERLAY_PLAN_TARGETS}")

    from config import DEMO_DATE

    milestone_id = ""
    value: Optional[str] = None
    entry_json: Optional[str] = None

    if body.target == "milestone":
        milestone_id = body.milestone_id or ""
        if not milestone_id:
            raise HTTPException(422, "milestone_id is required for a milestone plan edit.")
        entry_json = json.dumps(body.entry_json or {})
    else:
        if body.value is None or body.value == "":
            raise HTTPException(422, f"value is required for plan target '{body.target}'.")
        value = body.value
        if body.target in ("start_month", "end_month"):
            import re
            if not re.fullmatch(r"\d{4}-\d{2}", value):
                raise HTTPException(422, f"{body.target} must be 'YYYY-MM'.")
            if value < DEMO_DATE:
                raise HTTPException(
                    403,
                    f"Cannot move {body.target} to {value} (< open month {DEMO_DATE}); "
                    "nothing may reshape the past.",
                )
            # Keep the window non-inverted: validate against the counterpart's
            # effective value (its overlay if one exists, else the live project).
            # YYYY-MM strings order lexically.
            other_target = "end_month" if body.target == "start_month" else "start_month"
            other_overlay = (
                db.query(ScenarioPlanEdit.value)
                .filter(
                    ScenarioPlanEdit.scenario_id == scenario_id,
                    ScenarioPlanEdit.project_id == project_id,
                    ScenarioPlanEdit.target == other_target,
                )
                .scalar()
            )
            other_value = other_overlay or getattr(project, other_target, None)
            if other_value:
                start_v, end_v = (
                    (value, other_value)
                    if body.target == "start_month"
                    else (other_value, value)
                )
                if start_v > end_v:
                    raise HTTPException(
                        422,
                        f"Project start_month ({start_v}) must not be after "
                        f"end_month ({end_v}).",
                    )

    existing = (
        db.query(ScenarioPlanEdit)
        .filter(
            ScenarioPlanEdit.scenario_id == scenario_id,
            ScenarioPlanEdit.project_id == project_id,
            ScenarioPlanEdit.target == body.target,
            ScenarioPlanEdit.milestone_id == milestone_id,
        )
        .first()
    )
    if existing is not None:
        existing.value = value
        existing.entry_json = entry_json
    else:
        db.add(ScenarioPlanEdit(
            scenario_id=scenario_id,
            project_id=project_id,
            target=body.target,
            milestone_id=milestone_id,
            value=value,
            entry_json=entry_json,
        ))

    state = _recalc_after_overlay_write(db, scenario)
    return ScenarioPlanWriteResponse(
        state=state,
        grid=_grid_to_response(db, scenario, project_id),
        plan=_resolve_plan(db, scenario_id, project),
    )


@router.delete(
    "/{scenario_id}/projects/{project_id}/plan",
    response_model=ScenarioPlanWriteResponse,
)
def revert_plan_edit(
    scenario_id: int,
    project_id: str,
    target: Optional[str] = Query(None),
    milestone_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Revert plan overlay edits: one target (optionally a specific milestone) or
    — with no params — all plan edits for the project."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    project = _require_project(db, project_id)

    q = db.query(ScenarioPlanEdit).filter(
        ScenarioPlanEdit.scenario_id == scenario_id,
        ScenarioPlanEdit.project_id == project_id,
    )
    if target is not None:
        if target not in OVERLAY_PLAN_TARGETS:
            raise HTTPException(422, f"target must be one of {OVERLAY_PLAN_TARGETS}")
        q = q.filter(ScenarioPlanEdit.target == target)
        if milestone_id is not None:
            q = q.filter(ScenarioPlanEdit.milestone_id == milestone_id)
    elif milestone_id is not None:
        raise HTTPException(422, "target is required when filtering revert by milestone_id.")
    q.delete(synchronize_session=False)

    state = _recalc_after_overlay_write(db, scenario)
    return ScenarioPlanWriteResponse(
        state=state,
        grid=_grid_to_response(db, scenario, project_id),
        plan=_resolve_plan(db, scenario_id, project),
    )


# --- T1: Tier-3 mix control (ScenarioMixChange) ------------------------------
#     PUT/DELETE /{scenario_id}/projects/{project_id}/mix
#     gate writes on user_has_tier3; the FE renders the control null otherwise


def _mix_items(db: Session, scenario_id: int, project_id: str) -> list[ScenarioMixItem]:
    rows = (
        db.query(ScenarioMixChange)
        .filter(
            ScenarioMixChange.scenario_id == scenario_id,
            ScenarioMixChange.project_id == project_id,
        )
        .order_by(ScenarioMixChange.id)
        .all()
    )
    return [
        ScenarioMixItem(
            id=r.id,
            cost_center_id=r.cost_center_id,
            swap_from_role_id=r.swap_from_role_id,
            swap_to_role_id=r.swap_to_role_id,
            hours_per_month_swap=(float(r.hours_per_month_swap) if r.hours_per_month_swap is not None else None),
            effective_from=r.effective_from,
        )
        for r in rows
    ]


@router.get(
    "/{scenario_id}/projects/{project_id}/mix",
    response_model=ScenarioMixListResponse,
)
def list_mix_changes(
    scenario_id: int,
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """The current Tier-3 mix swaps for the project (so the control can render
    previously-saved swaps on mount). Visible to anyone who can view the scenario;
    the FE still renders the *control* null for non-Tier-3 authors."""
    scenario = _get_scenario_or_404(db, scenario_id)
    has_tier3 = user_has_tier3(db, user)
    if not _user_can_view_scenario(scenario, user, has_tier3):
        raise HTTPException(403, "You do not have access to this scenario.")
    _require_project(db, project_id)
    return ScenarioMixListResponse(
        mix_changes=_mix_items(db, scenario_id, project_id),
    )


@router.put(
    "/{scenario_id}/projects/{project_id}/mix",
    response_model=ScenarioMixWriteResponse,
)
def write_mix_change(
    scenario_id: int,
    project_id: str,
    body: MixChangeRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Upsert a Tier-3 seniority/sourcing mix swap (spec §8 — the lone Tier-3 grid
    control). WRITES are gated on ``user_has_tier3``; the FE renders the control
    null for non-Tier-3 authors. Upserts on
    (scenario, project, cost_center, swap_from, swap_to)."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    _require_project(db, project_id)

    if not user_has_tier3(db, user):
        raise HTTPException(403, "Tier 3 access is required to change the mix.")

    if body.swap_from_role_id == body.swap_to_role_id:
        raise HTTPException(422, "swap_from_role_id and swap_to_role_id must differ.")
    if body.hours_per_month_swap is None or body.hours_per_month_swap <= 0:
        raise HTTPException(422, "hours_per_month_swap must be a positive number.")

    from config import DEMO_DATE
    if body.effective_from < DEMO_DATE:
        raise HTTPException(
            403,
            f"effective_from {body.effective_from} is in the past (< {DEMO_DATE}); "
            "nothing may reshape the past.",
        )

    existing = (
        db.query(ScenarioMixChange)
        .filter(
            ScenarioMixChange.scenario_id == scenario_id,
            ScenarioMixChange.project_id == project_id,
            ScenarioMixChange.cost_center_id == body.cost_center_id,
            ScenarioMixChange.swap_from_role_id == body.swap_from_role_id,
            ScenarioMixChange.swap_to_role_id == body.swap_to_role_id,
        )
        .first()
    )
    if existing is not None:
        existing.hours_per_month_swap = body.hours_per_month_swap
        existing.effective_from = body.effective_from
    else:
        db.add(ScenarioMixChange(
            scenario_id=scenario_id,
            project_id=project_id,
            cost_center_id=body.cost_center_id,
            swap_from_role_id=body.swap_from_role_id,
            swap_to_role_id=body.swap_to_role_id,
            hours_per_month_swap=body.hours_per_month_swap,
            effective_from=body.effective_from,
        ))

    state = _recalc_after_overlay_write(db, scenario)
    return ScenarioMixWriteResponse(
        state=state,
        grid=_grid_to_response(db, scenario, project_id),
        mix_changes=_mix_items(db, scenario_id, project_id),
    )


@router.delete(
    "/{scenario_id}/projects/{project_id}/mix",
    response_model=ScenarioMixWriteResponse,
)
def revert_mix_change(
    scenario_id: int,
    project_id: str,
    mix_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Revert a Tier-3 mix swap (by ``mix_id``) or all of them for the project.
    Tier-3 gated, like the write."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    _require_project(db, project_id)

    if not user_has_tier3(db, user):
        raise HTTPException(403, "Tier 3 access is required to change the mix.")

    q = db.query(ScenarioMixChange).filter(
        ScenarioMixChange.scenario_id == scenario_id,
        ScenarioMixChange.project_id == project_id,
    )
    if mix_id is not None:
        q = q.filter(ScenarioMixChange.id == mix_id)
    q.delete(synchronize_session=False)

    state = _recalc_after_overlay_write(db, scenario)
    return ScenarioMixWriteResponse(
        state=state,
        grid=_grid_to_response(db, scenario, project_id),
        mix_changes=_mix_items(db, scenario_id, project_id),
    )


# --- T2: external-cost line items — add / remove / edit ----------------------
#     GET    /{scenario_id}/projects/{project_id}/external-costs
#     POST   /{scenario_id}/projects/{project_id}/external-costs
#     PUT    /{scenario_id}/projects/{project_id}/external-costs/{line_key}
#     DELETE /{scenario_id}/projects/{project_id}/external-costs/{line_key}
#     (description, vendor, category editable; line item is the unit, §3 item 5)
#
# add/remove/edit all write ScenarioLineEdit (line_kind='external_cost'):
#   - add  → minted new:ext:<uuid> line_key; per-month € then edited via cells.
#   - edit → metadata patch (vendor / cost-type / description / capex). Existing
#            anchor line → op='edit' overlay row; pending added line → patch the
#            add row in place (one row per line_key, uq_scenario_line_edit).
#   - remove → added line: drop the row + its cell edits; anchor line: op='remove'
#            (resolution suppresses it) + clear its cell edits.
# Reuses _recalc_after_overlay_write / _grid_to_response / _line_kind_for_key /
# _require_project. The change-feed entry is appended on the frontend
# (ScenarioContext), mirroring the cell path.

_CAPEX_OPEX_VALUES = ("capex", "opex")


def _external_costs_response(
    db: Session, scenario: Scenario, project_id: str,
) -> ExternalCostListResponse:
    """Assemble the external-cost line items for one project under the scenario.

    Identity + per-line € come from the resolved grid (anchor → macros → overlay,
    so add/remove/edit are already reflected). Metadata the resolved line does not
    carry (description / capex_opex) is sourced from the overlay row (add/edit
    wins) falling back to the anchor Forecast rows. Also returns the cost-type
    catalogue for the add/edit category selector.
    """
    from models.financial import ExternalCostType, Forecast
    from services.scenario_project_scope.resolution import resolve_project_grid
    from services.scenario_project_scope.types import LINE_KIND_EXTERNAL

    resolved = resolve_project_grid(db, scenario, project_id)

    overlay = {
        le.line_key: le
        for le in db.query(ScenarioLineEdit).filter(
            ScenarioLineEdit.scenario_id == scenario.id,
            ScenarioLineEdit.project_id == project_id,
            ScenarioLineEdit.line_kind == LINE_KIND_EXTERNAL,
        )
    }

    # Anchor metadata per natural line_key ("external|<cost_type>|").
    anchor_meta: dict[str, dict] = {}
    for row in db.query(Forecast).filter(
        Forecast.project_id == project_id, Forecast.category == "external",
    ):
        key = f"external|{row.sub_category or ''}|"
        meta = anchor_meta.setdefault(
            key, {"vendor": None, "description": None, "capex_opex": None},
        )
        if meta["vendor"] is None and row.vendor is not None:
            meta["vendor"] = row.vendor
        if meta["description"] is None and row.description is not None:
            meta["description"] = row.description
        if meta["capex_opex"] is None and row.capex_opex is not None:
            meta["capex_opex"] = row.capex_opex

    cost_type_names = {ct.id: ct.name for ct in db.query(ExternalCostType)}

    items: list[ExternalCostLineItem] = []
    for line in resolved.lines:
        if line.kind != LINE_KIND_EXTERNAL:
            continue
        le = overlay.get(line.line_key)
        anc = anchor_meta.get(line.line_key, {})
        cost_type_id = line.sub_category
        vendor = line.vendor if line.vendor is not None else anc.get("vendor")
        if le is not None and le.description is not None:
            description = le.description
        else:
            description = anc.get("description")
        if le is not None and le.capex_opex is not None:
            capex_opex = le.capex_opex
        else:
            capex_opex = anc.get("capex_opex")
        total = round(sum(c.amount_eur for c in line.cells.values()), 2)
        items.append(ExternalCostLineItem(
            line_key=line.line_key,
            cost_type_id=cost_type_id,
            cost_type_name=cost_type_names.get(cost_type_id),
            vendor=vendor,
            description=description,
            capex_opex=capex_opex,
            total_eur=total,
            origin="added" if line.line_key.startswith("new:ext:") else "anchor",
        ))
    items.sort(key=lambda it: (it.cost_type_name or "", it.vendor or "", it.line_key))

    available = [
        ExternalCostTypeOption(id=ct_id, name=name)
        for ct_id, name in sorted(cost_type_names.items(), key=lambda kv: kv[1])
    ]
    return ExternalCostListResponse(
        scenario_id=scenario.id,
        project_id=project_id,
        items=items,
        available_cost_types=available,
        total=len(items),
    )


def _require_external_line_key(line_key: str) -> None:
    """422 unless ``line_key`` is an external-cost line (added or natural)."""
    if _line_kind_for_key(line_key) != "external_cost":
        raise HTTPException(
            422,
            f"line_key '{line_key}' is not an external-cost line "
            "(use the role-lines endpoints for internal lines).",
        )


def _anchor_external_line_exists(
    db: Session, project_id: str, line_key: str,
) -> bool:
    """True if a natural-key external line exists in the live Forecast rows."""
    from models.financial import Forecast
    parts = line_key.split("|")
    if len(parts) < 2 or parts[0] != "external":
        return False
    sub_category = parts[1] or None
    q = db.query(Forecast).filter(
        Forecast.project_id == project_id, Forecast.category == "external",
    )
    if sub_category is not None:
        q = q.filter(Forecast.sub_category == sub_category)
    else:
        q = q.filter(Forecast.sub_category.is_(None))
    return db.query(q.exists()).scalar()


def _external_write_response(
    db: Session, scenario: Scenario, project_id: str, line_key: str,
) -> ExternalCostWriteResponse:
    state = _recalc_after_overlay_write(db, scenario)
    return ExternalCostWriteResponse(
        line_key=line_key,
        state=state,
        grid=_grid_to_response(db, scenario, project_id),
        external_costs=_external_costs_response(db, scenario, project_id),
    )


@router.get(
    "/{scenario_id}/projects/{project_id}/external-costs",
    response_model=ExternalCostListResponse,
)
def list_external_cost_lines(
    scenario_id: int,
    project_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """External-cost line items for one project under the scenario (anchor +
    overlay resolved), plus the cost-type catalogue for the add/edit selector."""
    scenario = _get_scenario_or_404(db, scenario_id)
    has_tier3 = user_has_tier3(db, user)
    if not _user_can_view_scenario(scenario, user, has_tier3):
        raise HTTPException(403, "You do not have access to this scenario.")
    _require_project(db, project_id)
    return _external_costs_response(db, scenario, project_id)


@router.post(
    "/{scenario_id}/projects/{project_id}/external-costs",
    response_model=ExternalCostWriteResponse,
)
def add_external_cost_line(
    scenario_id: int,
    project_id: str,
    body: ExternalCostLineCreateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Add an external-cost line item to the project's scenario plan. Mints a
    stable ``new:ext:<uuid>`` line_key; per-month € is entered via the cell path.

    CC Owners are excluded — the scoped PL/CC authoring layer is Session 4.
    """
    from services.scenario_project_scope.types import LINE_KIND_EXTERNAL

    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    _require_project(db, project_id)
    if body.capex_opex is not None and body.capex_opex not in _CAPEX_OPEX_VALUES:
        raise HTTPException(422, f"capex_opex must be one of {_CAPEX_OPEX_VALUES}")
    from models.financial import ExternalCostType
    if db.query(ExternalCostType).filter(
        ExternalCostType.id == body.cost_type_id,
    ).first() is None:
        raise HTTPException(422, f"cost_type_id '{body.cost_type_id}' not found.")

    line_key = f"new:ext:{uuid.uuid4().hex[:12]}"
    db.add(ScenarioLineEdit(
        scenario_id=scenario_id,
        project_id=project_id,
        line_key=line_key,
        op="add",
        line_kind=LINE_KIND_EXTERNAL,
        category="external",
        sub_category=body.cost_type_id,
        cost_type_id=body.cost_type_id,
        vendor=body.vendor,
        description=body.description,
        capex_opex=body.capex_opex,
    ))
    return _external_write_response(db, scenario, project_id, line_key)


@router.put(
    "/{scenario_id}/projects/{project_id}/external-costs/{line_key:path}",
    response_model=ExternalCostWriteResponse,
)
def edit_external_cost_line(
    scenario_id: int,
    project_id: str,
    line_key: str,
    body: ExternalCostLineUpdateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Edit an external-cost line's metadata (vendor / cost-type / description /
    capex). Existing anchor line → upsert an ``op='edit'`` overlay row; pending
    added line → patch the add row in place."""
    from services.scenario_project_scope.types import LINE_KIND_EXTERNAL

    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    _require_project(db, project_id)
    _require_external_line_key(line_key)
    if body.capex_opex is not None and body.capex_opex not in _CAPEX_OPEX_VALUES:
        raise HTTPException(422, f"capex_opex must be one of {_CAPEX_OPEX_VALUES}")
    if (
        body.cost_type_id is None
        and body.vendor is None
        and body.description is None
        and body.capex_opex is None
    ):
        raise HTTPException(422, "No metadata fields supplied to edit.")
    if body.cost_type_id is not None:
        from models.financial import ExternalCostType
        if db.query(ExternalCostType).filter(
            ExternalCostType.id == body.cost_type_id,
        ).first() is None:
            raise HTTPException(422, f"cost_type_id '{body.cost_type_id}' not found.")

    existing = (
        db.query(ScenarioLineEdit)
        .filter(
            ScenarioLineEdit.scenario_id == scenario_id,
            ScenarioLineEdit.project_id == project_id,
            ScenarioLineEdit.line_key == line_key,
        )
        .first()
    )
    if existing is not None:
        if existing.op == "remove":
            raise HTTPException(
                409,
                "Line is removed in this scenario; revert the removal before "
                "editing.",
            )
        # add or edit row → patch in place (keeps op='add' for pending added lines).
        if body.cost_type_id is not None:
            existing.cost_type_id = body.cost_type_id
            existing.sub_category = body.cost_type_id
        if body.vendor is not None:
            existing.vendor = body.vendor
        if body.description is not None:
            existing.description = body.description
        if body.capex_opex is not None:
            existing.capex_opex = body.capex_opex
    else:
        if not _anchor_external_line_exists(db, project_id, line_key):
            raise HTTPException(404, f"External line {line_key} not found")
        db.add(ScenarioLineEdit(
            scenario_id=scenario_id,
            project_id=project_id,
            line_key=line_key,
            op="edit",
            line_kind=LINE_KIND_EXTERNAL,
            category="external",
            sub_category=body.cost_type_id,
            cost_type_id=body.cost_type_id,
            vendor=body.vendor,
            description=body.description,
            capex_opex=body.capex_opex,
        ))
    return _external_write_response(db, scenario, project_id, line_key)


@router.delete(
    "/{scenario_id}/projects/{project_id}/external-costs/{line_key:path}",
    response_model=ExternalCostWriteResponse,
)
def remove_external_cost_line(
    scenario_id: int,
    project_id: str,
    line_key: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_role("controller", "executive")),
):
    """Remove an external-cost line from the scenario plan. An added line drops its
    overlay row + cell edits entirely; an anchor line gets an ``op='remove'`` row
    (resolution suppresses it) and its cell edits are cleared."""
    scenario = _get_scenario_or_404(db, scenario_id)
    _check_scenario_owner(scenario, user)
    _require_project(db, project_id)
    _require_external_line_key(line_key)

    from services.scenario_project_scope.types import LINE_KIND_EXTERNAL

    existing = (
        db.query(ScenarioLineEdit)
        .filter(
            ScenarioLineEdit.scenario_id == scenario_id,
            ScenarioLineEdit.project_id == project_id,
            ScenarioLineEdit.line_key == line_key,
        )
        .first()
    )

    if line_key.startswith("new:ext:"):
        # Added line: it only exists via its overlay row — drop it cleanly.
        if existing is None:
            raise HTTPException(404, f"External line {line_key} not found")
        db.delete(existing)
    else:
        if existing is not None:
            existing.op = "remove"
        else:
            if not _anchor_external_line_exists(db, project_id, line_key):
                raise HTTPException(404, f"External line {line_key} not found")
            db.add(ScenarioLineEdit(
                scenario_id=scenario_id,
                project_id=project_id,
                line_key=line_key,
                op="remove",
                line_kind=LINE_KIND_EXTERNAL,
                category="external",
            ))

    # Stray cell edits on a removed/dropped line are ignored at resolution, but
    # clear them so the overlay stays clean (mirrors the resolver removed-keys skip).
    db.query(ScenarioForecastCellEdit).filter(
        ScenarioForecastCellEdit.scenario_id == scenario_id,
        ScenarioForecastCellEdit.project_id == project_id,
        ScenarioForecastCellEdit.line_key == line_key,
    ).delete(synchronize_session=False)

    return _external_write_response(db, scenario, project_id, line_key)
