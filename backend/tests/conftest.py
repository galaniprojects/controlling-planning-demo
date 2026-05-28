"""Shared test fixtures for the CRETA backend test suite."""

import os
import sys

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base
from schemas.common import CurrentUser

# Import all models so Base.metadata knows about all tables
import models  # noqa: F401

# ---------------------------------------------------------------------------
# In-memory SQLite engine shared across all test modules
# ---------------------------------------------------------------------------

from sqlalchemy.pool import StaticPool

TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(bind=TEST_ENGINE)


@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables before each test and drop after.

    Inserts the ``max_allocation_depth`` planning parameter (default 6) so
    code paths that read it via :func:`services.depth_validation.get_max_allocation_depth`
    — including :func:`get_upstream_chain` and the save-time depth check on
    edge writes — work without each test having to seed it.
    """
    Base.metadata.create_all(bind=TEST_ENGINE)
    from models.system import PlanningParameter
    session = TestSessionLocal()
    try:
        existing = (
            session.query(PlanningParameter)
            .filter(PlanningParameter.key == "max_allocation_depth")
            .first()
        )
        if existing is None:
            session.add(PlanningParameter(
                key="max_allocation_depth",
                name="Max Allocation Depth",
                description="Maximum Stage 1 distribution chain length",
                current_value="6",
                default_value="6",
                data_type="integer",
                param_group="limits",
            ))
            session.commit()
    finally:
        session.close()
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture
def db():
    """Yield a fresh SQLAlchemy session, closed after test."""
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Persona / CurrentUser factories
# ---------------------------------------------------------------------------

@pytest.fixture
def controller_user() -> CurrentUser:
    return CurrentUser(
        user_id="persona-controller",
        person_id="p-controller",
        name="Test Controller",
        role="controller",
        cost_center_id=None,
        project_ids=[],
    )


@pytest.fixture
def pl_user() -> CurrentUser:
    return CurrentUser(
        user_id="persona-pl",
        person_id="p-pl",
        name="Test Project Lead",
        role="project_lead",
        cost_center_id=None,
        project_ids=["proj-alpha", "proj-beta"],
    )


@pytest.fixture
def cc_owner_user() -> CurrentUser:
    return CurrentUser(
        user_id="persona-cc-owner",
        person_id="p-cc-owner",
        name="Test CC Owner",
        role="cost_center_owner",
        cost_center_id="cc-muc-dev",
        project_ids=[],
    )


@pytest.fixture
def exec_user() -> CurrentUser:
    return CurrentUser(
        user_id="persona-exec",
        person_id="p-exec",
        name="Test Executive",
        role="executive",
        cost_center_id=None,
        project_ids=[],
    )


# ---------------------------------------------------------------------------
# Seed helpers — organisational base data
# ---------------------------------------------------------------------------

@pytest.fixture
def seed_org_base(db):
    """Insert minimal org data required for FK constraints.

    Returns a dict of IDs for reference in tests.
    """
    from models.organization import Location, CompetenceCenter, CostCenter
    from models.people import RoleType, Person

    loc = Location(id="loc-muc", city="Munich", country="Germany")
    cc_center = CompetenceCenter(id="comp-dev", name="Development")
    cost_center = CostCenter(
        id="cc-muc-dev",
        name="Munich Development",
        location_id="loc-muc",
        competence_center_id="comp-dev",
    )
    role_dev = RoleType(id="role-dev", name="Developer")
    role_pm = RoleType(id="role-pm", name="Project Manager")
    person_a = Person(
        id="p-dev-1", name="Dev One",
        role_type_id="role-dev", cost_center_id="cc-muc-dev",
        competence_center_id="comp-dev",
    )
    person_b = Person(
        id="p-dev-2", name="Dev Two",
        role_type_id="role-dev", cost_center_id="cc-muc-dev",
        competence_center_id="comp-dev",
    )
    person_pm = Person(
        id="p-pm-1", name="PM One",
        role_type_id="role-pm", cost_center_id="cc-muc-dev",
        competence_center_id="comp-dev",
    )

    db.add_all([loc, cc_center, cost_center, role_dev, role_pm,
                person_a, person_b, person_pm])
    db.commit()

    return {
        "location_id": "loc-muc",
        "competence_center_id": "comp-dev",
        "cost_center_id": "cc-muc-dev",
        "role_dev_id": "role-dev",
        "role_pm_id": "role-pm",
        "person_ids": ["p-dev-1", "p-dev-2", "p-pm-1"],
    }


@pytest.fixture
def seed_hierarchy(db, seed_org_base):
    """Insert a minimal 2-level grouping hierarchy.

    Structure:
      Hierarchy: "Standard"
        Level 1: Line of Business  → LoB-Alpha, LoB-Beta
        Level 2: Programme         → Prog-One (under LoB-Alpha)
    """
    from models.organization import (
        GroupingEntityType, GroupingEntity,
        GroupingHierarchy, GroupingHierarchyLevel,
    )

    get_lob = GroupingEntityType(id="get-lob", name="Line of Business")
    get_prog = GroupingEntityType(id="get-prog", name="Programme")

    hierarchy = GroupingHierarchy(id="hier-std", name="Standard", is_active_hierarchy=True)

    level1 = GroupingHierarchyLevel(hierarchy_id="hier-std", level_order=1, entity_type_id="get-lob")
    level2 = GroupingHierarchyLevel(hierarchy_id="hier-std", level_order=2, entity_type_id="get-prog")

    lob_alpha = GroupingEntity(id="lob-alpha", entity_type_id="get-lob", name="LoB Alpha")
    lob_beta = GroupingEntity(id="lob-beta", entity_type_id="get-lob", name="LoB Beta")
    prog_one = GroupingEntity(
        id="prog-one", entity_type_id="get-prog", name="Programme One",
        parent_entity_id="lob-alpha",
    )

    db.add_all([get_lob, get_prog, hierarchy, level1, level2,
                lob_alpha, lob_beta, prog_one])
    db.commit()

    return {
        "hierarchy_id": "hier-std",
        "lob_alpha_id": "lob-alpha",
        "lob_beta_id": "lob-beta",
        "prog_one_id": "prog-one",
        "lob_type_id": "get-lob",
        "prog_type_id": "get-prog",
    }


# ---------------------------------------------------------------------------
# Test project factory
# ---------------------------------------------------------------------------

@pytest.fixture
def create_test_project(db, seed_org_base):
    """Factory fixture: call with project params to insert a Project + financials.

    Usage:
        proj = create_test_project("proj-1", "Test Project",
                                   months=["2026-01", "2026-02"],
                                   forecast_amt=1000, baseline_amt=900)
    """
    from models.projects import Project
    from models.financial import Baseline, Forecast, Actuals

    def _create(
        project_id: str = "proj-test",
        name: str = "Test Project",
        status: str = "active",
        capex_opex: str = "capex",
        start_month: str = "2025-01",
        end_month: str = "2026-12",
        months: list[str] | None = None,
        baseline_amt: float = 1000.0,
        forecast_amt: float = 1100.0,
        actuals_amt: float | None = None,
        pl_person_id: str | None = None,
    ):
        proj = Project(
            id=project_id, name=name, status=status,
            capex_opex=capex_opex, start_month=start_month,
            end_month=end_month, pl_person_id=pl_person_id,
        )
        db.add(proj)
        db.flush()

        if months is None:
            months = ["2026-01", "2026-02", "2026-03"]

        for m in months:
            db.add(Baseline(
                project_id=project_id, month=m,
                category="internal", sub_category="role-dev",
                hours=10, amount_eur=baseline_amt,
            ))
            db.add(Forecast(
                project_id=project_id, month=m,
                category="internal", sub_category="role-dev",
                hours=11, amount_eur=forecast_amt,
            ))
            if actuals_amt is not None:
                db.add(Actuals(
                    project_id=project_id, month=m,
                    category="internal", sub_category="role-dev",
                    hours=10, amount_eur=actuals_amt,
                ))

        db.commit()
        return proj

    return _create


# ---------------------------------------------------------------------------
# TestClient for router integration tests
# ---------------------------------------------------------------------------

@pytest.fixture
def test_client(db):
    """FastAPI TestClient with overridden get_db and get_current_user dependencies.

    Usage:
        def test_endpoint(test_client, seed_personas):
            resp = test_client.get("/api/...", headers={"X-Current-User": "persona-controller"})
    """
    import json as _json

    from fastapi import Header
    from fastapi.testclient import TestClient
    from database import get_db as real_get_db
    from dependencies import get_current_user as real_get_current_user
    from models.users import DemoPersona
    from main import app

    def _override_get_db():
        try:
            yield db
        finally:
            pass  # Don't close — db fixture handles lifecycle

    app.dependency_overrides[real_get_db] = _override_get_db

    # Override get_current_user to resolve personas from the test DB.
    # We use fastapi.Request to extract the header manually, avoiding
    # Depends(get_db) sub-dependency resolution issues.
    from fastapi import HTTPException, Request

    def _override_get_current_user(request: Request):
        header_val = request.headers.get("x-current-user")
        if not header_val:
            raise HTTPException(status_code=422, detail="Missing X-Current-User header")
        persona = db.query(DemoPersona).filter(DemoPersona.id == header_val).first()
        if not persona:
            raise HTTPException(status_code=401, detail=f"Unknown persona: {header_val}")
        project_ids = _json.loads(persona.owned_project_ids_json) if persona.owned_project_ids_json else []
        return CurrentUser(
            user_id=persona.id, person_id=persona.person_id,
            name=persona.display_name, role=persona.role,
            cost_center_id=persona.managed_cost_center_id,
            project_ids=project_ids,
        )

    app.dependency_overrides[real_get_current_user] = _override_get_current_user

    # Initialize fixtures store if not already set
    if not hasattr(app.state, "fixtures") or not app.state.fixtures:
        app.state.fixtures = {"advisor_goals": [], "manuals": {}, "faq": []}

    # Prevent startup event from running seed_database on production DB
    original_startup = app.router.on_startup.copy()
    app.router.on_startup.clear()

    client = TestClient(app, raise_server_exceptions=False)
    yield client

    app.router.on_startup = original_startup
    app.dependency_overrides.clear()


@pytest.fixture
def seed_personas(db, seed_org_base):
    """Seed DemoPersona rows so TestClient can resolve X-Current-User headers."""
    from models.users import DemoPersona

    personas = [
        DemoPersona(
            id="persona-controller", person_id="p-dev-1", role="controller",
            display_name="Test Controller", title="Controller",
            default_module="launchpad",
        ),
        DemoPersona(
            id="persona-exec", person_id="p-dev-2", role="executive",
            display_name="Test Executive", title="Executive",
            default_module="launchpad",
        ),
        DemoPersona(
            id="persona-pl", person_id="p-pm-1", role="project_lead",
            display_name="Test PL", title="Project Lead",
            default_module="workbench",
            owned_project_ids_json='["proj-alpha", "proj-beta"]',
        ),
        DemoPersona(
            id="persona-cc-owner", person_id="p-dev-1", role="cost_center_owner",
            display_name="Test CC Owner", title="CC Owner",
            default_module="capacity",
            managed_cost_center_id="cc-muc-dev",
        ),
    ]
    db.add_all(personas)
    db.commit()
    return {p.id: p for p in personas}
