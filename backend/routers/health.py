from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.dependencies import get_db
from backend.schemas.common import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_ok = "connected"
    except Exception:
        db_ok = "disconnected"
    return HealthResponse(status="ok", version="4.0.0", database=db_ok)
