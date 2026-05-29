"""Unit tests for services/portfolio_service.py."""

import pytest
from unittest.mock import patch

from models.organization import ProjectGroupingAssignment
from models.projects import Project
from services.portfolio_service import (
    _aggregate_children,
    _get_projects_for_entity_recursive,
    _make_project_node,
    build_portfolio_tree,
    compute_portfolio_kpis,
    compute_project_financials,
    get_project_entity_info,
    get_project_hierarchy_path,
    get_top_level_entity_type_id,
)


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

class TestMakeProjectNode:
    def test_project_node(self):
        p = Project(
            id="proj-1", name="Test", status="active",
            capex_opex="capex", start_month="2025-01", end_month="2026-12",
            rag_status="green", is_service=False,
        )
        fins = {
            "baseline_total": 1000, "forecast_total": 1100,
            "actuals_ytd": 500, "plan_drift_pct": 10.0,
            "baseline_cy": 800, "forecast_cy": 900, "actuals_cy": 400,
            "baseline_py": 200, "forecast_py": 200, "actuals_py": 100,
        }
        node = _make_project_node(p, fins)
        assert node["id"] == "proj-1"
        assert node["type"] == "project"
        assert node["rag"] == "green"
        assert node["baseline_budget"] == 1000
        assert node["children"] == []

    def test_service_node(self):
        p = Project(
            id="svc-1", name="Service", status="active",
            capex_opex="opex", start_month="2025-01",
            is_service=True,
        )
        fins = {
            "baseline_total": 0, "forecast_total": 0,
            "actuals_ytd": 0, "plan_drift_pct": 0,
            "baseline_cy": 0, "forecast_cy": 0, "actuals_cy": 0,
            "baseline_py": 0, "forecast_py": 0, "actuals_py": 0,
        }
        node = _make_project_node(p, fins)
        assert node["type"] == "service"


class TestAggregateChildren:
    def test_single_child(self):
        children = [{
            "baseline_budget": 1000, "current_forecast": 1100,
            "actuals_ytd": 500, "rag": "green",
            "baseline_cy": 800, "forecast_cy": 900, "actuals_cy": 400,
            "baseline_py": 200, "forecast_py": 200, "actuals_py": 100,
        }]
        rag_priority = {"green": 0, "amber": 1, "red": 2, None: -1}
        result = _aggregate_children(children, rag_priority)
        assert result["baseline_budget"] == 1000
        assert result["current_forecast"] == 1100
        assert result["rag"] == "green"

    def test_multiple_children_worst_rag(self):
        children = [
            {"baseline_budget": 500, "current_forecast": 500, "actuals_ytd": 200,
             "rag": "green", "baseline_cy": 500, "forecast_cy": 500, "actuals_cy": 200,
             "baseline_py": 0, "forecast_py": 0, "actuals_py": 0},
            {"baseline_budget": 500, "current_forecast": 600, "actuals_ytd": 300,
             "rag": "red", "baseline_cy": 500, "forecast_cy": 600, "actuals_cy": 300,
             "baseline_py": 0, "forecast_py": 0, "actuals_py": 0},
        ]
        rag_priority = {"green": 0, "amber": 1, "red": 2, None: -1}
        result = _aggregate_children(children, rag_priority)
        assert result["baseline_budget"] == 1000
        assert result["current_forecast"] == 1100
        assert result["rag"] == "red"

    def test_empty_children(self):
        rag_priority = {"green": 0, "amber": 1, "red": 2, None: -1}
        result = _aggregate_children([], rag_priority)
        assert result["baseline_budget"] == 0
        assert result["rag"] is None


# ---------------------------------------------------------------------------
# DB-dependent functions
# ---------------------------------------------------------------------------

class TestGetTopLevelEntityTypeId:
    def test_returns_top_level(self, db, seed_hierarchy):
        result = get_top_level_entity_type_id(db)
        assert result == seed_hierarchy["lob_type_id"]

    def test_no_active_hierarchy(self, db):
        # No hierarchy seeded
        result = get_top_level_entity_type_id(db)
        assert result is None


class TestGetProjectEntityInfo:
    def test_direct_assignment(self, db, seed_hierarchy, create_test_project):
        proj = create_test_project("proj-1")
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))
        db.commit()
        result = get_project_entity_info(db, "proj-1")
        assert result["id"] == seed_hierarchy["prog_one_id"]

    def test_walk_up_to_lob(self, db, seed_hierarchy, create_test_project):
        proj = create_test_project("proj-1")
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))
        db.commit()
        result = get_project_entity_info(db, "proj-1", seed_hierarchy["lob_type_id"])
        assert result["id"] == seed_hierarchy["lob_alpha_id"]

    def test_no_assignment(self, db, create_test_project):
        create_test_project("proj-1")
        result = get_project_entity_info(db, "proj-1")
        assert result is None


