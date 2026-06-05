"""Per-project scenario anchoring per [B-SL-01..02]
(What-If Simulator E2E Fixes Session 3).

Replaces the single scalar ``Scenario.anchor_forecast_version_id`` with a
``ScenarioProjectAnchor`` association — one row per project a scenario touches,
each pinned to *that project's* latest cycle ``ForecastVersion``. This is the
single home for anchor logic reused by create, the promote / apply stale-guard,
the impact dashboard, and rebase.

Why per-project: the former global guard found "the latest cycle" with
``version_type=='cycle'`` ordered by ``created_at DESC`` then ``.first()``. All
seeded cycle versions share one timestamp, so that tie-break was
non-deterministic (it picked the lowest id), 409-ing apply/promote on every
other project. Here "latest cycle" is resolved per project by **max
``version_number``** — deterministic and correct under tied timestamps.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from models.financial import ForecastVersion
from models.scenarios import (
    Scenario,
    ScenarioProjectAnchor,
    ScenarioAction,
    ScenarioForecastCellEdit,
    ScenarioLineEdit,
    ScenarioMixChange,
    ScenarioPlanEdit,
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class AnchorError(Exception):
    """Anchor-time error (bad rebase target). Router maps to HTTP 400/404."""

    def __init__(self, message: str, *, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class StaleProject:
    """One project whose anchor is behind its own latest cycle."""

    project_id: str
    anchored_version_id: Optional[int]
    anchored_version_number: Optional[int]
    latest_version_id: int
    latest_version_number: int


# ---------------------------------------------------------------------------
# Latest-cycle resolution (deterministic, per project)
# ---------------------------------------------------------------------------

def latest_cycle_version_for_project(
    db: Session, project_id: str,
) -> Optional[ForecastVersion]:
    """The project's most recent ``cycle`` ForecastVersion, or None.

    Ordered by ``version_number`` (sequential per project, unique) so the
    result is deterministic even when seeded cycles share a ``created_at``.
    """
    return (
        db.query(ForecastVersion)
        .filter(
            ForecastVersion.project_id == project_id,
            ForecastVersion.version_type == "cycle",
        )
        .order_by(ForecastVersion.version_number.desc())
        .first()
    )


# ---------------------------------------------------------------------------
# Touched projects
# ---------------------------------------------------------------------------

def touched_project_ids(db: Session, scenario: Scenario) -> set[str]:
    """Distinct project ids this scenario touches.

    Union of project-scoped actions and every overlay edit table — the same
    set the promote / apply write paths iterate.
    """
    pids: set[str] = set()
    # Project-scoped actions (project_id is nullable on ScenarioAction).
    for (pid,) in (
        db.query(ScenarioAction.project_id)
        .filter(
            ScenarioAction.scenario_id == scenario.id,
            ScenarioAction.project_id.isnot(None),
        )
        .distinct()
    ):
        pids.add(pid)
    # Overlay edit tables — all carry a non-null project_id.
    for model in (
        ScenarioForecastCellEdit,
        ScenarioLineEdit,
        ScenarioMixChange,
        ScenarioPlanEdit,
    ):
        for (pid,) in (
            db.query(model.project_id)
            .filter(model.scenario_id == scenario.id)
            .distinct()
        ):
            if pid is not None:
                pids.add(pid)
    return pids


# ---------------------------------------------------------------------------
# Anchoring (pin a project the first time it is touched)
# ---------------------------------------------------------------------------

def ensure_anchors_for_touched(
    db: Session, scenario: Scenario,
) -> list[ScenarioProjectAnchor]:
    """Anchor each touched project that is not yet anchored to its latest cycle.

    Idempotent and additive: pins a project to its then-latest cycle the first
    time the scenario touches it, and **never modifies an existing anchor row**
    — so a rebased or earlier-pinned project keeps its anchor and the stale-guard
    can still detect later cycle drift. Projects with no cycle version yet are
    skipped (no row), preserving no-cycle tolerance. Caller flushes/commits.

    Called at create (clone), at every scenario-mutation chokepoint (alongside
    ``modified_at``), and by the seed builder.
    """
    existing = {a.project_id for a in scenario.project_anchors}
    rows: list[ScenarioProjectAnchor] = []
    for pid in sorted(touched_project_ids(db, scenario)):
        if pid in existing:
            continue
        latest = latest_cycle_version_for_project(db, pid)
        if latest is None:
            continue
        row = ScenarioProjectAnchor(
            project_id=pid,
            forecast_version_id=latest.id,
        )
        # Append to the relationship so the in-memory collection stays
        # consistent for an immediate read in the same transaction.
        scenario.project_anchors.append(row)
        rows.append(row)
    if rows:
        db.flush()
    return rows


# ---------------------------------------------------------------------------
# Per-project stale-guard
# ---------------------------------------------------------------------------

def _active_anchors(db: Session, scenario: Scenario) -> list[ScenarioProjectAnchor]:
    """Anchor rows for projects the scenario *still* touches.

    An anchor row persists after its project stops being touched (the last
    action/edit for it is deleted). Such an orphan must not drive the
    stale-guard, the anchor totals, or the rebase picker — otherwise a later
    cycle for a project the scenario no longer touches would 409 promote/apply
    with no diff to rebase against. All readers go through this filter; orphan
    rows stay inert in the DB and an existing pin is preserved if the project is
    touched again.
    """
    touched = touched_project_ids(db, scenario)
    return [a for a in scenario.project_anchors if a.project_id in touched]


def stale_projects(db: Session, scenario: Scenario) -> list[StaleProject]:
    """Projects whose anchor is behind that project's latest cycle.

    Empty list = all current (or nothing to check). Pure — raises nothing.
    Each *active* anchor row (project still touched) is compared against its
    project's latest cycle by ``version_number``. No-cycle tolerance: a project
    with no cycle version is not evaluated. A dangling anchor (its version row
    gone) is reported stale.
    """
    stale: list[StaleProject] = []
    for anchor in _active_anchors(db, scenario):
        latest = latest_cycle_version_for_project(db, anchor.project_id)
        if latest is None:
            # No cycle for this project (legacy state) — nothing to be behind.
            continue
        anchored = (
            db.query(ForecastVersion)
            .filter(ForecastVersion.id == anchor.forecast_version_id)
            .first()
        )
        if anchored is not None and anchored.id == latest.id:
            continue
        stale.append(
            StaleProject(
                project_id=anchor.project_id,
                anchored_version_id=anchored.id if anchored else None,
                anchored_version_number=(
                    anchored.version_number if anchored else None
                ),
                latest_version_id=latest.id,
                latest_version_number=latest.version_number,
            )
        )
    return stale


def stale_message(stale: list[StaleProject], *, verb: str) -> str:
    """Human message naming the stale project(s) for a 409."""
    names = ", ".join(
        f"{s.project_id} (anchor v{s.anchored_version_number or '—'} → "
        f"latest v{s.latest_version_number})"
        for s in stale
    )
    return (
        f"Scenario anchor is behind the latest cycle for: {names}. "
        f"Rebase {'these projects' if len(stale) > 1 else 'this project'} "
        f"before {verb}."
    )


# ---------------------------------------------------------------------------
# Read helpers for display / impact
# ---------------------------------------------------------------------------

def anchor_version_ids(db: Session, scenario: Scenario) -> dict[str, int]:
    """``{project_id: forecast_version_id}`` for every *touched* anchored project."""
    return {
        a.project_id: a.forecast_version_id
        for a in _active_anchors(db, scenario)
    }


def anchor_total(db: Session, scenario: Scenario) -> Optional[float]:
    """Sum of the anchored versions' grand totals in EUR, or None.

    Replaces the former single-version anchor total: a multi-project scenario's
    anchor baseline is the sum across each project's pinned version. Returns
    None when no anchored version carries a total.
    """
    total = 0.0
    seen = False
    for a in _active_anchors(db, scenario):
        fv = (
            db.query(ForecastVersion)
            .filter(ForecastVersion.id == a.forecast_version_id)
            .first()
        )
        if fv is not None and fv.total_amount_eur is not None:
            total += float(fv.total_amount_eur)
            seen = True
    return total if seen else None


# ---------------------------------------------------------------------------
# Rebase
# ---------------------------------------------------------------------------

def rebase_anchors(
    db: Session, scenario: Scenario, mapping: dict[str, int],
) -> list[ScenarioProjectAnchor]:
    """Re-anchor the given projects to the given cycle versions.

    ``mapping`` is ``{project_id: forecast_version_id}``. Each project must be
    one the scenario touches; each version must exist, be a ``cycle`` version,
    and belong to that project. Records the prior anchor in
    ``rebased_from_version_id``. Upserts (a project touched after its first
    cycle appeared, with no anchor row yet, gets one). Caller commits.
    """
    touched = touched_project_ids(db, scenario)
    existing = {a.project_id: a for a in scenario.project_anchors}
    updated: list[ScenarioProjectAnchor] = []
    for project_id, version_id in mapping.items():
        if project_id not in touched:
            raise AnchorError(
                f"Project {project_id} is not part of this scenario.",
            )
        fv = (
            db.query(ForecastVersion)
            .filter(ForecastVersion.id == version_id)
            .first()
        )
        if fv is None:
            raise AnchorError(
                f"Forecast version {version_id} not found", status_code=404,
            )
        if fv.project_id != project_id:
            raise AnchorError(
                f"Forecast version {version_id} does not belong to project "
                f"{project_id}.",
            )
        if fv.version_type != "cycle":
            raise AnchorError(
                f"Forecast version {version_id} is not a cycle version.",
            )
        row = existing.get(project_id)
        if row is None:
            row = ScenarioProjectAnchor(
                project_id=project_id,
                forecast_version_id=fv.id,
            )
            scenario.project_anchors.append(row)
        elif row.forecast_version_id != fv.id:
            row.rebased_from_version_id = row.forecast_version_id
            row.forecast_version_id = fv.id
        else:
            # No-op: target equals the current anchor — don't write a spurious
            # self-rebase audit entry.
            continue
        updated.append(row)
    db.flush()
    return updated
