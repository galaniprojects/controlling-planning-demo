"""Capacity dashboard aggregations.

Powers the executive/controller dashboard layer of the Capacity Module
Redesign (v5.2): forecast time series, headcount breakdown, and hotspot
ranking. Read by ``routers/capacity.py`` from three GET endpoints under
``/api/capacity/dashboard/*``.

Spec references:
- §11.10 (dashboard endpoint contract)
- §11.6 (three-category hotspot severity formula)
- §5.2 (KPI computations — reused for hotspot inputs)

Reuses ``services/calculations.compute_utilization_pct()`` for utilization
math; do not reimplement.

This file is a stub created in v5.2 W1 lead pre-work. Implementation lives
under Teammate B (fastapi-developer) per the wave plan.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session


def compute_dashboard_forecast(
    db: Session,
    *,
    scope: str,
    start: str,
    end: str,
) -> dict:
    """Monthly available / allocated / incoming-demand hours per scope.

    Returns the time-series payload backing GET /api/capacity/dashboard/forecast.
    """
    raise NotImplementedError("v5.2 W1 Teammate B: implement per spec §11.10")


def compute_headcount_breakdown(
    db: Session,
    *,
    scope: str,
    dimension: str,
) -> dict:
    """Headcount split by dimension (location | hierarchy | role | cost_center).

    Backs GET /api/capacity/dashboard/headcount-breakdown.
    """
    raise NotImplementedError("v5.2 W1 Teammate B: implement per spec §11.10")


def compute_hotspots(
    db: Session,
    *,
    scope: str,
    limit: int = 5,
) -> list[dict]:
    """Top-N capacity issues ranked by three-category severity.

    Categories per spec §11.6: over-allocation, chronic under-utilization,
    unfulfilled demand. Returns ranked list with severity icon + summary.
    """
    raise NotImplementedError("v5.2 W1 Teammate B: implement per spec §11.6 / §11.10")
