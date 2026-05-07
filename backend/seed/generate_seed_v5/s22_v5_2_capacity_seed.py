"""Stage 22 — v5.2 W1 Capacity foundation seed top-up.

One-shot generator following the s21 pattern: load current seed.sql into an
in-memory SQLite, inspect existing capacity rows, emit a block of SQL
INSERT/UPDATE statements that:

  1. Ensure ≥2 people are over-allocated (>100% utilization) in ≥1 month
     within the next 12 months. (Hotspot list, over-allocated filter chip,
     red-border summary bar testing.)
  2. Ensure ≥3 pending resource requests across ≥2 role types and ≥2 CCs.
     (Demand strip, inbox, PL competing demand badge.)
  3. Ensure ≥1 project has resource requests fanned out to multiple CCs.
     (Multi-CC fan-out scenario per §12.6.)
  4. Ensure ≥1 project has a pending CR-triggered re-confirmation with
     ``change_direction`` indicators on affected months. (Re-confirm flow.)
  5. Ensure ≥2 ``ResourceRequest`` rows with ``request_type='external_cost'``.
     (External cost section of assignment panel.)
  6. Insert 5–10 ``CapacityActionLog`` entries spanning different action
     types, users, and dates within the last 30 days. (History page +
     inbox "Recently completed" section on first load.)
  7. Ensure ≥1 person has 0% utilization across 6+ consecutive months.
     (Chronic under-utilization scenario for hotspot list.)
  8. Insert at least one multi-person assignment example exercising the
     relaxed (resource_request_id, month, person_id) unique constraint.

Output is appended to ``backend/seed/seed.sql``.

Usage:
    cd backend
    python -m seed.generate_seed_v5.s22_v5_2_capacity_seed > /tmp/v5_2_w1.sql
    cat /tmp/v5_2_w1.sql >> seed/seed.sql

Determinism: ``random.seed(522)`` keeps emitted IDs and dates byte-identical
across runs.

This file is a stub created in v5.2 W1 lead pre-work. Implementation lives
under Teammate C (fastapi-developer / generalist).
"""
from __future__ import annotations

import random

random.seed(522)


def main() -> None:
    raise NotImplementedError("v5.2 W1 Teammate C: implement per spec §1 acceptance criteria")


if __name__ == "__main__":
    main()
