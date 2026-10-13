from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.dependencies import get_db, get_current_user
from backend.models.scenario import Scenario
from backend.models.simulation import Simulation
from backend.models.training_run import TrainingRun
from backend.models.user import User
from backend.services import report_service
from backend.services import pdf_service

router = APIRouter(prefix="/reports", tags=["Reports"])


def _check_sim_access(db, sim_id, user_id):
    """Block users from peeking at simulations they don't own."""
    sim = db.query(Simulation).filter(Simulation.id == sim_id).first()
    if sim is None:
        raise HTTPException(404, "Simulation not found")
    if sim.user_id is not None and sim.user_id != user_id:
        raise HTTPException(404, "Simulation not found")


def _check_scenario_access(db, scenario_id, user_id):
    sc = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if sc is None:
        raise HTTPException(404, "Scenario not found")
    if sc.user_id is not None and sc.user_id != user_id:
        raise HTTPException(404, "Scenario not found")


def _check_run_access(db, run_id, user_id):
    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if run is None:
        raise HTTPException(404, "Training run not found")
    if run.user_id is not None and run.user_id != user_id:
        raise HTTPException(404, "Training run not found")


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    # Scope dashboard counts to this user's data
    return report_service.get_dashboard_stats(db, user_id=user.id)


@router.get("/simulations/{sim_id}/summary")
def sim_summary(sim_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    _check_sim_access(db, sim_id, user.id)
    result = report_service.get_sim_summary(db, sim_id)
    if not result:
        raise HTTPException(404, "Simulation not found")
    return result


@router.get("/training/csvfiles")
def csv_files(user: User = Depends(get_current_user)):
    return report_service.list_csv_files()


@router.get("/training/csv/{filename}")
def csv_rewards(filename: str, user: User = Depends(get_current_user)):
    result = report_service.get_csv_rewards(filename)
    if result is None:
        raise HTTPException(404, "CSV file not found")
    return result


@router.get("/training/plots")
def plot_files(user: User = Depends(get_current_user)):
    return report_service.list_plot_files()


@router.get("/training/{run_id}/rewards")
def training_rewards(run_id: int, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    _check_run_access(db, run_id, user.id)
    result = report_service.get_training_rewards(run_id)
    if result is None:
        raise HTTPException(404, "Training rewards not found")
    return result


@router.get("/defense-analysis")
def defense_analysis(db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    return report_service.get_defense_analysis(db, user_id=user.id)


@router.get("/simulations/{sim_id}/report")
def full_report(sim_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    _check_sim_access(db, sim_id, user.id)
    result = report_service.generate_report(db, sim_id)
    if not result:
        raise HTTPException(404, "Simulation not found")
    return result


@router.get("/simulations/{sim_id}/firewall")
def firewall_analysis(sim_id: int, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    _check_sim_access(db, sim_id, user.id)
    result = report_service.get_firewall_analysis(db, sim_id)
    if not result:
        raise HTTPException(404, "Simulation not found")
    return result


@router.get("/scenarios/{scenario_id}/recommendations")
def ai_recommendations(scenario_id: int, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    _check_scenario_access(db, scenario_id, user.id)
    result = report_service.get_ai_recommendations(db, scenario_id)
    if not result:
        raise HTTPException(404, "No completed simulations found for this scenario")
    return result


@router.get("/scenarios/{scenario_id}/pdf")
def download_pdf(
    scenario_id: int,
    sim_id: int = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _check_scenario_access(db, scenario_id, user.id)
    if sim_id is not None:
        _check_sim_access(db, sim_id, user.id)
    buf = pdf_service.generate_pdf(db, scenario_id, sim_id)
    if not buf:
        raise HTTPException(404, "Scenario not found")
    filename = f"cyberdrill_report_{scenario_id}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
