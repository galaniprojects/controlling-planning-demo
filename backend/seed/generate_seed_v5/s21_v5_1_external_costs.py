"""Stage 21 — v5.1 W5 C-09 External Costs top-up.

This script is a one-shot generator. It loads the current ``seed.sql`` into
an in-memory SQLite database, inspects the existing external Forecast /
Actuals / Baseline rows, and emits a block of additional SQL statements
(``UPDATE`` + ``INSERT``) that:

  1. Populate the new C-09 schema columns (``forecast.po_amount``,
     ``forecast.accrual_amount``, ``forecast.contract_end_month``,
     ``forecast.po_number`` for ordered/open lines, ``actuals.po_number``,
     ``actuals.invoiced_amount``) on rows that already exist.

  2. Add a small set of new external rows so each project carries the spec
     status mix (≥1 ``open`` line — the new sixth status introduced here).

  3. Insert ``external_cost_deliveries`` and ``external_cost_invoices`` rows
     for every PO-tracked line so the row-expansion drawer has data.

The output is intended to be appended verbatim to ``backend/seed/seed.sql``.

Usage:
    cd backend
    python -m seed.generate_seed_v5.s21_v5_1_external_costs > /tmp/c09.sql
    cat /tmp/c09.sql >> seed/seed.sql

Determinism: ``random.seed(909)`` keeps PO numbers, contract end months,
delivery / invoice schedules byte-identical across runs.
"""
from __future__ import annotations

import os
import random
import sqlite3
import sys
from collections import defaultdict
from datetime import date, timedelta
from typing import Iterable

random.seed(909)

CONTRACT_END_OPTIONS = ["2026-06", "2027-03", "2027-09", "2028-06"]


def _seed_path() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "seed.sql"))


def _load_seed_into_memory() -> sqlite3.Connection:
    """Build an in-memory SQLite DB containing the current seed.sql."""
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


def _po_number(seq: int, year: int = 2026) -> str:
    return f"PO-{year}-{seq:04d}"


def _add_months(month: str, n: int) -> str:
    y, m = int(month[:4]), int(month[5:7])
    total = y * 12 + (m - 1) + n
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def _line_groups(conn: sqlite3.Connection) -> dict:
    """Return {(project_id, vendor, sub_category, description): {...}}.

    Each value carries the full month list with status, plus the role.
    """
    cur = conn.execute("""
        SELECT project_id, vendor, sub_category, description, role_type_id,
               month, amount_eur, ext_status, capex_opex
        FROM forecasts
        WHERE category = 'external'
          AND vendor IS NOT NULL AND vendor != ''
        ORDER BY project_id, vendor, sub_category, description, month
    """)
    groups: dict = defaultdict(lambda: {
        "role_type_id": None,
        "capex_opex": None,
        "rows": [],  # list of {month, amount_eur, ext_status}
    })
    for (pid, vendor, sub_cat, desc, role, month, amt, status,
         co) in cur.fetchall():
        key = (pid, vendor, sub_cat, desc or "")
        g = groups[key]
        g["role_type_id"] = role
        g["capex_opex"] = co
        g["rows"].append({
            "month": month, "amount_eur": float(amt or 0),
            "ext_status": status,
        })
    return groups


