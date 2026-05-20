"""Stage 9 — BTC (Business Transfer Charging) profiles + lines.

Per ``[F-S2-01..08]`` and ``[A-PL-06]``:
- One ``btc_profiles`` row per (chargeable_entity, year) **for entities that
  qualify**. All Offerings, all Run-stage Projects (DoI=5), and the 5
  InternalServices that carry an ``s_code`` get a 2026 profile. The 12
  InternalServices with ``s_code=None`` are intentionally skipped per
  FD-4 [F-S2-01] — InternalService BTC is derivation-only from the UM
  matrix (no manual fallback); these 12 entities all have
  ``to_business_pct=0`` so the BTC gate at DoI 2→3 stays untripped.
- Two-mode mix:
    * ``automatic`` — entities whose ``entities.py`` row carries an
      ``s_code``. ``um_snapshot_at`` records which UM batch drove the
      percentages; lines are emitted with the percentages computed at
      seed-generation time (mirroring ``btc_service.compute_um_snapshot``).
    * ``manual`` — Project / Offering entities without an ``s_code``.
      Lines are emitted per the explicit per-entity distribution shape
      designed in this module. **InternalService is never manual** per
      [F-S2-01] (FD-4); the service-layer gate rejects manual creation,
      so the seed cannot emit a manual InternalService profile either.
- Year-rollover demonstrated for the two flagship offerings: ``off-mdh`` and
  ``off-eunify`` get **both** 2025 and 2026 profiles. The 2026 profile points
  to the 2025 profile via ``copied_from_profile_id`` (provenance chain).
  Emission order: 2025 first, then 2026 (so the FK target exists by then).
- Sum-rule: every profile's ``Σ(line.percentage) == 100`` within
  ``BTC_SUM_TOLERANCE = 0.01``. Validated at module-load time; assertion
  failure breaks the seed run loudly.

The ``profile_id`` autoincrement is handled by SQLite at INSERT time. Per
``BTCProfileLine.profile_id`` semantics, lines must reference the profile's
auto-id. We therefore emit profiles in deterministic order and reference the
1-based sequence number when emitting lines (the standard SQLite ROWID
allocation). That sequence is stable across runs because every INSERT below
is in a fixed order.
"""
from __future__ import annotations

from generate_seed_v5.config.entities import (
    INTERNAL_SERVICES,
    OFFERINGS,
    PROJECTS,
)
from generate_seed_v5.config.um import percentages_for

# ---------------------------------------------------------------------------
# Per-entity year + mode plan.
# ---------------------------------------------------------------------------

_FLAGSHIP_ROLLOVER_ENTITIES = ("off-mdh", "off-eunify")  # also seeded for 2025

# Year-rollover: 2025 batch is the canonical historical snapshot for these
# offerings. 2026 profiles for the same entities will point back to 2025 via
# ``copied_from_profile_id``.
_PROFILE_TIMESTAMP_2025 = "2025-01-25 09:00:00"
_PROFILE_TIMESTAMP_2026 = "2026-01-20 09:00:00"
_UM_SNAPSHOT_2025 = "2025-01-20 10:00:00"
_UM_SNAPSHOT_2026 = "2026-01-15 10:00:00"

BTC_SUM_TOLERANCE = 0.01

# ---------------------------------------------------------------------------
# Manual BTC profile shapes per entity. Each list of (charging_location_id,
# percentage) sums to exactly 100.00. Designed to spread cost across major
# DACH hubs + region-specific spillovers, matching the entity narrative.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Per-(entity, year) DEMO_TUNING_OVERRIDES for automatic profiles.
# Applied AFTER the UM-derived lines are computed; replaces the entire line
# set for the matching profile. Keep these tightly-scoped — every override
# diverges the seeded BTC from the UM matrix and weakens the "automatic mode
# mirrors UM" promise. Add a comment justifying each entry.
# ---------------------------------------------------------------------------
DEMO_TUNING_OVERRIDES: dict[tuple[str, int], list[tuple[str, float]]] = {
    # Item 8 follow-up: bump cl-de-muc up by 10pp (and cut cl-fr-par 10pp)
    # so the seeded "MDH BTC Rebalance — DE/PL/CZ" scenario can shift 10pp
    # off DE-Munich onto PL-Poznan + CZ-Prague without driving any line
    # negative. Sum still = 100. The other 15 lines mirror the raw UM
    # snapshot for S042 / 2026.
    ("off-mdh", 2026): [
        ("cl-de-ber",  1.13),
        ("cl-de-fra",  4.93),
        ("cl-de-ham",  1.59),
        ("cl-de-muc", 16.19),
        ("cl-de-stg",  2.21),
        ("cl-de-wol",  2.52),
        ("cl-es-mad",  6.09),
        ("cl-fr-lyo",  7.52),
        ("cl-fr-par",  5.62),
        ("cl-hu-bud",  3.48),
        ("cl-in-pun", 11.28),
        ("cl-it-mil",  9.38),
        ("cl-nl-ams",  3.79),
        ("cl-pl-poz",  6.11),
        ("cl-uk-lon",  7.85),
        ("cl-uk-man",  1.15),
        ("cl-us-det",  9.16),
    ],
}


