"""Direct overlay-diff routing + the two write paths (spec §6). **Stream C.**

Feeds the project-scope overlay diff DIRECTLY through the existing routing
decision (``scenario_promote.decide_routing``) — no synthetic-action round-trip.
Each Layer-2 overlay entry becomes a ``RoutableDiff`` and is individually
routable / promotable, so partial promote is preserved. Also de-stubs the two
write paths:

  - **promote ``direct_forecast_update``** — currently a no-op stub in
    ``scenario_promote.apply_routing``; becomes a real writer of live Forecast
    (and external-cost) rows for the own-project forecast_grid diffs.
  - **apply-to-forecast** — currently flags cells ``is_provisional=True`` WITHOUT
    values in ``scenario_apply_forecast``; becomes a materialiser that writes the
    resolved values into the next cycle as provisional cells.

Stream C implements every function here, then wires ``scenario_promote.py`` and
``scenario_apply_forecast.py`` to call them. The eligibility *widening* and
stale-anchor guard for apply-to-forecast are Session 4 — only the write
*capability* lands in Session 1. Stream C owns the accompanying tests and can
build against fixture overlays.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from models.financial import Forecast
from models.scenarios import (
    Scenario,
    ScenarioForecastCellEdit,
    ScenarioLineEdit,
    ScenarioMixChange,
    ScenarioPlanEdit,
)
from services.scenario_project_scope.rates import effective_hourly_rate
from services.scenario_project_scope.types import (
    ResolvedGrid,
    RoutableDiff,
    ROUTABLE_KIND_CELL,
    ROUTABLE_KIND_LINE,
    ROUTABLE_KIND_MIX,
    ROUTABLE_KIND_PLAN,
)


# Plan-edit targets that route through the existing DoI gate check.
_PIPELINE_PLAN_TARGETS = ("stage", "doi")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_line_key(line_key: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Split a natural composite ``"category|sub_category|role_type_id"`` into
    its parts. Empty trailing segments (e.g. external lines omit role_type_id)
    resolve to ``None``. Minted line_keys ("new:role:..." / "new:ext:...") are
    NOT natural composites — callers detect those via ``line_key.startswith``
    and read metadata off the companion ``ScenarioLineEdit`` instead.
    """
    parts = line_key.split("|")
    category = parts[0] if parts and parts[0] else None
    sub_category = parts[1] if len(parts) > 1 and parts[1] else None
    role_type_id = parts[2] if len(parts) > 2 and parts[2] else None
    return category, sub_category, role_type_id


def _find_forecast_cell(
    db: Session, project_id: str, month: str, category: Optional[str],
    sub_category: Optional[str], role_type_id: Optional[str],
) -> Optional[Forecast]:
    """Locate a live Forecast row by its cell key
    ``(project_id, month, category, sub_category, role_type_id)``. Handles a
    NULL ``role_type_id`` explicitly (legacy internal lines carry the role in
    ``sub_category`` with a NULL ``role_type_id`` column).
    """
    q = db.query(Forecast).filter(
        Forecast.project_id == project_id,
        Forecast.month == month,
        Forecast.category == category,
        Forecast.sub_category == sub_category,
    )
    if role_type_id:
        q = q.filter(Forecast.role_type_id == role_type_id)
    else:
        q = q.filter(Forecast.role_type_id.is_(None))
    return q.first()


# ---------------------------------------------------------------------------
# Overlay → RoutableDiff classification
# ---------------------------------------------------------------------------

