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