def _emit_phase1_updates(groups: dict) -> Iterable[str]:
    """Phase 1 — populate new columns on existing forecast / actuals rows.

    Strategy: assign one canonical PO# per (project, vendor, sub_cat,
    description) line that ever carries a procurement status (any of
    ordered / planned / invoiced / goods_received). Lines that are pure
    accrual (no PO concept) skip the PO assignment.

    For each line we then UPDATE:
      - ``forecasts.po_number`` for matching (vendor, description) rows
      - ``forecasts.po_amount`` for ext_status='ordered' rows
      - ``forecasts.accrual_amount`` for ext_status='accrual' rows
      - ``forecasts.contract_end_month`` for the whole line
      - ``actuals.po_number`` for matching past months
      - ``actuals.invoiced_amount`` for ext_status='invoiced' actuals
    """
    yield "-- v5.1 W5 C-09 — Phase 1: populate new external-cost columns"
    yield "-- =========================================================="

    po_seq = 1000  # PO-2026-1000 onwards so we don't collide with anything
    line_assignments: dict[tuple, dict] = {}

    # Sort for determinism — PO number assignment is sequence-sensitive.
    for key in sorted(groups.keys()):
        g = groups[key]
        rows = g["rows"]
        statuses = {r["ext_status"] for r in rows}
        non_null_statuses = {s for s in statuses if s}
        # Skip lines that never touch a PO concept.
        po_relevant = bool(non_null_statuses & {
            "ordered", "planned", "invoiced", "goods_received",
        })
        if not po_relevant:
            line_assignments[key] = {
                "po_number": None,
                "contract_end": None,
            }
            continue
        po_seq += 1
        po = _po_number(po_seq)
        contract_end = random.choice(CONTRACT_END_OPTIONS)
        line_assignments[key] = {
            "po_number": po,
            "contract_end": contract_end,
        }

    # --- Emit UPDATEs per line ---------------------------------------------
    for key in sorted(groups.keys()):
        pid, vendor, sub_cat, desc = key
        g = groups[key]
        assign = line_assignments[key]
        po = assign["po_number"]
        contract_end = assign["contract_end"]

        where_line = (
            f"project_id = {_quote(pid)} "
            f"AND category = 'external' "
            f"AND vendor = {_quote(vendor)} "
            f"AND sub_category = {_quote(sub_cat)} "
            f"AND COALESCE(description, '') = {_quote(desc)}"
        )
        if po:
            yield (
                f"UPDATE forecasts SET po_number = {_quote(po)}, "
                f"contract_end_month = {_quote(contract_end)} "
                f"WHERE {where_line};"
            )
            yield (
                f"UPDATE actuals SET po_number = {_quote(po)} "
                f"WHERE {where_line};"
            )

    # --- Bulk UPDATEs for accrual / ordered / invoiced ---------------------
    yield ""
    yield "-- For 'ordered' rows: po_amount mirrors amount_eur."
    yield (
        "UPDATE forecasts SET po_amount = amount_eur "
        "WHERE category = 'external' AND ext_status = 'ordered' "
        "AND vendor IS NOT NULL;"
    )
    yield ""
    yield "-- For 'accrual' forecast rows: accrual_amount mirrors amount_eur."
    yield (
        "UPDATE forecasts SET accrual_amount = amount_eur "
        "WHERE category = 'external' AND ext_status = 'accrual' "
        "AND vendor IS NOT NULL;"
    )
    yield ""
    yield (
        "-- For 'accrual' actuals rows: spec [v5.1 W5 C-09] models accrual as "
        "estimated cost with no invoice journal yet, so amount_eur and "
        "invoiced_amount both reset to 0 (the recognised value lives on the "
        "forecast row's accrual_amount)."
    )
    yield (
        "UPDATE actuals SET amount_eur = 0, invoiced_amount = 0 "
        "WHERE category = 'external' AND ext_status = 'accrual' "
        "AND vendor IS NOT NULL;"
    )
    yield ""
    yield "-- For 'invoiced' actuals rows: invoiced_amount = amount_eur."
    yield (
        "UPDATE actuals SET invoiced_amount = amount_eur "
        "WHERE category = 'external' AND ext_status = 'invoiced' "
        "AND vendor IS NOT NULL;"
    )
    yield ""
    yield (
        "-- For 'goods_received' actuals rows: cost recognised, invoice "
        "pending → invoiced_amount stays at 0."
    )
    yield (
        "UPDATE actuals SET invoiced_amount = 0 "
        "WHERE category = 'external' AND ext_status = 'goods_received' "
        "AND vendor IS NOT NULL;"
    )