def collect_overlay_diffs(
    db: Session,
    scenario: Scenario,
    *,
    controller_user_id: Optional[str] = None,
) -> list[RoutableDiff]:
    """Read a scenario's Layer-2 overlay rows (cell / line / mix / plan edits) and
    present them as ``RoutableDiff``s, one per entry, classified by
    ``lever_category`` (cell/line on a forecast line → forecast_grid; mix →
    people; plan stage/DoI → pipeline_stage; plan dates/milestones → milestone).
    When ``controller_user_id`` is given, resolve ``own`` (project.pl_person_id
    vs the controller) so forecast_grid diffs split direct-update vs
    change-request. Each overlay entry is individually routable, so partial
    promote is preserved.
    """
    diffs: list[RoutableDiff] = []

    # Resolve each project's PL once for the own/other split.
    own_cache: dict[str, Optional[bool]] = {}

    def _resolve_own(project_id: Optional[str]) -> Optional[bool]:
        if controller_user_id is None or not project_id:
            return None
        if project_id not in own_cache:
            from models.projects import Project
            proj = db.query(Project).filter(Project.id == project_id).first()
            pl_id = proj.pl_person_id if proj else None
            # No PL on the project → treat as own (controller-managed).
            own_cache[project_id] = (pl_id is None) or (pl_id == controller_user_id)
        return own_cache[project_id]

    # Layer-2 cell edits → forecast_grid.
    cells = (
        db.query(ScenarioForecastCellEdit)
        .filter(ScenarioForecastCellEdit.scenario_id == scenario.id)
        .order_by(ScenarioForecastCellEdit.id)
        .all()
    )
    for c in cells:
        diffs.append(RoutableDiff(
            lever_category="forecast_grid",
            project_id=c.project_id,
            scope="project",
            kind=ROUTABLE_KIND_CELL,
            line_key=c.line_key,
            month=c.month,
            field=c.field,
            own=_resolve_own(c.project_id),
            ref=f"cell:{c.id}",
        ))

    # Layer-2 line edits (add/remove) → forecast_grid.
    lines = (
        db.query(ScenarioLineEdit)
        .filter(ScenarioLineEdit.scenario_id == scenario.id)
        .order_by(ScenarioLineEdit.id)
        .all()
    )
    for ln in lines:
        diffs.append(RoutableDiff(
            lever_category="forecast_grid",
            project_id=ln.project_id,
            scope="project",
            kind=ROUTABLE_KIND_LINE,
            line_key=ln.line_key,
            month=None,
            field=ln.op,
            own=_resolve_own(ln.project_id),
            ref=f"line:{ln.id}",
        ))

    # Layer-2 mix changes → people (routes people_action_item at promote).
    mixes = (
        db.query(ScenarioMixChange)
        .filter(ScenarioMixChange.scenario_id == scenario.id)
        .order_by(ScenarioMixChange.id)
        .all()
    )
    for mx in mixes:
        diffs.append(RoutableDiff(
            lever_category="people",
            project_id=mx.project_id,
            scope="project",
            kind=ROUTABLE_KIND_MIX,
            line_key=None,
            month=mx.effective_from,
            field=None,
            own=_resolve_own(mx.project_id),
            ref=f"mix:{mx.id}",
        ))

    # Layer-2 plan edits → pipeline_stage (stage/DoI) or milestone (dates/ms).
    plans = (
        db.query(ScenarioPlanEdit)
        .filter(ScenarioPlanEdit.scenario_id == scenario.id)
        .order_by(ScenarioPlanEdit.id)
        .all()
    )
    for pl in plans:
        lever = (
            "pipeline_stage" if pl.target in _PIPELINE_PLAN_TARGETS else "milestone"
        )
        diffs.append(RoutableDiff(
            lever_category=lever,
            project_id=pl.project_id,
            scope="project",
            kind=ROUTABLE_KIND_PLAN,
            line_key=None,
            month=None,
            field=pl.target,
            own=_resolve_own(pl.project_id),
            ref=f"plan:{pl.id}",
        ))

    return diffs


# ---------------------------------------------------------------------------
# Write path 1 — promote direct_forecast_update
# ---------------------------------------------------------------------------

def write_forecast_cells(
    db: Session,
    scenario: Scenario,
    diffs: list[RoutableDiff],
    *,
    acting_user_id: str,
) -> int:
    """Promote's ``direct_forecast_update`` writer: apply the own-project
    forecast_grid overlay diffs to live Forecast (and external-cost) rows —
    upsert by ``(project_id, month, category, sub_category, role_type_id)``,
    insert minted lines, suppress removed lines. Returns the number of rows
    written (cells upserted + line rows removed). Replaces the demo stub in
    ``scenario_promote.apply_routing``.

    €-coherence: an internal cell edit carries ``field='hours'``; writing it
    keeps ``Forecast.amount_eur`` coherent by recomputing € via the effective
    role rate. External cell edits carry ``field='amount_eur'`` and are written
    verbatim (hours stays NULL).
    """
    written = 0

    # Only own-project forecast_grid diffs are direct-updatable. Other-PL diffs
    # (own is False) route through change_request, not here.
    routable = [
        d for d in diffs
        if d.lever_category == "forecast_grid" and d.own is not False
    ]

    # Removals first, so a remove-then-readd on the same key resolves cleanly.
    for d in (x for x in routable if x.kind == ROUTABLE_KIND_LINE):
        le = (
            db.query(ScenarioLineEdit)
            .filter(
                ScenarioLineEdit.scenario_id == scenario.id,
                ScenarioLineEdit.project_id == d.project_id,
                ScenarioLineEdit.line_key == d.line_key,
            )
            .first()
        )
        if le is None or le.op != "remove":
            # 'add' line rows carry no values themselves — their cells are
            # written via the cell diffs below.
            continue
        category, sub_category, role_type_id = _parse_line_key(le.line_key)
        rows = db.query(Forecast).filter(
            Forecast.project_id == d.project_id,
            Forecast.category == category,
            Forecast.sub_category == sub_category,
        )
        if role_type_id:
            rows = rows.filter(Forecast.role_type_id == role_type_id)
        else:
            rows = rows.filter(Forecast.role_type_id.is_(None))
        for r in rows.all():
            db.delete(r)
            written += 1

    # Cell upserts.
    for d in (x for x in routable if x.kind == ROUTABLE_KIND_CELL):
        ce = (
            db.query(ScenarioForecastCellEdit)
            .filter(
                ScenarioForecastCellEdit.scenario_id == scenario.id,
                ScenarioForecastCellEdit.project_id == d.project_id,
                ScenarioForecastCellEdit.line_key == d.line_key,
                ScenarioForecastCellEdit.month == d.month,
                ScenarioForecastCellEdit.field == d.field,
            )
            .first()
        )
        if ce is None:
            continue

        minted = ce.line_key.startswith("new:")
        vendor = capex_opex = description = None
        if minted:
            le = (
                db.query(ScenarioLineEdit)
                .filter(
                    ScenarioLineEdit.scenario_id == scenario.id,
                    ScenarioLineEdit.project_id == ce.project_id,
                    ScenarioLineEdit.line_key == ce.line_key,
                )
                .first()
            )
            if le is None:
                # Minted cell without its companion line row — cannot place it.
                continue
            category = le.category
            sub_category = le.sub_category
            role_type_id = le.role_type_id
            vendor = le.vendor
            capex_opex = le.capex_opex
            description = le.description
        else:
            category, sub_category, role_type_id = _parse_line_key(ce.line_key)

        value = float(ce.value) if ce.value is not None else 0.0

        row = _find_forecast_cell(
            db, ce.project_id, ce.month, category, sub_category, role_type_id,
        )
        if row is None:
            row = Forecast(
                project_id=ce.project_id,
                month=ce.month,
                category=category,
                sub_category=sub_category,
                role_type_id=role_type_id,
                amount_eur=0.0,
                vendor=vendor,
                capex_opex=capex_opex,
                description=description,
            )
            db.add(row)

        if ce.field == "hours":
            row.hours = value
            rate = effective_hourly_rate(db, role_type_id or sub_category)
            row.amount_eur = round(value * rate, 2)
        else:  # amount_eur
            row.amount_eur = value

        written += 1

    db.flush()
    return written


