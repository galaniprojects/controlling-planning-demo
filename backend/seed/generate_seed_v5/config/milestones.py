"""Milestone catalogue, per-project milestone schedules, deliverable
checklists and progress snapshot history.

Owned by Phase 2 T2 (financials & lifecycle). Read-only consumed by
``s17_milestones`` and ``s18_progress``.

Decision tags:
- [A-MS-01..03]: ProjectMilestone with baseline + forecast windows;
  baseline immutable after first save (override only via controller audit).
- [A-BK-34]: MilestoneType global catalogue.
- [E-04c]: Per-milestone deliverable checklist; ProgressSnapshot history
  (subsumes legacy ``loader._seed_progress_tracker_data``).
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Global milestone-type catalogue [A-BK-34]. Default colours align with the
# project-phase palette; per-milestone ``color`` overrides on
# ``project_milestones.color`` take precedence at render time.
# ---------------------------------------------------------------------------
MILESTONE_TYPES: list[dict] = [
    {"id": "mt-planning",       "name": "Planning",                       "color": "blue",    "ordering": 1},
    {"id": "mt-requirements",   "name": "Requirements & Analysis",        "color": "teal",    "ordering": 2},
    {"id": "mt-development",    "name": "Development",                    "color": "emerald", "ordering": 3},
    {"id": "mt-testing",        "name": "Testing/QA",                     "color": "amber",   "ordering": 4},
    {"id": "mt-uat",            "name": "UAT",                            "color": "violet",  "ordering": 5},
    {"id": "mt-pilot",          "name": "Pilot",                          "color": "indigo",  "ordering": 6},
    {"id": "mt-rollout",        "name": "Rollout",                        "color": "sky",     "ordering": 7},
    {"id": "mt-data-migration", "name": "Data Migration",                 "color": "cyan",    "ordering": 8},
    {"id": "mt-training",       "name": "Training/Change Management",     "color": "rose",    "ordering": 9},
    {"id": "mt-hypermaint",     "name": "Hyper-maintenance",              "color": "slate",   "ordering": 10},
]


# Substring → milestone_type_id resolver (case-insensitive). Order matters —
# more specific labels first. Mirrors v4 s09_milestones._NAME_TO_TYPE_ID.
NAME_TO_TYPE_ID: list[tuple[str, str]] = [
    ("requirements",   "mt-requirements"),
    ("discovery",      "mt-requirements"),
    ("assessment",     "mt-requirements"),
    ("planning",       "mt-planning"),
    ("concept",        "mt-planning"),
    ("design",         "mt-planning"),
    ("architecture",   "mt-planning"),
    ("engineering",    "mt-development"),
    ("development",    "mt-development"),
    ("build",          "mt-development"),
    ("implementation", "mt-development"),
    ("integration",    "mt-development"),
    ("migration",      "mt-data-migration"),
    ("test",           "mt-testing"),
    ("validation",     "mt-testing"),
    ("commissioning",  "mt-testing"),
    ("rollout",        "mt-rollout"),
    ("launch",         "mt-rollout"),
    ("go-live",        "mt-rollout"),
    ("deployment",     "mt-rollout"),
    ("hyper",          "mt-hypermaint"),
    ("operate",        "mt-hypermaint"),  # Operate sits inside hypermaint band visually.
    ("pilot",          "mt-pilot"),
    ("uat",            "mt-uat"),
]


def resolve_milestone_type_id(name: str) -> str | None:
    """Resolve a milestone display name to a catalogue id."""
    lower = name.lower()
    for needle, type_id in NAME_TO_TYPE_ID:
        if needle in lower:
            return type_id
    return None


# ---------------------------------------------------------------------------
# Per-project milestone schedules [A-MS-01].
#
# DEMO_DATE = 2026-04. Each list is ordered by sequence_number 1..N.
# Fields per milestone:
#   - n: sequence_number
#   - name: display
#   - bs/be: baseline_start / baseline_end (YYYY-MM)
#   - fs/fe: forecast_start / forecast_end (YYYY-MM)
#   - color: optional per-milestone override (None falls back to type colour)
#
# Two DoI 0 projects (proj-greenedge, proj-connveh) are intentionally omitted
# — they have no milestone plan yet and ``current_milestone_id`` stays NULL
# per the verification rule in the plan doc.
# ---------------------------------------------------------------------------
PROJECT_MILESTONES: dict[str, list[dict]] = {
    # Active flagship — Master Data Hub Rollout (Oct 2025 – Dec 2026)
    "proj-mdh-rollout": [
        {"n": 1, "name": "Discovery",     "bs": "2025-10", "be": "2025-12", "fs": "2025-10", "fe": "2025-12", "color": "blue"},
        {"n": 2, "name": "Design",        "bs": "2026-01", "be": "2026-03", "fs": "2026-01", "fe": "2026-03", "color": "teal"},
        {"n": 3, "name": "Build",         "bs": "2026-04", "be": "2026-08", "fs": "2026-04", "fe": "2026-08", "color": "emerald"},
        {"n": 4, "name": "Test",          "bs": "2026-09", "be": "2026-10", "fs": "2026-09", "fe": "2026-10", "color": "amber"},
        {"n": 5, "name": "Rollout",       "bs": "2026-11", "be": "2026-12", "fs": "2026-11", "fe": "2026-12", "color": "violet"},
    ],

    # Active red — ERP Integration Phase 2 (Jul 2024 – Sep 2026)
    "proj-erp2": [
        {"n": 1, "name": "Discovery",     "bs": "2024-07", "be": "2024-10", "fs": "2024-07", "fe": "2024-10", "color": "blue"},
        {"n": 2, "name": "Design",        "bs": "2024-11", "be": "2025-03", "fs": "2024-11", "fe": "2025-04", "color": "teal"},
        {"n": 3, "name": "Build",         "bs": "2025-04", "be": "2025-12", "fs": "2025-05", "fe": "2026-02", "color": "amber"},
        {"n": 4, "name": "Test",          "bs": "2026-01", "be": "2026-04", "fs": "2026-03", "fe": "2026-06", "color": "emerald"},
        {"n": 5, "name": "Rollout",       "bs": "2026-05", "be": "2026-06", "fs": "2026-07", "fe": "2026-09", "color": "violet"},
    ],

    # Active amber — Sensor Data Pipeline (Mar 2025 – Dec 2026)
    "proj-sensor": [
        {"n": 1, "name": "Planning",      "bs": "2025-03", "be": "2025-06", "fs": "2025-03", "fe": "2025-06", "color": "blue"},
        {"n": 2, "name": "Build",         "bs": "2025-07", "be": "2026-04", "fs": "2025-07", "fe": "2026-05", "color": "amber"},
        {"n": 3, "name": "Test",          "bs": "2026-05", "be": "2026-09", "fs": "2026-06", "fe": "2026-10", "color": "emerald"},
        {"n": 4, "name": "Deployment",    "bs": "2026-10", "be": "2026-12", "fs": "2026-11", "fe": "2026-12", "color": "violet"},
    ],

    # Approved — Predictive Maintenance PoC (Jun 2025 – Mar 2027)
    "proj-predmaint": [
        {"n": 1, "name": "Discovery",     "bs": "2025-06", "be": "2025-12", "fs": "2025-06", "fe": "2025-12", "color": "blue"},
        {"n": 2, "name": "PoC",           "bs": "2026-01", "be": "2026-09", "fs": "2026-01", "fe": "2026-10", "color": "teal"},
        {"n": 3, "name": "Pilot",         "bs": "2026-10", "be": "2027-03", "fs": "2026-11", "fe": "2027-03", "color": "amber"},
    ],

    # Under Evaluation late (DoI 2 intake) — Smart Logistics (Jun 2026 – Dec 2027)
    "proj-autobrake": [
        {"n": 1, "name": "Concept",       "bs": "2026-06", "be": "2026-09", "fs": "2026-06", "fe": "2026-09", "color": "blue"},
        {"n": 2, "name": "Design",        "bs": "2026-10", "be": "2027-02", "fs": "2026-10", "fe": "2027-02", "color": "teal"},
        {"n": 3, "name": "Development",   "bs": "2027-03", "be": "2027-09", "fs": "2027-03", "fe": "2027-09", "color": "emerald"},
        {"n": 4, "name": "Test",          "bs": "2027-10", "be": "2027-12", "fs": "2027-10", "fe": "2027-12", "color": "amber"},
    ],

    # Approved — Supply Chain Compliance (Sep 2026 – Jun 2028)
    "proj-railsafety": [
        {"n": 1, "name": "Requirements",  "bs": "2026-09", "be": "2027-01", "fs": "2026-09", "fe": "2027-01", "color": "blue"},
        {"n": 2, "name": "Implementation","bs": "2027-02", "be": "2027-12", "fs": "2027-02", "fe": "2027-12", "color": "teal"},
        {"n": 3, "name": "Certification", "bs": "2028-01", "be": "2028-04", "fs": "2028-01", "fe": "2028-04", "color": "amber"},
        {"n": 4, "name": "Deployment",    "bs": "2028-05", "be": "2028-06", "fs": "2028-05", "fe": "2028-06", "color": "violet"},
    ],

    # Under Evaluation early — Data Warehouse Consolidation (Jul 2026 – Sep 2027)
    "proj-dwh": [
        {"n": 1, "name": "Planning",      "bs": "2026-07", "be": "2026-12", "fs": "2026-07", "fe": "2026-12", "color": "blue"},
        {"n": 2, "name": "Build",         "bs": "2027-01", "be": "2027-06", "fs": "2027-01", "fe": "2027-06", "color": "emerald"},
        {"n": 3, "name": "Test",          "bs": "2027-07", "be": "2027-09", "fs": "2027-07", "fe": "2027-09", "color": "amber"},
    ],

    # Run — Cloud Platform Run (Operate from 2024-01)
    "proj-cloud3-run": [
        {"n": 1, "name": "Operate",       "bs": "2024-01", "be": "2030-12", "fs": "2024-01", "fe": "2030-12", "color": "slate"},
    ],

    # Run — Identity & Access Management Run (Operate; with hyper-maintenance phase recently completed)
    "proj-iam-run": [
        {"n": 1, "name": "Implementation","bs": "2024-01", "be": "2025-06", "fs": "2024-01", "fe": "2025-06", "color": "emerald"},
        {"n": 2, "name": "Operate",       "bs": "2025-07", "be": "2030-12", "fs": "2025-07", "fe": "2030-12", "color": "slate"},
    ],
}


# ---------------------------------------------------------------------------
# Per-milestone deliverable checklists [E-04c].
#
# Three demo entities each receive 7 items with 4 marked complete (the
# "4-of-7" demo shape called out in the plan doc). The checklist attaches
# to the entity's *current* milestone so the auto-computed
# ``Project.progress_pct`` lands at 4/7 ≈ 57%.
# ---------------------------------------------------------------------------
DELIVERABLE_CHECKLISTS: dict[str, dict] = {
    "proj-mdh-rollout": {
        "milestone_seq": 3,  # Build phase — currently active in DEMO_DATE = 2026-04
        "items": [
            ("Source-system inventory finalised",        True),
            ("Reference-data taxonomy approved",         True),
            ("Snowflake schemas provisioned",            True),
            ("Match/merge rules pilot complete",         True),
            ("API contract published to consumers",      False),
            ("Stewardship playbook ratified",            False),
            ("Production cutover runbook drafted",       False),
        ],
    },
    "proj-erp2": {
        "milestone_seq": 4,  # Test phase
        "items": [
            ("API integration suite signed off",         True),
            ("Performance benchmarks within SLA",        True),
            ("UAT scenarios executed",                   True),
            ("Cutover plan reviewed with TBS",           True),
            ("UAT defects resolved",                     False),
            ("Cutover plan rehearsal",                   False),
            ("Go/No-Go decision recorded",               False),
        ],
    },
    "proj-iam-run": {
        "milestone_seq": 2,  # Operate phase
        "items": [
            ("Pilot user group migrated",                True),
            ("Production federation enabled (primary)", True),
            ("Service desk runbook published",          True),
            ("Quarterly access review automated",       True),
            ("DR-site federation enabled",              False),
            ("Self-service password reset rollout",     False),
            ("Legacy AD decommission plan",             False),
        ],
    },
}


# ---------------------------------------------------------------------------
# ProgressSnapshot history per ChargeableEntity [E-04c].
#
# Each demo entity gets 3 cycle closures (Q4 2025, Q1 2026, Q2 2026) so the
# Workbench Overview drill-down (Progress tile per [E-03f]) renders a
# progress trajectory. Q2 2026 reflects the live state captured by
# ``DELIVERABLE_CHECKLISTS`` above.
#
# Live-state fields (narrative, confidence, reason, current milestone) are
# applied to ``Project`` rows by s18; older snapshots are recorded as past
# states. ``progress_updated_at`` is set to 2026-04-15 09:00:00.
# ---------------------------------------------------------------------------
PROGRESS_LIVE: dict[str, dict] = {
    "proj-mdh-rollout": {
        "current_milestone_seq": 3,  # Build
        "progress_pct": 57.14,        # 4/7 — auto-computed when checklist exists
        "manual_override": False,
        "narrative": (
            "Build streams on plan; reference-data taxonomy ratified, match/merge "
            "pilot complete. API contract draft pending Snowflake security review."
        ),
        "confidence": "on_track",
        "reason": None,
    },
    "proj-erp2": {
        "current_milestone_seq": 4,  # Test
        "progress_pct": 57.14,
        "manual_override": False,
        "narrative": (
            "UAT in progress; two open defects under triage. Cutover plan reviewed "
            "with TBS leadership."
        ),
        "confidence": "at_risk",
        "reason": "Two P1 integration defects pending vendor fix.",
    },
    "proj-iam-run": {
        "current_milestone_seq": 2,  # Operate
        "progress_pct": 57.14,
        "manual_override": False,
        "narrative": (
            "Steady-state operations; DR federation rollout paused while AD "
            "handshake issue is triaged with vendor."
        ),
        "confidence": "blocked",
        "reason": "Federation handshake failing in DR site; ticket open with vendor.",
    },
}


# Per-cycle snapshots: list of (cycle_label, cycle_id, snapshot_at, pct, conf, milestone_seq, items_complete_count).
# items_complete_count is the number of checklist items that were complete
# at the time of the snapshot — used to reconstruct historical checklist
# state for the rendered History view (we only keep "first N items
# complete" semantics; finer-grained reconstruction is intentionally out of
# scope for the demo).
PROGRESS_SNAPSHOTS: dict[str, list[dict]] = {
    "proj-mdh-rollout": [
        {"cycle_label": "Q4 2025 Cycle", "cycle_id": "seed-q4-2025", "snapshot_at": "2025-10-15 10:00:00", "milestone_seq": 1, "pct": 80.00, "confidence": "on_track", "items_complete": 0, "narrative": "Discovery phase wrapping up; design kickoff scheduled for January."},
        {"cycle_label": "Q1 2026 Cycle", "cycle_id": "seed-q1-2026", "snapshot_at": "2026-01-15 10:00:00", "milestone_seq": 2, "pct": 50.00, "confidence": "on_track", "items_complete": 0, "narrative": "Design workstreams underway; reference-data taxonomy circulated for stakeholder review."},
        {"cycle_label": "Q2 2026 Cycle", "cycle_id": "seed-q2-2026", "snapshot_at": "2026-04-15 10:00:00", "milestone_seq": 3, "pct": 57.14, "confidence": "on_track", "items_complete": 4, "narrative": "Build streams on plan; reference-data taxonomy ratified, match/merge pilot complete. API contract draft pending Snowflake security review."},
    ],
    "proj-erp2": [
        {"cycle_label": "Q4 2025 Cycle", "cycle_id": "seed-q4-2025", "snapshot_at": "2025-10-15 10:00:00", "milestone_seq": 3, "pct": 70.00, "confidence": "at_risk", "items_complete": 0, "narrative": "Build phase trailing schedule; integration backlog accumulating."},
        {"cycle_label": "Q1 2026 Cycle", "cycle_id": "seed-q1-2026", "snapshot_at": "2026-01-15 10:00:00", "milestone_seq": 3, "pct": 95.00, "confidence": "at_risk", "items_complete": 2, "narrative": "Build close to complete; UAT to start in February."},
        {"cycle_label": "Q2 2026 Cycle", "cycle_id": "seed-q2-2026", "snapshot_at": "2026-04-15 10:00:00", "milestone_seq": 4, "pct": 57.14, "confidence": "at_risk", "items_complete": 4, "narrative": "UAT in progress; two open defects under triage. Cutover plan reviewed with TBS leadership."},
    ],
    "proj-iam-run": [
        {"cycle_label": "Q4 2025 Cycle", "cycle_id": "seed-q4-2025", "snapshot_at": "2025-10-15 10:00:00", "milestone_seq": 2, "pct": 30.00, "confidence": "on_track", "items_complete": 1, "narrative": "Operate transition begun; pilot user group migrated."},
        {"cycle_label": "Q1 2026 Cycle", "cycle_id": "seed-q1-2026", "snapshot_at": "2026-01-15 10:00:00", "milestone_seq": 2, "pct": 45.00, "confidence": "at_risk", "items_complete": 2, "narrative": "Production federation live; service desk runbook in flight."},
        {"cycle_label": "Q2 2026 Cycle", "cycle_id": "seed-q2-2026", "snapshot_at": "2026-04-15 10:00:00", "milestone_seq": 2, "pct": 57.14, "confidence": "blocked", "items_complete": 4, "narrative": "Steady-state operations; DR federation rollout paused while AD handshake issue is triaged with vendor."},
    ],
}