def _emit_open_status_inserts(groups: dict) -> Iterable[str]:
    """Phase 2 — introduce the new ``open`` status.

    Strategy: pick a small handful of high-spend vendor lines (one per
    project across the 2-3 largest projects) and add a single forecast row
    in a future month with ``ext_status='open'`` plus a partial actuals row
    against the SAME PO number so the open_po formula has signal.

    The "open" semantic per spec: a PO whose committed amount exceeds the
    sum of actuals that have hit it — i.e. partially fulfilled.
    """
    yield ""
    yield "-- v5.1 W5 C-09 — Phase 2: 'open' status (partially fulfilled PO)"
    yield "-- =============================================================="

    # Hand-picked seed projects/vendors that already have rich data so the
    # 'open' rows attach to a meaningful place in the demo.
    open_lines = [
        # (project, vendor, sub_category, description, role, month,
        #  forecast_amount, actuals_recognised, capex_opex)
        ("proj-mdh-rollout", "Accenture", "ext-consulting",
         "MDH Implementation Consulting", "role-sr-arch",
         "2026-04", 12000.0, 4500.0, "capex"),
        ("proj-erp2", "Deloitte", "ext-consulting",
         "SAP Implementation Support", "role-sr-arch",
         "2026-04", 18000.0, 6000.0, "capex"),
        ("proj-sensor", "Thoughtworks", "ext-consulting",
         "Data Engineering Consulting", "role-data-eng",
         "2026-04", 9000.0, 2500.0, "capex"),
    ]

    # Each row gets a fresh PO so the "open" computation is isolated and
    # the existing line PO assignments aren't mutated. invoiced_amount is
    # set to half of actuals so remaining_not_invoiced stays positive and
    # distinct from open_po — gives the demo data signal on both KPIs.
    open_po_base = 9000
    forecast_values = []
    actuals_values = []
    for idx, (pid, vendor, sub_cat, desc, role, month, fc_amt, ac_amt,
              co) in enumerate(open_lines):
        po = _po_number(open_po_base + idx)
        invoiced = round(ac_amt * 0.5, 2)
        forecast_values.append(
            f"({_quote(pid)}, {_quote(month)}, 'external', "
            f"{_quote(sub_cat)}, NULL, {fc_amt}, {_quote(desc + ' (open PO)')}, "
            f"{_quote(co)}, 'open', {_quote(po)}, {_quote(vendor)}, "
            f"{_quote(role)}, 0, {fc_amt}, 0, '2027-12')"
        )
        actuals_values.append(
            f"({_quote(pid)}, {_quote(month)}, 'external', "
            f"{_quote(sub_cat)}, NULL, {ac_amt}, {_quote(desc + ' (open PO)')}, "
            f"{_quote(co)}, {_quote(vendor)}, 'open', {_quote(role)}, "
            f"{_quote(po)}, {invoiced})"
        )

    yield (
        "INSERT INTO forecasts (project_id, month, category, sub_category, "
        "hours, amount_eur, description, capex_opex, ext_status, po_number, "
        "vendor, role_type_id, is_provisional, po_amount, accrual_amount, "
        "contract_end_month) VALUES"
    )
    for i, val in enumerate(forecast_values):
        suffix = "," if i < len(forecast_values) - 1 else ";"
        yield f"  {val}{suffix}"

    yield ""
    yield (
        "INSERT INTO actuals (project_id, month, category, sub_category, "
        "hours, amount_eur, description, capex_opex, vendor, ext_status, "
        "role_type_id, po_number, invoiced_amount) VALUES"
    )
    for i, val in enumerate(actuals_values):
        suffix = "," if i < len(actuals_values) - 1 else ";"
        yield f"  {val}{suffix}"


