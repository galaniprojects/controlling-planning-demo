import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine

app = FastAPI(
    title="CRETA Demo API",
    description="Controlling, Reporting, Estimation, Tracking & Allocations — Demo Application",
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


# --- Routers ---
from routers.admin import router as admin_router  # noqa: E402
from routers.reference import router as reference_router  # noqa: E402
from routers.documentation import router as docs_router  # noqa: E402
from routers.global_launchpad import router as launchpad_router  # noqa: E402
from routers.portfolio import router as portfolio_router  # noqa: E402
from routers.workbench import router as workbench_router  # noqa: E402
from routers.capacity import router as capacity_router  # noqa: E402
from routers.scenarios import router as scenarios_router  # noqa: E402
from routers.reports import router as reports_router  # noqa: E402

app.include_router(admin_router)
app.include_router(reference_router)
app.include_router(docs_router)
app.include_router(launchpad_router)
app.include_router(portfolio_router)
app.include_router(workbench_router)
app.include_router(capacity_router)
app.include_router(scenarios_router)
app.include_router(reports_router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
