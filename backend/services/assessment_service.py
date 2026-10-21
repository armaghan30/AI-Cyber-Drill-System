import sys
import threading
from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import SessionLocal
from backend.models.assessment import Assessment, AssessmentStatus
from backend.models.scenario import Scenario
from backend.services.simulation_service import NoTrainedModelError, _topo_path, _topo_tag
from orchestrator.adversarial import load_policy
from orchestrator.assessment import AI_DEFENCE, CURRENT_SECURITY, run_assessment
from orchestrator.playbook import build_playbook, load_host_info
from orchestrator.whatif import run_what_if

ACTIVE = (AssessmentStatus.QUEUED, AssessmentStatus.RUNNING)


def _model_paths(topo_path):
    tag = _topo_tag(topo_path)
    red = settings.MODELS_DIR / f"maskable_ppo_red_{tag}.zip"
    blue = settings.MODELS_DIR / f"maskable_ppo_blue_{tag}.zip"
    if not (red.exists() and blue.exists()):
        raise NoTrainedModelError(
            f"No trained Red/Blue models found for '{tag}'. Train the agents for this network first.")
    return str(red), str(blue)


def _get_scenario(db, scenario_id, user_id):
    q = db.query(Scenario).filter(Scenario.id == scenario_id)
    if user_id is not None:
        q = q.filter(or_(Scenario.user_id == user_id, Scenario.user_id.is_(None), Scenario.is_demo == True))
    return q.first()


def _start_thread(assessment_id, topo_path, red, blue):
    threading.Thread(target=_worker, args=(assessment_id, topo_path, red, blue), daemon=True).start()


def start_assessment(db: Session, scenario_id, user_id=None, drills=30, steps=15):
    scenario = _get_scenario(db, scenario_id, user_id)
    if not scenario:
        raise LookupError(f"Scenario {scenario_id} not found")

    running = (db.query(Assessment)
               .filter(Assessment.scenario_id == scenario_id, Assessment.status.in_(ACTIVE))
               .order_by(Assessment.id.desc()).first())
    if running:
        return running

    topo = _topo_path(scenario)
    red, blue = _model_paths(topo)

    a = Assessment(scenario_id=scenario_id, user_id=user_id, kind="standard",
                   drills_per_mode=drills, steps=steps, progress_total=3 * drills,
                   model_type="maskable_ppo")
    db.add(a)
    db.commit()
    db.refresh(a)
    _start_thread(a.id, topo, red, blue)
    return a


def _worker(assessment_id, topo_path, red, blue):
    # agent logs contain characters some consoles can't print
    try:
        sys.stdout.reconfigure(errors="backslashreplace")
    except Exception:
        pass

    db = SessionLocal()
    try:
        a = db.get(Assessment, assessment_id)
        if not a:
            return
        a.status = AssessmentStatus.RUNNING
        a.started_at = datetime.now(timezone.utc)
        db.commit()

        drills, total = a.drills_per_mode, 3 * a.drills_per_mode

        def progress(done, offset=0):
            a.progress_done, a.progress_total = offset + done, total
            db.commit()

        red, blue = load_policy(red), load_policy(blue)
        result = run_assessment(topo_path, red, blue, drills=drills, steps=a.steps,
                                modes=(CURRENT_SECURITY, AI_DEFENCE), progress=lambda d, t: progress(d))
        result["playbook"] = build_playbook(result, load_host_info(topo_path))
        # 2 modes done, the what-if run is the last third of the progress bar
        result["what_if"] = run_what_if(topo_path, red, result, result["playbook"], drills=drills, steps=a.steps,
                                        progress=lambda d, t: progress(d, 2 * drills))
        progress(drills, 2 * drills)
        a.result = result
        a.status = AssessmentStatus.COMPLETED
        a.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        db.rollback()
        a = db.get(Assessment, assessment_id)
        if a:
            a.status = AssessmentStatus.FAILED
            a.error_message = str(e)[:1000]
            a.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def _owned(q, user_id):
    if user_id is not None:
        q = q.filter(or_(Assessment.user_id == user_id, Assessment.user_id.is_(None)))
    return q


def get_assessment(db: Session, assessment_id, user_id=None):
    return _owned(db.query(Assessment).filter(Assessment.id == assessment_id), user_id).first()


def latest_assessment(db: Session, scenario_id, user_id=None, kind="standard"):
    q = db.query(Assessment).filter(Assessment.scenario_id == scenario_id, Assessment.kind == kind,
                                    Assessment.status == AssessmentStatus.COMPLETED)
    return _owned(q, user_id).order_by(Assessment.id.desc()).first()


def list_assessments(db: Session, scenario_id=None, user_id=None):
    q = db.query(Assessment)
    if scenario_id:
        q = q.filter(Assessment.scenario_id == scenario_id)
    return _owned(q, user_id).order_by(Assessment.id.desc()).all()


def mark_interrupted(db: Session):
    stale = db.query(Assessment).filter(Assessment.status.in_(ACTIVE)).all()
    for a in stale:
        a.status = AssessmentStatus.FAILED
        a.error_message = "Server restarted before the assessment finished"
    if stale:
        db.commit()
    return len(stale)


def public_result(result):
    """The stored result without the per-step drill traces."""
    if not result:
        return result
    out = dict(result)
    if "playbook" not in out:
        out["playbook"] = build_playbook(result)
    out["modes"] = {m: {k: v for k, v in s.items() if k != "runs"} for m, s in result.get("modes", {}).items()}
    return out


def serialize(a: Assessment):
    return {
        "id": a.id,
        "scenario_id": a.scenario_id,
        "kind": a.kind,
        "status": a.status.value if hasattr(a.status, "value") else a.status,
        "drills_per_mode": a.drills_per_mode,
        "steps": a.steps,
        "progress_done": a.progress_done or 0,
        "progress_total": a.progress_total or 0,
        "model_type": a.model_type,
        "result": public_result(a.result),
        "error_message": a.error_message,
        "started_at": a.started_at,
        "completed_at": a.completed_at,
        "created_at": a.created_at,
    }
