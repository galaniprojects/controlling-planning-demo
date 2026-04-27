# Import all models so Base.metadata.create_all() discovers all tables.
# Import order matters — base tables first, then tables with foreign keys.

from models.organization import (
    Location, CompetenceCenter, CostCenter,
    GroupingEntityType, GroupingEntity, GroupingHierarchy,
    GroupingHierarchyLevel, ProjectGroupingAssignment,
)
from models.people import RoleType, Person, RateTable
from models.projects import Project, ProjectMilestone, MilestoneType
from models.financial import ExternalCostType, Baseline, Forecast, Actuals
from models.capacity import Allocation, ResourceRequest, ResourceRequestAssignment
from models.change_requests import ChangeRequest, CRChangeDetail, CRSubmissionSnapshot
from models.scenarios import Scenario, ScenarioAction, ScenarioState, ScenarioCapacityImpact
from models.system import PlanningParameter, KPIDefinition, Notification, AuditLog, SystemSuggestion
from models.users import DemoPersona
from models.reporting import ForecastSnapshot, SavedReport, SavedReportShare, SavedView
from models.submissions import ProjectSubmissionSnapshot

__all__ = [
    "Location", "CompetenceCenter", "CostCenter",
    "GroupingEntityType", "GroupingEntity", "GroupingHierarchy",
    "GroupingHierarchyLevel", "ProjectGroupingAssignment",
    "RoleType", "Person", "RateTable",
    "Project", "ProjectMilestone", "MilestoneType",
    "ExternalCostType", "Baseline", "Forecast", "Actuals",
    "Allocation", "ResourceRequest", "ResourceRequestAssignment",
    "ChangeRequest", "CRChangeDetail", "CRSubmissionSnapshot",
    "Scenario", "ScenarioAction", "ScenarioState", "ScenarioCapacityImpact",
    "PlanningParameter", "KPIDefinition", "Notification", "AuditLog", "SystemSuggestion",
    "DemoPersona",
    "ForecastSnapshot", "SavedReport", "SavedReportShare", "SavedView",
    "ProjectSubmissionSnapshot",
]