class TestGetProjectHierarchyPath:
    def test_full_path(self, db, seed_hierarchy, create_test_project):
        create_test_project("proj-1")
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))
        db.commit()
        path = get_project_hierarchy_path(db, "proj-1")
        assert len(path) == 2
        assert path[0]["entity_name"] == "LoB Alpha"
        assert path[1]["entity_name"] == "Programme One"

    def test_no_assignment(self, db, create_test_project):
        create_test_project("proj-1")
        assert get_project_hierarchy_path(db, "proj-1") == []


class TestGetProjectsForEntityRecursive:
    def test_direct_projects(self, db, seed_hierarchy, create_test_project):
        create_test_project("proj-1")
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))
        db.commit()
        pids = _get_projects_for_entity_recursive(db, seed_hierarchy["prog_one_id"])
        assert "proj-1" in pids

    def test_recursive_children(self, db, seed_hierarchy, create_test_project):
        create_test_project("proj-1")
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))
        db.commit()
        # LoB Alpha is parent of Prog One, so recursive should find proj-1
        pids = _get_projects_for_entity_recursive(db, seed_hierarchy["lob_alpha_id"])
        assert "proj-1" in pids

    def test_empty_entity(self, db, seed_hierarchy):
        pids = _get_projects_for_entity_recursive(db, seed_hierarchy["lob_beta_id"])
        assert pids == []


@patch("services.portfolio_service.DEMO_DATE", "2026-04")
class TestComputeProjectFinancials:
    def test_basic_financials(self, db, create_test_project):
        create_test_project("proj-1", months=["2026-01", "2026-02"],
                            baseline_amt=1000, forecast_amt=1100, actuals_amt=950)
        result = compute_project_financials(db, "proj-1")
        assert result["baseline_total"] == 2000.0
        assert result["forecast_total"] == 2200.0
        assert result["actuals_ytd"] == 1900.0
        assert result["plan_drift_pct"] == 10.0

    def test_no_data(self, db, seed_org_base):
        from models.projects import Project
        db.add(Project(id="proj-empty", name="E", status="active",
                       capex_opex="capex", start_month="2025-01"))
        db.commit()
        result = compute_project_financials(db, "proj-empty")
        assert result["baseline_total"] == 0.0
        assert result["forecast_total"] == 0.0


@patch("services.portfolio_service.DEMO_DATE", "2026-04")
class TestComputePortfolioKpis:
    def test_basic_kpis(self, db, create_test_project):
        create_test_project("proj-1", months=["2026-01", "2026-02"],
                            baseline_amt=1000, forecast_amt=1100)
        result = compute_portfolio_kpis(db)
        assert result["active_project_count"] == 1
        assert result["baseline"] == 2000.0
        assert result["current_forecast"] == 2200.0
        assert result["plan_drift_pct"] == 10.0

    def test_no_projects(self, db, seed_org_base):
        result = compute_portfolio_kpis(db)
        assert result["active_project_count"] == 0
        assert result["baseline"] == 0

    def test_status_filter(self, db, create_test_project):
        create_test_project("proj-1", status="active")
        create_test_project("proj-2", name="Draft", status="draft")
        result = compute_portfolio_kpis(db, {"status": "active"})
        assert result["active_project_count"] == 1


class TestChangeStatusBadge:
    """VIPER §3.2 — derived change_status hint per pipeline stage."""

    @pytest.mark.parametrize("stage,expected", [
        ("Active", "active"),
        ("Hyper-maintenance", "hyper_maintenance"),
        ("Completed", "completed"),
        ("Run entity spawned", "handed_over"),
        ("Approved", "staged"),
        ("Paused", "paused"),
        ("Proposed", None),
        ("Under Evaluation", None),
        (None, None),
    ])
    def test_change_status_mapping(self, stage, expected):
        from services.portfolio_service import _change_status
        p = Project(
            id="p", name="P", status="active", capex_opex="capex",
            start_month="2026-01", is_service=False, pipeline_stage=stage,
        )
        assert _change_status(p) == expected

    def test_node_carries_change_status(self):
        p = Project(
            id="p", name="P", status="active", capex_opex="capex",
            start_month="2026-01", end_month="2026-12", is_service=False,
            pipeline_stage="Active",
        )
        fins = {k: 0 for k in (
            "baseline_total", "forecast_total", "actuals_ytd", "plan_drift_pct",
            "baseline_cy", "forecast_cy", "actuals_cy",
            "baseline_py", "forecast_py", "actuals_py",
        )}
        assert _make_project_node(p, fins)["change_status"] == "active"


