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

Scope semantics (used by all three dashboard aggregations):

The ``scope`` parameter is a string identifier:
  * ``"all"`` (default) — every active person and project.
  * ``"location:<id>"`` — restrict to people whose CC is at that location.
  * ``"hierarchy:<id>"`` — restrict to projects under the hierarchy node
    (recursive descent via ``_get_projects_for_entity_recursive``) and
    people allocated to those projects.
  * ``"cost_center:<id>"`` — restrict to one CC. Note: per §11.7 the
    dashboard hides entirely on the frontend when scoped to a single CC,
    but the backend still serves data for completeness and API testing.

Empty scope returns empty lists (not 404). Invalid scope strings raise
``ValueError`` so the route can map to a 400.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from config import DEMO_DATE
from models.capacity import Allocation, ResourceRequest
from models.organization import (
    CostCenter, GroupingEntity, Location, ProjectGroupingAssignment,
)
from models.people import Person, RoleType
from models.projects import Project
from services.calculations import (
    add_months, compute_utilization_pct, generate_month_range, get_standard_hours,
)
from services.portfolio_service import (
    _get_projects_for_entity_recursive, get_top_level_entity_type_id,
)


# ---------------------------------------------------------------------------
# Scope helpers
# ---------------------------------------------------------------------------


def _parse_scope(scope: str) -> tuple[str, Optional[str]]:
    """Split a scope string like 'location:loc-muc' into (kind, id).

    Returns ('all', None) for the default/empty case. Raises ValueError on
    an unrecognised prefix so the caller can return 400.
    """
    if not scope or scope == "all":
        return "all", None
    if ":" not in scope:
        raise ValueError(f"Invalid scope '{scope}'. Expected 'all' or '<kind>:<id>'.")
    kind, _, sid = scope.partition(":")
    if kind not in ("location", "hierarchy", "cost_center"):
        raise ValueError(
            f"Invalid scope kind '{kind}'. Allowed: location | hierarchy | cost_center."
        )
    return kind, sid


def _scoped_person_ids(db: Session, scope: str) -> list[str]:
    """Return active person IDs in the given scope."""
    kind, sid = _parse_scope(scope)
    q = db.query(Person.id).filter(Person.is_active.is_(True), Person.cost_center_id.isnot(None))
    if kind == "location" and sid:
        q = q.join(CostCenter, Person.cost_center_id == CostCenter.id).filter(
            CostCenter.location_id == sid
        )
    elif kind == "cost_center" and sid:
        q = q.filter(Person.cost_center_id == sid)
    elif kind == "hierarchy" and sid:
        proj_ids = _get_projects_for_entity_recursive(db, sid)
        if not proj_ids:
            return []
        # People allocated to those projects (inclusive of any month).
        person_ids = (
            db.query(Allocation.person_id)
            .filter(Allocation.project_id.in_(proj_ids))
            .distinct()
            .all()
        )
        return [r[0] for r in person_ids if r[0]]
    return [r[0] for r in q.all()]


def _scoped_project_ids(db: Session, scope: str) -> Optional[list[str]]:
    """Return project IDs in the given scope, or None for 'all' (no filter)."""
    kind, sid = _parse_scope(scope)
    if kind == "all":
        return None
    if kind == "hierarchy" and sid:
        return _get_projects_for_entity_recursive(db, sid)
    if kind == "location" and sid:
        # Projects whose PL or any allocated person is at this location are
        # too loose for the dashboard. We instead use "projects with at
        # least one allocated person at this location". This keeps the
        # demand series consistent with the people series.
        person_ids = _scoped_person_ids(db, scope)
        if not person_ids:
            return []
        rows = (
            db.query(Allocation.project_id)
            .filter(Allocation.person_id.in_(person_ids))
            .distinct()
            .all()
        )
        return [r[0] for r in rows if r[0]]
    if kind == "cost_center" and sid:
        # Projects with resource requests against this CC, or projects with
        # any allocation by a person on this CC.
        person_ids = _scoped_person_ids(db, scope)
        proj_ids: set[str] = set()
        if person_ids:
            for r in (
                db.query(Allocation.project_id)
                .filter(Allocation.person_id.in_(person_ids))
                .distinct()
                .all()
            ):
                if r[0]:
                    proj_ids.add(r[0])
        for r in (
            db.query(ResourceRequest.project_id)
            .filter(ResourceRequest.cost_center_id == sid)
            .distinct()
            .all()
        ):
            if r[0]:
                proj_ids.add(r[0])
        return list(proj_ids)
    return None