def _emit_deliveries_and_invoices(conn: sqlite3.Connection,
                                  groups: dict) -> Iterable[str]:
    """Phase 3 — populate ``external_cost_deliveries`` and
    ``external_cost_invoices`` for every PO-tracked line.

    Per spec: 2-4 deliveries per (vendor, po_number); 1-3 invoices for
    invoiced/open lines. Generated deterministically from the line's month
    span so the demo data tells a coherent story (delivered_month is set
    when expected_month <= demo date; invoice_date is set to the month's
    15th; status alternates received / paid).
    """
    yield ""
    yield ("-- v5.1 W5 C-09 — Phase 3: delivery schedule + invoice history "
           "(row-expansion content)")
    yield ("-- ========================================================="
           "===========")

    # Fetch the post-Phase-1 forecast PO assignments by querying the
    # in-memory DB AFTER applying the same UPDATEs we just emitted.
    # Simpler: re-derive PO numbers using the same algorithm.
    po_seq = 1000
    line_pos: dict[tuple, dict] = {}
    for key in sorted(groups.keys()):
        g = groups[key]
        rows = g["rows"]
        statuses = {r["ext_status"] for r in rows}
        non_null_statuses = {s for s in statuses if s}
        po_relevant = bool(non_null_statuses & {
            "ordered", "planned", "invoiced", "goods_received",
        })
        if not po_relevant:
            continue
        po_seq += 1
        po = _po_number(po_seq)
        line_pos[key] = {
            "po_number": po,
            "rows": rows,
            "vendor": key[1],
            "sub_category": key[2],
            "project_id": key[0],
            "description": key[3],
        }

    delivery_values = []
    invoice_values = []
    invoice_seq = 60000

    for key in sorted(line_pos.keys()):
        line = line_pos[key]
        po = line["po_number"]
        rows = line["rows"]
        vendor = line["vendor"]
        pid = line["project_id"]
        sub_cat = line["sub_category"]

        if not rows:
            continue
        months = [r["month"] for r in rows]
        first_month = min(months)
        last_month = max(months)

        # Pick 3 deterministic delivery anchors across the line's lifespan.
        anchor_indices = [0, len(months) // 2, len(months) - 1]
        seen_months = set()
        for ai in anchor_indices:
            anchor_month = months[ai]
            if anchor_month in seen_months:
                continue
            seen_months.add(anchor_month)
            # Was this month delivered yet? Anything with cost recognised
            # (accrual / goods_received / invoiced) counts as delivered;
            # ordered / planned remain pending.
            anchor_status = rows[ai]["ext_status"]
            delivered_month = (
                anchor_month
                if anchor_status in {"invoiced", "goods_received", "accrual"}
                else None
            )
            milestone_name = (
                f"{vendor} milestone {ai + 1}"
                if vendor else f"Milestone {ai + 1}"
            )
            expected_amount = round(rows[ai]["amount_eur"], 2)
            delivery_values.append((
                pid, vendor, po, sub_cat, milestone_name,
                anchor_month, expected_amount, delivered_month,
            ))

        # Invoices: emit one per invoiced row up to a cap of 3.
        invoiced_rows = [r for r in rows if r["ext_status"] == "invoiced"]
        invoiced_rows = invoiced_rows[:3]
        for inv_row in invoiced_rows:
            invoice_seq += 1
            invoice_no = f"INV-{inv_row['month'].replace('-', '')}-{invoice_seq:05d}"
            invoice_date = f"{inv_row['month']}-15"
            inv_amount = round(inv_row["amount_eur"], 2)
            inv_status = (
                "paid" if invoice_seq % 2 == 0 else "received"
            )
            invoice_values.append((
                pid, vendor, po, invoice_no, invoice_date,
                inv_amount, inv_status,
            ))

    # Also seed deliveries + invoices for the 3 'open' PO lines added in
    # phase 2 — keeps the row-expansion drawer informative for the new
    # demo status.
    open_extras = [
        ("proj-mdh-rollout", "Accenture", "ext-consulting", _po_number(9000),
         "Open PO milestone — Accenture", "2026-04", 4500.0, "2026-04"),
        ("proj-erp2", "Deloitte", "ext-consulting", _po_number(9001),
         "Open PO milestone — Deloitte", "2026-04", 6000.0, "2026-04"),
        ("proj-sensor", "Thoughtworks", "ext-consulting", _po_number(9002),
         "Open PO milestone — Thoughtworks", "2026-04", 2500.0, "2026-04"),
    ]
    for pid, vendor, sub_cat, po, name, month, amt, delivered in open_extras:
        # First delivery — partially delivered.
        delivery_values.append((
            pid, vendor, po, sub_cat, name, month, amt, delivered,
        ))
        # Pending future delivery — not yet received.
        future_month = _add_months(month, 2)
        delivery_values.append((
            pid, vendor, po, sub_cat,
            f"{name} (remaining)", future_month,
            round(amt * 1.5, 2), None,
        ))
        # One invoice for the partially-delivered slice.
        invoice_seq += 1
        invoice_no = f"INV-{month.replace('-', '')}-{invoice_seq:05d}"
        invoice_values.append((
            pid, vendor, po, invoice_no, f"{month}-20",
            round(amt * 0.5, 2), "received",
        ))

    if delivery_values:
        yield ""
        yield (
            "INSERT INTO external_cost_deliveries "
            "(project_id, vendor, po_number, sub_category, milestone_name, "
            "expected_month, expected_amount, delivered_month) VALUES"
        )
        for i, (pid, vendor, po, sub_cat, name, exp_m, amt,
                deliv_m) in enumerate(delivery_values):
            suffix = "," if i < len(delivery_values) - 1 else ";"
            yield (
                f"  ({_quote(pid)}, {_quote(vendor)}, {_quote(po)}, "
                f"{_quote(sub_cat)}, {_quote(name)}, {_quote(exp_m)}, "
                f"{amt}, {_quote(deliv_m)}){suffix}"
            )

    if invoice_values:
        yield ""
        yield (
            "INSERT INTO external_cost_invoices "
            "(project_id, vendor, po_number, invoice_number, invoice_date, "
            "amount, status) VALUES"
        )
        for i, (pid, vendor, po, inv_no, inv_date, amt,
                status) in enumerate(invoice_values):
            suffix = "," if i < len(invoice_values) - 1 else ";"
            yield (
                f"  ({_quote(pid)}, {_quote(vendor)}, {_quote(po)}, "
                f"{_quote(inv_no)}, {_quote(inv_date)}, {amt}, "
                f"{_quote(status)}){suffix}"
            )


def main() -> None:
    conn = _load_seed_into_memory()
    try:
        groups = _line_groups(conn)
    finally:
        conn.close()

    print("-- =============================================================")
    print("-- v5.1 W5 C-09 External Costs top-up (generated by")
    print("--   backend/seed/generate_seed_v5/s21_v5_1_external_costs.py)")
    print("-- Run the generator once to refresh; the output below is")
    print("-- intended to be appended verbatim to seed.sql.")
    print("-- =============================================================")
    print()

    for line in _emit_phase1_updates(groups):
        print(line)
    for line in _emit_open_status_inserts(groups):
        print(line)
    for line in _emit_deliveries_and_invoices(conn, groups):
        print(line)
    print()
    print("-- End of v5.1 W5 C-09 top-up.")


if __name__ == "__main__":
    main()
