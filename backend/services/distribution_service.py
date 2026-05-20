"""Stage 1 distribution edge service for v5 Cluster F.

Per [F-S1-01..05]:

- ``[F-S1-02]``: ``to_business_pct + sum(distribute_to %) ≤ 100``. Residual
  is self-retained — the entity "charges itself".
- ``[F-S1-05]``: cycle detection is hard-block on save with an error message
  showing the cycle chain.

The router calls into these helpers; service-level errors are raised as
``DistributionValidationError`` and translated to HTTP 409 responses.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models.charging import (
    ChargeableEntity, Distribution,
)
from services.dag_resolver import detect_cycle_db

# FD-3 B0 transition note: the v4 ``DISTRIBUTION_BUILTIN_VERSIONS`` /
# ``DISTRIBUTION_VERSION_BASELINE`` constants were removed by A1 along with
# the row-column ``version`` String. ``is_known_version`` is kept as a
# transitional shim that always returns True so the router import path stays
# intact for FD-3 B0; B1 rewrites the service layer against the new
# ``version_id`` model and drops the shim.


class DistributionValidationError(Exception):
    """Raised by the service when a write would violate the sum or cycle rules.

    The router catches this and returns 409 Conflict with a structured body
    containing the message and (for cycles) the cycle chain.
    """

    def __init__(self, message: str, *, cycle_chain: Optional[list[str]] = None):
        super().__init__(message)
        self.message = message
        self.cycle_chain = cycle_chain


@dataclass
class SumValidationResult:
    """Per-entity sum-rule validation result."""

    entity_id: str
    to_business_pct: float
    distribution_total_pct: float
    grand_total_pct: float
    self_retained_pct: float
    is_valid: bool


# ---------------------------------------------------------------------------
# Sum-rule validation per [F-S1-02]
# ---------------------------------------------------------------------------

# Allowable rounding tolerance when validating sums. Percentages are stored
# at 2dp; this tolerance covers floating-point rounding without permitting
# meaningful over-allocation.
SUM_TOLERANCE = 0.01


def compute_sum_validation(
    db: Session, source_entity_id: str, year: int, version: str,
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
    boolean. The router uses ``is_valid`` to decide whether to commit; it can
    also surface the breakdown to the user inline (per the [F-S1-03] editor
    UX showing self-retained as derived).
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
        Distribution.year == year,
        Distribution.version == version,
    ).all()

    distribution_total = 0.0
    candidate_applied = False
    for e in edges:
        if candidate_edge_id is not None and e.id == candidate_edge_id:
            # Update path — substitute the new percentage.
            distribution_total += float(candidate_percentage or 0.0)
            candidate_applied = True
        else:
            distribution_total += float(e.percentage)

    if candidate_destination_id is not None and not candidate_applied:
        # Create path — add the new edge's percentage on top.
        distribution_total += float(candidate_percentage or 0.0)

    grand_total = to_business + distribution_total
    self_retained = max(0.0, 100.0 - grand_total)
    is_valid = grand_total <= 100.0 + SUM_TOLERANCE

    return SumValidationResult(
        entity_id=source_entity_id,
        to_business_pct=round(to_business, 2),
        distribution_total_pct=round(distribution_total, 2),
        grand_total_pct=round(grand_total, 2),
        self_retained_pct=round(self_retained, 2),
        is_valid=is_valid,
    )


def assert_sum_within_100(
    db: Session, source_entity_id: str, year: int, version: str,
    *, candidate_to_business_pct: Optional[float] = None,
    candidate_edge_id: Optional[int] = None,
    candidate_destination_id: Optional[str] = None,
    candidate_percentage: Optional[float] = None,
) -> SumValidationResult:
    """Compute the sum validation and raise if invalid."""
    result = compute_sum_validation(
        db, source_entity_id, year, version,
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
    year: int, version: str, *, exclude_edge_id: Optional[int] = None,
) -> None:
    """Raise ``DistributionValidationError`` if the candidate edge creates a cycle.

    The error carries ``cycle_chain`` so the caller / response payload can show
    ``A → B → C → A``.
    """
    chain = detect_cycle_db(
        db, year, version, source_entity_id, destination_entity_id,
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


def is_known_version(version: str) -> bool:
    """Transitional shim — always returns True (FD-3 B0).

    The v4 free-form ``version`` String (``baseline`` | ``forecast`` |
    ``actuals`` | ``scenario-<id>``) was removed in FD-3 A1; the new model
    keys edges by ``version_id`` against the ``DistributionVersion`` header.
    This soft validator was the only consumer of the deleted constants and
    no longer maps onto reality. The function is kept (returns True) so the
    router import path stays intact while B1/B2 land the new service layer.
    The B2 router refactor removes the call site; B1 then removes this shim.
    """
    return True


def create_distribution_edge(
    db: Session, *, year: int, version: str, source_entity_id: str,
    destination_entity_id: str, percentage: float,
) -> Distribution:
    """Insert a new distribution edge after validating the sum and cycle rules.

    Does not commit — the caller commits within the audit-log transaction.
    """
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

    # Reject duplicate edge — uniqueness is also enforced at the DB layer but
    # surfacing a friendlier 409 here is better UX.
    existing = db.query(Distribution).filter(
        Distribution.year == year,
        Distribution.version == version,
        Distribution.source_entity_id == source_entity_id,
        Distribution.destination_entity_id == destination_entity_id,
    ).first()
    if existing is not None:
        raise DistributionValidationError(
            f"Distribution edge already exists "
            f"({source_entity_id} → {destination_entity_id} for "
            f"{year} / {version}). Update the existing edge instead.",
        )

    assert_no_cycle(
        db, source_entity_id, destination_entity_id, year, version,
    )
    assert_sum_within_100(
        db, source_entity_id, year, version,
        candidate_destination_id=destination_entity_id,
        candidate_percentage=percentage,
    )

    edge = Distribution(
        year=year, version=version,
        source_entity_id=source_entity_id,
        destination_entity_id=destination_entity_id,
        percentage=Decimal(str(round(percentage, 2))),
    )
    db.add(edge)
    db.flush()  # populate edge.id for audit logging without committing
    return edge


def update_distribution_edge(
    db: Session, edge_id: int, *, percentage: float,
) -> Distribution:
    """Update an existing edge's percentage. Source/dest are immutable."""
    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise DistributionValidationError(
            f"Distribution edge {edge_id} not found",
        )
    assert_sum_within_100(
        db, edge.source_entity_id, edge.year, edge.version,
        candidate_edge_id=edge.id, candidate_percentage=percentage,
    )
    edge.percentage = Decimal(str(round(percentage, 2)))
    return edge


def delete_distribution_edge(db: Session, edge_id: int) -> Distribution:
    """Delete an existing edge. Caller commits."""
    edge = db.query(Distribution).filter_by(id=edge_id).first()
    if edge is None:
        raise DistributionValidationError(
            f"Distribution edge {edge_id} not found",
        )
    db.delete(edge)
    return edge


def update_to_business_pct(
    db: Session, entity_id: str, *, new_pct: float, year: int, version: str,
) -> SumValidationResult:
    """Update an entity's to_business_pct after validating the sum cap.

    The validation uses ``candidate_to_business_pct`` so the caller can
    experiment without committing first. On success, the entity field is
    updated; the caller commits.
    """
    entity = db.query(ChargeableEntity).filter_by(id=entity_id).first()
    if entity is None:
        raise DistributionValidationError(
            f"Entity '{entity_id}' not found",
        )
    result = assert_sum_within_100(
        db, entity_id, year, version,
        candidate_to_business_pct=new_pct,
    )
    entity.to_business_pct = Decimal(str(round(new_pct, 2)))
    return result