MANUAL_BTC_LINES: dict[str, list[tuple[str, float]]] = {
    # FD-4 [F-S2-01]: InternalService manual BTC profiles are REMOVED.
    # Internal services without an s_code (12 of the 17) have no BTC profile
    # at all; the BTC gate at DoI 2→3 stays untripped because all 12 have
    # to_business_pct=0. The 5 InternalServices with an s_code get an
    # automatic profile via the s_code path below.
    # --- Offerings (manual mode — no s_code) ---
    "off-ecollab": [
        ("cl-de-muc", 22.0),
        ("cl-de-stg", 12.0),
        ("cl-de-fra", 10.0),
        ("cl-fr-par", 12.0),
        ("cl-uk-lon", 10.0),
        ("cl-it-mil", 8.0),
        ("cl-es-mad", 7.0),
        ("cl-nl-ams", 6.0),
        ("cl-us-det", 8.0),
        ("cl-jp-tok", 5.0),
    ],
    "off-fielddx": [
        ("cl-de-muc", 35.0),
        ("cl-de-stg", 25.0),
        ("cl-de-wol", 20.0),
        ("cl-us-det", 20.0),
    ],
    # --- Run-stage projects (manual mode — no s_code on project rows) ---
    "proj-cloud3-run": [
        ("cl-de-muc", 50.0),
        ("cl-hu-bud", 25.0),
        ("cl-in-pun", 15.0),
        ("cl-us-det", 10.0),
    ],
    "proj-iam-run": [
        ("cl-de-muc", 45.0),
        ("cl-hu-bud", 25.0),
        ("cl-in-pun", 20.0),
        ("cl-us-det", 10.0),
    ],
}


# ---------------------------------------------------------------------------
# Plan resolution: walk the FROZEN entity roster and decide which profiles
# to emit (entity_id + year + mode + s_code).
# ---------------------------------------------------------------------------

class _PlannedProfile:
    """A planned BTC profile row (pre-emission)."""

    __slots__ = (
        "entity_id", "year", "mode", "s_code",
        "um_snapshot_at", "status", "copied_from_entity_id",
        "lines",  # list[(charging_location_id, percentage)]
    )

    def __init__(
        self,
        entity_id: str,
        year: int,
        mode: str,
        s_code: str | None,
        um_snapshot_at: str | None,
        status: str,
        copied_from_entity_id: str | None,
        lines: list[tuple[str, float]],
    ):
        self.entity_id = entity_id
        self.year = year
        self.mode = mode
        self.s_code = s_code
        self.um_snapshot_at = um_snapshot_at
        self.status = status
        self.copied_from_entity_id = copied_from_entity_id
        self.lines = lines


def _entity_btc_mode(entity: dict) -> str:
    """Return 'manual' or 'automatic' for one chargeable-entity row."""
    if "btc_mode" in entity and entity["btc_mode"]:
        return entity["btc_mode"]
    # Run-stage projects don't carry a btc_mode field — default to 'manual'.
    return "manual"


def _entity_s_code(entity: dict) -> str | None:
    return entity.get("s_code")


def _automatic_lines(s_code: str, year: int, quarter: int) -> list[tuple[str, float]]:
    """Materialise BTC line percentages from the UM snapshot.

    Mirrors ``services.btc_service.compute_um_snapshot`` so the seed lines
    match what the live service would compute on demand.
    """
    pcts = percentages_for(s_code, year, quarter)
    if not pcts:
        raise RuntimeError(
            f"No UM cells for s_code={s_code} year={year} quarter={quarter}; "
            f"automatic BTC profile cannot be derived. "
            f"Add cells to config/um.py or switch the entity to manual mode."
        )
    return pcts


def _manual_lines_for(entity_id: str) -> list[tuple[str, float]]:
    if entity_id not in MANUAL_BTC_LINES:
        raise RuntimeError(
            f"Manual BTC profile required for entity '{entity_id}' but no "
            f"line shape is defined in MANUAL_BTC_LINES."
        )
    return MANUAL_BTC_LINES[entity_id]


