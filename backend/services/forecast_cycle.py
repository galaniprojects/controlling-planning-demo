"""Forecast cycle state machine — in-memory 5-phase wizard."""
from __future__ import annotations
from dataclasses import dataclass, field
from uuid import uuid4


@dataclass
class ForecastCycleState:
    cycle_id: str
    project_id: str
    phase: int = 1
    retrospective_data: list = field(default_factory=list)
    suggestions: list = field(default_factory=list)
    working_changes: list = field(default_factory=list)
    applied_suggestion_ids: list = field(default_factory=list)
    review_groups: list = field(default_factory=list)


_active_cycles: dict[str, ForecastCycleState] = {}


def start_cycle(project_id: str) -> ForecastCycleState:
    cycle = ForecastCycleState(
        cycle_id=uuid4().hex[:8],
        project_id=project_id,
        phase=1,
    )
    _active_cycles[project_id] = cycle
    return cycle


def get_active_cycle(project_id: str) -> ForecastCycleState | None:
    return _active_cycles.get(project_id)


def get_cycle_by_id(project_id: str, cycle_id: str) -> ForecastCycleState | None:
    cycle = _active_cycles.get(project_id)
    if cycle and cycle.cycle_id == cycle_id:
        return cycle
    return None


def clear_cycle(project_id: str) -> None:
    _active_cycles.pop(project_id, None)


def clear_all_cycles() -> None:
    _active_cycles.clear()
