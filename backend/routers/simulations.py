from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.dependencies import get_db, get_current_user
from backend.models.user import User
from backend.schemas.simulation import SimulationCreate, SimulationResponse, SimulationDetailResponse, StepActionResponse
from backend.services import simulation_service
from backend.services.simulation_service import NoTrainedModelError

router = APIRouter(prefix="/simulations", tags=["Simulations"])


@router.post("/", response_model=SimulationResponse, status_code=201)
def create(payload: SimulationCreate, db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    try:
        return simulation_service.create_simulation(db, payload, user_id=user.id)
    except NoTrainedModelError as e:
        # 409 Conflict — the topology exists but is not yet trained
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/run", response_model=SimulationDetailResponse)
def run_full(payload: SimulationCreate, db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    try:
        return simulation_service.run_full_simulation(db, payload, user_id=user.id)
    except NoTrainedModelError as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{session_id}/step", response_model=StepActionResponse)
def run_step(session_id: str, db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    try:
        result = simulation_service.run_step(db, session_id)
        return StepActionResponse(
            session_id=session_id,
            step=result["step"],
            simulation_status=result["simulation_status"],
            steps_remaining=result["steps_remaining"],
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/", response_model=list[SimulationResponse])
def list_all(scenario_id: int = Query(None), db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    return simulation_service.list_simulations(db, scenario_id, user_id=user.id)


@router.get("/{sim_id}", response_model=SimulationDetailResponse)
def get_detail(sim_id: int, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    sim = simulation_service.get_simulation(db, sim_id, user_id=user.id)
    if not sim:
        raise HTTPException(404, "Simulation not found")
    return sim


@router.get("/{sim_id}/attack-path")
def get_attack_path(sim_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    try:
        return simulation_service.get_attack_path(db, sim_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.delete("/{session_id}/abandon", status_code=204)
def abandon(session_id: str, user: User = Depends(get_current_user)):
    simulation_service.cleanup_session(session_id)


@router.post("/{session_id}/stop", response_model=SimulationDetailResponse)
def stop(session_id: str, db: Session = Depends(get_db),
         user: User = Depends(get_current_user)):
    try:
        return simulation_service.stop_simulation(db, session_id, user_id=user.id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/posture-comparison")
def posture_comparison(
    scenario_id: int,
    trials: int = Query(10, ge=1, le=50),
    max_steps: int = Query(15, ge=5, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return simulation_service.run_posture_comparison(db, scenario_id, trials, max_steps)
    except ValueError as e:
        raise HTTPException(400, str(e))
