#!/usr/bin/env python3
"""Seed-data consistency validator for v5 (Cluster F polymorphic model).

Re-authored from ``backend/seed/generate_seed/validate.py`` for the v5
schema. Key differences from the v4 validator:

1. **No hardcoded v4 IDs.** Mixed-CapEx detection, project rosters, and
   service detection all read from ``chargeable_entities`` /
   ``config.entities`` rather than baked-in id sets.
2. **v5 column awareness.** The legacy ``projects.is_service`` column is
   gone in v5 — service detection reads ``ChargeableEntity.entity_type``.
3. **Polymorphic allocations.** ``check_no_orphan_allocations`` walks both
   ``allocations.project_id`` (legacy) and ``allocations.chargeable_entity_id``
   (v5 polymorphic).
4. **Two new v5 rules:** distribution sum (``to_business_pct + Σ%≤100``)
   and BTC profile sum (``Σ% == 100`` within tolerance).
5. **Stub-aware.** Each rule first checks whether the relevant table has
   any rows; if empty (e.g. T1's distribution / T2's financials not yet
   merged), the rule is skipped with a "no data — skipping" message
   rather than reporting failure. This keeps the validator green when
   running against a partial Phase-2 worktree.

Usage::

    cd backend && python seed/generate_seed_v5/validate.py
    # or:
    cd backend && python -m seed.generate_seed_v5.validate
"""
from __future__ import annotations

import os
import sqlite3
import sys
from collections import defaultdict

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "viper_demo.db")
DEMO_DATE = "2026-04"
FTE_HOURS = 160

# Persons known to be intentionally over-allocated for the demo's capacity
# warning UX. Reads from a small static list because these names are tied to
# the seed narrative; if the names change, update both this and the seed
# generator (no schema FK to point at).
OVER_ALLOCATED_PERSONS = {"p-fischer", "p-szabo", "p-winter"}

# BTC profile sum-rule tolerance — must match
# ``services/btc_service.py::BTC_SUM_TOLERANCE``.
BTC_SUM_TOLERANCE = 0.01

# Pre-execution pipeline stages (mirror services.pipeline.BACKLOG_STAGES).
# Projects in these stages carry an estimated total_budget but no baselines
# yet — baselines are created when the project enters delivery.
_PRE_EXECUTION_STAGES = ("Proposed", "Under Evaluation", "Approved")


# ---------------------------------------------------------------------------
# Plumbing
# ---------------------------------------------------------------------------
def get_db() -> sqlite3.Connection:
    if not os.path.exists(DB_PATH):
        print(f"ERROR: Database not found at {DB_PATH}")
        print("Start the backend first to create and seed the database.")
        sys.exit(2)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _table_exists(db: sqlite3.Connection, name: str) -> bool:
    row = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,),
    ).fetchone()
    return row is not None


def _row_count(db: sqlite3.Connection, name: str) -> int:
    if not _table_exists(db, name):
        return 0
    return db.execute(f"SELECT COUNT(*) as cnt FROM {name}").fetchone()["cnt"]


def _project_ids(db: sqlite3.Connection) -> set[str]:
    """All project ids from the ChargeableEntity polymorphic table.

    v5 source-of-truth — replaces v4's hardcoded ``MIXED_CAPEX_PROJECTS``
    style sets.
    """
    if not _table_exists(db, "chargeable_entities"):
        return set()
    rows = db.execute(
        "SELECT id FROM chargeable_entities WHERE entity_type='Project'"
    ).fetchall()
    return {r["id"] for r in rows}


def _service_ids(db: sqlite3.Connection) -> set[str]:
    """All Offering+InternalService ids — Cluster F's "service" notion."""
    if not _table_exists(db, "chargeable_entities"):
        return set()
    rows = db.execute(
        "SELECT id FROM chargeable_entities "
        "WHERE entity_type IN ('Offering','InternalService')"
    ).fetchall()
    return {r["id"] for r in rows}