def _assert_sums_to_100(entity_id: str, year: int, lines: list[tuple[str, float]]) -> None:
    total = round(sum(p for _, p in lines), 2)
    if abs(total - 100.0) > BTC_SUM_TOLERANCE:
        raise AssertionError(
            f"BTC profile for entity={entity_id} year={year} sums to {total} (expected 100). "
            f"Adjust MANUAL_BTC_LINES (manual) or UM cells (automatic)."
        )


def _build_planned_profiles() -> list[_PlannedProfile]:
    """Resolve the FROZEN roster into the deterministic profile sequence.

    Emission order (matches SQLite ROWID auto-allocation):
      1. 2025 profiles (only ``_FLAGSHIP_ROLLOVER_ENTITIES``) — sorted by entity id.
      2. 2026 profiles for every Run-portfolio entity — sorted by entity id.
    The 2026 profile for a flagship rollover entity references the 2025
    profile id via ``copied_from_entity_id`` (resolved to the auto-id at
    SQL emission time).
    """
    plans: list[_PlannedProfile] = []

    # All "Run-portfolio" entities: 6 offerings + 17 internal services + 2
    # Run-stage projects (DoI=5). Tag each row's source kind so we can apply
    # the FD-4 [F-S2-01] InternalService-manual-skip rule cleanly below.
    run_portfolio: list[dict] = []
    for off in OFFERINGS:
        run_portfolio.append({**off, "_kind": "offering"})
    for svc in INTERNAL_SERVICES:
        run_portfolio.append({**svc, "_kind": "internal_service"})
    for p in PROJECTS:
        if p.get("annual_cost") is not None:  # Run-stage marker (annual_cost set).
            run_portfolio.append({
                "id": p["id"],
                "btc_mode": "manual",  # Run projects: manual default.
                "s_code": None,
                "annual_cost": p["annual_cost"],
                "_kind": "project",
            })

    # Sort for determinism (id is unique within the roster).
    run_portfolio_sorted = sorted(run_portfolio, key=lambda e: e["id"])

    def _skip_internal_service(ent: dict) -> bool:
        """FD-4 [F-S2-01] Path B: InternalService entities without an s_code
        get no BTC profile. They all have to_business_pct=0 so the DoI 2→3
        gate stays untripped; the 5 InternalServices with s_codes still get
        an automatic profile via the s_code path."""
        return ent.get("_kind") == "internal_service" and not ent.get("s_code")

    # Pass 1: 2025 profiles for the rollover entities (flagship offerings only).
    for ent in run_portfolio_sorted:
        if ent["id"] not in _FLAGSHIP_ROLLOVER_ENTITIES:
            continue
        if _skip_internal_service(ent):
            continue
        mode = _entity_btc_mode(ent)
        s_code = _entity_s_code(ent)
        if mode == "automatic":
            assert s_code is not None  # contract: auto requires s_code.
            lines = _automatic_lines(s_code, 2025, 1)
            um_snap = _UM_SNAPSHOT_2025
        else:
            # FD-4 [F-S2-01]: InternalService never reaches the manual branch.
            assert ent.get("_kind") != "internal_service", (
                f"InternalService '{ent['id']}' must not seed a manual BTC profile "
                f"per [F-S2-01]."
            )
            lines = _manual_lines_for(ent["id"])
            um_snap = None
        _assert_sums_to_100(ent["id"], 2025, lines)
        plans.append(_PlannedProfile(
            entity_id=ent["id"],
            year=2025,
            mode=mode,
            s_code=s_code,
            um_snapshot_at=um_snap,
            status="active",  # the 2025 profile is the historical reference.
            copied_from_entity_id=None,
            lines=lines,
        ))

    # Pass 2: 2026 profiles for every qualifying Run-portfolio entity.
    for ent in run_portfolio_sorted:
        if _skip_internal_service(ent):
            continue
        mode = _entity_btc_mode(ent)
        s_code = _entity_s_code(ent)
        if mode == "automatic":
            assert s_code is not None
            lines = _automatic_lines(s_code, 2026, 1)
            um_snap = _UM_SNAPSHOT_2026
        else:
            # FD-4 [F-S2-01]: InternalService never reaches the manual branch.
            assert ent.get("_kind") != "internal_service", (
                f"InternalService '{ent['id']}' must not seed a manual BTC profile "
                f"per [F-S2-01]."
            )
            lines = _manual_lines_for(ent["id"])
            um_snap = None
        # Apply demo-tuning overrides (Item 8 — see DEMO_TUNING_OVERRIDES doc).
        if (ent["id"], 2026) in DEMO_TUNING_OVERRIDES:
            lines = list(DEMO_TUNING_OVERRIDES[(ent["id"], 2026)])
        _assert_sums_to_100(ent["id"], 2026, lines)
        copied_from = ent["id"] if ent["id"] in _FLAGSHIP_ROLLOVER_ENTITIES else None
        plans.append(_PlannedProfile(
            entity_id=ent["id"],
            year=2026,
            mode=mode,
            s_code=s_code,
            um_snapshot_at=um_snap,
            status="active",
            copied_from_entity_id=copied_from,
            lines=lines,
        ))

    return plans


