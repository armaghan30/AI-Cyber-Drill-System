import os
import csv
import time
import threading
from datetime import datetime, timezone
from sqlalchemy.orm import Session as DBSession

from backend.config import settings
from backend.database import SessionLocal
from backend.models.training_run import TrainingRun, TrainingStatus
from backend.models.scenario import Scenario
from backend.schemas.training import TrainingCreate

# pause/stop events keyed by run_id
_pause_events: dict[int, threading.Event] = {}
_stop_events:  dict[int, threading.Event] = {}


def _mask_fn(env):
    # same masking as orchestrator/train_maskable_ppo_red.py
    return env.action_masks()


def _make_env(Env, topo_path, max_steps, is_maskable):
    """Build the training env. MaskablePPO gets an ActionMasker that uses the env's real masks."""
    from stable_baselines3.common.monitor import Monitor
    base_env = Env(topo_path, max_steps=max_steps)
    if is_maskable:
        from sb3_contrib.common.wrappers import ActionMasker
        return Monitor(ActionMasker(base_env, _mask_fn))
    return Monitor(base_env)


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
        print(f"\n{'='*55}", flush=True)
        print(f"[AI Drill] Training {role.upper()} agent  |  algo={algo}  |  timesteps={timesteps:,}", flush=True)
        print(f"[AI Drill] Topology: {topo_tag}  |  run_id={run_id}", flush=True)
        print(f"{'='*55}", flush=True)

        # pick algorithm
        is_maskable = False
        if algo == "dqn":
            from stable_baselines3 import DQN as Algo
        elif algo == "maskable_ppo":
            try:
                from sb3_contrib import MaskablePPO as Algo
                is_maskable = True
            except ImportError:
                from stable_baselines3 import PPO as Algo
        else:
            from stable_baselines3 import PPO as Algo

        # pick environment based on role
        if role == "red":
            from orchestrator.rl_env_red import RedRLEnvironment as Env
        else:
            from orchestrator.rl_env_blue import BlueRLEnvironment as Env

        from stable_baselines3.common.callbacks import BaseCallback

        pause_ev = _pause_events.get(run_id)
        stop_ev  = _stop_events.get(run_id)

        # callback to log episode rewards + handle pause/stop
        class RewardLog(BaseCallback):
            def __init__(self):
                super().__init__(verbose=0)
                self.rewards = []
                self._ep_count = 0

            def _on_step(self):
                # check stop
                if stop_ev and stop_ev.is_set():
                    return False  # stops training
                # check pause — block until resumed
                if pause_ev and pause_ev.is_set():
                    while pause_ev.is_set():
                        if stop_ev and stop_ev.is_set():
                            return False
                        time.sleep(0.5)

                for info in self.locals.get("infos", []):
                    if "episode" in info:
                        self.rewards.append(info["episode"]["r"])
                        self._ep_count += 1
                        # update DB every 50 episodes so frontend can poll live progress
                        if self._ep_count % 50 == 0:
                            try:
                                _db = SessionLocal()
                                _r = _db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
                                if _r:
                                    _r.episodes_completed = self._ep_count
                                    _db.commit()
                                _db.close()
                            except Exception:
                                pass
                return True

        env = _make_env(Env, topo_path, max_steps, is_maskable)

        # hyperparams
        if algo == "dqn":
            model = Algo(
                "MlpPolicy", env,
                learning_rate=1e-3, buffer_size=50_000,
                learning_starts=500, batch_size=64, gamma=0.99,
                target_update_interval=500, exploration_fraction=0.5,
                exploration_initial_eps=1.0, exploration_final_eps=0.05,
                verbose=1,
            )
        else:  # ppo or maskable_ppo
            model = Algo(
                "MlpPolicy", env,
                learning_rate=3e-4, n_steps=128, batch_size=64,
                n_epochs=10, gamma=0.99, gae_lambda=0.95,
                clip_range=0.2, ent_coef=0.01, verbose=1,
            )

        cb = RewardLog()
        model.learn(total_timesteps=timesteps, callback=cb)

        # save model + csv
        os.makedirs(str(settings.MODELS_DIR), exist_ok=True)
        os.makedirs(str(settings.CSV_DIR), exist_ok=True)

        # filename must match simulation_service lookup convention
        if algo == "maskable_ppo":
            model_file = str(settings.MODELS_DIR / f"maskable_ppo_{role}_{topo_tag}")
        else:
            model_file = str(settings.MODELS_DIR / f"sb3_{algo}_{role}_{topo_tag}")
        csv_file = str(settings.CSV_DIR / f"sb3_{algo}_{role}_{topo_tag}.csv")

        model.save(model_file)

        with open(csv_file, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["episode", "reward", "topology"])
            for i, r in enumerate(cb.rewards, 1):
                w.writerow([i, r, topo_tag])

        import numpy as np
        mean_r = float(np.mean(cb.rewards)) if cb.rewards else 0.0
        print(f"\n[AI Drill] {role.upper()} training DONE — {len(cb.rewards)} episodes  |  mean reward: {mean_r:.3f}", flush=True)
        print(f"[AI Drill] Model saved → {model_file}.zip\n", flush=True)
        run.status = TrainingStatus.COMPLETED
        run.completed_at = datetime.now(timezone.utc)
        run.episodes_completed = len(cb.rewards)
        run.mean_reward = mean_r
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


