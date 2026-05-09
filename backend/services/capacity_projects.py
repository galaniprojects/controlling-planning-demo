"""Group-by-project view aggregation for the Capacity Module Redesign (v5.2).

Powers ``GET /api/capacity/projects`` (consumed by the workspace timeline when
the group-by control is set to "Project" — spec §10). The endpoint returns one
row per visible project with three child collections:

  * assigned_people     — one entry per person allocated to the project
  * unfulfilled_slots   — one entry per resource-type RR with status
                          'pending' or 'partially_fulfilled'
  * external_costs      — one entry per external-cost-type RR

Per spec §10.12 the **scope** filters which PROJECTS appear, NOT which people
within a project. A project is visible if at least one allocation OR one
resource request involving the scoped people/CCs touches it. Once a project
is visible, all its allocated people are returned regardless of their CC.

Per spec §10.9 projects are sorted by fulfillment percentage ascending
(least-staffed first), with project name alphabetical as the tiebreaker.

The reference maximum for fulfillment-bar scaling (spec §10.3) is the highest
total-requested-hours single month across all visible projects. The frontend
uses this to scale bar widths comparably across projects.

Authorization: Controller / Executive / CC Owner (PL is blocked at the route
level). CC Owner queries are not server-restricted — the scope param dictates
which projects appear, and CC Owners default to ``cost_center:<their cc>`` on
the frontend.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Optional

from sqlalchemy.orm import Session

from config import DEMO_DATE
from models.capacity import Allocation, ResourceRequest, ResourceRequestAssignment
from models.financial import ExternalCostType
from models.organization import CostCenter
from models.people import Person, RoleType
from models.projects import Project
from services.calculations import (
    add_months, generate_month_range, get_standard_hours,
)
from services.capacity_dashboard import (
    _parse_scope, _scoped_person_ids,
)
from services.portfolio_service import (
    _get_projects_for_entity_recursive, get_project_entity_info,
    get_top_level_entity_type_id,
)


# ---------------------------------------------------------------------------
# Window defaults — match the dashboard so the project view and the role view
# show the same time slice on first load.
# ---------------------------------------------------------------------------

DEFAULT_WINDOW_MONTHS = 18


def _default_window() -> tuple[str, str]:
    """Return (start, end) defaulting to DEMO_DATE for 18 months forward."""
    start = DEMO_DATE[:7]
    end = add_months(start, DEFAULT_WINDOW_MONTHS - 1)
    return start, end


# ---------------------------------------------------------------------------
# Scope: which projects are visible
# ---------------------------------------------------------------------------


def _visible_project_ids(db: Session, scope: str) -> list[str]:
    """Resolve the visible-project set per spec §10.12.

    A project is visible if at least one allocation OR one resource request
    involving the scoped people/CCs touches it.

    For ``scope='all'`` returns the full project list.

    P1 #4 fix (defensive): the hierarchy branch is now consistent with
    cost_center / location branches — it unions hierarchy-membership
    projects with allocation-derived projects. Pre-fix the branch returned
    only membership-assigned projects (which can include rows with zero
    RRs or allocations in the visible window), creating asymmetric
    behaviour vs. the other scope kinds. Spec §10.12 reads "Show only
    projects assigned to that hierarchy node"; the union remains a
    superset of the strict reading.
    """
    kind, sid = _parse_scope(scope)

    if kind == "all":
        rows = db.query(Project.id).all()
        return [r[0] for r in rows]

    project_ids: set[str] = set()

    if kind == "hierarchy" and sid:
        # Membership-assigned projects (the strict spec reading).
        for pid in _get_projects_for_entity_recursive(db, sid):
            project_ids.add(pid)

    if kind == "cost_center" and sid:
        # Projects whose RRs target this CC (the CC Owner's natural feed).
        for r in (
            db.query(ResourceRequest.project_id)
            .filter(ResourceRequest.cost_center_id == sid)
            .distinct().all()
        ):
            if r[0]:
                project_ids.add(r[0])

    # Projects allocated to scoped people (works for location / cost_center
    # / hierarchy). For hierarchy this surfaces projects whose hierarchy-
    # scoped people are also allocated cross-node — an intentional
    # superset of the strict membership reading.
    person_ids = _scoped_person_ids(db, scope)
    if person_ids:
        for r in (
            db.query(Allocation.project_id)
            .filter(Allocation.person_id.in_(person_ids))
            .distinct().all()
        ):
            if r[0]:
                project_ids.add(r[0])

    return list(project_ids)


# ---------------------------------------------------------------------------
# Fulfillment math (spec §10.3)
# ---------------------------------------------------------------------------


def _request_monthly_demand(rr: ResourceRequest, months: list[str]) -> dict[str, float]:
    """Per-month requested hours for a single resource request, restricted
    to the visible window. External-cost RRs return an empty dict (they
    don't contribute to fulfillment math).
    """
    if rr.request_type != "resource":
        return {}
    per_month = float(rr.hours_or_amount_per_month or 0)
    rng = generate_month_range(rr.period_start, rr.period_end)
    visible_set = set(months)
    return {m: per_month for m in rng if m in visible_set}


# ---------------------------------------------------------------------------
# Main aggregation
# ---------------------------------------------------------------------------


def compute_capacity_projects(
    db: Session,
    *,
    scope: str = "all",
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> dict:
    """Return the project-view aggregation for the capacity workspace.

    See module docstring for the response shape and rules.

    v5.2 W6 Track A — the legacy ``filter_chip`` server-side parameter
    has been removed. Filter-chip semantics live entirely in the
    frontend now (``frontend/src/modules/capacity/timeline/projectFilters.ts``)
    where they double-duty as the chip-count source. The dead server-side
    code path was never wired into the React layer post-W5.
    """
    # --- Window ---
    if not start or not end:
        ds, de = _default_window()
        start = start or ds
        end = end or de
    months = generate_month_range(start, end)
    if not months:
        return {
            "items": [], "total": 0, "scope": scope,
            "start": start, "end": end, "reference_max_hours": 0.0,
        }

    # --- Scope → candidate project IDs ---
    proj_ids = _visible_project_ids(db, scope)
    if not proj_ids:
        return {
            "items": [], "total": 0, "scope": scope,
            "start": start, "end": end, "reference_max_hours": 0.0,
        }

    # --- Bulk fetches (avoid N+1) ---
    projects = {
        p.id: p
        for p in db.query(Project).filter(Project.id.in_(proj_ids)).all()
    }

    # All resource requests for these projects (no status filter — even
    # confirmed RRs contribute to the project-row demand bar in the
    # visible window via their assignments).
    all_rrs = (
        db.query(ResourceRequest)
        .filter(ResourceRequest.project_id.in_(proj_ids))
        .all()
    )
    rr_ids = [r.id for r in all_rrs]

    # All assignments for those RRs.
    rra_rows = (
        db.query(ResourceRequestAssignment)
        .filter(ResourceRequestAssignment.resource_request_id.in_(rr_ids))
        .all()
    ) if rr_ids else []

    # Per-RR per-month assigned hours.
    assigned_by_rr_month: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for row in rra_rows:
        assigned_by_rr_month[row.resource_request_id][row.month] += float(row.hours)

    # All allocations for these projects in window — for assigned-person rows.
    alloc_rows = (
        db.query(Allocation)
        .filter(
            Allocation.project_id.in_(proj_ids),
            Allocation.month >= start,
            Allocation.month <= end,
        )
        .all()
    )

    # Person × Month total hours (across ALL projects in window) for the
    # background-utilization layer in §10.4.
    person_ids_in_play: set[str] = {a.person_id for a in alloc_rows if a.person_id}
    total_hours_by_person_month: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    if person_ids_in_play:
        for row in (
            db.query(Allocation)
            .filter(
                Allocation.person_id.in_(person_ids_in_play),
                Allocation.month >= start,
                Allocation.month <= end,
            )
            .all()
        ):
            total_hours_by_person_month[row.person_id][row.month] += float(row.hours or 0)

    # Joined names (people, roles, CCs, cost types). Load PLs into the
    # `people` map BEFORE building `role_ids` / `cc_ids` (P1 #7 fix —
    # previously PLs were folded in after role_ids was queried, so a
    # future change rendering "PL role" in the response would silently
    # miss those role lookups; the ordering was fragile).
    people = {
        p.id: p
        for p in db.query(Person).filter(Person.id.in_(person_ids_in_play)).all()
    } if person_ids_in_play else {}

    pl_ids = {p.pl_person_id for p in projects.values() if p.pl_person_id}
    if pl_ids:
        for pp in db.query(Person).filter(Person.id.in_(pl_ids)).all():
            people[pp.id] = pp

    role_ids = {r.role_type_id for r in all_rrs if r.role_type_id}
    role_ids.update({p.role_type_id for p in people.values() if p.role_type_id})
    role_names = {
        rt.id: rt.name
        for rt in db.query(RoleType).filter(RoleType.id.in_(role_ids)).all()
    } if role_ids else {}

    cc_ids = {r.cost_center_id for r in all_rrs}
    cc_ids.update({p.cost_center_id for p in people.values() if p.cost_center_id})
    ccs = {
        c.id: c
        for c in db.query(CostCenter).filter(CostCenter.id.in_(cc_ids)).all()
    } if cc_ids else {}

    cost_type_ids = {r.cost_type_id for r in all_rrs if r.cost_type_id}
    cost_types = {
        ct.id: ct
        for ct in db.query(ExternalCostType).filter(ExternalCostType.id.in_(cost_type_ids)).all()
    } if cost_type_ids else {}

    # Hierarchy node names — top-level (LoB) by default.
    top_type = get_top_level_entity_type_id(db)

    # Standard hours per month (for utilization %).
    std_hours = get_standard_hours(db)

    # --- Pre-compute per-RR monthly demand once (v5.2 W6 Track C polish) ---
    # `_request_monthly_demand` was previously called four times per
    # resource RR — once for project-level demand, once for the status
    # count, once for the fulfillment-pct loop, and once for the slot
    # rendering. Hoisting the call out of the per-project loop and
    # caching by rr.id eliminates the redundant work; on a 100-project /
    # 36-month window it cuts ~75% of the calls in this hot path.
    demand_by_rr: dict[int, dict[str, float]] = {
        rr.id: _request_monthly_demand(rr, months)
        for rr in all_rrs
        if rr.request_type == "resource"
    }

    # --- Build items ---
    items: list[dict] = []
    reference_max = 0.0

    for proj_id in proj_ids:
        project = projects.get(proj_id)
        if project is None:
            continue

        proj_rrs = [r for r in all_rrs if r.project_id == proj_id]

        # --- Per-month project demand and fulfillment ---
        project_requested = {m: 0.0 for m in months}
        project_assigned = {m: 0.0 for m in months}

        for rr in proj_rrs:
            if rr.request_type != "resource":
                continue
            demand = demand_by_rr.get(rr.id, {})
            for m, h in demand.items():
                project_requested[m] += h
            for m in months:
                project_assigned[m] += assigned_by_rr_month[rr.id].get(m, 0.0)

        # --- Status badge math: fully-assigned RRs over total resource RRs ---
        resource_rrs = [r for r in proj_rrs if r.request_type == "resource"]
        fully_assigned_count = 0
        total_request_count = len(resource_rrs)
        for rr in resource_rrs:
            demand = demand_by_rr.get(rr.id, {})
            if not demand:
                continue
            fully = True
            for m, requested in demand.items():
                if assigned_by_rr_month[rr.id].get(m, 0.0) + 1e-6 < requested:
                    fully = False
                    break
            if fully:
                fully_assigned_count += 1

        # Fulfillment percentage for sorting (per §10.9):
        # share of request-months that are fully assigned across all resource RRs in window.
        total_months = 0
        fully_months = 0
        for rr in resource_rrs:
            demand = demand_by_rr.get(rr.id, {})
            for m, requested in demand.items():
                total_months += 1
                if assigned_by_rr_month[rr.id].get(m, 0.0) + 1e-6 >= requested:
                    fully_months += 1
        fulfillment_pct = (100.0 * fully_months / total_months) if total_months else 100.0

        # --- Project group monthly_demand entries (for fulfillment bar) ---
        monthly_demand = [
            {
                "month": m,
                "requested_hours": round(project_requested[m], 2),
                "assigned_hours": round(min(project_assigned[m], project_requested[m]), 2),
            }
            for m in months
        ]
        # Track the global reference max across visible projects.
        for m in months:
            if project_requested[m] > reference_max:
                reference_max = project_requested[m]

        # --- Assigned person rows (§10.4) ---
        person_proj_hours: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for a in alloc_rows:
            if a.project_id != proj_id or not a.person_id:
                continue
            person_proj_hours[a.person_id][a.month] += float(a.hours or 0)

        assigned_people = []
        for pid in sorted(
            person_proj_hours.keys(),
            key=lambda pp: -sum(person_proj_hours[pp].values()),
        ):
            person = people.get(pid)
            if person is None:
                continue
            monthly = []
            for m in months:
                this_hours = person_proj_hours[pid].get(m, 0.0)
                total_hours = total_hours_by_person_month.get(pid, {}).get(m, 0.0)
                util_pct = (100.0 * total_hours / std_hours) if std_hours else 0.0
                monthly.append({
                    "month": m,
                    "this_project_hours": round(this_hours, 2),
                    "total_hours_all_projects": round(total_hours, 2),
                    "total_utilization_pct": round(util_pct, 1),
                })
            assigned_people.append({
                "person_id": pid,
                "person_name": person.name,
                "role_type_id": person.role_type_id,
                "role_name": role_names.get(person.role_type_id) if person.role_type_id else None,
                "cost_center_id": person.cost_center_id,
                "cost_center_name": ccs.get(person.cost_center_id).name if person.cost_center_id and ccs.get(person.cost_center_id) else None,
                "monthly": monthly,
            })

        # --- Unfulfilled slot rows (§10.5) ---
        unfulfilled_slots = []
        for rr in resource_rrs:
            if rr.status not in ("pending", "partially_fulfilled"):
                continue
            demand = demand_by_rr.get(rr.id, {})
            if not demand:
                continue
            slot_monthly = []
            for m in sorted(demand.keys()):
                requested = demand[m]
                assigned = assigned_by_rr_month[rr.id].get(m, 0.0)
                slot_monthly.append({
                    "month": m,
                    "requested_hours": round(requested, 2),
                    "assigned_hours": round(min(assigned, requested), 2),
                })
            cc = ccs.get(rr.cost_center_id)
            unfulfilled_slots.append({
                "request_id": rr.id,
                "role_type_id": rr.role_type_id,
                "role_name": role_names.get(rr.role_type_id) if rr.role_type_id else None,
                "status": rr.status,
                "period_start": rr.period_start,
                "period_end": rr.period_end,
                "cc_id": rr.cost_center_id,
                "cc_name": cc.name if cc else None,
                "priority": rr.priority,
                "change_request_id": rr.change_request_id,
                "monthly": slot_monthly,
            })
        # Sort by period_start asc per §10.2.
        unfulfilled_slots.sort(key=lambda s: s["period_start"])

        # --- External cost rows (§10.6) ---
        external_costs = []
        for rr in proj_rrs:
            if rr.request_type != "external_cost":
                continue
            ct = cost_types.get(rr.cost_type_id) if rr.cost_type_id else None
            cc = ccs.get(rr.cost_center_id)
            external_costs.append({
                "request_id": rr.id,
                "description": rr.explanation,
                "cost_type_id": rr.cost_type_id,
                "cost_type_label": ct.name if ct else None,
                "period_start": rr.period_start,
                "period_end": rr.period_end,
                "status": rr.status,
                "cc_id": rr.cost_center_id,
                "cc_name": cc.name if cc else None,
            })

        # --- Project metadata ---
        entity_info = get_project_entity_info(db, project.id, top_type)
        pl = people.get(project.pl_person_id) if project.pl_person_id else None

        items.append({
            "project_id": project.id,
            "project_name": project.name,
            "project_status": project.status,
            "hierarchy_node_id": entity_info["id"] if entity_info else None,
            "hierarchy_node_name": entity_info["name"] if entity_info else None,
            "pl_person_id": pl.id if pl else None,
            "pl_name": pl.name if pl else None,
            "fully_assigned_request_count": fully_assigned_count,
            "total_request_count": total_request_count,
            "fulfillment_pct": round(fulfillment_pct, 1),
            "monthly_demand": monthly_demand,
            "assigned_people": assigned_people,
            "unfulfilled_slots": unfulfilled_slots,
            "external_costs": external_costs,
        })

    # --- Sort: fulfillment % asc, project name asc (§10.9) ---
    items.sort(key=lambda it: (it["fulfillment_pct"], it["project_name"].lower()))

    return {
        "items": items,
        "total": len(items),
        "scope": scope,
        "start": start,
        "end": end,
        "reference_max_hours": round(reference_max, 2),
    }
