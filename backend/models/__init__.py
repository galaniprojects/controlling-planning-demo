# Import all models so Base.metadata.create_all() discovers all tables.
# Import order matters — base tables first, then tables with foreign keys.

from models.organization import LineOfBusiness, Location, CompetenceCenter, CostCenter
from models.people import RoleType, Person, RateTable
from models.projects import Program, Project
from models.financial import ExternalCostType, Baseline, Forecast, Actuals
from models.capacity import Allocation, ResourceRequest
from models.change_requests import ChangeRequest, CRChangeDetail
from models.scenarios import Scenario, ScenarioAction, ScenarioState, ScenarioCapacityImpact
from models.system import PlanningParameter, KPIDefinition, Notification, AuditLog, SystemSuggestion
from models.users import DemoPersona

__all__ = [
    "LineOfBusiness", "Location", "CompetenceCenter", "CostCenter",
    "RoleType", "Person", "RateTable",
    "Program", "Project",
    "ExternalCostType", "Baseline", "Forecast", "Actuals",
    "Allocation", "ResourceRequest",
    "ChangeRequest", "CRChangeDetail",
    "Scenario", "ScenarioAction", "ScenarioState", "ScenarioCapacityImpact",
    "PlanningParameter", "KPIDefinition", "Notification", "AuditLog", "SystemSuggestion",
    "DemoPersona",
]
