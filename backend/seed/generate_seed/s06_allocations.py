"""
Generate allocations (person × project × month) and resource requests.
"""
from .config import ASSIGNMENTS, CREATED_AT, month_range, sql_str

BATCH_SIZE = 100


def generate() -> str:
    parts = []
    parts.append("-- =============================================================================")
    parts.append("-- Allocations & Resource Requests")
    parts.append("-- =============================================================================")

    # --- Allocations ---
    rows = []
    for person_id, project_id, base_hours, start, end, overrides in ASSIGNMENTS:
        months = month_range(start, end)
        for mo in months:
            hours = overrides.get(mo, base_hours)
            # is_confirmed: 0 for p-fischer's erp2 in 2026-04..2026-07 (pending confirmation)
            is_confirmed = 1
            if person_id == "p-fischer" and project_id == "proj-erp2" and "2026-04" <= mo <= "2026-07":
                is_confirmed = 0
            rows.append(
                f"({sql_str(person_id)}, {sql_str(project_id)}, {sql_str(mo)}, {hours}, {is_confirmed})"
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
