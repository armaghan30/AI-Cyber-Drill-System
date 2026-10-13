import yaml
from pathlib import Path
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models.scenario import Scenario
from backend.schemas.scenario import ScenarioCreate, ScenarioUpdate


def _topo_path(sc: Scenario) -> Path:
    """Return the absolute path to a scenario's YAML file."""
    if sc.is_demo:
        return settings.TOPOLOGY_DIR / "baselines" / sc.filename
    if sc.user_id:
        return settings.USER_UPLOADS_DIR / str(sc.user_id) / sc.filename
    return settings.TOPOLOGY_DIR / sc.filename  # legacy null-user rows


def _load_yaml(path: Path):
    with open(path, "r") as f:
        return yaml.safe_load(f)


def create_scenario(db: Session, payload: ScenarioCreate, user_id=None):
    if user_id:
        path = settings.USER_UPLOADS_DIR / str(user_id) / payload.filename
    else:
        path = settings.TOPOLOGY_DIR / payload.filename

    if not path.exists():
        raise FileNotFoundError(f"Topology file not found: {payload.filename}")

    data = _load_yaml(path)
    num_hosts = len(data.get("network", {}).get("hosts", {}))

    sc = Scenario(
        name=payload.name, filename=payload.filename,
        num_hosts=num_hosts, description=payload.description,
        user_id=user_id,
    )
    db.add(sc)
    db.commit()
    db.refresh(sc)
    return sc


def get_scenario(db: Session, sid, user_id=None):
    """Return the scenario if it belongs to the user or is a demo."""
    q = db.query(Scenario).filter(Scenario.id == sid)
    if user_id is not None:
        q = q.filter(
            or_(Scenario.user_id == user_id, Scenario.is_demo == True)
        )
    return q.first()


def get_scenario_detail(db: Session, sid, user_id=None):
    sc = get_scenario(db, sid, user_id=user_id)
    if not sc:
        return None
    data = _load_yaml(_topo_path(sc))
    hosts = data.get("network", {}).get("hosts", {})
    edges = data.get("network", {}).get("edges", [])
    return {
        "scenario": sc,
        "topology_data": data,
        "host_names": list(hosts.keys()),
        "edge_count": len(edges),
    }


def list_scenarios(db: Session, user_id=None):
    q = db.query(Scenario)
    if user_id is not None:
        q = q.filter(
            or_(Scenario.user_id == user_id, Scenario.is_demo == True)
        )
    return q.order_by(Scenario.is_demo.desc(), Scenario.created_at.desc()).all()


def update_scenario(db: Session, sid, payload: ScenarioUpdate, user_id=None):
    # Demo scenarios are read-only; only owner can update their own.
    sc = db.query(Scenario).filter(
        Scenario.id == sid, Scenario.user_id == user_id, Scenario.is_demo == False
    ).first()
    if not sc:
        return None
    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(sc, k, v)
    db.commit()
    db.refresh(sc)
    return sc


def delete_scenario(db: Session, sid, user_id=None):
    # Demo scenarios cannot be deleted; only owner can delete their own.
    sc = db.query(Scenario).filter(
        Scenario.id == sid, Scenario.user_id == user_id, Scenario.is_demo == False
    ).first()
    if not sc:
        return False
    # Also remove the uploaded file from disk.
    try:
        _topo_path(sc).unlink(missing_ok=True)
    except Exception:
        pass
    db.delete(sc)
    db.commit()
    return True
