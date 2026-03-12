import csv
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.simulation import Simulation, SimulationStep, SimulationStatus
from backend.models.training_run import TrainingRun, TrainingStatus


def get_sim_summary(db: Session, sim_id):
    sim = db.query(Simulation).filter(Simulation.id == sim_id).first()
    if not sim:
        return None

    steps = db.query(SimulationStep).filter(
        SimulationStep.simulation_id == sim_id
    ).order_by(SimulationStep.step_number).all()

    r_rewards = [s.red_reward for s in steps]
    b_rewards = [s.blue_reward for s in steps]

    # count how many times each action was used
    r_actions, b_actions = {}, {}
    for s in steps:
        ra = s.red_action.get("action", "unknown") if s.red_action else "unknown"
        ba = s.blue_action.get("action", "unknown") if s.blue_action else "unknown"
        r_actions[ra] = r_actions.get(ra, 0) + 1
        b_actions[ba] = b_actions.get(ba, 0) + 1

    return {
        "simulation_id": sim_id,
        "status": sim.status.value if hasattr(sim.status, 'value') else sim.status,
        "total_steps": sim.total_steps,
        "total_red_reward": sim.total_red_reward,
        "total_blue_reward": sim.total_blue_reward,
        "red_reward_per_step": r_rewards,
        "blue_reward_per_step": b_rewards,
        "red_action_counts": r_actions,
        "blue_action_counts": b_actions,
        "winner": "red" if sim.total_red_reward > sim.total_blue_reward else "blue",
    }


def get_training_rewards(run_id):
    from backend.database import SessionLocal
    db = SessionLocal()
    try:
        run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
        if not run or not run.csv_path:
            return None
        p = Path(run.csv_path)
        if not p.exists():
            return None
        rows = []
        with open(p, "r") as f:
            for row in csv.DictReader(f):
                rows.append({
                    "episode": int(row["episode"]),
                    "reward": float(row["reward"]),
                    "topology": row["topology"],
                })
        return rows
    finally:
        db.close()


def list_csv_files():
    from backend.config import settings
    files = []
    if settings.CSV_DIR.exists():
        for p in sorted(settings.CSV_DIR.glob("*.csv")):
            name = p.stem
            parts = name.split("_")
            if len(parts) >= 4:
                files.append({
                    "filename": name,
                    "agent_role": parts[2],
                    "algorithm": parts[1],
                    "topology": "_".join(parts[3:]),
                })
    return files


