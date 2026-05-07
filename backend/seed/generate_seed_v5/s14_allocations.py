"""Stage 14 — Allocations [F-DM-01].

Person × ChargeableEntity × Month allocation rows. Allocations are
polymorphic per [F-DM-01]: the v5 ``chargeable_entity_id`` FK is the
canonical pointer, while ``project_id`` is retained for backward
compatibility with the v4 capacity router. For Project-typed entities the
two FKs co-resolve (1:1 with the ChargeableEntity row created in s06).
For Offering / InternalService rows, ``project_id`` is set to NULL.

Wait — ``Allocation.project_id`` is declared NOT NULL in the model. So for
Offerings and InternalServices we cannot create allocation rows in a single
schema run. Practical compromise: this stage emits allocations only for
Project subtypes (matching the v4 behaviour). Offering / InternalService
people-staffing is implicit in their ``annual_cost`` column on
``ChargeableEntity`` (per F3 [F-S2-01]); the Capacity heatmap is
project-only by design in v5 — Cluster F's "ResourceHub" rollout in a
follow-on session will introduce a separate non-project allocation surface
when that constraint is relaxed.

Person selection mirrors v4's hash-stable seed pattern (deterministic across
re-runs). Over-allocations from
``config/financials.ASSIGNMENT_OVERRIDES`` win over the auto-generated rows.
"""
from __future__ import annotations

import hashlib
from collections import defaultdict

from _utils import month_range, sql_str
from generate_seed_v5.config.entities import PROJECTS
from generate_seed_v5.config.financials import (
    ASSIGNMENT_OVERRIDES,
    CHRONIC_UNDERUTIL_PEOPLE,
    FORECAST_ADJUSTMENTS,
    PROJECT_STAFFING,
)
from generate_seed_v5.config.people import PEOPLE

BATCH_SIZE = 100
SERVICE_HORIZON_END = "2029-12"


def _stable_index(project_id: str, role_type_id: str, people_count: int) -> int:
    """Deterministic index for person selection per (project, role)."""
    if people_count == 0:
        return 0
    h = hashlib.md5(f"{project_id}:{role_type_id}".encode()).hexdigest()
    return int(h, 16) % people_count


def _adjusted_hours(
    proj_id: str, role: str, loc: str, month: str, base_hours: float,
) -> float:
    """Apply FORECAST_ADJUSTMENTS to a per-(role, loc, month) hours figure."""
    adj = FORECAST_ADJUSTMENTS.get(proj_id, {}).get("internal", [])
    for a in adj:
        if a["role"] == role and a["loc"] == loc and month >= a["from"]:
            return float(a["hours"])
    return float(base_hours)


