"""Unit tests for dependencies.py — DB-dependent get_current_user."""

import pytest
from fastapi import HTTPException

from dependencies import get_current_user
from models.people import Person, RoleType
from models.organization import Location, CompetenceCenter, CostCenter
from models.users import DemoPersona


def _seed_persona(db, persona_id="persona-test", role="controller",
                  person_id="p-test", cost_center_id=None, project_ids_json=None):
    """Insert a DemoPersona with required FK chain."""
    # Ensure base org exists
    if not db.query(Location).filter(Location.id == "loc-test").first():
        db.add(Location(id="loc-test", city="Test", country="DE"))
        db.add(CompetenceCenter(id="comp-test", name="Test CC"))
        db.add(CostCenter(id="cc-test", name="Test CC", location_id="loc-test",
                          competence_center_id="comp-test"))
        if not db.query(RoleType).filter(RoleType.id == "role-test").first():
            db.add(RoleType(id="role-test", name="Tester"))
        db.flush()

    if not db.query(Person).filter(Person.id == person_id).first():
        db.add(Person(id=person_id, name="Test Person", role_type_id="role-test",
                      cost_center_id="cc-test", competence_center_id="comp-test"))
        db.flush()

    persona = DemoPersona(
        id=persona_id, person_id=person_id, role=role,
        display_name="Test User", title="Tester",
        default_module="launchpad",
        managed_cost_center_id=cost_center_id,
        owned_project_ids_json=project_ids_json,
    )
    db.add(persona)
    db.commit()
    return persona


class TestGetCurrentUser:
    def test_valid_persona(self, db):
        _seed_persona(db, "persona-ctrl", "controller")
        user = get_current_user(x_current_user="persona-ctrl", db=db)
        assert user.user_id == "persona-ctrl"
        assert user.role == "controller"
        assert user.name == "Test User"

    def test_unknown_persona_raises_401(self, db):
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(x_current_user="nonexistent", db=db)
        assert exc_info.value.status_code == 401

    def test_persona_with_project_ids(self, db):
        _seed_persona(db, "persona-pl", "project_lead",
                      project_ids_json='["proj-1", "proj-2"]')
        user = get_current_user(x_current_user="persona-pl", db=db)
        assert user.project_ids == ["proj-1", "proj-2"]

    def test_persona_with_cost_center(self, db):
        _seed_persona(db, "persona-cco", "cost_center_owner",
                      cost_center_id="cc-test")
        user = get_current_user(x_current_user="persona-cco", db=db)
        assert user.cost_center_id == "cc-test"