@patch("services.calendar.DEMO_DATE", "2026-04")
class TestChangePopulationFilter:
    """VIPER §3.2 — opt-in Change Portfolio population filter.

    The filter is applied ONLY when ``population == "change"``; the unscoped
    path (Launchpad / module cards) must keep counting every active project.
    ``DEMO_DATE`` is patched on ``services.calendar`` (the symbol read by
    ``current_fiscal_year``) so the current-FY assertion is self-contained.
    """

    def test_unscoped_counts_all_active(self, db, create_test_project):
        # Regression guard: no population flag → every stage counts.
        create_test_project("p-prop", pipeline_stage="Proposed")
        create_test_project("p-active", pipeline_stage="Active")
        assert compute_portfolio_kpis(db)["active_project_count"] == 2

    def test_change_excludes_null_stage(self, db, create_test_project):
        # A stage-less project belongs to no §3.2 population → excluded from
        # Change, but still counted on the unscoped path.
        create_test_project("p-null", pipeline_stage=None)
        create_test_project("p-active", pipeline_stage="Active")
        assert compute_portfolio_kpis(db)["active_project_count"] == 2
        change = compute_portfolio_kpis(db, {"population": "change"})
        assert change["active_project_count"] == 1

    def test_change_excludes_backlog_includes_execution_terminal(self, db, create_test_project):
        create_test_project("p-prop", pipeline_stage="Proposed")     # backlog → out
        create_test_project("p-active", pipeline_stage="Active")     # execution → in
        create_test_project("p-hm", pipeline_stage="Hyper-maintenance")  # execution → in
        create_test_project("p-done", pipeline_stage="Completed")    # terminal → in
        create_test_project("p-spawn", pipeline_stage="Run entity spawned")  # terminal → in
        result = compute_portfolio_kpis(db, {"population": "change"})
        assert result["active_project_count"] == 4

    def test_change_approved_current_year_dual_visible(self, db, create_test_project):
        # Approved + current-FY start (2026) is dual-visible → in Change.
        create_test_project("p-app-cy", pipeline_stage="Approved", start_month="2026-05")
        # Approved + future-year start → backlog only, excluded from Change.
        create_test_project("p-app-fy", pipeline_stage="Approved", start_month="2027-05")
        result = compute_portfolio_kpis(db, {"population": "change"})
        assert result["active_project_count"] == 1

    def test_change_paused_routed_by_frozen_doi(self, db, create_test_project):
        # Paused mid-execution (frozen_doi >= 3) stays in Change; a pre-execution
        # pause (frozen_doi < 3 / NULL) is excluded.
        mid = create_test_project("p-paused-mid", pipeline_stage="Paused")
        pre = create_test_project("p-paused-pre", pipeline_stage="Paused")
        none = create_test_project("p-paused-none", pipeline_stage="Paused")
        mid.frozen_doi = 4
        pre.frozen_doi = 1
        db.commit()
        result = compute_portfolio_kpis(db, {"population": "change"})
        assert result["active_project_count"] == 1


@patch("services.portfolio_service.DEMO_DATE", "2026-04")
class TestBuildPortfolioTree:
    def test_flat_without_hierarchy(self, db, create_test_project):
        create_test_project("proj-1")
        # No hierarchy seeded → flat list
        tree = build_portfolio_tree(db)
        assert len(tree) == 1
        assert tree[0]["id"] == "proj-1"
        assert tree[0]["children"] == []

    def test_hierarchical_tree(self, db, seed_hierarchy, create_test_project):
        create_test_project("proj-1")
        db.add(ProjectGroupingAssignment(
            project_id="proj-1", grouping_entity_id=seed_hierarchy["prog_one_id"],
        ))
        db.commit()
        tree = build_portfolio_tree(db)
        # Should have LoB Alpha at top with children
        assert len(tree) >= 1
        lob_node = tree[0]
        assert lob_node["id"] == seed_hierarchy["lob_alpha_id"]
        assert len(lob_node["children"]) >= 1

    def test_empty_portfolio(self, db, seed_org_base):
        tree = build_portfolio_tree(db)
        assert tree == []

    def test_unassigned_projects_appear(self, db, seed_hierarchy, create_test_project):
        create_test_project("proj-unassigned")
        # No ProjectGroupingAssignment for this project
        tree = build_portfolio_tree(db)
        # Should appear at top level since it's not in any entity
        proj_ids = [n["id"] for n in tree]
        assert "proj-unassigned" in proj_ids