# ---------------------------------------------------------------------------
# SQL emission.
# ---------------------------------------------------------------------------

def _profile_timestamp_for(year: int) -> str:
    return _PROFILE_TIMESTAMP_2025 if year == 2025 else _PROFILE_TIMESTAMP_2026


def _sql_str(v: object) -> str:
    """Local SQL escaping for plan rows (matches ``_utils.sql_str`` semantics)."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return f"'{str(v).replace(chr(39), chr(39) + chr(39))}'"


def generate() -> str:
    plans = _build_planned_profiles()

    # Map (entity_id, year) → 1-based profile_id (matches SQLite's
    # auto-increment for an empty btc_profiles table).
    profile_id_by_key: dict[tuple[str, int], int] = {}
    for idx, plan in enumerate(plans, start=1):
        profile_id_by_key[(plan.entity_id, plan.year)] = idx

    lines: list[str] = []
    lines.append("-- =============================================================================")
    lines.append("-- s09_btc / BTC profiles + lines [F-S2-01..08] [A-PL-06]")
    lines.append(
        f"-- {len(plans)} profiles "
        f"({sum(1 for p in plans if p.year == 2025)} × 2025 rollover, "
        f"{sum(1 for p in plans if p.year == 2026)} × 2026)"
    )
    lines.append(
        f"-- {sum(len(p.lines) for p in plans)} lines total "
        f"({sum(1 for p in plans if p.mode == 'manual')} manual + "
        f"{sum(1 for p in plans if p.mode == 'automatic')} automatic profiles)."
    )
    lines.append(
        "-- Year-rollover: 2026 profiles for "
        f"{', '.join(_FLAGSHIP_ROLLOVER_ENTITIES)} reference 2025 via copied_from_profile_id."
    )
    lines.append("-- =============================================================================")
    lines.append("")

    # ---- Pass 1: btc_profiles INSERTs ------------------------------------
    lines.append("-- BTC profile rows (deterministic order: 2025 rollovers first, then 2026 by entity id).")
    lines.append(
        "INSERT INTO btc_profiles (entity_id, year, mode, s_code, "
        "um_snapshot_at, status, copied_from_profile_id, created_at, modified_at) VALUES"
    )
    profile_rows: list[str] = []
    for plan in plans:
        copied_from_id = (
            profile_id_by_key.get((plan.copied_from_entity_id, 2025))
            if plan.copied_from_entity_id else None
        )
        ts = _profile_timestamp_for(plan.year)
        profile_rows.append(
            f"({_sql_str(plan.entity_id)}, {plan.year}, {_sql_str(plan.mode)}, "
            f"{_sql_str(plan.s_code)}, {_sql_str(plan.um_snapshot_at)}, "
            f"{_sql_str(plan.status)}, {_sql_str(copied_from_id)}, "
            f"'{ts}', '{ts}')"
        )
    lines.append(",\n".join(profile_rows) + ";")
    lines.append("")

    # ---- Pass 2: btc_profile_lines INSERTs (one INSERT per profile) ------
    lines.append("-- BTC profile lines (sums to 100% per profile within tolerance 0.01).")
    for plan in plans:
        profile_id = profile_id_by_key[(plan.entity_id, plan.year)]
        lines.append(
            f"-- Profile {profile_id}: {plan.entity_id} {plan.year} ({plan.mode}"
            + (f", s_code={plan.s_code}" if plan.s_code else "")
            + f") — {len(plan.lines)} lines"
        )
        lines.append(
            "INSERT INTO btc_profile_lines (profile_id, charging_location_id, percentage) VALUES"
        )
        line_rows: list[str] = []
        for cl_id, pct in plan.lines:
            line_rows.append(f"({profile_id}, {_sql_str(cl_id)}, {pct})")
        lines.append(",\n".join(line_rows) + ";")
        lines.append("")

    # Summary footer.
    lines.append(f"-- Total btc_profiles: {len(plans)}")
    lines.append(f"-- Total btc_profile_lines: {sum(len(p.lines) for p in plans)}")

    return "\n".join(lines) + "\n"