# ---------------------------------------------------------------------------
# Card 2: Capacity forecast (§11.4 / §11.10)
# ---------------------------------------------------------------------------


def compute_dashboard_forecast(
    db: Session,
    *,
    scope: str = "all",
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> dict:
    """Monthly available / allocated / incoming-demand hours per scope.

    Returns the time-series payload backing GET /api/capacity/dashboard/forecast.
    """
    if not start:
        start = DEMO_DATE
    if not end:
        end = add_months(start, 11)
    if end < start:
        raise ValueError("end must be >= start")
    months = generate_month_range(start, end)

    person_ids = _scoped_person_ids(db, scope)
    proj_ids = _scoped_project_ids(db, scope)
    kind, sid = _parse_scope(scope)

    # --- Allocated hours per month ---
    allocated_per_month: dict[str, float] = {m: 0.0 for m in months}
    if person_ids:
        rows = (
            db.query(Allocation.month, func.coalesce(func.sum(Allocation.hours), 0))
            .filter(
                Allocation.person_id.in_(person_ids),
                Allocation.month >= start,
                Allocation.month <= end,
            )
            .group_by(Allocation.month)
            .all()
        )
        for month, total in rows:
            allocated_per_month[month] = float(total or 0)

    # --- Available hours per month (headcount × per-location standard hours) ---
    # We compute per-person available based on each person's CC location so
    # mixed-location scopes don't average incorrectly.
    available_per_month: dict[str, float] = {m: 0.0 for m in months}
    if person_ids:
        # Pre-fetch each person's location.
        loc_rows = (
            db.query(Person.id, CostCenter.location_id)
            .join(CostCenter, Person.cost_center_id == CostCenter.id)
            .filter(Person.id.in_(person_ids))
            .all()
        )
        std_cache: dict[Optional[str], float] = {}
        total_std_hours = 0.0
        for _pid, loc_id in loc_rows:
            if loc_id not in std_cache:
                std_cache[loc_id] = get_standard_hours(db, loc_id)
            total_std_hours += std_cache[loc_id]
        for m in months:
            available_per_month[m] = round(total_std_hours, 1)

    # --- Demand hours per month: pending/partial resource requests ---
    demand_per_month: dict[str, float] = {m: 0.0 for m in months}
    demand_q = db.query(ResourceRequest).filter(
        ResourceRequest.request_type == "resource",
        ResourceRequest.status.in_(("pending", "partially_fulfilled")),
    )
    if kind == "cost_center" and sid:
        demand_q = demand_q.filter(ResourceRequest.cost_center_id == sid)
    elif kind == "location" and sid:
        # Filter to CCs at this location.
        cc_ids = [r[0] for r in db.query(CostCenter.id).filter(CostCenter.location_id == sid).all()]
        if cc_ids:
            demand_q = demand_q.filter(ResourceRequest.cost_center_id.in_(cc_ids))
        else:
            demand_q = demand_q.filter(False)  # noqa: E712
    elif kind == "hierarchy" and sid:
        if proj_ids:
            demand_q = demand_q.filter(ResourceRequest.project_id.in_(proj_ids))
        else:
            demand_q = demand_q.filter(False)  # noqa: E712

    for r in demand_q.all():
        per_month_hours = float(r.hours_or_amount_per_month or 0)
        for m in generate_month_range(r.period_start, r.period_end):
            if start <= m <= end:
                demand_per_month[m] = demand_per_month.get(m, 0.0) + per_month_hours

    items = [
        {
            "month": m,
            "available_hours": round(available_per_month[m], 1),
            "allocated_hours": round(allocated_per_month[m], 1),
            "demand_hours": round(demand_per_month[m], 1),
        }
        for m in months
    ]
    return {
        "items": items,
        "total": len(items),
        "scope": scope or "all",
        "start": start,
        "end": end,
    }


# ---------------------------------------------------------------------------
# Card 3: Headcount breakdown (§11.5 / §11.10)
# ---------------------------------------------------------------------------


def _avg_utilization_for(db: Session, person_ids: list[str], months: list[str]) -> float:
    """Mean of compute_utilization_pct across (person × month) cells.

    Hours are summed per (person, month) before computing percentage so a
    person with 2× 80h rows shows up as 100% rather than 50% twice. Uses
    160h FTE base (compute_utilization_pct).
    """
    if not person_ids or not months:
        return 0.0
    rows = (
        db.query(Allocation.person_id, Allocation.month, func.coalesce(func.sum(Allocation.hours), 0))
        .filter(
            Allocation.person_id.in_(person_ids),
            Allocation.month.in_(months),
        )
        .group_by(Allocation.person_id, Allocation.month)
        .all()
    )
    cells: dict[tuple[str, str], float] = {(pid, m): float(h or 0) for pid, m, h in rows}
    pct_sum = 0.0
    cell_count = 0
    for pid in person_ids:
        for m in months:
            pct_sum += compute_utilization_pct(cells.get((pid, m), 0.0))
            cell_count += 1
    return round(pct_sum / cell_count, 1) if cell_count else 0.0


def compute_headcount_breakdown(
    db: Session,
    *,
    scope: str = "all",
    dimension: str = "location",
) -> dict:
    """Headcount split by dimension (location | hierarchy | role | cost_center).

    Backs GET /api/capacity/dashboard/headcount-breakdown.
    """
    if dimension not in ("location", "hierarchy", "role", "cost_center"):
        raise ValueError(
            f"Invalid dimension '{dimension}'. Allowed: location|hierarchy|role|cost_center."
        )

    scoped_person_ids = _scoped_person_ids(db, scope)
    if not scoped_person_ids:
        return {"items": [], "total": 0, "dimension": dimension, "scope": scope or "all"}

    # Visible window for utilization averaging — match the timeline default
    # (current month + next 11). Per §11.7 the dashboard recomputes when the
    # scope changes; the time window stays the same.
    months = generate_month_range(DEMO_DATE, add_months(DEMO_DATE, 11))

    segments: list[dict] = []

    if dimension == "location":
        loc_rows = (
            db.query(Location.id, Location.city)
            .filter(Location.is_active.is_(True))
            .order_by(Location.city)
            .all()
        )
        for loc_id, city in loc_rows:
            pids = [
                r[0]
                for r in db.query(Person.id)
                .join(CostCenter, Person.cost_center_id == CostCenter.id)
                .filter(
                    Person.id.in_(scoped_person_ids),
                    CostCenter.location_id == loc_id,
                )
                .all()
            ]
            if not pids:
                continue
            segments.append({
                "label": city,
                "count": len(pids),
                "avg_utilization_pct": _avg_utilization_for(db, pids, months),
                "segment_id": loc_id,
            })

    elif dimension == "role":
        role_rows = (
            db.query(RoleType.id, RoleType.name).order_by(RoleType.name).all()
        )
        for role_id, name in role_rows:
            pids = [
                r[0]
                for r in db.query(Person.id)
                .filter(Person.id.in_(scoped_person_ids), Person.role_type_id == role_id)
                .all()
            ]
            if not pids:
                continue
            segments.append({
                "label": name,
                "count": len(pids),
                "avg_utilization_pct": _avg_utilization_for(db, pids, months),
                "segment_id": role_id,
            })

    elif dimension == "cost_center":
        cc_rows = (
            db.query(CostCenter.id, CostCenter.name)
            .filter(CostCenter.is_active.is_(True))
            .order_by(CostCenter.name)
            .all()
        )
        for cc_id, name in cc_rows:
            pids = [
                r[0]
                for r in db.query(Person.id)
                .filter(Person.id.in_(scoped_person_ids), Person.cost_center_id == cc_id)
                .all()
            ]
            if not pids:
                continue
            segments.append({
                "label": name,
                "count": len(pids),
                "avg_utilization_pct": _avg_utilization_for(db, pids, months),
                "segment_id": cc_id,
            })

    else:  # hierarchy
        top_type = get_top_level_entity_type_id(db)
        if not top_type:
            return {"items": [], "total": 0, "dimension": dimension, "scope": scope or "all"}
        top_entities = (
            db.query(GroupingEntity)
            .filter(
                GroupingEntity.entity_type_id == top_type,
                GroupingEntity.is_active.is_(True),
            )
            .order_by(GroupingEntity.name)
            .all()
        )
        for ent in top_entities:
            proj_ids = _get_projects_for_entity_recursive(db, ent.id)
            if not proj_ids:
                continue
            # People allocated to projects under this hierarchy node, intersected
            # with the scope's person set.
            pid_rows = (
                db.query(Allocation.person_id)
                .filter(
                    Allocation.project_id.in_(proj_ids),
                    Allocation.person_id.in_(scoped_person_ids),
                )
                .distinct()
                .all()
            )
            pids = [r[0] for r in pid_rows if r[0]]
            if not pids:
                continue
            segments.append({
                "label": ent.name,
                "count": len(pids),
                "avg_utilization_pct": _avg_utilization_for(db, pids, months),
                "segment_id": ent.id,
            })

    return {
        "items": segments,
        "total": len(segments),
        "dimension": dimension,
        "scope": scope or "all",
    }


# ---------------------------------------------------------------------------
# Card 4: Hotspot list (§11.6 / §11.10)
# ---------------------------------------------------------------------------


def compute_hotspots(
    db: Session,
    *,
    scope: str = "all",
    limit: int = 5,
) -> list[dict]:
    """Top-N capacity issues ranked by three-category severity.

    Categories per spec §11.6: over-allocation, chronic under-utilization,
    unfulfilled demand. Returns ranked list with severity icon + summary.
    """
    if limit < 1:
        limit = 5
    person_ids = _scoped_person_ids(db, scope)
    months = generate_month_range(DEMO_DATE, add_months(DEMO_DATE, 11))
    if not months:
        return []

    issues: list[dict] = []

    # ---------- Per-person utilization map ----------
    util_map: dict[str, dict[str, float]] = defaultdict(lambda: {m: 0.0 for m in months})
    if person_ids:
        rows = (
            db.query(Allocation.person_id, Allocation.month, func.coalesce(func.sum(Allocation.hours), 0))
            .filter(
                Allocation.person_id.in_(person_ids),
                Allocation.month.in_(months),
            )
            .group_by(Allocation.person_id, Allocation.month)
            .all()
        )
        for pid, m, h in rows:
            util_map[pid][m] = compute_utilization_pct(float(h or 0))

    # ---------- Pre-fetch person + role names + per-person location for summary text ----------
    people: dict[str, Person] = {}
    if person_ids:
        for p in db.query(Person).filter(Person.id.in_(person_ids)).all():
            people[p.id] = p
    role_names = {r.id: r.name for r in db.query(RoleType).all()}
    # Single CC→location lookup so the chronic-under-util loop below
    # doesn't issue one query per person.
    person_to_location: dict[str, Optional[str]] = {}
    if people:
        cc_ids = {p.cost_center_id for p in people.values() if p.cost_center_id}
        if cc_ids:
            cc_loc = dict(
                db.query(CostCenter.id, CostCenter.location_id)
                .filter(CostCenter.id.in_(cc_ids))
                .all()
            )
            for pid, p in people.items():
                person_to_location[pid] = cc_loc.get(p.cost_center_id) if p.cost_center_id else None

    def _short(person_name: str) -> str:
        # "Felix Keller" -> "F. Keller" per §11.6 example summary text.
        parts = person_name.split()
        if len(parts) < 2:
            return person_name
        return f"{parts[0][0]}. {' '.join(parts[1:])}"

    # ---------- Category 1: Over-allocation ----------
    for pid, by_month in util_map.items():
        over_months = [m for m, pct in by_month.items() if pct > 100]
        if not over_months:
            continue
        peak = max(by_month.values())
        affected = len(over_months)
        avg_over = sum(by_month[m] for m in over_months) / affected
        severity = 3 * (peak - 100) * affected
        person = people.get(pid)
        if not person:
            continue
        first_m = over_months[0]
        last_m = over_months[-1]
        if first_m == last_m:
            window = first_m
        else:
            window = f"{first_m}–{last_m}"
        summary = (
            f"{_short(person.name)} over-allocated {window} "
            f"({avg_over:.0f}% avg, peak {peak:.0f}%)"
        )
        issues.append({
            "category": "over_allocation",
            "severity": round(severity, 2),
            "summary": summary,
            "target_id": pid,
            "target_type": "person",
        })

    # ---------- Category 2: Unfulfilled demand ----------
    # Pending resource requests with assignment shortfall. Severity weight =
    # 2 × unassigned_hours_total. We aggregate by (role_type_id) so the row
    # text reads naturally per the spec example.
    proj_ids = _scoped_project_ids(db, scope)
    kind, sid = _parse_scope(scope)
    pending_q = (
        db.query(ResourceRequest)
        .filter(
            ResourceRequest.request_type == "resource",
            ResourceRequest.status == "pending",
        )
    )
    if kind == "cost_center" and sid:
        pending_q = pending_q.filter(ResourceRequest.cost_center_id == sid)
    elif kind == "location" and sid:
        cc_ids = [r[0] for r in db.query(CostCenter.id).filter(CostCenter.location_id == sid).all()]
        pending_q = pending_q.filter(ResourceRequest.cost_center_id.in_(cc_ids)) if cc_ids else pending_q.filter(False)  # noqa: E712
    elif kind == "hierarchy" and sid:
        pending_q = pending_q.filter(ResourceRequest.project_id.in_(proj_ids)) if proj_ids else pending_q.filter(False)  # noqa: E712

    pending_requests = pending_q.all()

    # Group by role to build a "QA Engineer — 3 open requests, 480h unassigned across 2 projects" line.
    role_groups: dict[str, dict] = defaultdict(lambda: {
        "count": 0, "unassigned_hours": 0.0, "project_ids": set(),
    })
    role_request_ids: dict[str, list[int]] = defaultdict(list)
    for r in pending_requests:
        if not r.role_type_id:
            continue
        request_months = generate_month_range(r.period_start, r.period_end)
        # We treat all months of a pending request as "unassigned" for severity
        # purposes because pending requests have not yet been confirmed.
        unassigned_hours = float(r.hours_or_amount_per_month or 0) * len(request_months)
        rg = role_groups[r.role_type_id]
        rg["count"] += 1
        rg["unassigned_hours"] += unassigned_hours
        rg["project_ids"].add(r.project_id)
        role_request_ids[r.role_type_id].append(r.id)

    for role_id, rg in role_groups.items():
        severity = 2 * rg["unassigned_hours"]
        role_label = role_names.get(role_id, role_id)
        summary = (
            f"{role_label} — {rg['count']} open request"
            f"{'s' if rg['count'] != 1 else ''}, "
            f"{rg['unassigned_hours']:.0f}h unassigned across "
            f"{len(rg['project_ids'])} project"
            f"{'s' if len(rg['project_ids']) != 1 else ''}"
        )
        issues.append({
            "category": "unfulfilled_demand",
            "severity": round(severity, 2),
            "summary": summary,
            "target_id": role_id,
            "target_type": "role",
        })

    # ---------- Category 3: Chronic under-utilization ----------
    # Person whose avg utilization < 10% across the longest run of consecutive
    # months ≥ 6 (spec §11.6). Single pass: track current run + best run + start.
    for pid, by_month in util_map.items():
        person = people.get(pid)
        if not person:
            continue
        cur = 0
        best_run = 0
        best_start = 0
        for i, m in enumerate(months):
            if by_month[m] < 10:
                cur += 1
                if cur > best_run:
                    best_run = cur
                    best_start = i - cur + 1
            else:
                cur = 0
        if best_run < 6:
            continue
        run_months = months[best_start:best_start + best_run]
        run_avg = sum(by_month[m] for m in run_months) / best_run
        if run_avg >= 10:
            continue
        # Severity = 1 × idle_months × standard_hours_per_month
        std_h = get_standard_hours(db, person_to_location.get(pid))
        severity = best_run * std_h
        role_label = role_names.get(person.role_type_id, person.role_type_id)
        summary = (
            f"{_short(person.name)} ({role_label}) — "
            f"{run_avg:.0f}% utilized for {best_run} months"
        )
        issues.append({
            "category": "under_utilization",
            "severity": round(severity, 2),
            "summary": summary,
            "target_id": pid,
            "target_type": "person",
        })

    issues.sort(key=lambda x: x["severity"], reverse=True)
    return issues[:limit]
