"""Stage 1 distribution service.

Per `[F-S1-01..08]` (Charging/UM rework cluster FD-3):

- `[F-S1-02]` Versions are effective-dated; production resolution by latest
  ``active_from`` ≤ evaluated date. Identical ``active_from`` for the same
  scope is forbidden (service-enforced).
- `[F-S1-02]` Sum-rule: ``to_business_pct + Σ outgoing ≤ 100``. Residual is
  self-retained — the entity "charges itself".
- `[F-S1-04]` Version creation origins: ``blank`` / ``copy_active`` /
  ``copy_prior``; draft-then-schedule pattern mirroring UMVersion / BTCProfile.
- `[F-S1-05]` Rationale is first-class on the version (and per edge).
  Activation requires non-empty version rationale.
- `[F-S1-05]` Cycle detection is hard-block on save with an error message
  showing the cycle chain.
- `[F-S1-08]` Active production versions are immutable (header + edges).
  Activation granularity is per version; per-edge activation is rejected.

The router calls into these helpers; service-level errors are raised as
``DistributionValidationError`` and translated to HTTP 409 responses.

**Service invariants** (enforced here — same pattern UMVersion uses, since
SQLite partial unique indexes are not portable):

1. ``status='active'`` requires ``scenario_id IS NULL`` — scenario versions
   stay ``'draft'`` permanently.
2. Two **production** active rows must not share ``active_from``.
3. Active production version is immutable (header + edges).
4. Activation requires non-NULL ``active_from`` and non-empty ``rationale``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import (
    DISTRIBUTION_VERSION_SOURCES,
    ChargeableEntity,
    Distribution,
    DistributionVersion,
)
from services.dag_resolver import detect_cycle_db


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class DistributionValidationError(Exception):
    """Raised by the service when a write would violate a business rule.

    The router catches this and returns 409 Conflict with a structured body
    containing the message and (for cycles) the cycle chain.
    """

    def __init__(self, message: str, *, cycle_chain: Optional[list[str]] = None):
        super().__init__(message)
        self.message = message
        self.cycle_chain = cycle_chain


# ---------------------------------------------------------------------------
# Version resolution + lookups
# ---------------------------------------------------------------------------


def get_version(db: Session, version_id: int) -> DistributionVersion:
    """Fetch a ``DistributionVersion`` by id; raise if not found."""
    v = db.query(DistributionVersion).filter_by(id=version_id).first()
    if v is None:
        raise DistributionValidationError(
            f"DistributionVersion {version_id} not found",
        )
    return v


def resolve_active_version(
    db: Session, evaluated_date: date,
) -> Optional[DistributionVersion]:
    """Return the production version in force for ``evaluated_date`` per `[F-S1-02]`.

    Production scope only — scenario-scoped versions (``scenario_id`` not
    NULL) are excluded. The result is the active row with the latest
    ``active_from`` ≤ ``evaluated_date``. None if no version is in force
    (an unseeded / pre-history state).
    """
    return (
        db.query(DistributionVersion)
        .filter(
            DistributionVersion.scenario_id.is_(None),
            DistributionVersion.status == "active",
            DistributionVersion.active_from <= evaluated_date,
        )
        .order_by(
            DistributionVersion.active_from.desc(),
            DistributionVersion.id.desc(),
        )
        .first()
    )


def resolve_active_version_or_raise(
    db: Session, evaluated_date: date,
) -> DistributionVersion:
    v = resolve_active_version(db, evaluated_date)
    if v is None:
        raise DistributionValidationError(
            f"No production DistributionVersion in force for {evaluated_date}",
        )
    return v


def list_versions(
    db: Session,
    *,
    status: Optional[str] = None,
    include_scenario: bool = False,
) -> list[DistributionVersion]:
    """List ``DistributionVersion`` rows with optional filters.

    Ordering: production versions first (``scenario_id IS NULL``), then by
    ``active_from`` desc (NULLs last — drafts at the bottom of the list),
    then by ``id`` desc as the deterministic tiebreaker.
    """
    q = db.query(DistributionVersion)
    if not include_scenario:
        q = q.filter(DistributionVersion.scenario_id.is_(None))
    if status is not None:
        q = q.filter(DistributionVersion.status == status)
    return q.order_by(
        DistributionVersion.scenario_id.is_(None).desc(),
        DistributionVersion.active_from.desc().nullslast(),
        DistributionVersion.id.desc(),
    ).all()


def list_edges_for_version(
    db: Session, version_id: int,
) -> list[Distribution]:
    """Return all edges sourced + destinated on the version, deterministic order."""
    return (
        db.query(Distribution)
        .filter(Distribution.version_id == version_id)
        .order_by(
            Distribution.source_entity_id,
            Distribution.destination_entity_id,
        )
        .all()
    )


def _require_draft_version(version: DistributionVersion) -> None:
    """Service invariant per `[F-S1-08]`: only drafts are mutable."""
    if version.status == "active":
        raise DistributionValidationError(
            f"DistributionVersion {version.id} is 'active' and immutable per "
            f"[F-S1-08] — create a new draft (origin='copy_active') instead.",
        )


# ---------------------------------------------------------------------------
# Version state machine — create / update / activate / delete
# ---------------------------------------------------------------------------


def create_version(
    db: Session,
    *,
    origin: str,
    rationale: Optional[str] = None,
    copied_from_version_id: Optional[int] = None,
    created_by_person_id: Optional[str] = None,
    scenario_id: Optional[int] = None,
    evaluated_date: Optional[date] = None,
) -> DistributionVersion:
    """Create a new draft ``DistributionVersion`` per `[F-S1-04]`.

    Three origins:

    - ``'blank'`` — empty draft, no edges. ``copied_from_version_id``
      ignored.
    - ``'copy_active'`` — copy edges from the production version currently
      in force (``resolve_active_version(db, evaluated_date or today)``).
      Sets ``copied_from_version_id`` to the resolved active version's id.
      Raises if no production version is in force.
    - ``'copy_prior'`` — copy edges from the version identified by
      ``copied_from_version_id`` (required for this origin).
    - ``'seed'`` — reserved for the seed loader; service-callers should
      not use it (it carries no copy semantics).

    Scenario-scoped versions are created lazily by ``scenario_lever12``
    (it passes ``scenario_id`` here). API callers must not pass
    ``scenario_id`` — the router enforces that.

    Returns the new ``DistributionVersion`` row (flushed; not committed).
    Caller commits within the audit-log transaction.
    """
    if origin not in DISTRIBUTION_VERSION_SOURCES:
        raise DistributionValidationError(
            f"Invalid origin '{origin}'; expected one of "
            f"{', '.join(DISTRIBUTION_VERSION_SOURCES)}",
        )
    if origin == "copy_prior" and copied_from_version_id is None:
        raise DistributionValidationError(
            "origin='copy_prior' requires copied_from_version_id",
        )

    resolved_active: Optional[DistributionVersion] = None
    if origin == "copy_active":
        eval_date = evaluated_date or date.today()
        resolved_active = resolve_active_version(db, eval_date)
        if resolved_active is None:
            raise DistributionValidationError(
                "Cannot create a 'copy_active' draft — no production "
                f"DistributionVersion is in force for {eval_date}",
            )
        # Override / set the lineage explicitly.
        copied_from_version_id = resolved_active.id

    if copied_from_version_id is not None:
        src = get_version(db, copied_from_version_id)
    else:
        src = None

    new = DistributionVersion(
        active_from=None,
        status="draft",
        rationale=rationale or "",
        origin=origin,
        copied_from_version_id=copied_from_version_id,
        scenario_id=scenario_id,
        created_by_person_id=created_by_person_id,
    )
    db.add(new)
    db.flush()  # assign new.id

    # Copy edges from the source version, if any.
    if src is not None and origin in ("copy_active", "copy_prior"):
        for edge in list_edges_for_version(db, src.id):
            db.add(
                Distribution(
                    version_id=new.id,
                    source_entity_id=edge.source_entity_id,
                    destination_entity_id=edge.destination_entity_id,
                    percentage=edge.percentage,
                    rationale=edge.rationale,
                )
            )

    return new


def update_version_rationale(
    db: Session, version_id: int, *, rationale: str,
) -> DistributionVersion:
    """Update a draft version's rationale per `[F-S1-05]`.

    The service rejects updates on an active version (immutable per
    `[F-S1-08]`). Edges remain mutable via ``create_distribution_edge`` /
    ``update_distribution_edge`` while the version is in draft.
    """
    v = get_version(db, version_id)
    _require_draft_version(v)
    v.rationale = rationale
    return v


def activate_version(
    db: Session, version_id: int, *, active_from: date, rationale: str,
) -> DistributionVersion:
    """Flip a draft production version to active per `[F-S1-02..03][F-S1-08]`.

    Requires:
    - The version is currently ``status='draft'``.
    - The version is production-scope (``scenario_id IS NULL``) — scenario
      versions stay draft permanently.
    - ``rationale`` is non-empty after stripping whitespace.
    - No other production active version shares ``active_from``.

    On success: sets ``status='active'``, ``activated_at=now()``,
    ``active_from`` and ``rationale`` to the provided values. Header + edges
    are then immutable.
    """
    v = get_version(db, version_id)

    if v.status == "active":
        raise DistributionValidationError(
            f"DistributionVersion {version_id} is already active.",
        )
    if v.scenario_id is not None:
        raise DistributionValidationError(
            f"DistributionVersion {version_id} is scenario-scoped "
            f"(scenario_id={v.scenario_id}); scenario versions stay draft "
            f"permanently per the lever-12 sandbox contract.",
        )
    if not rationale or not rationale.strip():
        raise DistributionValidationError(
            "Activation requires a non-empty rationale per [F-S1-05].",
        )
    if active_from is None:
        raise DistributionValidationError(
            "Activation requires a non-null active_from per [F-S1-02].",
        )

    # Reject identical active_from on another production active version per
    # [F-S1-02] "identical active_from for the same scope is forbidden".
    clash = (
        db.query(DistributionVersion)
        .filter(
            DistributionVersion.id != v.id,
            DistributionVersion.scenario_id.is_(None),
            DistributionVersion.status == "active",
            DistributionVersion.active_from == active_from,
        )
        .first()
    )
    if clash is not None:
        raise DistributionValidationError(
            f"Another production version (id={clash.id}) is already active "
            f"with active_from={active_from} per [F-S1-02] — identical "
            f"active_from on the same scope is forbidden.",
        )

    v.status = "active"
    v.active_from = active_from
    v.rationale = rationale
    v.activated_at = datetime.utcnow()
    return v


def delete_version(
    db: Session, version_id: int,
) -> DistributionVersion:
    """Delete a draft ``DistributionVersion``.

    Active production versions are immutable per `[F-S1-08]` — the service
    rejects deletion with a validation error. Future-dated active revocation
    is tracked as a deferred open question (plan §"Open questions" #2);
    not implemented in B1.

    Scenario-scoped versions are deleted via scenario cleanup
    (FK ``ondelete=CASCADE``), not via this function — but it's safe to
    delete a draft scenario version if a caller really needs to.

    Cascade ``ondelete=CASCADE`` on ``Distribution.version_id`` drops the
    edges automatically.
    """
    v = get_version(db, version_id)
    _require_draft_version(v)
    db.delete(v)
    return v


# ---------------------------------------------------------------------------
# Sum-rule validation per [F-S1-02]
# ---------------------------------------------------------------------------


@dataclass
class SumValidationResult:
    """Per-entity sum-rule validation result."""

    entity_id: str
    version_id: int
    to_business_pct: float
    distribution_total_pct: float
    grand_total_pct: float
    self_retained_pct: float
    is_valid: bool


# Allowable rounding tolerance when validating sums. Percentages are stored
# at 2dp; this tolerance covers floating-point rounding without permitting
# meaningful over-allocation.
SUM_TOLERANCE = 0.01


def compute_sum_validation(
    db: Session, source_entity_id: str, version_id: int,
    *, candidate_to_business_pct: Optional[float] = None,
    candidate_edge_id: Optional[int] = None,
    candidate_destination_id: Optional[str] = None,
    candidate_percentage: Optional[float] = None,
) -> SumValidationResult:
    """Compute the source entity's distribution sum and validate the cap.

    The optional ``candidate_*`` arguments let the caller simulate adding or
    updating an edge before commit. When all candidate args are None the
    function reports the current state.

    Returns a ``SumValidationResult`` with the breakdown plus an ``is_valid``
    boolean. The router uses ``is_valid`` to decide whether to commit; it
    can also surface the breakdown to the user inline (per the editor UX
    showing self-retained as derived).
    """
    entity = db.query(ChargeableEntity).filter_by(id=source_entity_id).first()
    if entity is None:
        raise DistributionValidationError(
            f"Source entity '{source_entity_id}' not found",
        )

    to_business = (
        candidate_to_business_pct
        if candidate_to_business_pct is not None
        else float(entity.to_business_pct)
    )

    edges = db.query(Distribution).filter(
        Distribution.source_entity_id == source_entity_id,
        Distribution.version_id == version_id,
    ).all()

    distribution_total = 0.0
    candidate_applied = False
    for e in edges:
        if candidate_edge_id is not None and e.id == candidate_edge_id:
            distribution_total += float(candidate_percentage or 0.0)
            candidate_applied = True
        else:
            distribution_total += float(e.percentage)

    if candidate_destination_id is not None and not candidate_applied:
        distribution_total += float(candidate_percentage or 0.0)

    grand_total = to_business + distribution_total
    self_retained = max(0.0, 100.0 - grand_total)
    is_valid = grand_total <= 100.0 + SUM_TOLERANCE

    return SumValidationResult(
        entity_id=source_entity_id,
        version_id=version_id,
        to_business_pct=round(to_business, 2),
        distribution_total_pct=round(distribution_total, 2),
        grand_total_pct=round(grand_total, 2),
        self_retained_pct=round(self_retained, 2),
        is_valid=is_valid,
    )


def assert_sum_within_100(
    db: Session, source_entity_id: str, version_id: int,
    *, candidate_to_business_pct: Optional[float] = None,
    candidate_edge_id: Optional[int] = None,
    candidate_destination_id: Optional[str] = None,
    candidate_percentage: Optional[float] = None,
) -> SumValidationResult:
    """Compute the sum validation and raise if invalid."""
    result = compute_sum_validation(
        db, source_entity_id, version_id,
        candidate_to_business_pct=candidate_to_business_pct,
        candidate_edge_id=candidate_edge_id,
        candidate_destination_id=candidate_destination_id,
        candidate_percentage=candidate_percentage,
    )
    if not result.is_valid:
        raise DistributionValidationError(
            f"Sum rule violation per [F-S1-02]: to_business_pct "
            f"({result.to_business_pct}) + distributed "
            f"({result.distribution_total_pct}) = {result.grand_total_pct} "
            f"exceeds 100%",
        )
    return result


# ---------------------------------------------------------------------------
# Cycle wrapper per [F-S1-05]
# ---------------------------------------------------------------------------


def assert_no_cycle(
    db: Session, source_entity_id: str, destination_entity_id: str,
    version_id: int, *, exclude_edge_id: Optional[int] = None,
) -> None:
    """Raise ``DistributionValidationError`` if the candidate edge creates a cycle.

    The error carries ``cycle_chain`` so the caller / response payload can
    show ``A → B → C → A``.
    """
    chain = detect_cycle_db(
        db, version_id, source_entity_id, destination_entity_id,
        exclude_edge_id=exclude_edge_id,
    )
    if chain is not None:
        rendered = " → ".join(chain)
        raise DistributionValidationError(
            f"Cycle detected per [F-S1-05]: {rendered}",
            cycle_chain=chain,
        )


# ---------------------------------------------------------------------------
# Edge CRUD orchestration
# ---------------------------------------------------------------------------


def create_distribution_edge(
    db: Session, *, version_id: int, source_entity_id: str,
    destination_entity_id: str, percentage: float,
    rationale: Optional[str] = None,
) -> Distribution:
    """Insert a new distribution edge after validating the sum and cycle rules.

    The edge must target a **draft** version — active versions are immutable
    per `[F-S1-08]`. Does not commit — the caller commits within the
    audit-log transaction.
    """
    version = get_version(db, version_id)
    _require_draft_version(version)

    src = db.query(ChargeableEntity).filter_by(id=source_entity_id).first()
    if src is None:
        raise DistributionValidationError(
            f"Source entity '{source_entity_id}' not found",
        )
    dst = db.query(ChargeableEntity).filter_by(id=destination_entity_id).first()
    if dst is None:
        raise DistributionValidationError(
            f"Destination entity '{destination_entity_id}' not found",
        )

    # Reject duplicate edge — uniqueness is also enforced at the DB layer
    # but surfacing a friendlier 409 here is better UX.
    existing = db.query(Distribution).filter(
        Distribution.version_id == version_id,
        Distribution.source_entity_id == source_entity_id,
        Distribution.destination_entity_id == destination_entity_id,
    ).first()
    if existing is not None:
        raise DistributionValidationError(
            f"Distribution edge already exists "
            f"({source_entity_id} → {destination_entity_id} for "
            f"version_id={version_id}). Update the existing edge instead.",
        )

    assert_no_cycle(
        db, source_entity_id, destination_entity_id, version_id,
    )
    assert_sum_within_100(
        db, source_entity_id, version_id,
        candidate_destination_id=destination_entity_id,
        candidate_percentage=percentage,
    )

    edge = Distribution(
        version_id=version_id,
        source_entity_id=source_entity_id,
        destination_entity_id=destination_entity_id,
        percentage=Decimal(str(round(percentage, 2))),
        rationale=rationale,
    )
    db.add(edge)
    db.flush()
    return edge


def update_distribution_edge(
    db: Session, edge_id: int, *, percentage: float,
    rationale: Optional[str] = None,
    update_rationale: bool = False,
) -> Distribution:
    """Update an existing edge's percentage (and optionally rationale).

    Source/destination/version are immutable: changing those is semantically
    a different edge. The version must be a draft per `[F-S1-08]`.

    ``rationale`` updates are opt-in via the explicit ``update_rationale=True``
    sentinel so callers can update only ``percentage`` without disturbing the
    existing rationale (None is a legitimate value meaning "no rationale").
    """
    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise DistributionValidationError(
            f"Distribution edge {edge_id} not found",
        )
    version = get_version(db, edge.version_id)
    _require_draft_version(version)

    assert_sum_within_100(
        db, edge.source_entity_id, edge.version_id,
        candidate_edge_id=edge.id, candidate_percentage=percentage,
    )
    edge.percentage = Decimal(str(round(percentage, 2)))
    if update_rationale:
        edge.rationale = rationale
    return edge


def delete_distribution_edge(db: Session, edge_id: int) -> Distribution:
    """Delete an existing edge. Version must be a draft per `[F-S1-08]`."""
    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise DistributionValidationError(
            f"Distribution edge {edge_id} not found",
        )
    version = get_version(db, edge.version_id)
    _require_draft_version(version)
    db.delete(edge)
    return edge


def update_to_business_pct(
    db: Session, entity_id: str, *, new_pct: float, version_id: int,
) -> SumValidationResult:
    """Update an entity's to_business_pct after validating the sum cap.

    ``version_id`` scopes the sum-rule check — the entity's outgoing edges
    in that version are summed against the new candidate ``to_business_pct``.
    The version must be a draft per `[F-S1-08]` (mutating to_business_pct
    against an immutable version's sum-rule context is rejected).
    """
    version = get_version(db, version_id)
    _require_draft_version(version)

    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise DistributionValidationError(
            f"Entity '{entity_id}' not found",
        )
    result = assert_sum_within_100(
        db, entity_id, version_id,
        candidate_to_business_pct=new_pct,
    )
    entity.to_business_pct = Decimal(str(round(new_pct, 2)))
    return result


# ---------------------------------------------------------------------------
# Version diff per [F-S1-07]
# ---------------------------------------------------------------------------


@dataclass
class DiffEdge:
    """One change row in a version-diff report."""

    change_kind: str  # 'added' | 'removed' | 'changed'
    source_entity_id: str
    destination_entity_id: str
    old_percentage: Optional[float]
    new_percentage: Optional[float]
    old_rationale: Optional[str]
    new_rationale: Optional[str]


@dataclass
class DiffResult:
    version: DistributionVersion
    compared_to_version: DistributionVersion
    changes: list[DiffEdge]

    @property
    def added_count(self) -> int:
        return sum(1 for c in self.changes if c.change_kind == "added")

    @property
    def removed_count(self) -> int:
        return sum(1 for c in self.changes if c.change_kind == "removed")

    @property
    def changed_count(self) -> int:
        return sum(1 for c in self.changes if c.change_kind == "changed")


def resolve_default_compared_to(
    db: Session, version: DistributionVersion,
) -> Optional[DistributionVersion]:
    """Resolve the default ``compared_to`` partner for diffing per `[F-S1-07]`.

    - For production versions: the active production version with the
      next-earlier ``active_from`` (i.e. the one this version supersedes).
      If the input is itself a draft, fall back to the latest active
      production version.
    - For scenario versions: the production version the scenario forked from
      — pinned on ``Scenario.anchor_distribution_version_id``. If unpinned
      (legacy fallback), resolve the active production version at
      ``today``.

    Returns None if no suitable partner exists (e.g. the first ever
    production version).
    """
    if version.scenario_id is not None:
        # Scenario-scoped — fall back to the scenario's anchor.
        from models.scenarios import Scenario

        sc = db.query(Scenario).filter_by(id=version.scenario_id).first()
        anchor_id = sc.anchor_distribution_version_id if sc else None
        if anchor_id is not None:
            return db.query(DistributionVersion).filter_by(id=anchor_id).first()
        # Legacy fallback: today's active production version.
        return resolve_active_version(db, date.today())

    # Production scope.
    if version.status == "active" and version.active_from is not None:
        # The version it supersedes by effective date.
        return (
            db.query(DistributionVersion)
            .filter(
                DistributionVersion.scenario_id.is_(None),
                DistributionVersion.status == "active",
                DistributionVersion.id != version.id,
                DistributionVersion.active_from < version.active_from,
            )
            .order_by(DistributionVersion.active_from.desc())
            .first()
        )
    # Draft production version — diff against the latest active production
    # version (the version this draft would replace).
    return (
        db.query(DistributionVersion)
        .filter(
            DistributionVersion.scenario_id.is_(None),
            DistributionVersion.status == "active",
            DistributionVersion.id != version.id,
        )
        .order_by(DistributionVersion.active_from.desc())
        .first()
    )


def compute_version_diff(
    db: Session, version_id: int, compared_to_version_id: Optional[int] = None,
) -> DiffResult:
    """Compute a per-edge diff between two versions per `[F-S1-07]`.

    If ``compared_to_version_id`` is None, resolves via
    :func:`resolve_default_compared_to`. Raises if no comparison partner
    can be resolved.

    Output edge order: sorted by ``(source_entity_id, destination_entity_id,
    change_kind)`` for deterministic UI rendering.
    """
    target = get_version(db, version_id)

    if compared_to_version_id is None:
        partner = resolve_default_compared_to(db, target)
        if partner is None:
            raise DistributionValidationError(
                f"No default comparison partner available for version "
                f"{version_id}. Pass an explicit compared_to_version_id.",
            )
    else:
        partner = get_version(db, compared_to_version_id)

    # Build lookup maps keyed by (source, destination).
    target_edges = {
        (e.source_entity_id, e.destination_entity_id): e
        for e in list_edges_for_version(db, target.id)
    }
    partner_edges = {
        (e.source_entity_id, e.destination_entity_id): e
        for e in list_edges_for_version(db, partner.id)
    }
    all_keys = set(target_edges) | set(partner_edges)

    changes: list[DiffEdge] = []
    for key in sorted(all_keys):
        src, dst = key
        t = target_edges.get(key)
        p = partner_edges.get(key)

        if t is not None and p is None:
            changes.append(DiffEdge(
                change_kind="added",
                source_entity_id=src, destination_entity_id=dst,
                old_percentage=None, new_percentage=float(t.percentage),
                old_rationale=None, new_rationale=t.rationale,
            ))
            continue
        if t is None and p is not None:
            changes.append(DiffEdge(
                change_kind="removed",
                source_entity_id=src, destination_entity_id=dst,
                old_percentage=float(p.percentage), new_percentage=None,
                old_rationale=p.rationale, new_rationale=None,
            ))
            continue
        # Both present — emit 'changed' iff the percentage or rationale moved.
        if t is not None and p is not None:
            t_pct = float(t.percentage)
            p_pct = float(p.percentage)
            if abs(t_pct - p_pct) > SUM_TOLERANCE or t.rationale != p.rationale:
                changes.append(DiffEdge(
                    change_kind="changed",
                    source_entity_id=src, destination_entity_id=dst,
                    old_percentage=p_pct, new_percentage=t_pct,
                    old_rationale=p.rationale, new_rationale=t.rationale,
                ))

    return DiffResult(
        version=target,
        compared_to_version=partner,
        changes=changes,
    )


# ---------------------------------------------------------------------------
# Compatibility shim — `is_known_version`
# ---------------------------------------------------------------------------


def is_known_version(version: str) -> bool:
    """Transitional shim — always returns True (FD-3 B0).

    Kept temporarily so the existing router import line in
    ``backend/routers/charging.py`` does not break before the router is
    fully rewritten in FD-3 B2. The B2 commit removes the router's last
    call site; the symbol is then deleted entirely.
    """
    return True
