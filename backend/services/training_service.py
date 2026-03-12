import os
import csv
import threading
from datetime import datetime, timezone
from sqlalchemy.orm import Session as DBSession

from backend.config import settings
from backend.database import SessionLocal
from backend.models.training_run import TrainingRun, TrainingStatus
from backend.models.scenario import Scenario
from backend.schemas.training import TrainingCreate


def _train_worker(run_id, topo_path, role, algo, timesteps, max_steps):
    """Background thread that runs the actual RL training."""
    db = SessionLocal()
    try:
        run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
        if not run:
            return

        run.status = TrainingStatus.RUNNING
        run.started_at = datetime.now(timezone.utc)
        db.commit()

        topo_tag = os.path.splitext(os.path.basename(topo_path))[0]

        # pick algorithm
        if algo == "dqn":
            from stable_baselines3 import DQN as Algo
        else:
            from stable_baselines3 import PPO as Algo

        # pick environment based on role
        if role == "red":
            from orchestrator.rl_env_red import RedRLEnvironment as Env
        else:
            from orchestrator.rl_env_blue import BlueRLEnvironment as Env

        from stable_baselines3.common.monitor import Monitor
        from stable_baselines3.common.callbacks import BaseCallback

        # callback to log episode rewards during training
        class RewardLog(BaseCallback):
            def __init__(self):
                super().__init__(verbose=0)
                self.rewards = []

            def _on_step(self):
                for info in self.locals.get("infos", []):
                    if "episode" in info:
                        self.rewards.append(info["episode"]["r"])
                return True

        env = Monitor(Env(topo_path, max_steps=max_steps))

        # hyperparams - same as our standalone training scripts
        if algo == "dqn":
            model = Algo(
                "MlpPolicy", env,
                learning_rate=1e-3, buffer_size=50_000,
                learning_starts=500, batch_size=64, gamma=0.99,
                target_update_interval=500, exploration_fraction=0.5,
                exploration_initial_eps=1.0, exploration_final_eps=0.05,
                verbose=0,
            )
        else:
            model = Algo(
                "MlpPolicy", env,
                learning_rate=3e-4, n_steps=128, batch_size=64,
                n_epochs=10, gamma=0.99, gae_lambda=0.95,
                clip_range=0.2, ent_coef=0.01, verbose=0,
            )

        cb = RewardLog()
        model.learn(total_timesteps=timesteps, callback=cb)

        # save model + csv
        os.makedirs(str(settings.MODELS_DIR), exist_ok=True)
        os.makedirs(str(settings.CSV_DIR), exist_ok=True)

        model_file = str(settings.MODELS_DIR / f"sb3_{algo}_{role}_{topo_tag}")
        csv_file = str(settings.CSV_DIR / f"sb3_{algo}_{role}_{topo_tag}.csv")

        model.save(model_file)

        with open(csv_file, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["episode", "reward", "topology"])
            for i, r in enumerate(cb.rewards, 1):
                w.writerow([i, r, topo_tag])

        import numpy as np
        run.status = TrainingStatus.COMPLETED
        run.completed_at = datetime.now(timezone.utc)
        run.episodes_completed = len(cb.rewards)
        run.mean_reward = float(np.mean(cb.rewards)) if cb.rewards else None
        run.model_path = model_file + ".zip"
        run.csv_path = csv_file
        db.commit()
        env.close()

    except Exception as e:
        run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
        if run:
            run.status = TrainingStatus.FAILED
            run.error_message = str(e)[:1000]
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def start_training(db: DBSession, payload: TrainingCreate):
    scenario = db.query(Scenario).filter(Scenario.id == payload.scenario_id).first()
    if not scenario:
        raise ValueError(f"Scenario {payload.scenario_id} not found")

    topo_path = str(settings.TOPOLOGY_DIR / scenario.filename)

    run = TrainingRun(
        scenario_id=payload.scenario_id,
        agent_role=payload.agent_role,
        algorithm=payload.algorithm,
        total_timesteps=payload.total_timesteps,
        max_steps_per_episode=payload.max_steps_per_episode,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # start training in background thread so API doesnt block
    t = threading.Thread(
        target=_train_worker,
        args=(run.id, topo_path, payload.agent_role, payload.algorithm,
              payload.total_timesteps, payload.max_steps_per_episode),
        daemon=True,
    )
    t.start()
    return run


def get_training_run(db: DBSession, run_id):
    return db.query(TrainingRun).filter(TrainingRun.id == run_id).first()


def list_training_runs(db: DBSession, scenario_id=None, status=None):
    q = db.query(TrainingRun).order_by(TrainingRun.created_at.desc())
    if scenario_id:
        q = q.filter(TrainingRun.scenario_id == scenario_id)
    if status:
        q = q.filter(TrainingRun.status == status)
    return q.all()