def generate() -> str:
    parts: list[str] = []
    parts.append("-- =============================================================================")
    parts.append("-- s14_allocations — Person × ChargeableEntity × Month [F-DM-01]")
    parts.append("-- chargeable_entity_id is the canonical FK; project_id retained for v4 ABI.")
    parts.append("-- =============================================================================")

    # --- Build people-by-role lookup (only people with a CC).
    # v5.2 W1 [C]: people listed in CHRONIC_UNDERUTIL_PEOPLE are excluded from
    # the candidate pool so they emerge from seed with zero allocations across
    # the entire planning horizon — populates the chronic under-utilisation
    # hotspot for the Capacity redesign acceptance criteria (§1).
    people_by_role: dict[str, list[dict]] = defaultdict(list)
    for p in PEOPLE:
        if p["cc"] is None:
            continue
        if p["id"] in CHRONIC_UNDERUTIL_PEOPLE:
            continue
        people_by_role[p["role"]].append(p)
    for role in people_by_role:
        people_by_role[role].sort(key=lambda x: x["id"])

    project_lookup = {p["id"]: p for p in PROJECTS}

    # alloc[(person_id, project_id, month)] = (hours, is_confirmed)
    alloc: dict[tuple[str, str, str], tuple[float, int]] = {}

    for proj_id in sorted(PROJECT_STAFFING.keys()):
        # Filter to Project subtypes only (Offerings / InternalServices skipped —
        # see module docstring).
        proj = project_lookup.get(proj_id)
        if proj is None:
            continue
        # Skip pending_approval / pending_cc_confirmation projects (resources are
        # request-bound, not allocated yet).
        if proj["v4_status"] in ("pending_cc_confirmation", "pending_approval"):
            continue

        start = proj["start_month"]
        end = proj["end_month"] or SERVICE_HORIZON_END
        months = month_range(start, end)

        # Aggregate staffing hours by role per month (so FORECAST_ADJUSTMENTS
        # at the (role, loc) granularity bubble up to a per-role monthly total).
        role_monthly: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for entry in PROJECT_STAFFING.get(proj_id, []):
            role = entry["role"]
            loc = entry["loc"]
            base_hours = entry["hours"]
            for mo in months:
                role_monthly[role][mo] += _adjusted_hours(proj_id, role, loc, mo, base_hours)

        for role in sorted(role_monthly.keys()):
            month_hours = role_monthly[role]
            available = people_by_role.get(role, [])
            if not available:
                continue

            start_idx = _stable_index(proj_id, role, len(available))
            candidates = [available[(start_idx + i) % len(available)]
                          for i in range(len(available))]

            override_pids = {pid for (pid, pj) in ASSIGNMENT_OVERRIDES.keys()
                              if pj == proj_id and pid in {c["id"] for c in candidates}}

            for mo in sorted(month_hours.keys()):
                total_needed = month_hours[mo]
                if total_needed < 0.5:
                    continue
                remaining = total_needed

                # Apply explicit overrides first (intentional over-allocation
                # narrative — drives capacity heatmap warnings).
                for pid in sorted(override_pids):
                    if remaining <= 0:
                        break
                    o = ASSIGNMENT_OVERRIDES[(pid, proj_id)]
                    oh = o["overrides"].get(mo, o["base_hours"])
                    is_confirmed = 1
                    unconf = o.get("unconfirmed_range")
                    if unconf and unconf[0] <= mo <= unconf[1]:
                        is_confirmed = 0
                    alloc[(pid, proj_id, mo)] = (oh, is_confirmed)
                    remaining -= oh

                # Fill the remainder with auto-selected candidates.
                if remaining > 0.5:
                    for cand in candidates:
                        if remaining <= 0.5:
                            break
                        pid = cand["id"]
                        if (pid, proj_id, mo) in alloc:
                            continue  # Already allocated via override.
                        chunk = min(remaining, 160.0)
                        alloc[(pid, proj_id, mo)] = (chunk, 1)
                        remaining -= chunk

    # Emit allocations rows. chargeable_entity_id mirrors project_id for
    # Project subtypes (1:1 — see the s06 entities emission). Polymorphic
    # callers consume chargeable_entity_id; legacy callers consume project_id.
    rows: list[str] = []
    for (pid, proj_id, mo) in sorted(alloc.keys()):
        hours, is_confirmed = alloc[(pid, proj_id, mo)]
        rows.append(
            f"({sql_str(pid)}, {sql_str(proj_id)}, {sql_str(proj_id)}, "
            f"{sql_str(mo)}, {hours}, {is_confirmed})"
        )

    parts.append(f"\n-- Allocations ({len(rows)} rows)")
    cols = "(person_id, project_id, chargeable_entity_id, month, hours, is_confirmed)"
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        parts.append(
            f"INSERT INTO allocations {cols} VALUES\n" + ",\n".join(batch) + ";"
        )

    # --- Resource Requests (carried forward from v4 narrative shape) -------
    # The intake demo target is proj-autobrake (DoI 2 Under Eval late). 9
    # resource requests pre-staged for the CC Owner persona to confirm.
    parts.append("\n-- Resource Requests for proj-autobrake (DoI 2 intake demo)")
    parts.append(
        "INSERT INTO resource_requests (id, project_id, cost_center_id, "
        "request_type, role_type_id, cost_type_id, hours_or_amount_per_month, "
        "period_start, period_end, priority, status, assigned_person_id, "
        "adjusted_value, explanation, change_request_id, created_at, modified_at) VALUES\n"
        "(100, 'proj-autobrake', 'cc-muc-apd', 'resource', 'role-sr-arch', NULL, 40, '2026-06', '2027-12', 'high', 'pending', NULL, NULL, NULL, NULL, '2026-03-15 10:00:00', '2026-03-15 10:00:00'),\n"
        "(101, 'proj-autobrake', 'cc-muc-apd', 'resource', 'role-sr-dev', NULL, 80, '2026-06', '2027-12', 'high', 'pending', NULL, NULL, NULL, NULL, '2026-03-15 10:00:00', '2026-03-15 10:00:00'),\n"
        "(102, 'proj-autobrake', 'cc-muc-apd', 'resource', 'role-dev', NULL, 100, '2026-06', '2027-12', 'high', 'pending', NULL, NULL, NULL, NULL, '2026-03-15 10:00:00', '2026-03-15 10:00:00'),\n"
        "(103, 'proj-autobrake', 'cc-muc-apd', 'resource', 'role-qa', NULL, 40, '2026-06', '2027-12', 'medium', 'pending', NULL, NULL, NULL, NULL, '2026-03-15 10:00:00', '2026-03-15 10:00:00'),\n"
        "(104, 'proj-autobrake', 'cc-muc-apd', 'resource', 'role-ba', NULL, 20, '2026-06', '2027-12', 'medium', 'pending', NULL, NULL, NULL, NULL, '2026-03-15 10:00:00', '2026-03-15 10:00:00'),\n"
        "(105, 'proj-autobrake', 'cc-muc-apd', 'external_cost', NULL, 'ext-consulting', 8000, '2026-06', '2027-12', 'medium', 'pending', NULL, NULL, NULL, NULL, '2026-03-15 10:00:00', '2026-03-15 10:00:00'),\n"
        "(106, 'proj-autobrake', 'cc-muc-apd', 'external_cost', NULL, 'ext-sw-licenses', 5000, '2026-06', '2027-12', 'medium', 'pending', NULL, NULL, NULL, NULL, '2026-03-15 10:00:00', '2026-03-15 10:00:00'),\n"
        "(107, 'proj-autobrake', 'cc-muc-apd', 'external_cost', NULL, 'ext-cloud', 6000, '2026-06', '2027-12', 'medium', 'pending', NULL, NULL, NULL, NULL, '2026-03-15 10:00:00', '2026-03-15 10:00:00'),\n"
        "(108, 'proj-autobrake', 'cc-muc-apd', 'external_cost', NULL, 'ext-other', 3000, '2026-06', '2027-12', 'low', 'pending', NULL, NULL, NULL, NULL, '2026-03-15 10:00:00', '2026-03-15 10:00:00');"
    )

    # Pre-assign Sr Arch + Sr Dev so the CC Owner has partial work to inspect.
    autobrake_months = month_range("2026-06", "2027-12")
    assign_rows = []
    for mo in autobrake_months:
        assign_rows.append(
            f"(100, {sql_str(mo)}, 'p-brenner', 40, '2026-03-15 10:00:00', '2026-03-15 10:00:00')"
        )
        assign_rows.append(
            f"(101, {sql_str(mo)}, 'p-fischer', 80, '2026-03-15 10:00:00', '2026-03-15 10:00:00')"
        )

    parts.append(
        "\n-- ResourceRequest Assignments for proj-autobrake (Sr Arch + Sr Dev pre-assigned)"
    )
    cols_rra = (
        "(resource_request_id, month, person_id, hours, created_at, modified_at)"
    )
    for i in range(0, len(assign_rows), BATCH_SIZE):
        batch = assign_rows[i:i + BATCH_SIZE]
        parts.append(
            f"INSERT INTO resource_request_assignments {cols_rra} VALUES\n"
            + ",\n".join(batch) + ";"
        )

    return "\n".join(parts)
