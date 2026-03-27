"""
Generate allocations (person × project × month) and resource requests.

After processing explicit ASSIGNMENTS, performs a gap-filling pass using
PROJECT_STAFFING to ensure every internal forecast line has matching
allocations with correct hours.
"""
import hashlib
from collections import defaultdict

from .config import (
    ASSIGNMENTS, CREATED_AT, PEOPLE, PROJECTS, PROJECT_STAFFING,
    month_range, sql_str,
)

BATCH_SIZE = 100

# Service end default: ongoing services run through 2029-12
SERVICE_END = "2029-12"


def _stable_index(project_id: str, role_type_id: str, people_count: int) -> int:
    """Deterministic starting index for person selection."""
    if people_count == 0:
        return 0
    h = hashlib.md5(f"{project_id}:{role_type_id}".encode()).hexdigest()
    return int(h, 16) % people_count


def generate() -> str:
    parts = []
    parts.append("-- =============================================================================")
    parts.append("-- Allocations & Resource Requests")
    parts.append("-- =============================================================================")

    # --- Phase 1: Explicit ASSIGNMENTS ---
    rows = []
    # Track allocations: (person_id, project_id, month) → hours
    alloc_map: dict[tuple[str, str, str], float] = {}

    for person_id, project_id, base_hours, start, end, overrides in ASSIGNMENTS:
        months = month_range(start, end)
        for mo in months:
            hours = overrides.get(mo, base_hours)
            is_confirmed = 1
            if person_id == "p-fischer" and project_id == "proj-erp2" and "2026-04" <= mo <= "2026-07":
                is_confirmed = 0
            rows.append(
                f"({sql_str(person_id)}, {sql_str(project_id)}, {sql_str(mo)}, {hours}, {is_confirmed})"
            )
            alloc_map[(person_id, project_id, mo)] = hours

    # --- Phase 2: Gap-filling from PROJECT_STAFFING ---
    # Build people-by-role index (only active people with cost centers)
    people_by_role: dict[str, list[dict]] = defaultdict(list)
    for p in PEOPLE:
        if p["cc"] is not None:  # skip personas without CC
            people_by_role[p["role"]].append(p)
    # Sort each role list by ID for deterministic ordering
    for role in people_by_role:
        people_by_role[role].sort(key=lambda x: x["id"])

    # Build project lookup
    project_map = {p["id"]: p for p in PROJECTS}

    # Track which people are already allocated per project per role
    # (project_id, role_type_id) → set of person_ids
    project_role_people: dict[tuple[str, str], set[str]] = defaultdict(set)
    # (role_type_id, project_id, month) → total allocated hours
    role_project_month_hours: dict[tuple[str, str, str], float] = defaultdict(float)

    person_role_map = {p["id"]: p["role"] for p in PEOPLE}
    for (pid, proj_id, mo), hrs in alloc_map.items():
        role = person_role_map.get(pid)
        if role:
            project_role_people[(proj_id, role)].add(pid)
            role_project_month_hours[(role, proj_id, mo)] += hrs

    gap_rows = []
    for proj_id, staffing_list in PROJECT_STAFFING.items():
        proj = project_map.get(proj_id)
        if not proj:
            continue

        # Skip pending_approval projects — they get allocations at runtime when approved
        if proj["status"] == "pending_approval":
            continue

        # Determine month range
        start = proj["start"]
        end = proj["end"] or SERVICE_END
        months = month_range(start, end)

        # Aggregate staffing by role (sum hours across locations)
        role_hours: dict[str, float] = defaultdict(float)
        for entry in staffing_list:
            role_hours[entry["role"]] += entry["hours"]

        # For each role, check each month for gaps
        for role, total_needed in role_hours.items():
            available = people_by_role.get(role, [])
            if not available:
                continue

            # Get people already assigned to this project for this role
            existing_pids = list(project_role_people.get((proj_id, role), set()))

            # Build candidate list: prefer existing, then deterministic pick from pool
            selected_pids = list(existing_pids)
            start_idx = _stable_index(proj_id, role, len(available))
            for i in range(len(available)):
                pid = available[(start_idx + i) % len(available)]["id"]
                if pid not in selected_pids:
                    selected_pids.append(pid)

            for mo in months:
                current_hours = role_project_month_hours.get((role, proj_id, mo), 0)
                gap = total_needed - current_hours
                if gap < 0.5:
                    continue

                remaining = gap
                for pid in selected_pids:
                    if remaining <= 0.5:
                        break
                    # Skip if this person already has an allocation for this project/month
                    if (pid, proj_id, mo) in alloc_map:
                        continue
                    chunk = min(remaining, 160.0)
                    gap_rows.append(
                        f"({sql_str(pid)}, {sql_str(proj_id)}, {sql_str(mo)}, {round(chunk, 2)}, 1)"
                    )
                    # Track so we don't double-allocate within this pass
                    alloc_map[(pid, proj_id, mo)] = chunk
                    project_role_people[(proj_id, role)].add(pid)
                    role_project_month_hours[(role, proj_id, mo)] += chunk
                    remaining -= chunk

    all_rows = rows + gap_rows
    parts.append(f"\n-- Allocations ({len(all_rows)} rows, {len(rows)} explicit + {len(gap_rows)} gap-filled)")
    for i in range(0, len(all_rows), BATCH_SIZE):
        batch = all_rows[i:i + BATCH_SIZE]
        parts.append(
            "INSERT INTO allocations (person_id, project_id, month, hours, is_confirmed) VALUES\n"
            + ",\n".join(batch) + ";"
        )

    # --- Resource Requests ---
    parts.append("\n-- Resource Requests")
    parts.append("""INSERT INTO resource_requests (project_id, cost_center_id, request_type, role_type_id, cost_type_id, hours_or_amount_per_month, period_start, period_end, priority, status, assigned_person_id, adjusted_value, explanation, change_request_id, created_at, modified_at) VALUES
('proj-predmaint', 'cc-bud-apd', 'resource', 'role-sr-dev', NULL, 60, '2026-04', '2027-03', 'high', 'pending', NULL, NULL, 'Production pilot phase requires dedicated Senior Developer from BUD/APD. Current team lacks capacity for the extended scope.', NULL, '2026-02-20 10:00:00', '2026-02-20 10:00:00'),
('proj-erp2', 'cc-muc-apd', 'resource', 'role-sr-dev', NULL, 20, '2026-04', '2026-06', 'high', 'pending', NULL, NULL, 'Additional Sr Dev hours needed for final go-live sprint.', 9, '2026-03-05 09:00:00', '2026-03-05 09:00:00'),
('proj-sensor', 'cc-muc-dda', 'external_cost', NULL, 'ext-cloud', 5000, '2026-04', '2026-12', 'medium', 'pending', NULL, NULL, 'AWS production infrastructure scaling.', 15, '2026-03-08 09:30:00', '2026-03-08 09:30:00');""")

    return "\n".join(parts)
