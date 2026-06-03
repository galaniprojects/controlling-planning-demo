import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from database import Base, engine

app = FastAPI(
    title=f"{config.BRANDING['app_name']} Demo API",
    description=f"{config.BRANDING['app_full_name']} — Demo Application",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for JSON fixtures (loaded on startup)
app.state.fixtures = {}


@app.on_event("startup")
def startup():
    # Import all models so metadata knows about them
    import models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Seed database if empty and load JSON fixtures
    from seed.loader import seed_database

    app.state.fixtures = seed_database()


# --- Routers (lex-sorted by name) ---
from routers.admin import router as admin_router  # noqa: E402
from routers.ai_reports import router as ai_reports_router  # noqa: E402
from routers.audit import router as audit_router  # noqa: E402
from routers.capacity import router as capacity_router  # noqa: E402
from routers.charging import (  # noqa: E402
    router as charging_router,
    charging_router as charging_consumer_router,
)
from routers.config import router as config_router  # noqa: E402
from routers.documentation import router as docs_router  # noqa: E402
from routers.global_launchpad import router as launchpad_router  # noqa: E402
from routers.intake import router as intake_router  # noqa: E402
from routers.milestones import (  # noqa: E402
    project_router as milestones_project_router,
    admin_router as milestones_admin_router,
)
from routers.pipeline import router as pipeline_router  # noqa: E402
from routers.portfolio import router as portfolio_router  # noqa: E402
from routers.projects_define import router as projects_define_router  # noqa: E402
from routers.ranking import router as ranking_router  # noqa: E402
from routers.reference import router as reference_router  # noqa: E402
from routers.report_builder import router as report_builder_router  # noqa: E402
from routers.reports import router as reports_router  # noqa: E402
from routers.scenarios import router as scenarios_router  # noqa: E402
from routers.scenarios_project_scope import (  # noqa: E402
    router as scenarios_project_scope_router,
)
from routers.scheduled_changes import router as scheduled_changes_router  # noqa: E402
from routers.tech_navigator import router as tech_navigator_router  # noqa: E402
from routers.user_measurement_charging import (  # noqa: E402
    router as user_measurement_charging_router,
)
from routers.workbench import router as workbench_router  # noqa: E402
from routers.workbench import forecast_router as forecast_versions_router  # noqa: E402
from routers.workbench import progress_router as portfolio_progress_router  # noqa: E402
from routers.workbench import (  # noqa: E402
    external_costs_workbench_router as workbench_external_costs_router,
)
from routers.workflow_templates import router as workflow_templates_router  # noqa: E402

app.include_router(admin_router)
app.include_router(ai_reports_router)
app.include_router(audit_router)
app.include_router(capacity_router)
app.include_router(charging_router)
app.include_router(charging_consumer_router)
app.include_router(config_router)
app.include_router(docs_router)
app.include_router(launchpad_router)
app.include_router(intake_router)
app.include_router(milestones_project_router)
app.include_router(milestones_admin_router)
app.include_router(pipeline_router)
app.include_router(portfolio_router)
app.include_router(projects_define_router)
app.include_router(ranking_router)
app.include_router(reference_router)
app.include_router(report_builder_router)
app.include_router(reports_router)
app.include_router(scenarios_router)
app.include_router(scenarios_project_scope_router)
app.include_router(scheduled_changes_router)
app.include_router(tech_navigator_router)
app.include_router(user_measurement_charging_router)
app.include_router(workbench_router)
app.include_router(forecast_versions_router)
app.include_router(portfolio_progress_router)
app.include_router(workbench_external_costs_router)
app.include_router(workflow_templates_router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
