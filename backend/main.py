import uvicorn
from fastapi import FastAPI

from database import Base, engine

app = FastAPI(
    title="CPC Demo API",
    description="Controlling & Planning Centre — Demo Application",
    version="0.1.0",
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

app.include_router(admin_router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