# ---------------------------------------------------------------------------
# Write path 2 — apply-to-forecast materialiser
# ---------------------------------------------------------------------------

def _write_grid_cells(db: Session, grid: ResolvedGrid, *, provisional: bool) -> int:
    """Upsert a resolved grid's cells into live Forecast rows. Shared by promote
    (``provisional=False`` — commit the scenario plan to live) and
    apply-to-forecast (``provisional=True`` — carry into the next cycle as
    provisional). Upserts each (line, month) cell by
    ``(project_id, month, category, sub_category, role_type_id)``: internal lines
    write hours + €, external lines write € (hours stays NULL); existing rows are
    updated in place, absent cells inserted. Returns the number of cells written.
    """
    written = 0
    project_id = grid.project_id
    for line in grid.lines:
        category = line.category
        sub_category = line.sub_category
        role_type_id = line.role_type_id
        for month, cell in line.cells.items():
            row = _find_forecast_cell(
                db, project_id, month, category, sub_category, role_type_id,
            )
            if row is None:
                row = Forecast(
                    project_id=project_id,
                    month=month,
                    category=category,
                    sub_category=sub_category,
                    role_type_id=role_type_id,
                    amount_eur=0.0,
                    vendor=line.vendor,
                )
                db.add(row)
            row.amount_eur = round(float(cell.amount_eur), 2)
            if cell.hours is not None:
                row.hours = float(cell.hours)
            if provisional:
                row.is_provisional = True
            written += 1
    return written


def write_grid_replacing_project(db: Session, grid: ResolvedGrid) -> int:
    """Promote writer for a project whose plan was reshaped (e.g. a macro curve
    shift): make live Forecast equal the resolved grid. Deletes the project's
    live cells that the grid no longer contains — the months a delay/accelerate
    vacated, and lines an overlay removed — then upserts the resolved cells
    (``provisional=False``). Without the delete, a shift would double-count
    (pre-shift months left populated alongside the shifted ones).

    The resolved grid is built from ALL the project's live Forecast rows (anchor),
    so unshifted cells (incl. past months) are present in the grid and preserved;
    only genuinely-vacated cells are removed.
    """
    grid_keys = {
        (line.category, line.sub_category, line.role_type_id, month)
        for line in grid.lines
        for month in line.cells
    }
    for row in db.query(Forecast).filter(Forecast.project_id == grid.project_id).all():
        if (row.category, row.sub_category, row.role_type_id, row.month) not in grid_keys:
            db.delete(row)
    written = _write_grid_cells(db, grid, provisional=False)
    db.flush()
    return written


def materialize_provisional_cells(
    db: Session,
    scenario: Scenario,
    grids: list[ResolvedGrid],
) -> int:
    """Apply-to-forecast writer: materialise resolved values into the next cycle
    as provisional Forecast cells (``is_provisional=True``) WITH values —
    replacing the flag-only behaviour. Returns the number of cells written.
    """
    written = sum(_write_grid_cells(db, grid, provisional=True) for grid in grids)
    db.flush()
    return written
