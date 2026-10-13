from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.dependencies import get_db, get_current_user
from backend.models.user import User
from backend.schemas.training import TrainingCreate, TrainingResponse
from backend.services import training_service

router = APIRouter(prefix="/training", tags=["Training"])


@router.post("/", response_model=TrainingResponse, status_code=202)
def start(payload: TrainingCreate, db: Session = Depends(get_db),
          user: User = Depends(get_current_user)):
    try:
        return training_service.start_training(db, payload, user_id=user.id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/", response_model=list[TrainingResponse])
def list_runs(scenario_id: int = Query(None), status: str = Query(None),
              db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    return training_service.list_training_runs(db, scenario_id, status, user_id=user.id)


@router.get("/{run_id}", response_model=TrainingResponse)
def get_run(run_id: int, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    run = training_service.get_training_run(db, run_id, user_id=user.id)
    if not run:
        raise HTTPException(404, "Training run not found")
    return run


@router.post("/{run_id}/pause", status_code=200)
def pause_run(run_id: int, user: User = Depends(get_current_user)):
    training_service.pause_training(run_id)
    return {"status": "paused", "run_id": run_id}


@router.post("/{run_id}/resume", status_code=200)
def resume_run(run_id: int, user: User = Depends(get_current_user)):
    training_service.resume_training(run_id)
    return {"status": "running", "run_id": run_id}


@router.post("/{run_id}/stop", status_code=200)
def stop_run(run_id: int, db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    run = training_service.stop_training(db, run_id, user_id=user.id)
    if not run:
        raise HTTPException(404, "Training run not found")
    return {"status": "stopped", "run_id": run_id}
