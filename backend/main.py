import uvicorn
from fastapi import FastAPI

from database import Base, engine

app = FastAPI(
    title="CPC Demo API",
    description="Controlling & Planning Centre — Demo Application",
    version="0.1.0",
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
