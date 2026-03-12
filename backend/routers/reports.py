from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.dependencies import get_db
from backend.services import report_service

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    return report_service.get_dashboard_stats(db)


@router.get("/simulations/{sim_id}/summary")
def sim_summary(sim_id: int, db: Session = Depends(get_db)):
    result = report_service.get_sim_summary(db, sim_id)
    if not result:
        raise HTTPException(404, "Simulation not found")
    return result


@router.get("/training/csvfiles")
def csv_files():
    return report_service.list_csv_files()


@router.get("/training/csv/{filename}")
def csv_rewards(filename: str):
    result = report_service.get_csv_rewards(filename)
    if result is None:
        raise HTTPException(404, "CSV file not found")
    return result


@router.get("/training/plots")
def plot_files():
    return report_service.list_plot_files()


@router.get("/training/{run_id}/rewards")
def training_rewards(run_id: int):
    result = report_service.get_training_rewards(run_id)
    if result is None:
        raise HTTPException(404, "Training rewards not found")
    return result


@router.get("/defense-analysis")
def defense_analysis(db: Session = Depends(get_db)):
    return report_service.get_defense_analysis(db)


@router.get("/simulations/{sim_id}/report")
def full_report(sim_id: int, db: Session = Depends(get_db)):
    result = report_service.generate_report(db, sim_id)
    if not result:
        raise HTTPException(404, "Simulation not found")
    return result
