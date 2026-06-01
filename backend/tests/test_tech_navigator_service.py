"""Unit tests for services/tech_navigator.py — pure-function math + DB helpers."""

from __future__ import annotations

import pytest

from models.projects import Project
from models.system import PlanningParameter
from services.tech_navigator import (
    DEFAULT_COMPLEXITY_WEIGHTS,
    DEFAULT_RANKING_WEIGHTS,
    DEFAULT_TSHIRT_THRESHOLDS,
    DEFAULT_VALUE_WEIGHTS,
    WeightsSnapshot,
    compute_complexity,
    compute_composite,
    compute_value_creation,
    derive_tshirt,
    load_weights,
    recompute_all_scores,
    recompute_project,
)


def _make_project(**overrides) -> Project:
    """Build an in-memory Project (not committed) for pure-function tests."""
    defaults = dict(
        id="proj-test", name="Test", pipeline_stage="Active",
        capex_opex="capex", start_month="2026-01",
    )
    defaults.update(overrides)
    return Project(**defaults)


def _seed_default_weights(db) -> None:
    """Insert the 12 tech_navigator planning parameters at spec defaults."""
    rows = [
        ("tn_complexity_weight_standardization", "40"),
        ("tn_complexity_weight_usage", "40"),
        ("tn_complexity_weight_maintenance", "20"),
        ("tn_value_weight_financial", "50"),
        ("tn_value_weight_payback", "40"),
        ("tn_value_weight_competitive", "10"),
        ("tn_w_value", "70"),
        ("tn_w_complexity", "30"),
        ("tn_tshirt_xs_max", "100000"),
        ("tn_tshirt_s_max", "250000"),
        ("tn_tshirt_m_max", "500000"),
        ("tn_tshirt_l_max", "1000000"),
    ]
    for key, value in rows:
        db.add(PlanningParameter(
            key=key, name=key, current_value=value, default_value=value,
            data_type="percentage" if "tshirt" not in key else "integer",
            param_group="tech_navigator",
        ))
    db.commit()


# ---------------------------------------------------------------------------
# compute_complexity
# ---------------------------------------------------------------------------

class TestComputeComplexity:
    def test_default_weights_returns_weighted_average(self):
        proj = _make_project(tn_standardization=4, tn_usage=5, tn_maintenance=3)
        weights = WeightsSnapshot()
        # (4*40 + 5*40 + 3*20) / 100 = (160 + 200 + 60) / 100 = 4.2
        assert compute_complexity(proj, weights) == 4.2

    def test_returns_none_when_any_subscore_missing(self):
        proj = _make_project(tn_standardization=4, tn_usage=None, tn_maintenance=3)
        assert compute_complexity(proj, WeightsSnapshot()) is None

    def test_uses_admin_weights(self):
        proj = _make_project(tn_standardization=5, tn_usage=1, tn_maintenance=1)
        weights = WeightsSnapshot()
        weights.complexity = {"standardization": 100.0, "usage": 0.0, "maintenance": 0.0}
        assert compute_complexity(proj, weights) == 5.0


# ---------------------------------------------------------------------------
# compute_value_creation
# ---------------------------------------------------------------------------

class TestComputeValueCreation:
    def test_default_weights_returns_weighted_average(self):
        proj = _make_project(
            tn_financial_benefit=4, tn_payback=3, tn_competitive_advantage=5,
        )
        # (4*50 + 3*40 + 5*10) / 100 = (200 + 120 + 50) / 100 = 3.7
        assert compute_value_creation(proj, WeightsSnapshot()) == 3.7

    def test_ignores_reserved_slots(self):
        # Reserved slots have non-null values but don't affect the score.
        proj = _make_project(
            tn_financial_benefit=4, tn_payback=3, tn_competitive_advantage=5,
            tn_value_reserved_1=1, tn_value_reserved_2=1,
        )
        assert compute_value_creation(proj, WeightsSnapshot()) == 3.7

    def test_returns_none_when_surfaced_subscore_missing(self):
        proj = _make_project(
            tn_financial_benefit=None, tn_payback=3, tn_competitive_advantage=5,
        )
        assert compute_value_creation(proj, WeightsSnapshot()) is None


# ---------------------------------------------------------------------------
# compute_composite
# ---------------------------------------------------------------------------

class TestComputeComposite:
    def test_default_70_30_weighting(self):
        # value=4.0, complexity=3.0 → (4*70 + 3*30) / 100 = 3.7
        assert compute_composite(3.0, 4.0, WeightsSnapshot()) == 3.7

    def test_returns_none_when_complexity_missing(self):
        assert compute_composite(None, 4.0, WeightsSnapshot()) is None

    def test_returns_none_when_value_creation_missing(self):
        assert compute_composite(3.0, None, WeightsSnapshot()) is None


# ---------------------------------------------------------------------------
# derive_tshirt
# ---------------------------------------------------------------------------

