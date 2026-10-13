import os
import yaml
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from backend.config import settings
from backend.dependencies import get_db, get_current_user
from backend.models.scenario import Scenario
from backend.models.user import User
from backend.schemas.scenario import ScenarioCreate, ScenarioUpdate, ScenarioResponse, ScenarioDetailResponse
from backend.services import scenario_service
from backend.services.simulation_service import _topo_path, _topo_tag

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])


@router.post("/", response_model=ScenarioResponse, status_code=201)
def create(payload: ScenarioCreate, db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    try:
        return scenario_service.create_scenario(db, payload, user_id=user.id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.get("/", response_model=list[ScenarioResponse])
def list_all(db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    return scenario_service.list_scenarios(db, user_id=user.id)


@router.get("/{scenario_id}", response_model=ScenarioDetailResponse)
def get_detail(scenario_id: int, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    result = scenario_service.get_scenario_detail(db, scenario_id, user_id=user.id)
    if not result:
        raise HTTPException(404, "Scenario not found")
    s = result["scenario"]
    return ScenarioDetailResponse(
        id=s.id, name=s.name, filename=s.filename,
        num_hosts=s.num_hosts, description=s.description,
        is_demo=s.is_demo,
        created_at=s.created_at, updated_at=s.updated_at,
        topology_data=result["topology_data"],
        host_names=result["host_names"],
        edge_count=result["edge_count"],
    )


@router.get("/{scenario_id}/training-status")
def training_status(scenario_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """Report whether trained Red and Blue MaskablePPO .zip files exist on disk
    for this topology. The frontend uses this to decide whether the Launch Drill
    button should run training first or skip straight to simulation."""
    from sqlalchemy import or_
    q = db.query(Scenario).filter(Scenario.id == scenario_id)
    q = q.filter(or_(Scenario.user_id == user.id, Scenario.is_demo == True))
    scenario = q.first()
    if not scenario:
        raise HTTPException(404, "Scenario not found")
    tag = _topo_tag(_topo_path(scenario))
    red_path  = settings.MODELS_DIR / f"maskable_ppo_red_{tag}.zip"
    blue_path = settings.MODELS_DIR / f"maskable_ppo_blue_{tag}.zip"
    return {
        "topology_tag": tag,
        "red_trained":  red_path.exists(),
        "blue_trained": blue_path.exists(),
        "ready_to_simulate": red_path.exists() and blue_path.exists(),
    }


@router.patch("/{scenario_id}", response_model=ScenarioResponse)
def update(scenario_id: int, payload: ScenarioUpdate, db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    s = scenario_service.update_scenario(db, scenario_id, payload, user_id=user.id)
    if not s:
        raise HTTPException(404, "Scenario not found or is read-only")
    return s


@router.delete("/{scenario_id}", status_code=204)
def delete(scenario_id: int, db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    if not scenario_service.delete_scenario(db, scenario_id, user_id=user.id):
        raise HTTPException(404, "Scenario not found or is read-only")


@router.post("/upload", response_model=ScenarioResponse, status_code=201)
async def upload(file: UploadFile = File(...), db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    if not file.filename.endswith((".yaml", ".yml")):
        raise HTTPException(400, "File must be .yaml or .yml")

    content = await file.read()
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as e:
        raise HTTPException(400, f"Invalid YAML: {e}")

    if not data or "network" not in data or "hosts" not in data.get("network", {}):
        raise HTTPException(400, "YAML must have network.hosts structure")

    # Save to per-user directory to avoid cross-user filename collisions.
    user_dir = settings.USER_UPLOADS_DIR / str(user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    dest = user_dir / file.filename
    with open(dest, "wb") as f:
        f.write(content)

    name = file.filename.replace(".yaml", "").replace(".yml", "").replace("_", " ").title()

    existing = (
        db.query(Scenario)
        .filter(Scenario.filename == file.filename, Scenario.user_id == user.id)
        .first()
    )
    if existing:
        existing.num_hosts = len(data['network']['hosts'])
        db.commit()
        db.refresh(existing)
        return existing

    base_name = name
    suffix = 2
    while db.query(Scenario).filter(Scenario.name == name).first():
        name = f"{base_name} ({suffix})"
        suffix += 1

    payload = ScenarioCreate(
        name=name, filename=file.filename,
        description=f"Uploaded topology with {len(data['network']['hosts'])} hosts"
    )
    try:
        return scenario_service.create_scenario(db, payload, user_id=user.id)
    except Exception as e:
        raise HTTPException(400, str(e))
