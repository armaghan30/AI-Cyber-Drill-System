import os
import uuid
import logging
import threading
import datetime as _dt
from datetime import datetime, timezone

import numpy as np
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models.simulation import Simulation, SimulationStep, SimulationStatus
from backend.models.scenario import Scenario
from backend.schemas.simulation import SimulationCreate

log = logging.getLogger(__name__)

# keep orchestrator instances in memory for step-by-step mode
_sessions = {}
_lock = threading.Lock()


def _topo_path(scenario):
    return str(settings.TOPOLOGY_DIR / scenario.filename)


def _topo_tag(path):
    return os.path.splitext(os.path.basename(path))[0]


def _load_sb3_models(topo_path):
    """Try loading trained DQN models for this topology. Returns (red, blue) or (None, None)."""
    try:
        from stable_baselines3 import DQN
    except ImportError:
        return None, None

    tag = _topo_tag(topo_path)
    red_p = settings.MODELS_DIR / f"sb3_dqn_red_{tag}.zip"
    blue_p = settings.MODELS_DIR / f"sb3_dqn_blue_{tag}.zip"

    if not red_p.exists() or not blue_p.exists():
        log.info("No trained models for %s, using rule-based agents", tag)
        return None, None

    log.info("Loading DQN models for %s", tag)
    return DQN.load(str(red_p)), DQN.load(str(blue_p))


# --- action decoding (maps model output index to actual action) ---

def _decode_red(idx, hosts, red_agent):
    n = len(hosts)
    # 5 action types: scan, exploit, escalate, lateral_move, exfiltrate
    # each applied to n hosts, plus 1 idle action
    if idx < n:
        return red_agent.scan(hosts[idx])
    elif idx < 2 * n:
        return red_agent.exploit(hosts[idx - n])
    elif idx < 3 * n:
        return red_agent.escalate_privileges(hosts[idx - 2 * n])
    elif idx < 4 * n:
        return red_agent.lateral_move(hosts[idx - 3 * n])
    elif idx < 5 * n:
        return red_agent.exfiltrate(hosts[idx - 4 * n])
    return {"action": "idle", "target": None}


def _decode_blue(idx, hosts, blue_agent):
    n = len(hosts)
    if idx < n:
        return {"action": "patch", "target": hosts[idx]}
    elif idx < 2 * n:
        return {"action": "isolate", "target": hosts[idx - n]}
    elif idx < 3 * n:
        return {"action": "restore", "target": hosts[idx - 2 * n]}
    elif idx < 4 * n:
        return blue_agent.make_detect_action(hosts[idx - 3 * n])
    elif idx < 5 * n:
        return {"action": "harden", "target": hosts[idx - 4 * n]}
    return {"action": "idle", "target": None}


def _sb3_step(orch, red_model, blue_model, hosts):
    """Run one simulation step using trained SB3 models instead of rule-based agents."""
    from orchestrator.state_vectors import flatten_red_state, flatten_blue_state

    red_state = orch._build_red_state()
    blue_state = orch._build_blue_state()

    red_obs = flatten_red_state(red_state, hosts)
    blue_obs = flatten_blue_state(blue_state, hosts)

    # get action from each model
    red_idx, _ = red_model.predict(red_obs, deterministic=True)
    blue_idx, _ = blue_model.predict(blue_obs, deterministic=True)

    red_act = _decode_red(int(red_idx), hosts, orch.red_agent)
    blue_act = _decode_blue(int(blue_idx), hosts, orch.blue_agent)

    # get previous state for reward calc
    prev = orch.logs[-1]["environment"] if orch.logs else orch._snapshot_environment()

    env_state = orch.environment.step(red_act, blue_act)

    r_reward, b_reward = orch.reward_engine.compute_rewards(prev, env_state, red_act, blue_act)

    entry = {
        "step": len(orch.logs) + 1,
        "timestamp": _dt.datetime.now().isoformat(),
        "red_state": red_state, "blue_state": blue_state,
        "red_action": red_act, "blue_action": blue_act,
        "red_reward": r_reward, "blue_reward": b_reward,
        "environment": env_state,
    }
    orch.logs.append(entry)
    return entry


def _init_orchestrator(topo_path):
    from orchestrator.orchestrator_core import Orchestrator
    orch = Orchestrator(topo_path)
    orch.load_topology()
    orch.build_environment()
    orch.init_red_agent()
    orch.init_blue_agent()
    return orch


