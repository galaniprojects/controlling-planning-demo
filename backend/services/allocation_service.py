"""Auto-allocation service: ensures allocations exist for all internal forecast roles."""
from __future__ import annotations

import hashlib
from collections import defaultdict

from sqlalchemy.orm import Session

from models.capacity import Allocation
from models.financial import Forecast
from models.people import Person


def _stable_index(project_id: str, role_type_id: str, people_count: int) -> int:
    """Deterministic starting index for person selection, based on project + role."""
    if people_count == 0:
        return 0
    h = hashlib.md5(f"{project_id}:{role_type_id}".encode()).hexdigest()
    return int(h, 16) % people_count


def ensure_project_allocations(project_id: str, db: Session) -> int:
    """
    Auto-generate allocation rows from forecast data for a project.

    For each internal forecast line (grouped by role_type_id and month),
    ensures allocations exist with hours summing to the forecast total.
    Respects existing allocations (only fills gaps).

    Returns the number of allocation rows created.
    """
    # 1. Get all internal forecast rows, group by (role, month) → total hours
    forecasts = (
        db.query(Forecast)
        .filter(Forecast.project_id == project_id, Forecast.category == "internal")
        .all()
    )
    role_month_hours: dict[tuple[str, str], float] = defaultdict(float)
    for f in forecasts:
        if f.hours and float(f.hours) > 0:
            role_month_hours[(f.sub_category, f.month)] += float(f.hours)

    if not role_month_hours:
        return 0

    # 2. Get existing allocations, map to roles via person.role_type_id
    existing = (
        db.query(Allocation)
        .filter(Allocation.project_id == project_id)
        .all()
    )
    # Build: (role_type_id, month) → total allocated hours
    existing_hours: dict[tuple[str, str], float] = defaultdict(float)
    person_cache: dict[str, Person] = {}
    for a in existing:
        if a.person_id not in person_cache:
            person_cache[a.person_id] = db.query(Person).filter(Person.id == a.person_id).first()
        p = person_cache[a.person_id]
        if p:
            existing_hours[(p.role_type_id, a.month)] += float(a.hours)

    # 3. Get all active people grouped by role
    all_people = (
        db.query(Person)
        .filter(Person.is_active.is_(True), Person.cost_center_id.isnot(None))
        .order_by(Person.id)
        .all()
    )
    people_by_role: dict[str, list[Person]] = defaultdict(list)
    for p in all_people:
        people_by_role[p.role_type_id].append(p)

    # 4. Determine which people are already allocated to this project (for reuse)
    project_people_by_role: dict[str, list[str]] = defaultdict(list)
    for a in existing:
        p = person_cache.get(a.person_id)
        if p and a.person_id not in project_people_by_role[p.role_type_id]:
            project_people_by_role[p.role_type_id].append(a.person_id)

    # 5. For each (role, month), fill the gap
    created = 0
    # Group by role first for consistent person selection
    roles_needed: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for (role, month), needed_hours in role_month_hours.items():
        current = existing_hours.get((role, month), 0)
        gap = needed_hours - current
        if gap > 0.5:  # Ignore tiny rounding gaps
            roles_needed[role].append((month, gap))

    for role, month_gaps in roles_needed.items():
        available = people_by_role.get(role, [])
        if not available:
            continue

        # Prefer people already allocated to this project for this role
        existing_pids = project_people_by_role.get(role, [])
        # Select people: prefer existing, then pick deterministically from pool
        selected_pids = list(existing_pids)
        start_idx = _stable_index(project_id, role, len(available))
        for i in range(len(available)):
            pid = available[(start_idx + i) % len(available)].id
            if pid not in selected_pids:
                selected_pids.append(pid)

        for month, gap_hours in month_gaps:
            remaining = gap_hours
            for pid in selected_pids:
                if remaining <= 0.5:
                    break
                chunk = min(remaining, 160.0)
                # Check if this person already has an allocation for this project/month
                existing_alloc = (
                    db.query(Allocation)
                    .filter(
                        Allocation.person_id == pid,
                        Allocation.project_id == project_id,
                        Allocation.month == month,
                    )
                    .first()
                )
                if existing_alloc:
                    # Person already allocated, skip
                    continue
                db.add(Allocation(
                    person_id=pid,
                    project_id=project_id,
                    month=month,
                    hours=round(chunk, 2),
                    is_confirmed=True,
                ))
                remaining -= chunk
                created += 1

    return created
