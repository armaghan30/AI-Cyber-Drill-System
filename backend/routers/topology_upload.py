import re
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.config import settings
from backend.dependencies import get_db, get_current_user
from backend.models.user import User
from backend.schemas.scenario import ScenarioCreate, ScenarioResponse
from backend.services import scenario_service

router = APIRouter(prefix="/topology", tags=["Topology Import"])


def _safe_filename(raw: str) -> str:
    """Strip path components and dangerous chars so user-supplied filename
    can never escape settings.TOPOLOGY_DIR."""
    # Drop any directory parts — Path(...).name keeps only the basename
    # and handles both / and \ separators on every platform.
    base = Path(raw).name
    # Allow only [A-Za-z0-9._-], collapse the rest to underscore
    base = re.sub(r'[^A-Za-z0-9._-]', '_', base)
    # Defend against names that are all dots (e.g. "..", "....")
    base = base.lstrip('.') or 'topology'
    # Cap length so we don't blow up the filesystem
    return base[:120]


class SaveNmapRequest(BaseModel):
    filename: str
    hosts: list
    sensitivities: dict
    edges: list = []   # user-edited edges; empty = auto-generate


@router.post("/parse-nmap")
async def parse_nmap(file: UploadFile = File(...),
                     user: User = Depends(get_current_user)):

    if not file.filename or not file.filename.lower().endswith('.xml'):
        raise HTTPException(
            status_code=400,
            detail=(
                "Please upload an nmap XML scan (.xml). "
                "Generate one with:  nmap -sV -O -oX scan.xml <target>"
            ),
        )

    content = await file.read()

    if not content or not content.strip():
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty. Please run an nmap scan and try again.",
        )

    try:
        from orchestrator.nmap_parser import NmapParser
        parser = NmapParser(content)
        hosts = parser.parse()
    except ValueError:
        # Hide raw XML parser traceback from end users — show a friendly hint instead.
        raise HTTPException(
            status_code=400,
            detail=(
                "This doesn't look like a valid nmap XML file. "
                "Make sure the scan was saved with the -oX flag (XML output), "
                "for example:  nmap -sV -O -oX scan.xml 192.168.1.0/24"
            ),
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="We couldn't read this nmap file. Please regenerate the scan and try again.",
        )

    if not hosts:
        raise HTTPException(
            status_code=400,
            detail=(
                "No active (up) hosts were found in this scan. "
                "Re-run nmap against a range that has reachable hosts, "
                "e.g.  nmap -sV -O -oX scan.xml 192.168.1.0/24"
            ),
        )

    # Also return auto-generated edges so the UI can preview them
    from orchestrator.nmap_parser import _generate_edges
    sens = {h['key']: h['suggested_sensitivity'] for h in hosts}
    preview_edges = _generate_edges([h['key'] for h in hosts], sens)

    # Surface helpful warnings rather than silently rewriting the topology
    warnings: list = []
    hosts_no_services = [h['key'] for h in hosts if h.get('no_services_detected')]
    if hosts_no_services:
        warnings.append({
            "type": "no_services",
            "hosts": hosts_no_services,
            "message": (
                f"{len(hosts_no_services)} host(s) had no services detected. "
                "Re-run nmap with -sV (service detection) for a richer scan, "
                "or add services manually in the review step."
            ),
        })

    return {
        "hosts": hosts,
        "host_count": len(hosts),
        "preview_edges": preview_edges,
        "warnings": warnings,
    }


@router.post("/save-nmap", response_model=ScenarioResponse, status_code=201)
async def save_nmap(payload: SaveNmapRequest, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
   
    filename = _safe_filename(payload.filename)
    if not filename.endswith('.yaml'):
        filename = filename.replace('.xml', '').rstrip('_') + '_nmap.yaml'

    # Final safety check — resolved path must live under USER_UPLOADS_DIR.
    uploads_root = settings.USER_UPLOADS_DIR.resolve()
    user_dir = settings.USER_UPLOADS_DIR / str(user.id)
    resolved = (user_dir / filename).resolve()
    try:
        resolved.relative_to(uploads_root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    if not payload.hosts:
        raise HTTPException(
            status_code=400,
            detail="Cannot save an empty topology — at least one host is required.",
        )

    try:
        from orchestrator.nmap_parser import NmapParser
        parser = NmapParser(b'')
        parser.hosts = payload.hosts
        topology = parser.to_topology_yaml(payload.sensitivities)
        # Override edges if user provided custom ones
        if payload.edges:
            topology['network']['edges'] = payload.edges
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=(
                "We couldn't turn this scan into a topology. "
                "Please go back and review the host list before saving."
            ),
        )

    yaml_content = yaml.dump(topology, default_flow_style=False, sort_keys=False)
    user_dir = settings.USER_UPLOADS_DIR / str(user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    dest = user_dir / filename
    with open(dest, 'w') as f:
        f.write(yaml_content)

    from backend.models.scenario import Scenario
    existing = (
        db.query(Scenario)
        .filter(Scenario.filename == filename, Scenario.user_id == user.id)
        .first()
    )
    if existing:
        existing.num_hosts = len(payload.hosts)
        db.commit()
        db.refresh(existing)
        return existing

    base_name = filename.replace('.yaml', '').replace('_', ' ').title()
    name = base_name
    suffix = 2
    while db.query(Scenario).filter(Scenario.name == name).first():
        name = f"{base_name} ({suffix})"
        suffix += 1

    scenario_payload = ScenarioCreate(
        name=name,
        filename=filename,
        description=f"Imported from nmap scan — {len(payload.hosts)} hosts",
    )
    try:
        return scenario_service.create_scenario(db, scenario_payload, user_id=user.id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
