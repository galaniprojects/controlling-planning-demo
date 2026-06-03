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
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role, user_has_tier3
from models.projects import Project
from models.scenarios import (
    Scenario, ScenarioAction, ScenarioCapacityImpact,
    ScenarioForecastCellEdit, ScenarioState, OVERLAY_CELL_FIELDS,
)
from schemas.common import CurrentUser
from schemas.scenarios import (
    CellEditRequest,
    ScenarioGridCell, ScenarioGridColumn, ScenarioGridResponse,
    ScenarioGridRow, ScenarioGridWriteResponse,
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


# --- T1: plan — dates / milestones / stage / DoI (ScenarioPlanEdit) ----------
#     PUT/DELETE /{scenario_id}/projects/{project_id}/plan
#     date targets shift the resolved window in resolution._apply_overlay


# --- T1: Tier-3 mix control (ScenarioMixChange) ------------------------------
#     PUT/DELETE /{scenario_id}/projects/{project_id}/mix
#     gate writes on user_has_tier3; the FE renders the control null otherwise


# --- T2: external-cost line items — add / remove / edit ----------------------
#     POST   /{scenario_id}/projects/{project_id}/external-costs
#     PUT    /{scenario_id}/projects/{project_id}/external-costs/{line_key}
#     DELETE /{scenario_id}/projects/{project_id}/external-costs/{line_key}
#     (description, vendor, category editable; line item is the unit, §3 item 5)