def get_csv_rewards(filename):
    from backend.config import settings
    p = settings.CSV_DIR / f"{filename}.csv"
    if not p.exists():
        return None
    with open(p, "r") as f:
        all_rows = list(csv.DictReader(f))
    # downsample if too many rows (keeps response size manageable)
    step = max(1, len(all_rows) // 500)
    rows = []
    for i in range(0, len(all_rows), step):
        r = all_rows[i]
        rows.append({
            "episode": int(r["episode"]),
            "reward": float(r["reward"]),
            "topology": r["topology"],
        })
    return rows


def list_plot_files():
    from backend.config import settings
    plots_dir = settings.CSV_DIR.parent / "plots"
    files = []
    if plots_dir.exists():
        for p in sorted(plots_dir.glob("*.png")):
            files.append({"filename": p.stem, "url": f"/plots/{p.name}"})
    return files


def generate_report(db: Session, sim_id):
    sim = db.query(Simulation).filter(Simulation.id == sim_id).first()
    if not sim:
        return None

    steps = db.query(SimulationStep).filter(
        SimulationStep.simulation_id == sim_id
    ).order_by(SimulationStep.step_number).all()

    r_rewards = [s.red_reward for s in steps]
    b_rewards = [s.blue_reward for s in steps]

    r_actions, b_actions = {}, {}
    for s in steps:
        ra = s.red_action.get("action", "unknown") if s.red_action else "unknown"
        ba = s.blue_action.get("action", "unknown") if s.blue_action else "unknown"
        r_actions[ra] = r_actions.get(ra, 0) + 1
        b_actions[ba] = b_actions.get(ba, 0) + 1

    winner = "red" if sim.total_red_reward > sim.total_blue_reward else "blue"

    return {
        "report_type": "simulation",
        "simulation_id": sim_id,
        "status": sim.status.value if hasattr(sim.status, 'value') else sim.status,
        "total_steps": sim.total_steps,
        "total_red_reward": round(sim.total_red_reward, 2),
        "total_blue_reward": round(sim.total_blue_reward, 2),
        "winner": winner,
        "red_mean_reward": round(sum(r_rewards) / len(r_rewards), 2) if r_rewards else 0,
        "blue_mean_reward": round(sum(b_rewards) / len(b_rewards), 2) if b_rewards else 0,
        "red_max_reward": round(max(r_rewards), 2) if r_rewards else 0,
        "blue_max_reward": round(max(b_rewards), 2) if b_rewards else 0,
        "red_action_counts": r_actions,
        "blue_action_counts": b_actions,
        "red_reward_per_step": [round(r, 2) for r in r_rewards],
        "blue_reward_per_step": [round(r, 2) for r in b_rewards],
        "steps": [{
            "step": s.step_number,
            "red_action": s.red_action.get("action", "unknown") if s.red_action else "unknown",
            "red_target": s.red_action.get("target", "N/A") if s.red_action else "N/A",
            "blue_action": s.blue_action.get("action", "unknown") if s.blue_action else "unknown",
            "blue_target": s.blue_action.get("target", "N/A") if s.blue_action else "N/A",
            "red_reward": round(s.red_reward, 2),
            "blue_reward": round(s.blue_reward, 2),
        } for s in steps],
    }


def get_defense_analysis(db: Session):
    sims = db.query(Simulation).filter(Simulation.status == SimulationStatus.COMPLETED).all()

    if not sims:
        return {
            "total_simulations": 0, "blue_wins": 0, "red_wins": 0,
            "win_rate": 0, "avg_blue_reward": 0,
            "defense_actions": {}, "recent_simulations": [],
        }

    blue_wins = sum(1 for s in sims if s.total_blue_reward >= s.total_red_reward)
    red_wins = len(sims) - blue_wins
    avg_blue = sum(s.total_blue_reward for s in sims) / len(sims)

    all_steps = db.query(SimulationStep).filter(
        SimulationStep.simulation_id.in_([s.id for s in sims])
    ).all()

    def_actions = {}
    for s in all_steps:
        ba = s.blue_action.get("action", "unknown") if s.blue_action else "unknown"
        def_actions[ba] = def_actions.get(ba, 0) + 1

    recent = sorted(sims, key=lambda s: s.created_at or s.id, reverse=True)[:10]

    return {
        "total_simulations": len(sims),
        "blue_wins": blue_wins,
        "red_wins": red_wins,
        "win_rate": round(blue_wins / len(sims) * 100, 1),
        "avg_blue_reward": round(avg_blue, 2),
        "defense_actions": def_actions,
        "recent_simulations": [{
            "id": s.id, "total_steps": s.total_steps,
            "red_reward": round(s.total_red_reward, 2),
            "blue_reward": round(s.total_blue_reward, 2),
            "winner": "blue" if s.total_blue_reward >= s.total_red_reward else "red",
        } for s in recent],
    }


def get_dashboard_stats(db: Session):
    return {
        "total_simulations": db.query(func.count(Simulation.id)).scalar(),
        "completed_simulations": db.query(func.count(Simulation.id)).filter(
            Simulation.status == SimulationStatus.COMPLETED).scalar(),
        "total_training_runs": db.query(func.count(TrainingRun.id)).scalar(),
        "completed_training_runs": db.query(func.count(TrainingRun.id)).filter(
            TrainingRun.status == TrainingStatus.COMPLETED).scalar(),
    }