def start_training(db: DBSession, payload: TrainingCreate, user_id=None):
    from sqlalchemy import or_
    q = db.query(Scenario).filter(Scenario.id == payload.scenario_id)
    if user_id is not None:
        q = q.filter(or_(Scenario.user_id == user_id, Scenario.is_demo == True))
    scenario = q.first()
    if not scenario:
        raise ValueError(f"Scenario {payload.scenario_id} not found")

    if scenario.is_demo:
        topo_path = str(settings.TOPOLOGY_DIR / "baselines" / scenario.filename)
    elif scenario.user_id:
        topo_path = str(settings.USER_UPLOADS_DIR / str(scenario.user_id) / scenario.filename)
    else:
        topo_path = str(settings.TOPOLOGY_DIR / scenario.filename)

    run = TrainingRun(
        scenario_id=payload.scenario_id,
        user_id=user_id,
        agent_role=payload.agent_role,
        algorithm=payload.algorithm,
        total_timesteps=payload.total_timesteps,
        max_steps_per_episode=payload.max_steps_per_episode,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # init pause/stop events for this run
    _pause_events[run.id] = threading.Event()
    _stop_events[run.id]  = threading.Event()

    # start training in background thread so API doesnt block
    t = threading.Thread(
        target=_train_worker,
        args=(run.id, topo_path, payload.agent_role, payload.algorithm,
              payload.total_timesteps, payload.max_steps_per_episode),
        daemon=True,
    )
    t.start()
    return run


def pause_training(run_id: int):
    ev = _pause_events.get(run_id)
    if ev:
        ev.set()


def resume_training(run_id: int):
    ev = _pause_events.get(run_id)
    if ev:
        ev.clear()


def stop_training(db: DBSession, run_id: int, user_id=None):
    ev = _stop_events.get(run_id)
    if ev:
        ev.set()
    q = db.query(TrainingRun).filter(TrainingRun.id == run_id)
    if user_id is not None:
        q = q.filter(TrainingRun.user_id == user_id)
    run = q.first()
    if run and run.status == TrainingStatus.RUNNING:
        run.status = TrainingStatus.COMPLETED
        run.completed_at = datetime.now(timezone.utc)
        db.commit()
    _pause_events.pop(run_id, None)
    _stop_events.pop(run_id, None)
    return run


def get_training_run(db: DBSession, run_id, user_id=None):
    q = db.query(TrainingRun).filter(TrainingRun.id == run_id)
    if user_id is not None:
        q = q.filter(TrainingRun.user_id == user_id)
    return q.first()


def list_training_runs(db: DBSession, scenario_id=None, status=None, user_id=None):
    q = db.query(TrainingRun).order_by(TrainingRun.created_at.desc())
    if scenario_id:
        q = q.filter(TrainingRun.scenario_id == scenario_id)
    if status:
        q = q.filter(TrainingRun.status == status)
    if user_id is not None:
        q = q.filter(TrainingRun.user_id == user_id)
    return q.all()
