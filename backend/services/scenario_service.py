import yaml
from pathlib import Path
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models.scenario import Scenario
from backend.schemas.scenario import ScenarioCreate, ScenarioUpdate


def _topo_path(filename):
    return settings.TOPOLOGY_DIR / filename


def _load_yaml(path):
    with open(path, "r") as f:
        return yaml.safe_load(f)


def discover_topologies():
    results = []
    for p in settings.TOPOLOGY_DIR.glob("*.yaml"):
        if p.name.startswith("."):
            continue
        try:
            data = _load_yaml(p)
            hosts = data.get("network", {}).get("hosts", {})
            results.append({
                "filename": p.name,
                "num_hosts": len(hosts),
                "host_names": list(hosts.keys()),
            })
        except Exception:
            continue
    return results


def create_scenario(db: Session, payload: ScenarioCreate):
    path = _topo_path(payload.filename)
    if not path.exists():
        raise FileNotFoundError(f"Topology file not found: {payload.filename}")

    data = _load_yaml(path)
    num_hosts = len(data.get("network", {}).get("hosts", {}))

    sc = Scenario(
        name=payload.name, filename=payload.filename,
        num_hosts=num_hosts, description=payload.description
    )
    db.add(sc)
    db.commit()
    db.refresh(sc)
    return sc


def get_scenario(db: Session, sid):
    return db.query(Scenario).filter(Scenario.id == sid).first()


def get_scenario_detail(db: Session, sid):
    sc = get_scenario(db, sid)
    if not sc:
        return None
    data = _load_yaml(_topo_path(sc.filename))
    hosts = data.get("network", {}).get("hosts", {})
    edges = data.get("network", {}).get("edges", [])
    return {
        "scenario": sc,
        "topology_data": data,
        "host_names": list(hosts.keys()),
        "edge_count": len(edges),
    }


def list_scenarios(db: Session):
    return db.query(Scenario).order_by(Scenario.created_at.desc()).all()


def update_scenario(db: Session, sid, payload: ScenarioUpdate):
    sc = get_scenario(db, sid)
    if not sc:
        return None
    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(sc, k, v)
    db.commit()
    db.refresh(sc)
    return sc


def delete_scenario(db: Session, sid):
    sc = get_scenario(db, sid)
    if not sc:
        return False
    db.delete(sc)
    db.commit()
    return True