def create_simulation(db: Session, payload: SimulationCreate):
    scenario = db.query(Scenario).filter(Scenario.id == payload.scenario_id).first()
    if not scenario:
        raise ValueError(f"Scenario {payload.scenario_id} not found")

    sid = str(uuid.uuid4())
    orch = _init_orchestrator(_topo_path(scenario))

    with _lock:
        _sessions[sid] = orch

    sim = Simulation(
        scenario_id=payload.scenario_id, session_id=sid,
        status=SimulationStatus.RUNNING, max_steps=payload.max_steps,
    )
    db.add(sim)
    db.commit()
    db.refresh(sim)
    return sim


def run_step(db: Session, session_id):
    sim = db.query(Simulation).filter(Simulation.session_id == session_id).first()
    if not sim:
        raise ValueError(f"Simulation not found for session {session_id}")
    if sim.status != SimulationStatus.RUNNING:
        raise ValueError(f"Simulation is {sim.status.value}, not running")

    with _lock:
        orch = _sessions.get(session_id)
    if not orch:
        raise ValueError(f"No active session for {session_id}")

    entry = orch.run_single_step()

    step = SimulationStep(
        simulation_id=sim.id, step_number=entry["step"],
        red_action=entry["red_action"], blue_action=entry["blue_action"],
        red_reward=entry["red_reward"], blue_reward=entry["blue_reward"],
        red_state=entry["red_state"], blue_state=entry["blue_state"],
        environment_state=entry["environment"],
    )
    db.add(step)

    sim.total_steps = entry["step"]
    sim.total_red_reward += entry["red_reward"]
    sim.total_blue_reward += entry["blue_reward"]

    remaining = sim.max_steps - sim.total_steps
    if remaining <= 0:
        sim.status = SimulationStatus.COMPLETED
        sim.completed_at = datetime.now(timezone.utc)
        sim.final_state = entry["environment"]
        with _lock:
            _sessions.pop(session_id, None)

    db.commit()
    db.refresh(step)

    return {
        "step": step,
        "simulation_status": sim.status.value,
        "steps_remaining": max(0, remaining),
    }


def run_full_simulation(db: Session, payload: SimulationCreate):
    scenario = db.query(Scenario).filter(Scenario.id == payload.scenario_id).first()
    if not scenario:
        raise ValueError(f"Scenario {payload.scenario_id} not found")

    sid = str(uuid.uuid4())
    topo = _topo_path(scenario)
    orch = _init_orchestrator(topo)

    with _lock:
        _sessions[sid] = orch

    sim = Simulation(
        scenario_id=payload.scenario_id, session_id=sid,
        status=SimulationStatus.RUNNING, max_steps=payload.max_steps,
    )
    db.add(sim)
    db.commit()
    db.refresh(sim)

    # try using trained models, fallback to rule-based
    red_m, blue_m = _load_sb3_models(topo)
    use_sb3 = red_m is not None and blue_m is not None
    if use_sb3:
        host_order = list(orch.environment.hosts.keys())

    for _ in range(payload.max_steps):
        if use_sb3:
            entry = _sb3_step(orch, red_m, blue_m, host_order)
        else:
            entry = orch.run_single_step()

        step = SimulationStep(
            simulation_id=sim.id, step_number=entry["step"],
            red_action=entry["red_action"], blue_action=entry["blue_action"],
            red_reward=entry["red_reward"], blue_reward=entry["blue_reward"],
            red_state=entry["red_state"], blue_state=entry["blue_state"],
            environment_state=entry["environment"],
        )
        db.add(step)
        sim.total_steps = entry["step"]
        sim.total_red_reward += entry["red_reward"]
        sim.total_blue_reward += entry["blue_reward"]

    sim.status = SimulationStatus.COMPLETED
    sim.completed_at = datetime.now(timezone.utc)
    sim.final_state = orch.logs[-1]["environment"] if orch.logs else None

    with _lock:
        _sessions.pop(sid, None)

    db.commit()
    db.refresh(sim)
    return sim


def get_simulation(db: Session, sim_id):
    return db.query(Simulation).filter(Simulation.id == sim_id).first()


def list_simulations(db: Session, scenario_id=None):
    q = db.query(Simulation).order_by(Simulation.created_at.desc())
    if scenario_id:
        q = q.filter(Simulation.scenario_id == scenario_id)
    return q.all()


def cleanup_session(session_id):
    with _lock:
        _sessions.pop(session_id, None)
