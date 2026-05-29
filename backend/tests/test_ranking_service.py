"""Unit tests for backend/services/ranking.py [A-PRI-01..04] [A-BK-09..14].

Covers:

- Tie-breaker string parser
- RankingConfig load/defaults
- Pre-funded (Type 3) deduction
- Execution-committed deduction (Active + Hyper-maintenance, VIPER §6.2)
- Contestable envelope math
- Ranked backlog ordering (composite, tie-breakers, missing values)
- Cutoff line positions (should-be / reality / misalignment)
- start_year scoping (VIPER §4.2 / §6.4)
- recompute_within_cutoff_for_backlog flag updates
- parameter_key_triggers_recompute mapping
"""

from __future__ import annotations

import pytest

from models.financial import Baseline, Forecast
from models.projects import Project
from models.system import PlanningParameter
from services.ranking import (
    BACKLOG_HORIZON_MONTHS,
    DEFAULT_TIEBREAKERS,
    DEFAULT_TOTAL_AVAILABLE_BUDGET,
    RankingConfig,
    _parse_tiebreakers,
    _project_sort_key,
    _project_walk_budget,
    compute_contestable_envelope,
    compute_cutoff_lines,
    compute_execution_committed_total,
    compute_pre_funded_total,
    compute_ranked_backlog,
    load_config,
    parameter_key_triggers_recompute,
    recompute_within_cutoff_for_backlog,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_project(
    db,
    *,
    project_id: str,
    name: str = "P",
    pipeline_stage: str = "Approved",
    composite_score: float | None = None,
    doi: int | None = None,
    project_type: int | None = None,
    total_budget: float | None = None,
    within_cutoff: bool | None = None,
    is_active: bool = True,
    transformation_level: str | None = None,
    tshirt_size: str | None = None,
    complexity_score: float | None = None,
    value_creation_score: float | None = None,
    start_month: str = "2026-01",
    frozen_doi: int | None = None,
) -> Project:
    """Insert a Project row with v5 columns populated for ranking tests."""
    proj = Project(
        id=project_id,
        name=name,
        status="active",
        capex_opex="capex",
        start_month=start_month,
        end_month="2026-12",
        is_service=False,
        is_active=is_active,
        pipeline_stage=pipeline_stage,
        doi=doi,
        project_type=project_type,
        total_budget=total_budget,
        within_cutoff=within_cutoff,
        frozen_doi=frozen_doi,
        composite_score=composite_score,
        complexity_score=complexity_score,
        value_creation_score=value_creation_score,
        transformation_level=transformation_level,
        tshirt_size=tshirt_size,
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return proj


# ---------------------------------------------------------------------------
# Tie-breaker parser
# ---------------------------------------------------------------------------

class TestParseTiebreakers:
    def test_default_string_parses(self):
        result = _parse_tiebreakers(DEFAULT_TIEBREAKERS)
        assert result == (
            ("composite_score", "desc"),
            ("doi", "asc"),
            ("total_budget", "desc"),
        )

    def test_empty_returns_empty_tuple(self):
        assert _parse_tiebreakers("") == ()
        assert _parse_tiebreakers(None) == ()  # type: ignore[arg-type]

    def test_unknown_field_skipped(self):
        result = _parse_tiebreakers("composite_score:desc,bogus:asc,doi:asc")
        assert result == (
            ("composite_score", "desc"),
            ("doi", "asc"),
        )

    def test_bad_direction_falls_back_to_desc(self):
        result = _parse_tiebreakers("doi:sideways")
        assert result == (("doi", "desc"),)

    def test_field_without_direction_defaults_desc(self):
        result = _parse_tiebreakers("doi")
        assert result == (("doi", "desc"),)

    def test_whitespace_tolerant(self):
        result = _parse_tiebreakers(" doi : asc , total_budget : desc ")
        assert result == (("doi", "asc"), ("total_budget", "desc"))


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------

class TestLoadConfig:
    def test_empty_db_returns_defaults(self, db):
        cfg = load_config(db)
        assert cfg.total_available_budget == DEFAULT_TOTAL_AVAILABLE_BUDGET
        assert cfg.horizon_months == BACKLOG_HORIZON_MONTHS
        assert cfg.tiebreakers == _parse_tiebreakers(DEFAULT_TIEBREAKERS)

    def test_overrides_picked_up(self, db):
        db.add(PlanningParameter(
            key="ranking_total_available_budget",
            name="x", current_value="80000000",
            default_value="50000000", data_type="integer", param_group="ranking",
        ))
        db.add(PlanningParameter(
            key="ranking_tiebreakers",
            name="x", current_value="composite_score:desc,total_budget:desc",
            default_value=DEFAULT_TIEBREAKERS, data_type="string", param_group="ranking",
        ))
        db.commit()
        cfg = load_config(db)
        assert cfg.total_available_budget == 80_000_000.0
        assert cfg.tiebreakers == (
            ("composite_score", "desc"),
            ("total_budget", "desc"),
        )

    def test_corrupt_value_falls_back_silently(self, db):
        db.add(PlanningParameter(
            key="ranking_total_available_budget",
            name="x", current_value="not-a-number",
            default_value="50000000", data_type="integer", param_group="ranking",
        ))
        db.commit()
        cfg = load_config(db)
        # Falls back to default rather than crashing.
        assert cfg.total_available_budget == DEFAULT_TOTAL_AVAILABLE_BUDGET

    def test_unknown_ranking_key_ignored(self, db):
        db.add(PlanningParameter(
            key="ranking_made_up", name="x", current_value="1",
            default_value="1", data_type="integer", param_group="ranking",
        ))
        db.commit()
        # Should not raise even with an unrecognised ranking_* key.
        cfg = load_config(db)
        assert cfg.total_available_budget == DEFAULT_TOTAL_AVAILABLE_BUDGET


# ---------------------------------------------------------------------------
# Pre-funded / hyper-maintenance helpers
# ---------------------------------------------------------------------------

class TestPreFundedTotal:
    def test_type_3_in_funded_stages_counted(self, db):
        # VIPER §6.2: Type 3 stays funded across backlog + execution + terminal
        # stages (Operate/Retired are gone). Proposed + Active + Completed count.
        _make_project(db, project_id="t3-prop", project_type=3,
                      pipeline_stage="Proposed", total_budget=100_000)
        _make_project(db, project_id="t3-act", project_type=3,
                      pipeline_stage="Active", total_budget=200_000)
        _make_project(db, project_id="t3-done", project_type=3,
                      pipeline_stage="Completed", total_budget=300_000)
        # Excluded: off-path
        _make_project(db, project_id="t3-cancel", project_type=3,
                      pipeline_stage="Cancelled", total_budget=999_000)
        # Excluded: not Type 3
        _make_project(db, project_id="t1-act", project_type=1,
                      pipeline_stage="Active", total_budget=999_000)

        total = compute_pre_funded_total(db)
        assert total == 600_000.0

    def test_inactive_excluded(self, db):
        _make_project(db, project_id="t3-inactive", project_type=3,
                      pipeline_stage="Active", total_budget=100_000,
                      is_active=False)
        assert compute_pre_funded_total(db) == 0.0

    def test_null_budget_contributes_zero(self, db):
        _make_project(db, project_id="t3-null", project_type=3,
                      pipeline_stage="Approved", total_budget=None)
        assert compute_pre_funded_total(db) == 0.0


class TestExecutionCommittedTotal:
    def test_execution_stages_summed(self, db):
        # VIPER §6.2: deduction now spans EXECUTION_STAGES (Active +
        # Hyper-maintenance). Operate/Retired no longer exist; terminal and
        # backlog stages contribute nothing.
        _make_project(db, project_id="ex-act", pipeline_stage="Active",
                      total_budget=50_000)
        _make_project(db, project_id="ex-hm", pipeline_stage="Hyper-maintenance",
                      total_budget=70_000)
        # Excluded: terminal — cost lives on the spawned Run entity.
        _make_project(db, project_id="ex-done", pipeline_stage="Completed",
                      total_budget=30_000)
        _make_project(db, project_id="ex-spawned", pipeline_stage="Run entity spawned",
                      total_budget=30_000)
        # Excluded: in BACKLOG_STAGES.
        _make_project(db, project_id="bl-1", pipeline_stage="Approved",
                      total_budget=999_000)

        assert compute_execution_committed_total(db) == 120_000.0

    def test_inactive_excluded(self, db):
        _make_project(db, project_id="ex-x", pipeline_stage="Hyper-maintenance",
                      total_budget=100_000, is_active=False)
        assert compute_execution_committed_total(db) == 0.0


class TestContestableEnvelope:
    def test_subtracts_both_deductions(self):
        cfg = RankingConfig(total_available_budget=1_000_000.0)
        result = compute_contestable_envelope(
            cfg, type3_total=200_000, execution_committed_total=100_000,
        )
        assert result == 700_000.0

    def test_clamped_at_zero(self):
        cfg = RankingConfig(total_available_budget=100.0)
        result = compute_contestable_envelope(
            cfg, type3_total=500.0, execution_committed_total=500.0,
        )
        assert result == 0.0


# ---------------------------------------------------------------------------
# Ranked backlog ordering
# ---------------------------------------------------------------------------

class TestComputeRankedBacklog:
    def test_orders_by_composite_descending(self, db):
        _make_project(db, project_id="p-a", composite_score=3.0, total_budget=100, doi=2)
        _make_project(db, project_id="p-b", composite_score=4.5, total_budget=100, doi=2)
        _make_project(db, project_id="p-c", composite_score=2.0, total_budget=100, doi=2)
        result = compute_ranked_backlog(db)
        ids = [item["project_id"] for item in result["items"]]
        assert ids == ["p-b", "p-a", "p-c"]
        assert [item["rank"] for item in result["items"]] == [1, 2, 3]

    def test_tiebreaker_doi_ascending(self, db):
        # Equal composite — earlier DoI comes first per [A-BK-06].
        _make_project(db, project_id="p-doi-3", composite_score=4.0, doi=3, total_budget=100)
        _make_project(db, project_id="p-doi-1", composite_score=4.0, doi=1, total_budget=100)
        _make_project(db, project_id="p-doi-2", composite_score=4.0, doi=2, total_budget=100)
        result = compute_ranked_backlog(db)
        ids = [item["project_id"] for item in result["items"]]
        assert ids == ["p-doi-1", "p-doi-2", "p-doi-3"]

    def test_tiebreaker_total_budget_descending(self, db):
        # Equal composite + DoI — larger budget comes first.
        _make_project(db, project_id="p-small", composite_score=4.0, doi=2, total_budget=100_000)
        _make_project(db, project_id="p-big", composite_score=4.0, doi=2, total_budget=500_000)
        _make_project(db, project_id="p-mid", composite_score=4.0, doi=2, total_budget=250_000)
        result = compute_ranked_backlog(db)
        ids = [item["project_id"] for item in result["items"]]
        assert ids == ["p-big", "p-mid", "p-small"]

    def test_type_3_excluded_from_ranked_list(self, db):
        _make_project(db, project_id="p-t1", project_type=1, composite_score=4.0,
                      doi=2, total_budget=100, pipeline_stage="Approved")
        _make_project(db, project_id="p-t3", project_type=3, composite_score=5.0,
                      doi=2, total_budget=100, pipeline_stage="Approved")
        result = compute_ranked_backlog(db)
        ids = [item["project_id"] for item in result["items"]]
        assert ids == ["p-t1"]
        # Type 3 appears in pre_funded section.
        pre_ids = [item["project_id"] for item in result["pre_funded"]]
        assert "p-t3" in pre_ids

    def test_non_backlog_stages_excluded(self, db):
        # VIPER §3.3: only Proposed / Under Evaluation / Approved compete.
        # Execution + terminal + off-path stages all drop out.
        _make_project(db, project_id="p-prop", pipeline_stage="Proposed",
                      composite_score=4.0, doi=0, total_budget=100)
        _make_project(db, project_id="p-act", pipeline_stage="Active",
                      composite_score=5.0, doi=3, total_budget=100)
        _make_project(db, project_id="p-done", pipeline_stage="Completed",
                      composite_score=5.0, doi=5, total_budget=100)
        _make_project(db, project_id="p-spawned", pipeline_stage="Run entity spawned",
                      composite_score=5.0, doi=5, total_budget=100)
        _make_project(db, project_id="p-cancel", pipeline_stage="Cancelled",
                      composite_score=5.0, doi=None, total_budget=100)
        result = compute_ranked_backlog(db)
        ids = [item["project_id"] for item in result["items"]]
        assert ids == ["p-prop"]

    def test_inactive_excluded(self, db):
        _make_project(db, project_id="p-active", composite_score=3.0,
                      doi=2, total_budget=100, is_active=True)
        _make_project(db, project_id="p-inactive", composite_score=5.0,
                      doi=2, total_budget=100, is_active=False)
        result = compute_ranked_backlog(db)
        ids = [item["project_id"] for item in result["items"]]
        assert ids == ["p-active"]

    def test_null_composite_sinks_to_bottom(self, db):
        _make_project(db, project_id="p-scored", composite_score=2.0, doi=2, total_budget=100)
        _make_project(db, project_id="p-unscored", composite_score=None, doi=0, total_budget=100)
        result = compute_ranked_backlog(db)
        ids = [item["project_id"] for item in result["items"]]
        assert ids == ["p-scored", "p-unscored"]

    def test_active_and_paused_excluded_from_backlog(self, db):
        # VIPER §3.3: once a project goes Active it leaves the Backlog, and
        # Paused is excluded regardless (a mid-execution pause belongs in the
        # Change Portfolio). Only the Approved project competes.
        _make_project(db, project_id="p-approved", composite_score=3.0,
                      doi=3, total_budget=100, pipeline_stage="Approved")
        _make_project(db, project_id="p-active", composite_score=5.0,
                      doi=3, total_budget=100, pipeline_stage="Active")
        _make_project(db, project_id="p-paused", composite_score=4.5,
                      doi=None, total_budget=100, pipeline_stage="Paused",
                      frozen_doi=4)
        result = compute_ranked_backlog(db)
        ids = [item["project_id"] for item in result["items"]]
        assert ids == ["p-approved"]


# ---------------------------------------------------------------------------
# Cutoff lines walk
# ---------------------------------------------------------------------------

class TestCutoffLines:
    def _seed_envelope(self, db, value: float):
        db.add(PlanningParameter(
            key="ranking_total_available_budget",
            name="x", current_value=str(int(value)),
            default_value=str(int(value)), data_type="integer", param_group="ranking",
        ))
        db.commit()

    def test_should_be_cutoff_at_first_overflow(self, db):
        # Envelope = 1000. Three projects of 400 each → cumulative
        # 400 (rank 1, fits), 800 (rank 2, fits), 1200 (rank 3, exceeds).
        # Should-be cutoff lands at rank 3.
        self._seed_envelope(db, 1000.0)
        _make_project(db, project_id="p-1", composite_score=5.0, doi=2,
                      total_budget=400, pipeline_stage="Approved")
        _make_project(db, project_id="p-2", composite_score=4.0, doi=2,
                      total_budget=400, pipeline_stage="Approved")
        _make_project(db, project_id="p-3", composite_score=3.0, doi=2,
                      total_budget=400, pipeline_stage="Approved")

        cutoff = compute_cutoff_lines(db)
        assert cutoff["should_be_cutoff_rank"] == 3
        assert cutoff["contestable_envelope"] == 1000.0

    def test_envelope_never_exhausted_returns_none(self, db):
        self._seed_envelope(db, 10_000_000.0)
        _make_project(db, project_id="p-tiny", composite_score=4.0, doi=2,
                      total_budget=100, pipeline_stage="Approved")
        cutoff = compute_cutoff_lines(db)
        assert cutoff["should_be_cutoff_rank"] is None
        assert cutoff["reality_cutoff_rank"] is None

    def test_empty_backlog_returns_none(self, db):
        self._seed_envelope(db, 1_000_000.0)
        cutoff = compute_cutoff_lines(db)
        assert cutoff["should_be_cutoff_rank"] is None
        assert cutoff["reality_cutoff_rank"] is None
        assert cutoff["contestable_envelope"] == 1_000_000.0

    def test_reality_walk_only_counts_committed(self, db):
        # VIPER §6.3: Active has left the pool; reality counts only Approved
        # with within_cutoff == True. Envelope = 500, three Approved of 300.
        # Should-be: 300 (r1), 600 (r2 > 500) → cutoff rank 2.
        # Reality: only the committed one (r1) adds; the other two contribute
        # 0 → cum 300 ≤ 500 → never exceeds.
        self._seed_envelope(db, 500.0)
        _make_project(db, project_id="p-app-comm", composite_score=5.0, doi=3,
                      total_budget=300, pipeline_stage="Approved", within_cutoff=True)
        _make_project(db, project_id="p-app-uncomm", composite_score=4.0, doi=3,
                      total_budget=300, pipeline_stage="Approved", within_cutoff=False)
        _make_project(db, project_id="p-app-uncomm-2", composite_score=3.0, doi=3,
                      total_budget=300, pipeline_stage="Approved", within_cutoff=None)

        cutoff = compute_cutoff_lines(db)
        assert cutoff["should_be_cutoff_rank"] == 2
        assert cutoff["reality_cutoff_rank"] is None  # Reality cum = 300 ≤ 500.

    def test_misalignment_zone_bounds(self, db):
        # Envelope = 600. Three Approved of 300; two committed, one not.
        self._seed_envelope(db, 600.0)
        _make_project(db, project_id="p1", composite_score=5.0, doi=3,
                      total_budget=300, pipeline_stage="Approved", within_cutoff=True)
        _make_project(db, project_id="p2", composite_score=4.0, doi=3,
                      total_budget=300, pipeline_stage="Approved", within_cutoff=True)
        _make_project(db, project_id="p3", composite_score=3.0, doi=3,
                      total_budget=300, pipeline_stage="Approved", within_cutoff=False)
        # Should-be: 300, 600, 900 → cutoff rank 3.
        # Reality:   300, 600, 600 → never exceeds 600 → cutoff None.
        cutoff = compute_cutoff_lines(db)
        assert cutoff["should_be_cutoff_rank"] == 3
        assert cutoff["reality_cutoff_rank"] is None
        # When one cutoff is None, misalignment bounds are also None.
        assert cutoff["misalignment_zone_start"] is None

    def test_misalignment_zone_when_both_present(self, db):
        # Envelope = 250. Four Approved of 100; first three committed.
        # Should-be: 100, 200, 300, 400 → cutoff at rank 3.
        # Reality:   100, 200, 300, 300 → cutoff at rank 3 (300 > 250).
        self._seed_envelope(db, 250.0)
        _make_project(db, project_id="p1", composite_score=5.0, doi=3,
                      total_budget=100, pipeline_stage="Approved", within_cutoff=True)
        _make_project(db, project_id="p2", composite_score=4.0, doi=3,
                      total_budget=100, pipeline_stage="Approved", within_cutoff=True)
        _make_project(db, project_id="p3", composite_score=3.0, doi=3,
                      total_budget=100, pipeline_stage="Approved", within_cutoff=True)
        _make_project(db, project_id="p4", composite_score=2.0, doi=3,
                      total_budget=100, pipeline_stage="Approved", within_cutoff=False)

        cutoff = compute_cutoff_lines(db)
        assert cutoff["should_be_cutoff_rank"] == 3
        assert cutoff["reality_cutoff_rank"] == 3
        assert cutoff["misalignment_zone_start"] == 3
        assert cutoff["misalignment_zone_end"] == 3

    def test_type_3_deducted_off_top_envelope(self, db):
        # Envelope = 1000, but Type 3 takes 400 → contestable = 600.
        self._seed_envelope(db, 1000.0)
        _make_project(db, project_id="p-t3", project_type=3,
                      pipeline_stage="Approved", total_budget=400,
                      composite_score=5.0, doi=3)
        _make_project(db, project_id="p-1", composite_score=4.0, doi=3,
                      total_budget=400, pipeline_stage="Approved")
        _make_project(db, project_id="p-2", composite_score=3.0, doi=3,
                      total_budget=400, pipeline_stage="Approved")

        cutoff = compute_cutoff_lines(db)
        assert cutoff["type3_pre_funded_total"] == 400.0
        assert cutoff["contestable_envelope"] == 600.0
        # Should-be: rank 1 = 400 (fits), rank 2 = 800 > 600 → cutoff rank 2.
        assert cutoff["should_be_cutoff_rank"] == 2

    def test_execution_committed_deducted_off_top(self, db):
        # VIPER §6.2: both Active and Hyper-maintenance now deduct off the top.
        self._seed_envelope(db, 1000.0)
        _make_project(db, project_id="hm", pipeline_stage="Hyper-maintenance",
                      total_budget=200)
        _make_project(db, project_id="act", pipeline_stage="Active",
                      total_budget=100)
        _make_project(db, project_id="p-1", composite_score=4.0, doi=3,
                      total_budget=400, pipeline_stage="Approved")
        cutoff = compute_cutoff_lines(db)
        assert cutoff["execution_committed_total"] == 300.0
        assert cutoff["contestable_envelope"] == 700.0


# ---------------------------------------------------------------------------
# start_year scoping (VIPER §4.2 / §6.4)
# ---------------------------------------------------------------------------

class TestStartYearScoping:
    def _seed_envelope(self, db, value: float):
        db.add(PlanningParameter(
            key="ranking_total_available_budget",
            name="x", current_value=str(int(value)),
            default_value=str(int(value)), data_type="integer", param_group="ranking",
        ))
        db.commit()

    def test_pool_scoped_to_start_year(self, db):
        # Two competing Approved projects starting in different years.
        _make_project(db, project_id="p-2026", composite_score=5.0, doi=3,
                      total_budget=100, pipeline_stage="Approved",
                      start_month="2026-03")
        _make_project(db, project_id="p-2027", composite_score=4.0, doi=3,
                      total_budget=100, pipeline_stage="Approved",
                      start_month="2027-01")

        all_ids = [i["project_id"] for i in compute_ranked_backlog(db)["items"]]
        assert set(all_ids) == {"p-2026", "p-2027"}

        scoped = compute_ranked_backlog(db, start_year=2026)
        assert [i["project_id"] for i in scoped["items"]] == ["p-2026"]

    def test_deductions_scoped_to_start_year(self, db):
        # Type-3 pre-funded and execution-committed deductions are scoped too.
        self._seed_envelope(db, 1000.0)
        _make_project(db, project_id="t3-2026", project_type=3,
                      pipeline_stage="Approved", total_budget=200,
                      start_month="2026-05")
        _make_project(db, project_id="t3-2027", project_type=3,
                      pipeline_stage="Approved", total_budget=999,
                      start_month="2027-05")
        _make_project(db, project_id="ex-2026", pipeline_stage="Active",
                      total_budget=100, start_month="2026-02")
        _make_project(db, project_id="ex-2027", pipeline_stage="Active",
                      total_budget=999, start_month="2027-02")

        cutoff = compute_ranked_backlog(db, start_year=2026)["cutoff"]
        assert cutoff["type3_pre_funded_total"] == 200.0
        assert cutoff["execution_committed_total"] == 100.0
        # 1000 − 200 − 100 = 700; the 2027 rows are excluded from the view.
        assert cutoff["contestable_envelope"] == 700.0

    def test_matches_start_year_handles_null_start_month(self):
        # A transient/unsaved project with no start_month must not crash the
        # year-scoped walk — it degrades to "excluded" rather than raising.
        from services.ranking import _matches_start_year
        stub = type("P", (), {"start_month": None})()
        assert _matches_start_year(stub, None) is True       # no filter → kept
        assert _matches_start_year(stub, 2026) is False       # scoped → excluded, no raise

    def test_year_filter_does_not_mutate_within_cutoff(self, db):
        # §6.4: the persisted flag is recomputed UNSCOPED; a scoped read must
        # never write it. Recompute (whole-portfolio), then a year-scoped read,
        # then assert the flags are untouched.
        self._seed_envelope(db, 500.0)
        a = _make_project(db, project_id="p-a", composite_score=5.0, doi=3,
                          total_budget=300, pipeline_stage="Approved",
                          start_month="2026-01")
        b = _make_project(db, project_id="p-b", composite_score=4.0, doi=3,
                          total_budget=300, pipeline_stage="Approved",
                          start_month="2027-01")
        recompute_within_cutoff_for_backlog(db)
        db.refresh(a); db.refresh(b)
        before = (a.within_cutoff, b.within_cutoff)

        # A scoped read of a different year must not change the stored flags.
        compute_ranked_backlog(db, start_year=2027)
        db.refresh(a); db.refresh(b)
        assert (a.within_cutoff, b.within_cutoff) == before


# ---------------------------------------------------------------------------
# recompute_within_cutoff_for_backlog
# ---------------------------------------------------------------------------

class TestRecomputeWithinCutoff:
    def _seed_envelope(self, db, value: float):
        db.add(PlanningParameter(
            key="ranking_total_available_budget",
            name="x", current_value=str(int(value)),
            default_value=str(int(value)), data_type="integer", param_group="ranking",
        ))
        db.commit()

    def test_only_approved_backlog_projects_in_scope(self, db):
        # VIPER §3.3: Active has left the Backlog, so the recompute (which
        # walks BACKLOG_STAGES only) never touches it — its flag is left as-is.
        # Approved gets a fresh flag; the non-Approved backlog stage (Proposed)
        # is cleared to None.
        self._seed_envelope(db, 1000.0)
        approved = _make_project(db, project_id="p-app",
                                 pipeline_stage="Approved",
                                 composite_score=4.0, doi=3, total_budget=400)
        active = _make_project(db, project_id="p-act",
                               pipeline_stage="Active",
                               composite_score=3.0, doi=3, total_budget=400,
                               within_cutoff=True)  # out of backlog scope now
        proposed = _make_project(db, project_id="p-prop",
                                 pipeline_stage="Proposed",
                                 composite_score=2.0, doi=0, total_budget=400)

        result = recompute_within_cutoff_for_backlog(db)
        db.refresh(approved)
        db.refresh(active)
        db.refresh(proposed)

        assert approved.within_cutoff is True   # cumulative 400 ≤ 1000
        assert active.within_cutoff is True     # untouched — not in BACKLOG_STAGES
        assert proposed.within_cutoff is None   # non-Approved backlog → cleared
        # Only the two backlog projects (Approved + Proposed) are processed.
        assert result["recomputed"] == 2

    def test_approved_below_cutoff_set_false(self, db):
        # Envelope = 500. Two Approved projects of 400 each:
        # rank 1: cum = 400 ≤ 500 → within_cutoff True.
        # rank 2: cum = 800 > 500 → within_cutoff False.
        self._seed_envelope(db, 500.0)
        top = _make_project(db, project_id="p-top",
                            pipeline_stage="Approved",
                            composite_score=5.0, doi=3, total_budget=400)
        bottom = _make_project(db, project_id="p-bot",
                               pipeline_stage="Approved",
                               composite_score=2.0, doi=3, total_budget=400)
        recompute_within_cutoff_for_backlog(db)
        db.refresh(top)
        db.refresh(bottom)
        assert top.within_cutoff is True
        assert bottom.within_cutoff is False

    def test_changed_count_reports_only_real_movements(self, db):
        self._seed_envelope(db, 1_000_000.0)
        proj = _make_project(db, project_id="p",
                             pipeline_stage="Approved",
                             composite_score=4.0, doi=3, total_budget=400,
                             within_cutoff=True)  # already True
        # Re-running should not flip; envelope is huge.
        result = recompute_within_cutoff_for_backlog(db)
        assert result["changed"] == 0

    def test_idempotent(self, db):
        self._seed_envelope(db, 500.0)
        _make_project(db, project_id="p1", pipeline_stage="Approved",
                      composite_score=4.0, doi=3, total_budget=300)
        _make_project(db, project_id="p2", pipeline_stage="Approved",
                      composite_score=3.0, doi=3, total_budget=300)

        first = recompute_within_cutoff_for_backlog(db)
        second = recompute_within_cutoff_for_backlog(db)
        assert second["changed"] == 0
        assert first["cutoff"] == second["cutoff"]

    def test_type_3_approved_within_cutoff_cleared(self, db):
        # Type 3 projects don't compete in the ranked list, so their
        # within_cutoff should land at None even if previously set.
        self._seed_envelope(db, 1000.0)
        proj = _make_project(db, project_id="p-t3", project_type=3,
                             pipeline_stage="Approved",
                             composite_score=5.0, doi=3, total_budget=200,
                             within_cutoff=True)
        recompute_within_cutoff_for_backlog(db)
        db.refresh(proj)
        # Type 3 is excluded from ranking → no cumulative rank → flag cleared.
        assert proj.within_cutoff is None


# ---------------------------------------------------------------------------
# Trigger key set
# ---------------------------------------------------------------------------

class TestParameterKeyTriggers:
    @pytest.mark.parametrize("key", [
        "ranking_total_available_budget",
        "ranking_tiebreakers",
        "tn_w_value",
        "tn_complexity_weight_standardization",
        "tn_tshirt_xs_max",
    ])
    def test_relevant_keys_trigger(self, key):
        assert parameter_key_triggers_recompute(key) is True

    @pytest.mark.parametrize("key", [
        "fiscal_year_start",
        "planning_horizon",
        "rag_amber_threshold",
        "max_utilization",
    ])
    def test_unrelated_keys_do_not_trigger(self, key):
        assert parameter_key_triggers_recompute(key) is False


# ---------------------------------------------------------------------------
# Sort key edge cases (regression)
# ---------------------------------------------------------------------------

class TestProjectSortKey:
    def test_stable_on_identical_values(self):
        cfg = RankingConfig()
        a = type("P", (), {"id": "a", "composite_score": 4.0, "doi": 2, "total_budget": 100})
        b = type("P", (), {"id": "b", "composite_score": 4.0, "doi": 2, "total_budget": 100})
        # Final tiebreaker is project id ascending.
        assert _project_sort_key(a, cfg) < _project_sort_key(b, cfg)

    def test_walk_budget_handles_none(self):
        proj = type("P", (), {"total_budget": None})
        assert _project_walk_budget(proj) == 0.0

    def test_walk_budget_returns_float(self):
        proj = type("P", (), {"total_budget": 250_000})
        assert _project_walk_budget(proj) == 250_000.0
