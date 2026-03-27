"""
Generate allocations (person x project x month) and resource requests.

All allocations are derived from PROJECT_STAFFING (the same source that
generates forecast rows), ensuring allocation hours always match forecast.
FORECAST_ADJUSTMENTS are applied so adjusted months also match.
ASSIGNMENT_OVERRIDES provide narrative-specific exceptions (over-allocation, etc.).
"""
import hashlib
from collections import defaultdict

from .config import (
    ASSIGNMENT_OVERRIDES, CREATED_AT, FORECAST_ADJUSTMENTS,
    PEOPLE, PROJECTS, PROJECT_STAFFING, month_range, sql_str,
)

BATCH_SIZE = 100
SERVICE_END = "2029-12"


def _stable_index(project_id: str, role_type_id: str, people_count: int) -> int:
    """Deterministic starting index for person selection."""
    if people_count == 0:
        return 0
    h = hashlib.md5(f"{project_id}:{role_type_id}".encode()).hexdigest()
    return int(h, 16) % people_count


def _get_adjusted_hours(project_id: str, role: str, loc: str, month: str, base_hours: float) -> float:
    """Apply FORECAST_ADJUSTMENTS to get the actual forecast hours for a role/loc/month."""
    adj = FORECAST_ADJUSTMENTS.get(project_id, {}).get("internal", [])
    for a in adj:
        if a["role"] == role and a["loc"] == loc and month >= a["from"]:
            return a["hours"]
    return base_hours


def generate() -> str:
    parts = []
    parts.append("-- =============================================================================")
    parts.append("-- Allocations & Resource Requests")
    parts.append("-- =============================================================================")

    # Build people-by-role index (only active people with cost centers)
    people_by_role: dict[str, list[dict]] = defaultdict(list)
    for p in PEOPLE:
        if p["cc"] is not None:
            people_by_role[p["role"]].append(p)
    for role in people_by_role:
        people_by_role[role].sort(key=lambda x: x["id"])

    person_role_map = {p["id"]: p["role"] for p in PEOPLE}
    project_map = {p["id"]: p for p in PROJECTS}

    # Track all allocations: (person_id, project_id, month) -> (hours, is_confirmed)
    alloc_map: dict[tuple[str, str, str], tuple[float, int]] = {}

    for proj_id, staffing_list in PROJECT_STAFFING.items():
        proj = project_map.get(proj_id)
        if not proj:
            continue
        # Skip pending_approval — allocations created at runtime when approved
        if proj["status"] == "pending_approval":
            continue

        start = proj["start"]
        end = proj["end"] or SERVICE_END
        months = month_range(start, end)

        # Aggregate staffing by role (sum hours across locations per month)
        # We need per-month totals because FORECAST_ADJUSTMENTS can change hours
        role_monthly: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for entry in staffing_list:
            role = entry["role"]
            loc = entry["loc"]
            base_hours = entry["hours"]
            for mo in months:
                adjusted = _get_adjusted_hours(proj_id, role, loc, mo, base_hours)
                role_monthly[role][mo] += adjusted

        # For each role, select people and distribute hours
        for role, month_hours in role_monthly.items():
            available = people_by_role.get(role, [])
            if not available:
                continue

            # Deterministic person selection for this project+role
            start_idx = _stable_index(proj_id, role, len(available))
            # Build ordered candidate list
            candidates = [available[(start_idx + i) % len(available)] for i in range(len(available))]

            # Check if any candidate has an override for this project
            override_person_ids = set()
            for cand in candidates:
                if (cand["id"], proj_id) in ASSIGNMENT_OVERRIDES:
                    override_person_ids.add(cand["id"])

            for mo in months:
                total_needed = month_hours.get(mo, 0)
                if total_needed < 0.5:
                    continue

                remaining = total_needed

                # First, apply any overrides for this project+role
                for pid in list(override_person_ids):
                    if remaining <= 0:
                        break
                    override = ASSIGNMENT_OVERRIDES[(pid, proj_id)]
                    oh = override["overrides"].get(mo, override["base_hours"])
                    is_confirmed = 1
                    unconf = override.get("unconfirmed_range")
                    if unconf and unconf[0] <= mo <= unconf[1]:
                        is_confirmed = 0
                    alloc_map[(pid, proj_id, mo)] = (oh, is_confirmed)
                    remaining -= oh  # Can go negative for over-allocation (intentional)

                # Then fill remaining with regular candidates
                if remaining > 0.5:
                    for cand in candidates:
                        if remaining <= 0.5:
                            break
                        pid = cand["id"]
                        if (pid, proj_id, mo) in alloc_map:
                            continue  # Already assigned via override
                        chunk = min(remaining, 160.0)
                        alloc_map[(pid, proj_id, mo)] = (chunk, 1)
                        remaining -= chunk

    # Generate SQL rows
    rows = []
    for (pid, proj_id, mo), (hours, is_confirmed) in sorted(alloc_map.items()):
        rows.append(
            f"({sql_str(pid)}, {sql_str(proj_id)}, {sql_str(mo)}, {hours}, {is_confirmed})"
        )

    parts.append(f"\n-- Allocations ({len(rows)} rows)")
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
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
