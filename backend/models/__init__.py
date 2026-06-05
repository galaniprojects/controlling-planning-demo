# Import all models so Base.metadata.create_all() discovers all tables.
# Import order matters — base tables first, then tables with foreign keys.

from models.organization import (
    Location, CompetenceCenter, CostCenter,
    GroupingEntityType, GroupingEntity, GroupingHierarchy,
    GroupingHierarchyLevel, ProjectGroupingAssignment,
)
from models.people import RoleType, Person, RateTable
from models.projects import (
    Project, ProjectMilestone, MilestoneType, ProjectDependency,
    MilestoneDeliverable, ProgressSnapshot,
)
from models.financial import (
    ExternalCostType, Baseline, Forecast, Actuals, ForecastVersion,
    ExternalCostDelivery, ExternalCostInvoice,
)
from models.capacity import Allocation, ResourceRequest, ResourceRequestAssignment, CapacityActionLog
from models.change_requests import ChangeRequest, CRChangeDetail, CRSubmissionSnapshot
from models.scenarios import (
    Scenario, ScenarioProjectAnchor, ScenarioAction, ScenarioState,
    ScenarioCapacityImpact, ScenarioPromotion, ScenarioApplyToForecastEvent,
    ScenarioForecastCellEdit, ScenarioLineEdit, ScenarioMixChange,
    ScenarioPlanEdit,
)
from models.system import (
    PlanningParameter, KPIDefinition, Notification, AuditLog, SystemSuggestion,
    RolePermissionGrant,
)
from models.users import DemoPersona, User
from models.reporting import ForecastSnapshot, SavedReport, SavedReportShare, SavedView
from models.submissions import ProjectSubmissionSnapshot
from models.charging import (
    Country, Region, ChargingLocation, LegalEntity, UserMeasurement,
    UMVersion, ChargeableEntity, Distribution, DistributionVersion,
)
from models.workflow_templates import WorkflowTemplate, WorkflowStep, StepAction
from models.scheduled_changes import ScheduledChange

__all__ = [
    "Location", "CompetenceCenter", "CostCenter",
    "GroupingEntityType", "GroupingEntity", "GroupingHierarchy",
    "GroupingHierarchyLevel", "ProjectGroupingAssignment",
    "RoleType", "Person", "RateTable",
    "Project", "ProjectMilestone", "MilestoneType", "ProjectDependency",
    "MilestoneDeliverable", "ProgressSnapshot",
    "ExternalCostType", "Baseline", "Forecast", "Actuals", "ForecastVersion",
    "ExternalCostDelivery", "ExternalCostInvoice",
    "Allocation", "ResourceRequest", "ResourceRequestAssignment", "CapacityActionLog",
    "ChangeRequest", "CRChangeDetail", "CRSubmissionSnapshot",
    "Scenario", "ScenarioProjectAnchor", "ScenarioAction", "ScenarioState",
    "ScenarioCapacityImpact",
    "ScenarioPromotion", "ScenarioApplyToForecastEvent",
    "ScenarioForecastCellEdit", "ScenarioLineEdit", "ScenarioMixChange",
    "ScenarioPlanEdit",
    "PlanningParameter", "KPIDefinition", "Notification", "AuditLog", "SystemSuggestion",
    "RolePermissionGrant",
    "DemoPersona", "User",
    "ForecastSnapshot", "SavedReport", "SavedReportShare", "SavedView",
    "ProjectSubmissionSnapshot",
    "Country", "Region", "ChargingLocation", "LegalEntity", "UserMeasurement",
    "UMVersion", "ChargeableEntity", "Distribution", "DistributionVersion",
    "WorkflowTemplate", "WorkflowStep", "StepAction",
    "ScheduledChange",
]