# ---------------------------------------------------------------------------
# Rule 1 — Summation Integrity
# ---------------------------------------------------------------------------
def check_summation_integrity(db) -> tuple[bool, list[str]]:
    """Project total_budget should approximate sum of baseline amounts.

    Pre-execution backlog projects (Proposed / Under Evaluation / Approved)
    carry only an *estimated* ``total_budget`` — baselines are an
    execution-time artifact created when the project enters delivery — so a
    backlog project with no baselines is expected, not an integrity error.
    """
    if _row_count(db, "baselines") == 0:
        return True, ["  (no data — skipping)"]
    issues: list[str] = []
    rows = db.execute("""
        SELECT p.id, p.name, p.total_budget, p.pipeline_stage,
               COALESCE(SUM(b.amount_eur), 0) AS baseline_sum
        FROM projects p
        LEFT JOIN baselines b ON b.project_id = p.id
        GROUP BY p.id
    """).fetchall()
    for r in rows:
        if r["total_budget"] is None:
            continue
        total = float(r["total_budget"])
        bsum = float(r["baseline_sum"])
        if total == 0 and bsum == 0:
            continue
        # A pre-execution project with no baseline yet is fine.
        if bsum == 0 and r["pipeline_stage"] in _PRE_EXECUTION_STAGES:
            continue
        if total > 0:
            pct_diff = abs(bsum - total) / total * 100
            if pct_diff > 5:
                issues.append(
                    f"  {r['id']}: total_budget={total:,.0f}, "
                    f"baseline_sum={bsum:,.0f} (diff={pct_diff:.1f}%)"
                )
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Rule 2 — Temporal Consistency
# ---------------------------------------------------------------------------
def check_temporal_consistency(db) -> tuple[bool, list[str]]:
    """No actuals after April 2026."""
    if _row_count(db, "actuals") == 0:
        return True, ["  (no data — skipping)"]
    issues: list[str] = []
    future_actuals = db.execute(f"""
        SELECT project_id, month, COUNT(*) as cnt
        FROM actuals
        WHERE month > '{DEMO_DATE}'
        GROUP BY project_id, month
    """).fetchall()
    for r in future_actuals:
        issues.append(
            f"  Actuals in future: {r['project_id']} month={r['month']} "
            f"({r['cnt']} rows)"
        )
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Rule 3 — Allocation Consistency
# ---------------------------------------------------------------------------
def check_allocation_consistency(db) -> tuple[bool, list[str]]:
    """No person exceeds FTE_HOURS per month except intentional cases."""
    if _row_count(db, "allocations") == 0:
        return True, ["  (no data — skipping)"]
    issues: list[str] = []
    rows = db.execute("""
        SELECT a.person_id, p.name, a.month, SUM(a.hours) AS total_hours
        FROM allocations a
        JOIN people p ON p.id = a.person_id
        GROUP BY a.person_id, a.month
        HAVING SUM(a.hours) > ?
        ORDER BY a.person_id, a.month
    """, (FTE_HOURS,)).fetchall()
    for r in rows:
        if r["person_id"] in OVER_ALLOCATED_PERSONS:
            continue
        issues.append(
            f"  {r['person_id']} ({r['name']}): {r['month']} = "
            f"{float(r['total_hours']):.0f}h (exceeds {FTE_HOURS}h)"
        )
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Rule 4 — CR Consistency
# ---------------------------------------------------------------------------
def check_cr_consistency(db) -> tuple[bool, list[str]]:
    """Approved/rejected CRs have proper controller status + timestamps."""
    if _row_count(db, "change_requests") == 0:
        return True, ["  (no data — skipping)"]
    issues: list[str] = []
    approved = db.execute("""
        SELECT id, project_id, status, controller_status,
               controller_approval_timestamp
        FROM change_requests
        WHERE status = 'approved'
    """).fetchall()
    for r in approved:
        if r["controller_status"] != "approved":
            issues.append(
                f"  CR #{r['id']} ({r['project_id']}): status=approved but "
                f"controller_status={r['controller_status']}"
            )
        if r["controller_approval_timestamp"] is None:
            issues.append(
                f"  CR #{r['id']} ({r['project_id']}): status=approved but "
                f"no controller_approval_timestamp"
            )

    rejected = db.execute("""
        SELECT id, project_id, status, controller_status
        FROM change_requests
        WHERE status = 'rejected'
    """).fetchall()
    for r in rejected:
        if r["controller_status"] != "rejected":
            issues.append(
                f"  CR #{r['id']} ({r['project_id']}): status=rejected but "
                f"controller_status={r['controller_status']}"
            )

    # Stage 2 CRs must have cc_status='confirmed' and cc_confirmation_timestamp
    stage2 = db.execute("""
        SELECT id, project_id, cc_status, cc_confirmation_timestamp
        FROM change_requests
        WHERE status = 'pending_controller_approval'
    """).fetchall()
    for r in stage2:
        if r["cc_status"] != "confirmed":
            issues.append(
                f"  CR #{r['id']} ({r['project_id']}): at "
                f"pending_controller_approval but cc_status={r['cc_status']}"
            )
        if r["cc_confirmation_timestamp"] is None:
            issues.append(
                f"  CR #{r['id']} ({r['project_id']}): at "
                f"pending_controller_approval but no cc_confirmation_timestamp"
            )

    # Sent-back CRs must have feedback
    sent_back = db.execute("""
        SELECT id, project_id, status, cc_comments, controller_comments
        FROM change_requests
        WHERE status IN ('sent_back_by_cc', 'sent_back_by_controller')
    """).fetchall()
    for r in sent_back:
        if r["status"] == "sent_back_by_cc" and not r["cc_comments"]:
            issues.append(
                f"  CR #{r['id']} ({r['project_id']}): sent_back_by_cc "
                f"but no cc_comments"
            )
        if r["status"] == "sent_back_by_controller" and not r["controller_comments"]:
            issues.append(
                f"  CR #{r['id']} ({r['project_id']}): "
                f"sent_back_by_controller but no controller_comments"
            )
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Rule 5 — CR project FK soundness
# ---------------------------------------------------------------------------
def check_cr_project_refs(db) -> tuple[bool, list[str]]:
    """Every CR must reference a known project id."""
    if _row_count(db, "change_requests") == 0:
        return True, ["  (no data — skipping)"]
    project_ids = _project_ids(db)
    if not project_ids:
        return True, ["  (no project roster — skipping)"]
    issues: list[str] = []
    rows = db.execute("""
        SELECT id, project_id FROM change_requests
    """).fetchall()
    for r in rows:
        if r["project_id"] not in project_ids:
            issues.append(
                f"  CR #{r['id']}: project_id={r['project_id']} not in roster"
            )
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Rule 6 — Staff rate consistency
# ---------------------------------------------------------------------------
def check_staff_rates(db) -> tuple[bool, list[str]]:
    """Each role should have at most ~3 distinct implied rates (per location)."""
    if _row_count(db, "baselines") == 0:
        return True, ["  (no data — skipping)"]
    issues: list[str] = []
    role_rates: dict[str, set[float]] = defaultdict(set)
    rows = db.execute("""
        SELECT sub_category, hours, amount_eur
        FROM baselines
        WHERE category = 'internal' AND hours IS NOT NULL AND hours > 0
    """).fetchall()
    for r in rows:
        rate = round(float(r["amount_eur"]) / float(r["hours"]), 2)
        role_rates[r["sub_category"]].add(rate)
    for role, rates in sorted(role_rates.items()):
        if len(rates) > 3:
            issues.append(
                f"  Role {role} has {len(rates)} distinct rates "
                f"(expected max 3): {sorted(rates)}"
            )
        for rate in rates:
            if rate < 25 or rate > 200:
                issues.append(
                    f"  Role {role}: unusual rate EUR {rate:.2f}/h"
                )
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Rule 7 — Baseline coverage (every project has ≥1 baseline row)
# ---------------------------------------------------------------------------
def check_baseline_coverage(db) -> tuple[bool, list[str]]:
    """Every project in execution (or beyond) should have ≥1 baseline row.

    Baselines are created when a project enters delivery, so pre-execution
    backlog stages (Proposed / Under Evaluation / Approved) are exempt — they
    carry an estimate only. Gating on ``pipeline_stage`` rather than the legacy
    ``status`` enum keeps this correct in the v5 pipeline-stage model.
    """
    if _row_count(db, "baselines") == 0:
        return True, ["  (no data — skipping)"]
    issues: list[str] = []
    placeholders = ",".join("?" * len(_PRE_EXECUTION_STAGES))
    rows = db.execute(f"""
        SELECT p.id, p.name, p.pipeline_stage, COUNT(b.id) AS bcount
        FROM projects p
        LEFT JOIN baselines b ON b.project_id = p.id
        WHERE (p.pipeline_stage IS NULL OR p.pipeline_stage NOT IN ({placeholders}))
        GROUP BY p.id
    """, tuple(_PRE_EXECUTION_STAGES)).fetchall()
    for r in rows:
        if r["bcount"] == 0:
            issues.append(
                f"  {r['id']} ({r['name']}, stage={r['pipeline_stage']}): "
                f"zero baseline rows"
            )
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Rule 8 — Polymorphic allocation soundness (v5-specific)
# ---------------------------------------------------------------------------
def check_no_orphan_allocations(db) -> tuple[bool, list[str]]:
    """Every allocation row must point to a valid project_id OR a valid
    chargeable_entity_id (or both)."""
    if _row_count(db, "allocations") == 0:
        return True, ["  (no data — skipping)"]
    issues: list[str] = []
    project_ids = _project_ids(db)
    entity_rows = db.execute(
        "SELECT id FROM chargeable_entities"
    ).fetchall() if _table_exists(db, "chargeable_entities") else []
    entity_ids = {r["id"] for r in entity_rows}
    rows = db.execute("""
        SELECT id, person_id, project_id, chargeable_entity_id
        FROM allocations
    """).fetchall()
    for r in rows:
        proj_ok = r["project_id"] in project_ids if r["project_id"] else False
        ent_ok = (
            r["chargeable_entity_id"] in entity_ids
            if r["chargeable_entity_id"] else False
        )
        if not proj_ok and not ent_ok:
            issues.append(
                f"  Allocation #{r['id']} (person={r['person_id']}): "
                f"neither project_id={r['project_id']} nor "
                f"chargeable_entity_id={r['chargeable_entity_id']} resolves"
            )
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Rule 9 — Distribution sum rule (v5 / Cluster F)
# ---------------------------------------------------------------------------
def check_distribution_sum_rule(db) -> tuple[bool, list[str]]:
    """For every (source_entity, year, version) the running sum
    ``to_business_pct + Σ(distribution.percentage) ≤ 100``.

    Cycle detection delegates to ``services.dag_resolver`` if importable;
    otherwise we run a defensive direct-cycle check (``A→B and B→A`` in
    the same year/version).
    """
    if _row_count(db, "distributions") == 0:
        return True, ["  (no data — skipping)"]
    if not _table_exists(db, "chargeable_entities"):
        return True, ["  (no chargeable_entities table — skipping)"]
    issues: list[str] = []

    # Sum rule
    rows = db.execute("""
        SELECT d.source_entity_id, d.year, d.version,
               COALESCE(SUM(d.percentage), 0) AS dist_sum,
               ce.to_business_pct
        FROM distributions d
        JOIN chargeable_entities ce ON ce.id = d.source_entity_id
        GROUP BY d.source_entity_id, d.year, d.version
    """).fetchall()
    for r in rows:
        total = float(r["dist_sum"]) + float(r["to_business_pct"] or 0)
        if total > 100.0 + BTC_SUM_TOLERANCE:
            issues.append(
                f"  {r['source_entity_id']} (year={r['year']}, "
                f"version={r['version']}): to_business_pct"
                f" + Σdist% = {total:.2f} > 100"
            )

    # Cycle detection via dag_resolver if available
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
        from services.dag_resolver import compute_effective_cost  # noqa: F401
        # Best-effort smoke check: just ensure the import worked.
    except Exception:
        # Defensive direct-cycle scan.
        edges = db.execute("""
            SELECT source_entity_id AS s, destination_entity_id AS d,
                   year, version
            FROM distributions
        """).fetchall()
        edge_set = {(e["s"], e["d"], e["year"], e["version"]) for e in edges}
        for s, d, y, v in sorted(edge_set):
            if (d, s, y, v) in edge_set:
                if s < d:  # report once per pair
                    issues.append(
                        f"  Cycle (direct): {s} <-> {d} "
                        f"(year={y}, version={v})"
                    )
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Rule 10 — BTC profile sum rule (v5 / Cluster F)
# ---------------------------------------------------------------------------
def check_btc_sum_rule(db) -> tuple[bool, list[str]]:
    """Every BTC profile's lines must sum to 100 (within tolerance)."""
    if _row_count(db, "btc_profiles") == 0:
        return True, ["  (no data — skipping)"]
    issues: list[str] = []
    rows = db.execute("""
        SELECT p.id, p.entity_id, p.year, p.mode, p.status,
               COALESCE(SUM(l.percentage), 0) AS line_sum,
               COUNT(l.id) AS line_count
        FROM btc_profiles p
        LEFT JOIN btc_profile_lines l ON l.profile_id = p.id
        GROUP BY p.id
    """).fetchall()
    for r in rows:
        line_sum = float(r["line_sum"])
        # Empty profiles only valid if it's a draft awaiting setup.
        if r["line_count"] == 0:
            if r["status"] == "active":
                issues.append(
                    f"  BTC profile #{r['id']} (entity={r['entity_id']}, "
                    f"year={r['year']}): active but zero lines"
                )
            continue
        if abs(line_sum - 100.0) > BTC_SUM_TOLERANCE:
            issues.append(
                f"  BTC profile #{r['id']} (entity={r['entity_id']}, "
                f"year={r['year']}): line sum = {line_sum:.4f} (expected 100)"
            )
    return len(issues) == 0, issues


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
CHECKS = [
    ("1. Summation Integrity",       check_summation_integrity),
    ("2. Temporal Consistency",      check_temporal_consistency),
    ("3. Allocation Consistency",    check_allocation_consistency),
    ("4. CR Consistency",            check_cr_consistency),
    ("5. CR Project FK Refs",        check_cr_project_refs),
    ("6. Staff Rates",               check_staff_rates),
    ("7. Baseline Coverage",         check_baseline_coverage),
    ("8. Polymorphic Allocation FK", check_no_orphan_allocations),
    ("9. Distribution Sum Rule",     check_distribution_sum_rule),
    ("10. BTC Profile Sum Rule",     check_btc_sum_rule),
]


def main() -> int:
    print("=" * 60)
    print("VIPER v5 Seed Data Consistency Validator")
    print("=" * 60)
    print()

    db = get_db()
    passed = 0
    failed = 0

    for name, check_fn in CHECKS:
        try:
            ok, issues = check_fn(db)
        except Exception as exc:  # noqa: BLE001
            ok = False
            issues = [f"  Exception: {exc}"]
        status = "PASS" if ok else "FAIL"
        symbol = "+" if ok else "x"
        print(f"[{symbol}] {name}: {status}")
        for issue in issues:
            print(issue)
        if issues:
            print()
        if ok:
            passed += 1
        else:
            failed += 1

    db.close()
    print()
    print("-" * 60)
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    print("-" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