class TestDeriveTshirt:
    @pytest.mark.parametrize("budget,expected", [
        (50_000, "XS"),
        (100_000, "XS"),       # boundary inclusive
        (100_001, "S"),        # one euro above XS max
        (200_000, "S"),
        (250_000, "S"),
        (250_001, "M"),
        (400_000, "M"),
        (500_000, "M"),
        (500_001, "L"),
        (900_000, "L"),
        (1_000_000, "L"),
        (1_000_001, "XL"),
        (1_500_000, "XL"),
        (5_000_000, "XL"),
    ])
    def test_boundary_classification(self, budget, expected):
        assert derive_tshirt(budget, WeightsSnapshot()) == expected

    def test_null_budget_returns_none(self):
        assert derive_tshirt(None, WeightsSnapshot()) is None

    def test_admin_threshold_change_affects_size(self):
        weights = WeightsSnapshot()
        weights.tshirt = {"xs_max": 50_000, "s_max": 100_000, "m_max": 200_000, "l_max": 500_000}
        # 100k would have been XS at default thresholds; now it's S.
        assert derive_tshirt(100_000, weights) == "S"


# ---------------------------------------------------------------------------
# load_weights — DB integration
# ---------------------------------------------------------------------------

class TestLoadWeights:
    def test_falls_back_to_defaults_when_no_rows(self, db):
        weights = load_weights(db)
        assert weights.complexity == DEFAULT_COMPLEXITY_WEIGHTS
        assert weights.value_creation == DEFAULT_VALUE_WEIGHTS
        assert weights.ranking == DEFAULT_RANKING_WEIGHTS
        assert weights.tshirt == DEFAULT_TSHIRT_THRESHOLDS

    def test_reads_seeded_values(self, db):
        _seed_default_weights(db)
        weights = load_weights(db)
        assert weights.complexity["standardization"] == 40.0
        assert weights.value_creation["financial"] == 50.0
        assert weights.ranking["value"] == 70.0
        assert weights.tshirt["xs_max"] == 100_000

    def test_partial_override_keeps_defaults_for_missing_keys(self, db):
        # Only seed one row — others should fall back to defaults.
        db.add(PlanningParameter(
            key="tn_w_value", name="x", current_value="60", default_value="70",
            data_type="percentage", param_group="tech_navigator",
        ))
        db.commit()
        weights = load_weights(db)
        assert weights.ranking["value"] == 60.0  # overridden
        assert weights.ranking["complexity"] == DEFAULT_RANKING_WEIGHTS["complexity"]  # default

    def test_corrupt_value_falls_back_silently(self, db):
        db.add(PlanningParameter(
            key="tn_w_value", name="x", current_value="not_a_number",
            default_value="70", data_type="percentage", param_group="tech_navigator",
        ))
        db.commit()
        weights = load_weights(db)
        assert weights.ranking["value"] == DEFAULT_RANKING_WEIGHTS["value"]


# ---------------------------------------------------------------------------
# recompute_all_scores — DB integration
# ---------------------------------------------------------------------------

class TestRecomputeAllScores:
    def test_returns_count_and_mutates_projects(self, db, seed_org_base, create_test_project):
        _seed_default_weights(db)
        create_test_project(project_id="proj-a", months=["2026-01"])
        create_test_project(project_id="proj-b", months=["2026-01"])
        # Score one project; the other stays unscored.
        proj_a = db.query(Project).filter(Project.id == "proj-a").first()
        proj_a.tn_standardization = 4
        proj_a.tn_usage = 5
        proj_a.tn_maintenance = 3
        proj_a.tn_financial_benefit = 4
        proj_a.tn_payback = 3
        proj_a.tn_competitive_advantage = 5
        proj_a.total_budget = 200_000
        db.commit()

        count = recompute_all_scores(db)
        assert count == 2

        db.refresh(proj_a)
        assert float(proj_a.complexity_score) == 4.2
        assert float(proj_a.value_creation_score) == 3.7
        # composite = (3.7*70 + 4.2*30) / 100 = (259 + 126) / 100 = 3.85
        assert float(proj_a.composite_score) == 3.85
        assert proj_a.tshirt_size == "S"

        proj_b = db.query(Project).filter(Project.id == "proj-b").first()
        assert proj_b.complexity_score is None
        assert proj_b.composite_score is None

    def test_recompute_project_helper_mutates_in_place(self):
        proj = _make_project(
            tn_standardization=5, tn_usage=5, tn_maintenance=5,
            tn_financial_benefit=5, tn_payback=5, tn_competitive_advantage=5,
            total_budget=600_000,
        )
        recompute_project(proj, WeightsSnapshot())
        assert float(proj.complexity_score) == 5.0
        assert float(proj.value_creation_score) == 5.0
        assert float(proj.composite_score) == 5.0
        assert proj.tshirt_size == "L"
