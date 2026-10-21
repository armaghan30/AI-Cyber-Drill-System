from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from backend.config import settings
from backend.database import engine, Base, SessionLocal
from backend.routers import health, scenarios, simulations, training, reports, auth, topology_upload, cve, assessments


def _ensure_columns():
    """Idempotent inline migration for columns added after initial deploy."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    col_additions = {
        "scenarios":     [("user_id",  "INTEGER REFERENCES users(id)"),
                          ("is_demo",  "INTEGER NOT NULL DEFAULT 0")],
        "simulations":   [("user_id",  "INTEGER REFERENCES users(id)")],
        "training_runs": [("user_id",  "INTEGER REFERENCES users(id)")],
    }
    with engine.begin() as conn:
        for table, cols in col_additions.items():
            if table not in existing_tables:
                continue
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            for col_name, col_def in cols:
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))


def _checkpoint_wal():
    """Force a WAL TRUNCATE checkpoint at startup.

    After many test runs the WAL file can accumulate thousands of pages.
    SQLite's auto-checkpoint (default: 1000 pages) then blocks the *next*
    db.commit() call — typically the very first step of a live simulation —
    for 30-60 s while it rewrites the main DB file.  Running a one-time
    TRUNCATE here clears all accumulated WAL pages so the DB is clean before
    any simulation starts.  Combined with wal_autocheckpoint=100000 (set in
    database.py) this means automatic checkpointing essentially never fires
    during normal usage.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
            row = result.fetchone()
            # row = (busy, log, checkpointed)
            if row:
                print(f"[startup] WAL checkpoint: busy={row[0]}, log_frames={row[1]}, checkpointed={row[2]}")
            else:
                print("[startup] WAL checkpoint complete")
    except Exception as e:
        print(f"[startup] WAL checkpoint skipped: {e}")


def _cleanup_stale_sessions():
    """At startup _sessions is empty (in-memory only). Any simulation still RUNNING
    in the DB is a zombie whose orchestrator context is gone — mark it FAILED so
    run_step returns a clear error instead of 'No active session'."""
    from backend.models.simulation import Simulation, SimulationStatus
    db = SessionLocal()
    try:
        stale = db.query(Simulation).filter(
            Simulation.status == SimulationStatus.RUNNING
        ).all()
        for sim in stale:
            sim.status = SimulationStatus.FAILED
        if stale:
            db.commit()
            print(f"[startup] marked {len(stale)} zombie RUNNING simulation(s) as FAILED")
    except Exception as e:
        print(f"[startup] stale session cleanup failed: {e}")
    finally:
        db.close()


def _cleanup_stale_assessments():
    from backend.services.assessment_service import mark_interrupted
    db = SessionLocal()
    try:
        n = mark_interrupted(db)
        if n:
            print(f"[startup] marked {n} unfinished assessment(s) as FAILED")
    except Exception as e:
        print(f"[startup] assessment cleanup failed: {e}")
    finally:
        db.close()


def _remove_demo_scenarios():
    """Delete any auto-seeded demo scenarios. The platform is meant for real
    IT managers who upload their own network topology — leaving a built-in
    demo confused new users (it showed up before they uploaded anything)."""
    from backend.models.scenario import Scenario
    db = SessionLocal()
    try:
        removed = db.query(Scenario).filter(Scenario.is_demo == True).delete()
        if removed:
            db.commit()
            print(f"[startup] removed {removed} stale demo scenario row(s)")
    except Exception as e:  # pragma: no cover
        print(f"[startup] demo cleanup failed: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    try:
        _ensure_columns()
    except Exception as e:  # pragma: no cover
        print(f"[migration] column check failed: {e}")
    settings.USER_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    _checkpoint_wal()          # clear accumulated WAL pages before any simulation
    _cleanup_stale_sessions()
    _cleanup_stale_assessments()
    _remove_demo_scenarios()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="4.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for training plots
plots_dir = settings.CSV_DIR.parent / "plots"
if plots_dir.exists():
    app.mount("/plots", StaticFiles(directory=str(plots_dir)), name="plots")

# Register routers
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
app.include_router(scenarios.router, prefix=settings.API_V1_PREFIX)
app.include_router(simulations.router, prefix=settings.API_V1_PREFIX)
app.include_router(training.router, prefix=settings.API_V1_PREFIX)
app.include_router(reports.router, prefix=settings.API_V1_PREFIX)
app.include_router(topology_upload.router, prefix=settings.API_V1_PREFIX)
app.include_router(cve.router, prefix=settings.API_V1_PREFIX)
app.include_router(assessments.router, prefix=settings.API_V1_PREFIX)
