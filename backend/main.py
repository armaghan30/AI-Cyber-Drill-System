from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.database import engine, Base, SessionLocal
from backend.routers import health, scenarios, simulations, training, reports, auth


def seed_db():
    from backend.models.scenario import Scenario
    from backend.services.scenario_service import discover_topologies, create_scenario
    from backend.schemas.scenario import ScenarioCreate

    db = SessionLocal()
    try:
        if db.query(Scenario).count() > 0:
            return
        for t in discover_topologies():
            name = t["filename"].replace(".yaml", "").replace("_", " ").title()
            create_scenario(db, ScenarioCreate(
                name=name, filename=t["filename"],
                description=f"{t['num_hosts']}-host network topology"
            ))
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_db()
    yield


app = FastAPI(title=settings.PROJECT_NAME, version="4.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

plots_dir = settings.CSV_DIR.parent / "plots"
if plots_dir.exists():
    app.mount("/plots", StaticFiles(directory=str(plots_dir)), name="plots")

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
app.include_router(scenarios.router, prefix=settings.API_V1_PREFIX)
app.include_router(simulations.router, prefix=settings.API_V1_PREFIX)
app.include_router(training.router, prefix=settings.API_V1_PREFIX)
app.include_router(reports.router, prefix=settings.API_V1_PREFIX)
