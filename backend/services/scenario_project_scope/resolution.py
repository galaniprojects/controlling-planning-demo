"""Project-scope recompute core — resolution (spec §5, §6). **Stream A.**

Resolves a scenario's plan for one project in the fixed order
``anchor → apply macros in order → overlay hand edits on top`` (spec §5.1),
with absolute-month keying (§5.2) and hand-edits-win precedence, into a
``ResolvedGrid`` (per role line / per external-cost line, per month: internal
hours / external €).

**Anchor cell source = LIVE Forecast rows**, keyed by
``(project_id, month, category, sub_category, role_type_id)`` — the only true
per-month source, the only one carrying hours, and the same keyspace the write
paths target. ``Scenario.anchor_forecast_version_id`` stays the pinned scalar
reference + stale-anchor guard; it is not the per-cell source.

Stream A implements every function here and owns the accompanying tests.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from models.financial import Forecast
from models.projects import Project
from models.scenarios import (
    Scenario,
    ScenarioAction,
    ScenarioForecastCellEdit,
    ScenarioLineEdit,
    PROJECT_MACRO_ACTION_TYPES,
)
from services.scenario_project_scope.macros import (
    apply_macros,
    current_open_forecast_month,
)
from services.scenario_project_scope.rates import effective_hourly_rate
from services.scenario_project_scope.types import (
    LINE_KIND_EXTERNAL,
    LINE_KIND_INTERNAL,
    ResolvedCell,
    ResolvedGrid,
    ResolvedLine,
)


def _natural_line_key(category: str, sub_category, role_type_id) -> str:
    """Natural composite line key "category|sub_category|role_type_id".

    Matches the live Forecast cell key and the overlay's ``line_key`` for existing
    lines. External lines carry no role, so the third component is empty
    ("external|<sub>|"); internal lines carry the role id when present
    ("internal|<sub>|<role>").
    """
    return f"{category}|{sub_category or ''}|{role_type_id or ''}"


def _kind_for(category: str) -> str:
    return LINE_KIND_INTERNAL if category == "internal" else LINE_KIND_EXTERNAL


def read_anchor_grid(db: Session, project_id: str) -> ResolvedGrid:
    """Read the project's live Forecast rows into the baseline (pre-macro,
    pre-overlay) ``ResolvedGrid``. Internal rows carry hours + €; external rows
    carry €. ``line_key`` = natural composite "category|sub_category|role_type_id".
    """
    rows = (
        db.query(Forecast)
        .filter(Forecast.project_id == project_id)
        .all()
    )

    lines_by_key: dict[str, ResolvedLine] = {}
    for row in rows:
        category = row.category
        kind = _kind_for(category)
        key = _natural_line_key(category, row.sub_category, row.role_type_id)

        line = lines_by_key.get(key)
        if line is None:
            line = ResolvedLine(
                line_key=key,
                category=category,
                kind=kind,
                sub_category=row.sub_category,
                role_type_id=row.role_type_id,
                vendor=row.vendor,
            )
            lines_by_key[key] = line
        elif line.vendor is None and row.vendor is not None:
            line.vendor = row.vendor

        amount = float(row.amount_eur) if row.amount_eur is not None else 0.0
        hours = None
        if category == "internal" and row.hours is not None:
            hours = float(row.hours)

        cell = line.cells.get(row.month)
        if cell is None:
            line.cells[row.month] = ResolvedCell(amount_eur=amount, hours=hours)
        else:
            # Defensive accumulation — the keyspace is unique per row, but never
            # silently drop a duplicate.
            cell.amount_eur += amount
            if hours is not None:
                cell.hours = (cell.hours or 0.0) + hours

    project = db.query(Project).filter(Project.id == project_id).first()
    all_months = sorted(m for line in lines_by_key.values() for m in line.cells)

    if project and project.start_month:
        start_month = project.start_month
    else:
        start_month = all_months[0] if all_months else None

    if project and project.end_month:
        end_month = project.end_month
    else:
        end_month = all_months[-1] if all_months else None

    return ResolvedGrid(
        project_id=project_id,
        lines=list(lines_by_key.values()),
        start_month=start_month,
        end_month=end_month,
    )


def _line_from_key(line_key: str) -> ResolvedLine:
    """Best-effort synthesis of a line from a bare ``line_key`` for a cell edit
    that references a line without a companion ``ScenarioLineEdit`` add row.
    Handles both minted ids and the natural composite.
    """
    if line_key.startswith("new:role:"):
        return ResolvedLine(line_key=line_key, category="internal", kind=LINE_KIND_INTERNAL)
    if line_key.startswith("new:ext:"):
        return ResolvedLine(line_key=line_key, category="external", kind=LINE_KIND_EXTERNAL)
    parts = line_key.split("|")
    category = parts[0] if parts and parts[0] else "internal"
    sub_category = parts[1] if len(parts) > 1 and parts[1] else None
    role_type_id = parts[2] if len(parts) > 2 and parts[2] else None
    return ResolvedLine(
        line_key=line_key,
        category=category,
        kind=_kind_for(category),
        sub_category=sub_category,
        role_type_id=role_type_id,
    )


def _apply_overlay(db: Session, grid: ResolvedGrid, scenario_id: int, project_id: str) -> None:
    """Apply the Layer-2 hand-edit overlay on top of the (post-macro) grid in
    place (spec §5). Line add/remove first, then per-cell edits — hand-edits-win,
    absolute-month keyed.
    """
    lines_by_key = {line.line_key: line for line in grid.lines}
    removed_keys: set[str] = set()

    line_edits = (
        db.query(ScenarioLineEdit)
        .filter(
            ScenarioLineEdit.scenario_id == scenario_id,
            ScenarioLineEdit.project_id == project_id,
        )
        .all()
    )
    for edit in line_edits:
        if edit.op == "add":
            if edit.line_key not in lines_by_key:
                category = edit.category
                if not category:
                    category = "internal" if edit.line_kind == LINE_KIND_INTERNAL else "external"
                new_line = ResolvedLine(
                    line_key=edit.line_key,
                    category=category,
                    kind=edit.line_kind or _kind_for(category),
                    sub_category=edit.sub_category,
                    role_type_id=edit.role_type_id,
                    vendor=edit.vendor,
                )
                grid.lines.append(new_line)
                lines_by_key[edit.line_key] = new_line
        elif edit.op == "remove":
            if edit.line_key in lines_by_key:
                grid.lines = [l for l in grid.lines if l.line_key != edit.line_key]
                del lines_by_key[edit.line_key]
            removed_keys.add(edit.line_key)

    cell_edits = (
        db.query(ScenarioForecastCellEdit)
        .filter(
            ScenarioForecastCellEdit.scenario_id == scenario_id,
            ScenarioForecastCellEdit.project_id == project_id,
        )
        .all()
    )
    for edit in cell_edits:
        if edit.line_key in removed_keys:
            continue  # the line was removed in this scenario; ignore stray cell edits
        line = lines_by_key.get(edit.line_key)
        if line is None:
            line = _line_from_key(edit.line_key)
            grid.lines.append(line)
            lines_by_key[edit.line_key] = line

        cell = line.cells.get(edit.month)
        if cell is None:
            cell = ResolvedCell(amount_eur=0.0, hours=None)
            line.cells[edit.month] = cell

        value = float(edit.value) if edit.value is not None else None
        if edit.field == "hours":
            # Keep € coherent with the promote writer (routing.write_forecast_cells):
            # an hours edit recomputes amount_eur via the same effective rate, so
            # the rollup/dashboard and the promoted live forecast agree (blocker
            # fix). Rate keys on role_type_id, falling back to sub_category for
            # legacy internal lines that carry the role there.
            cell.hours = value
            rate = effective_hourly_rate(db, line.role_type_id or line.sub_category)
            cell.amount_eur = round((value or 0.0) * rate, 2)
        elif edit.field == "amount_eur":
            cell.amount_eur = value if value is not None else 0.0


def resolve_project_grid(db: Session, scenario: Scenario, project_id: str) -> ResolvedGrid:
    """Resolve ``anchor → macros → overlay`` into the per-line/per-month grid for
    one project (spec §5.1, §6). Macros (Layer 1) re-derive against the rebased
    anchor; the Layer-2 overlay is applied last (hand-edits-win), keyed to
    absolute months. Returns the fully-resolved (adjusted) grid.

    Note: macro notes (e.g. the accelerate clamp message) are surfaced by calling
    ``macros.apply_macros`` directly at the recalculate/promote layer; this
    function returns only the resolved grid per the frozen contract.
    """
    grid = read_anchor_grid(db, project_id)

    macros = (
        db.query(ScenarioAction)
        .filter(
            ScenarioAction.scenario_id == scenario.id,
            ScenarioAction.scope == "project",
            ScenarioAction.project_id == project_id,
            ScenarioAction.action_type.in_(PROJECT_MACRO_ACTION_TYPES),
        )
        .order_by(ScenarioAction.action_order)
        .all()
    )

    open_month = current_open_forecast_month()
    grid = apply_macros(grid, macros, current_open_month=open_month).grid

    _apply_overlay(db, grid, scenario.id, project_id)
    return grid
