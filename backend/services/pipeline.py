"""Pipeline stage + DoI gate service [A-PS-04] [A-DOI-04..A-DOI-10].

Encodes the VIPER pipeline state machine (§2 lifecycle model) and the
data-completeness gate checks that govern DoI advancement. The router consumes:

- ``STAGES`` and the four grouping constants — ``BACKLOG_STAGES``,
  ``EXECUTION_STAGES``, ``TERMINAL_STAGES``, ``OFF_PATH_STAGES`` — used by
  the backlog (§3.3), Change Portfolio (§3.2), and cutoff math (§6).
- ``VALID_TRANSITIONS`` plus :func:`is_transition_allowed` to validate stage
  moves. Per ``[A-PS-11]`` we permit backwards transitions between on-path
  stages without an override; off-path stages (Paused / Cancelled) require an
  explicit ``override_reason`` to leave or re-enter the on-path flow.
- :func:`doi_for_stage` to suggest the typical DoI for a stage.
- ``WORKING_DOI_GATES`` plus :func:`validate_doi_gate` — each DoI level's
  required-fields list is encoded so the router can return missing fields in
  the 409 detail body. Gate definitions are working assumptions per
  ``[A-OQ-04]`` / ``[A-BK-30]`` and can be tuned later without code changes
  to the router.
- :func:`compute_pipeline_state` — assembles the GET response payload.

Target stage set (VIPER §2.3):
  On-path:  Proposed → Under Evaluation → Approved → Active → Hyper-maintenance
            → { Run entity spawned | Completed }
  Off-path: Paused, Cancelled  (carry frozen_doi)
  Removed:  Operate, Retired   (replaced by Run entity spawned / Completed)

All gate checks are pure: they read the project (and, for DoI 3+, the count
of milestones / baseline rows) and never mutate state. The router decides
whether to enforce or accept an override.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from sqlalchemy.orm import Session


# ---------------------------------------------------------------------------
# Stage constants ([A-PS-02], [A-BK-01], [A-PS-10])
# ---------------------------------------------------------------------------

STAGES: tuple[str, ...] = (
    "Proposed",
    "Under Evaluation",
    "Approved",
    "Active",
    "Hyper-maintenance",
    "Completed",
    "Run entity spawned",
    "Paused",
    "Cancelled",
)

# Stages whose projects appear in the ranked backlog (VIPER §2.5 / §3.3).
# Pre-execution planning surface only: a project leaves the backlog the moment
# it goes Active. Paused is excluded regardless — a mid-execution pause belongs
# in the Change Portfolio (§3.2), a pre-execution pause is rare and still out.
BACKLOG_STAGES: frozenset[str] = frozenset({
    "Proposed", "Under Evaluation", "Approved",
})

# Stages where projects are actively executing and consuming project budget
# (VIPER §2.5 / §3.2). Replaces the old five-stage BACKLOG set for the
# Change Portfolio and the cutoff envelope deduction (§6.2).
EXECUTION_STAGES: frozenset[str] = frozenset({
    "Active", "Hyper-maintenance",
})

# Terminal stages — project change lifecycle is complete (VIPER §2.3 / §2.5).
# Completed: no Run entity spawned (internal improvement, decommission, etc.).
# Run entity spawned: project handed off; run_entity_id points to the entity.
TERMINAL_STAGES: frozenset[str] = frozenset({
    "Completed", "Run entity spawned",
})

# Off-path stages without a DoI digit; they carry a frozen_doi reference
# to the DoI held when the project left the main path [A-PS-03] [A-PS-10].
OFF_PATH_STAGES: frozenset[str] = frozenset({"Paused", "Cancelled"})

# Intake/submission review sub-states stored on ``Project.review_state``
# (orthogonal to pipeline_stage; NULL when the project isn't mid-review).
# These replace the transient values formerly overloaded onto Project.status.
REVIEW_STATES: frozenset[str] = frozenset({
    "pending_cc_confirmation", "pending_approval", "changes_requested",
})


# ---------------------------------------------------------------------------
# Transition graph ([A-PS-11])
# ---------------------------------------------------------------------------

# Natural forward progression. The graph is intentionally permissive on
# backwards moves — every on-path stage can rewind to any earlier on-path
# stage. We encode the full target set per source so the GET response can
# advertise transitions_available without a separate data structure.
#
# Cancelled is "nearly one-way" per [A-PS-10] — un-cancel is allowed but
# requires an override_reason. We express that via the override-only check
# in is_transition_allowed rather than removing edges from the graph.
VALID_TRANSITIONS: dict[str, frozenset[str]] = {
    "Proposed": frozenset({
        "Under Evaluation", "Approved", "Paused", "Cancelled",
    }),
    "Under Evaluation": frozenset({
        "Proposed", "Approved", "Paused", "Cancelled",
    }),
    "Approved": frozenset({
        "Under Evaluation", "Active", "Paused", "Cancelled",
    }),
    "Active": frozenset({
        "Approved", "Hyper-maintenance",
        "Completed", "Run entity spawned",  # terminal exits added (VIPER §2.4)
        "Paused", "Cancelled",
    }),
    "Hyper-maintenance": frozenset({
        "Active",
        "Completed", "Run entity spawned",  # terminal exits added (VIPER §2.4)
        "Paused", "Cancelled",
    }),
    # Terminal stages — no exits. Projects reaching these stages do not move
    # on; any ongoing cost is carried by the spawned Run entity (if any).
    "Completed": frozenset(),
    "Run entity spawned": frozenset(),
    "Paused": frozenset(STAGES),  # Paused can resume into any stage [A-PS-10].
    "Cancelled": frozenset(STAGES),  # Un-cancel allowed but requires override.
}


def is_transition_allowed(
    from_stage: Optional[str],
    to_stage: str,
    override_reason: Optional[str],
) -> tuple[bool, Optional[str]]:
    """Check whether a stage transition is permitted by the graph rules.

    Returns ``(ok, error_message)``. ``ok`` is False only when the transition
    is structurally forbidden — bad target name, no edge in the graph, or
    leaving Cancelled without an override. Gate-field validation is a
    separate concern handled by :func:`validate_doi_gate`.

    - ``from_stage is None`` (new project) is treated as a transition into the
      target from the implicit "nothing" — always allowed.
    - Self-transition (``from == to``) is rejected as a no-op.
    - Cancelled -> anything requires ``override_reason`` per [A-PS-10].
    """
    if to_stage not in STAGES:
        return False, f"Unknown target stage: {to_stage}"

    if from_stage is None:
        return True, None

    if from_stage == to_stage:
        return False, f"Already in stage '{to_stage}'"

    if from_stage == "Cancelled" and not override_reason:
        return False, (
            "Leaving Cancelled stage requires override_reason "
            "(un-cancel is an audited explicit override per [A-PS-10])."
        )

    allowed = VALID_TRANSITIONS.get(from_stage, frozenset())
    if to_stage not in allowed:
        return False, (
            f"Transition '{from_stage}' -> '{to_stage}' is not a defined edge "
            f"in the pipeline graph."
        )
    return True, None


# ---------------------------------------------------------------------------
# DoI mapping ([A-DOI-01], [A-DOI-02])
# ---------------------------------------------------------------------------

# DoI is a maturity indicator; multiple stages can share a DoI level
# (Approved and Active both at 3 per [A-DOI-02]). The mapping below is a
# default — callers may override on transition. Off-path stages return None
# because their DoI is captured separately in frozen_doi per [A-PS-03].
_DOI_DEFAULTS: dict[str, Optional[int]] = {
    "Proposed": 0,
    "Under Evaluation": 2,  # Default after assessment; 1 in early evaluation.
    "Approved": 3,
    "Active": 3,
    "Hyper-maintenance": 4,
    "Completed": 5,           # Terminal; reached operate-readiness then closed.
    "Run entity spawned": 5,  # Terminal; handed off to a Run entity (VIPER §2.4).
    # Operate / Retired removed — see VIPER §2.3 / §13.4.
    "Paused": None,
    "Cancelled": None,
}


def doi_for_stage(stage: str) -> Optional[int]:
    """Return the typical DoI for a stage.

    The router uses this when the caller does not supply ``target_doi`` in
    a transition request. Values reflect the macro-phase mapping in
    [A-DOI-01]: Demand Funnel (0-2), Change Execution (3-4), Operation (4-5).
    """
    return _DOI_DEFAULTS.get(stage)


# ---------------------------------------------------------------------------
# DoI gate definitions ([A-DOI-04..A-DOI-10], [A-BK-30])
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class FieldRequirement:
    """Single required-field entry in a DoI gate.

    ``field_path`` is the attribute name on Project (or a dotted path the
    validator interprets specially for non-Project sources). ``label`` is the
    human-readable name surfaced in error messages. ``source`` controls how
    the validator inspects the value:

    - ``"project"`` — read ``getattr(project, field_path)`` and require non-null.
    - ``"project_truthy"`` — same but require truthy (used for booleans we
      need to be True, e.g. ``ai_council_approved``).
    - ``"tn_count"`` — placeholder for "number of Tech Navigator sub-criteria
      filled" (handled by validator). ``field_path`` is the minimum count.
    - ``"milestone_count"`` — minimum number of project.phases rows. A4 will
      rename phases -> milestones; the validator dereferences the live
      attribute so the rename is mechanical.
    - ``"baseline_count"`` — minimum number of project.baselines rows.
    """

    field_path: str
    label: str
    source: Literal[
        "project", "project_truthy", "tn_count",
        "milestone_count", "baseline_count",
    ]


# Working set of gate requirements per DoI level. Encodes only fields that
# already exist on the Project model — the new attachment / demand-type /
# value-stream / wave fields per [A-DA-03] are explicitly out of scope for
# A2 and tracked as a follow-up. Each level's list is the set of fields that
# must be filled to *be at* that DoI; advancing TO a level uses that level's
# list.
WORKING_DOI_GATES: dict[int, list[FieldRequirement]] = {
    # DoI 0 minimum [A-DOI-04]: enough metadata to exist as a backlog entry.
    # Spec also lists structured description sections, requesting BU, demand
    # type, value stream, Wave ID — those columns don't exist yet and are
    # deferred per [A-DA-03]. We require the existing description as a
    # reasonable proxy plus the proposing PL.
    0: [
        FieldRequirement("name", "Project name", "project"),
        FieldRequirement("description", "Structured description", "project"),
        FieldRequirement("pl_person_id", "Proposing person (Project Lead)", "project"),
        FieldRequirement("project_type", "Project Type (1/2/3)", "project"),
    ],

    # DoI 0 -> 1 gate [A-DOI-05]: AI Council screening complete. project_type
    # (P1/P2/P3) is required here so a project cannot enter the *ranked* backlog
    # without a classification (it decides pre-funded vs. contestable treatment).
    1: [
        FieldRequirement("project_type", "Project Type (1/2/3)", "project"),
        FieldRequirement("composite_score", "Tech Navigator composite score", "project"),
        FieldRequirement("tshirt_size", "Budget t-shirt size", "project"),
        FieldRequirement("transformation_level", "Transformation level (T0/T1/T2)", "project"),
        FieldRequirement("ai_council_approved", "AI Council approval flag", "project_truthy"),
        FieldRequirement("ai_council_doc_url", "AI Council confirmation document", "project"),
    ],

    # DoI 1 -> 2 gate [A-DOI-06]: complete TN sub-criteria + budget split.
    2: [
        FieldRequirement("tn_standardization", "TN: Standardization sub-criterion", "project"),
        FieldRequirement("tn_usage", "TN: Usage sub-criterion", "project"),
        FieldRequirement("tn_maintenance", "TN: Maintenance sub-criterion", "project"),
        FieldRequirement("tn_financial_benefit", "TN: Financial benefit sub-criterion", "project"),
        FieldRequirement("tn_payback", "TN: Payback sub-criterion", "project"),
        FieldRequirement("tn_competitive_advantage", "TN: Competitive advantage sub-criterion", "project"),
        FieldRequirement("total_budget", "Total budget (EUR)", "project"),
        FieldRequirement("capex_opex", "CapEx/OpEx classification", "project"),
    ],

    # DoI 2 -> 3 gate [A-DOI-07] [A-DOI-08]: Pitch Board approval, baseline,
    # milestone breakdown. Milestones use project.phases until A4 renames
    # the relationship to milestones.
    3: [
        FieldRequirement("1", "At least one milestone with baseline dates", "milestone_count"),
        FieldRequirement("start_month", "Project start month", "project"),
    ],

    # DoI 3 -> 4 gate [A-DOI-09]: post-launch. We use the presence of any
    # baseline row as a heuristic for "named resource assignments confirmed".
    # The full named-assignment workflow lands in A5/A6.
    4: [
        FieldRequirement("1", "At least one baseline forecast row", "baseline_count"),
    ],

    # DoI 4 -> 5 gate [A-DOI-10]: scale / operate. Termination date set or
    # explicitly left open — we require end_month to be present (an explicit
    # null is also fine per [A-PL-04], but we cannot distinguish "explicitly
    # open" from "not yet decided" without a new field, so for v5 we require
    # an explicit end_month).
    5: [
        FieldRequirement("end_month", "Operate-stage termination date (end_month)", "project"),
    ],
}

# Stage-keyed gate requirement for the 'Run entity spawned' transition.
# DEFINITION ONLY (VIPER Wave 1) — enforcement is wired router-side in Wave 3.
# The DoI-keyed WORKING_DOI_GATES cannot differentiate Completed vs Run-entity-
# spawned at DoI 5; the router uses a separate stage-keyed check for this
# invariant. Do not add new references before Wave 3.
RUN_ENTITY_SPAWNED_REQUIREMENT = FieldRequirement(
    "run_entity_id", "Spawned Run entity", "project"
)

# Stage-entry prerequisites — checked when a project ENTERS the stage,
# independent of any DoI advance. Entering execution requires that resources
# are confirmed (≥1 baseline row): "Active" defaults to DoI 3, so an
# Approved→Active move is not a forward-DoI move and would otherwise skip the
# DoI-4 baseline gate. Enforced router-side with override_reason as the escape
# hatch (mirrors the DoI-gate 409).
STAGE_ENTRY_REQUIREMENTS: dict[str, list[FieldRequirement]] = {
    "Active": [
        FieldRequirement("1", "At least one baseline row (confirmed resources)", "baseline_count"),
    ],
    "Hyper-maintenance": [
        FieldRequirement("1", "At least one baseline row (confirmed resources)", "baseline_count"),
    ],
}


def validate_stage_entry(project, target_stage: str, db: Session) -> list[str]:
    """Return missing-field labels for ENTERING ``target_stage``.

    Empty list = no stage-entry prerequisite (or all satisfied). The caller
    decides whether to enforce a 409 or accept an override_reason.
    """
    missing: list[str] = []
    for req in STAGE_ENTRY_REQUIREMENTS.get(target_stage, []):
        msg = _check_requirement(project, db, req)
        if msg is not None:
            missing.append(msg)
    return missing


def _check_requirement(project, db: Session, req: FieldRequirement) -> Optional[str]:
    """Return the missing-field message for ``req`` or None when satisfied."""
    if req.source == "project":
        if getattr(project, req.field_path, None) in (None, ""):
            return req.label
        return None

    if req.source == "project_truthy":
        if not getattr(project, req.field_path, False):
            return req.label
        return None

    if req.source == "milestone_count":
        # A4 will rename to project.milestones; we read whichever exists.
        items = getattr(project, "milestones", None)
        if items is None:
            items = getattr(project, "phases", []) or []
        if len(list(items)) < int(req.field_path):
            return req.label
        return None

    if req.source == "baseline_count":
        items = getattr(project, "baselines", []) or []
        if len(list(items)) < int(req.field_path):
            return req.label
        return None

    if req.source == "tn_count":
        # Reserved for future use — count of non-null TN sub-criteria.
        filled = sum(
            1
            for attr in (
                "tn_standardization", "tn_usage", "tn_maintenance",
                "tn_financial_benefit", "tn_payback", "tn_competitive_advantage",
            )
            if getattr(project, attr, None) is not None
        )
        if filled < int(req.field_path):
            return req.label
        return None

    return None


def validate_doi_gate(project, target_doi: int, db: Session) -> list[str]:
    """Return the list of missing-field labels for advancing to ``target_doi``.

    Empty list means all fields are satisfied. The caller (router) decides
    whether to enforce a 409 or accept an override per [A-BK-30]. The check
    is non-recursive: validating "advance to DoI 3" does not re-check DoI 0,
    1, 2 — that policy is the controller's choice and matches the spec's
    framing of each gate as the requirements *for that level*.
    """
    requirements = WORKING_DOI_GATES.get(int(target_doi), [])
    missing: list[str] = []
    for req in requirements:
        msg = _check_requirement(project, db, req)
        if msg is not None:
            missing.append(msg)
    return missing


# ---------------------------------------------------------------------------
# Pipeline state assembly (GET response shape)
# ---------------------------------------------------------------------------

def compute_pipeline_state(project, db: Session) -> dict:
    """Build the dict consumed by ``PipelineStateResponse`` for a project.

    Keys mirror the schema. ``transitions_available`` is the set of stages
    that pass :func:`is_transition_allowed` from the project's current stage,
    excluding any that would require an override (so the UI knows which
    transitions are one-click vs. override-only).
    """
    current_stage = project.pipeline_stage
    current_doi = project.doi
    next_doi = (current_doi + 1) if current_doi is not None and current_doi < 5 else None

    # Transitions: report only edges that succeed without an override.
    transitions_available: list[str] = []
    if current_stage is not None:
        for candidate in STAGES:
            ok, _ = is_transition_allowed(current_stage, candidate, override_reason=None)
            if ok:
                transitions_available.append(candidate)

    # Gate status for the next DoI step.
    missing_fields: list[str] = []
    can_advance = True
    if next_doi is not None:
        missing_fields = validate_doi_gate(project, next_doi, db)
        can_advance = not missing_fields

    return {
        "project_id": project.id,
        "pipeline_stage": current_stage,
        "doi": current_doi,
        "frozen_doi": project.frozen_doi,
        "ai_council_approved": project.ai_council_approved,
        "ai_council_doc_url": project.ai_council_doc_url,
        "within_cutoff": project.within_cutoff,
        "transitions_available": transitions_available,
        "gate_status": {
            "current_doi": current_doi,
            "next_doi": next_doi,
            "missing_fields": missing_fields,
            "can_advance": can_advance,
            # Override is always available to controllers per [A-BK-30].
            "override_available": True,
        },
    }
