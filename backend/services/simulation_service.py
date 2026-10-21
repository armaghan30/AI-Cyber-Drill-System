import os
import secrets
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
    if scenario.is_demo:
        return str(settings.TOPOLOGY_DIR / "baselines" / scenario.filename)
    if scenario.user_id:
        return str(settings.USER_UPLOADS_DIR / str(scenario.user_id) / scenario.filename)
    return str(settings.TOPOLOGY_DIR / scenario.filename)


def _topo_tag(path):
    return os.path.splitext(os.path.basename(path))[0]


class NoTrainedModelError(RuntimeError):
    """Raised when no trained Red/Blue model pair exists for the given topology.
    Simulations require trained models — there is no rule-based fallback."""
    pass


def _warmup_model(model, model_type):
    """Fire one dummy predict() immediately after loading so PyTorch allocates its
    per-shape buffers now (during session creation) rather than on the first real
    step — which would stall the step loop for 30-60 s on a CPU-only machine."""
    try:
        obs_dim    = model.observation_space.shape[0]
        dummy_obs  = np.zeros(obs_dim, dtype=np.float32)
        if model_type == "maskable_ppo":
            dummy_mask = np.ones(model.action_space.n, dtype=bool)
            model.predict(dummy_obs, action_masks=dummy_mask)
        else:
            model.predict(dummy_obs)
        log.info("Model warmed up (obs_dim=%d)", obs_dim)
    except Exception as exc:
        log.warning("Model warmup skipped: %s", exc)


def _load_sb3_models(topo_path):
    models = _load_trained(topo_path)
    # loading a model resets the random seed, so reseed after loading
    from orchestrator.assessment import seed_everything
    seed_everything(secrets.randbits(32))
    return models


def _load_trained(topo_path):
    tag = _topo_tag(topo_path)

    # MaskablePPO first (best for large topologies)
    try:
        from sb3_contrib import MaskablePPO
        red_p  = settings.MODELS_DIR / f"maskable_ppo_red_{tag}.zip"
        blue_p = settings.MODELS_DIR / f"maskable_ppo_blue_{tag}.zip"
        if red_p.exists() and blue_p.exists():
            log.info("Loading MaskablePPO models for %s", tag)
            red_m  = MaskablePPO.load(str(red_p))
            blue_m = MaskablePPO.load(str(blue_p))
            _warmup_model(red_m,  "maskable_ppo")
            _warmup_model(blue_m, "maskable_ppo")
            return red_m, blue_m, "maskable_ppo"
    except ImportError:
        pass

    # PPO second
    try:
        from stable_baselines3 import PPO
        red_p  = settings.MODELS_DIR / f"sb3_ppo_red_{tag}.zip"
        blue_p = settings.MODELS_DIR / f"sb3_ppo_blue_{tag}.zip"
        if red_p.exists() and blue_p.exists():
            log.info("Loading PPO models for %s", tag)
            red_m  = PPO.load(str(red_p))
            blue_m = PPO.load(str(blue_p))
            _warmup_model(red_m,  "ppo")
            _warmup_model(blue_m, "ppo")
            return red_m, blue_m, "ppo"
    except ImportError:
        pass

    # DQN
    try:
        from stable_baselines3 import DQN
        red_p  = settings.MODELS_DIR / f"sb3_dqn_red_{tag}.zip"
        blue_p = settings.MODELS_DIR / f"sb3_dqn_blue_{tag}.zip"
        if red_p.exists() and blue_p.exists():
            log.info("Loading DQN models for %s", tag)
            red_m  = DQN.load(str(red_p))
            blue_m = DQN.load(str(blue_p))
            _warmup_model(red_m,  "dqn")
            _warmup_model(blue_m, "dqn")
            return red_m, blue_m, "dqn"
    except ImportError:
        pass

    raise NoTrainedModelError(
        f"No trained Red/Blue model pair found for topology '{tag}'. "
        "Train MaskablePPO agents for this topology before running a simulation."
    )


def _get_action_masks(orch, hosts, agent):
    """Same masks as in training."""
    from orchestrator.action_masks import red_action_mask, blue_action_mask
    if agent == "red":
        return red_action_mask(orch.environment, hosts, orch.red_agent)
    return blue_action_mask(orch.environment, hosts)


# --- action decoding (maps model output index to actual action) ---

def _decode_red(idx, hosts, red_agent):
    # same decoding as RedRLEnvironment (5 action types per host + idle)
    from orchestrator.adversarial import decode_red_action
    return decode_red_action(red_agent, hosts, idx)


def _decode_blue(idx, hosts, blue_agent):
    # same decoding as BlueRLEnvironment (6 action types per host + idle)
    from orchestrator.adversarial import decode_blue_action
    return decode_blue_action(blue_agent, hosts, idx)


_RED_TYPES_PER_HOST  = 5   # scan, exploit, escalate, lateral_move, exfiltrate
_BLUE_TYPES_PER_HOST = 6   # patch, isolate, restore, detect, harden, deploy_firewall


def _action_type(idx, n, types_per_host):
    """Map an action index to its action-type id (0..types_per_host-1, or types_per_host for idle)."""
    idx = int(idx)
    if idx >= types_per_host * n:
        return types_per_host  # idle
    return idx // n


def _diversify(model, obs, base_mask, recent, n, types_per_host, history_len=5, max_repeat=2):
    """Pick an action from the trained policy but force action-type rotation.

    If the chosen action TYPE has already been used `max_repeat` times in the last
    `history_len` steps, mask that whole type-slice and re-sample. This stops the
    trained Red agent from spamming "exploit" every step and lets the attack chain
    (scan → exploit → escalate → lateral_move → exfiltrate) actually unfold.
    """
    if base_mask is not None:
        idx_arr, _ = model.predict(obs, deterministic=False, action_masks=base_mask)
    else:
        idx_arr, _ = model.predict(obs, deterministic=False)
    chosen_type = _action_type(idx_arr, n, types_per_host)

    if recent.count(chosen_type) >= max_repeat and chosen_type < types_per_host:
        new_mask = base_mask.copy() if base_mask is not None else np.ones(types_per_host * n + 1, dtype=bool)
        new_mask[chosen_type * n:(chosen_type + 1) * n] = False
        if new_mask.any():
            idx_arr, _ = model.predict(obs, deterministic=False, action_masks=new_mask) \
                if base_mask is not None else model.predict(obs, deterministic=False)
            chosen_type = _action_type(idx_arr, n, types_per_host)

    recent.append(chosen_type)
    while len(recent) > history_len:
        recent.pop(0)
    return idx_arr


def _sb3_step(orch, red_model, blue_model, hosts, model_type="ppo", red_recent=None, blue_recent=None):
    """Run one simulation step using trained SB3 models with action-type diversity."""
    from orchestrator.state_vectors import flatten_red_state, flatten_blue_state

    red_state = orch._build_red_state()
    blue_state = orch._build_blue_state()

    red_obs = flatten_red_state(red_state, hosts)
    blue_obs = flatten_blue_state(blue_state, hosts)

    n = len(hosts)
    red_recent  = red_recent  if red_recent  is not None else []
    blue_recent = blue_recent if blue_recent is not None else []

    if model_type == "maskable_ppo":
        red_mask  = _get_action_masks(orch, hosts, "red")
        blue_mask = _get_action_masks(orch, hosts, "blue")
    else:
        red_mask = None
        blue_mask = None

    red_idx  = _diversify(red_model,  red_obs,  red_mask,  red_recent,  n, _RED_TYPES_PER_HOST)
    blue_idx = _diversify(blue_model, blue_obs, blue_mask, blue_recent, n, _BLUE_TYPES_PER_HOST)

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


def _flush_steps_to_db(db: Session, sim, ctx, final_env=None):
    """Bulk-insert ALL accumulated steps + update the simulation row in ONE commit.

    Called either when the simulation completes naturally (remaining <= 0) or when
    the user hits Stop Drill.  Keeping every per-step db.commit() out of the hot
    path means the WAL checkpoint never blocks mid-simulation.
    """
    orch   = ctx["orch"]
    sim_id = sim.id

    for log_entry in orch.logs:
        compact_env = {
            "step":  log_entry["environment"].get("step"),
            "edges": log_entry["environment"].get("edges", []),
            "hosts": {
                name: {
                    "is_compromised":   h.get("is_compromised"),
                    "is_isolated":      h.get("is_isolated"),
                    "data_exfiltrated": h.get("data_exfiltrated"),
                    "firewall_active":  h.get("firewall_active"),
                }
                for name, h in log_entry["environment"].get("hosts", {}).items()
            },
        }
        db.add(SimulationStep(
            simulation_id=sim_id,
            step_number=log_entry["step"],
            red_action=log_entry["red_action"],
            blue_action=log_entry["blue_action"],
            red_reward=log_entry["red_reward"],
            blue_reward=log_entry["blue_reward"],
            red_state=None,
            blue_state=None,
            environment_state=compact_env,
        ))

    sim.total_steps       = ctx.get("total_steps", 0)
    sim.total_red_reward  = ctx.get("total_red_reward",  0.0)
    sim.total_blue_reward = ctx.get("total_blue_reward", 0.0)
    sim.status            = SimulationStatus.COMPLETED
    sim.completed_at      = datetime.now(timezone.utc)
    if final_env is not None:
        sim.final_state = final_env
    elif orch.logs:
        sim.final_state = orch.logs[-1]["environment"]

    db.commit()


def create_simulation(db: Session, payload: SimulationCreate, user_id=None):
    from sqlalchemy import or_
    q = db.query(Scenario).filter(Scenario.id == payload.scenario_id)
    if user_id is not None:
        q = q.filter(or_(Scenario.user_id == user_id, Scenario.is_demo == True))
    scenario = q.first()
    if not scenario:
        raise ValueError(f"Scenario {payload.scenario_id} not found")

    sid = str(uuid.uuid4())
    topo = _topo_path(scenario)
    orch = _init_orchestrator(topo)

    # Trained models are required — no rule-based fallback.
    # Raises NoTrainedModelError if no Red/Blue pair exists for this topology.
    red_m, blue_m, m_type = _load_sb3_models(topo)
    host_order = list(orch.environment.hosts.keys())

    with _lock:
        _sessions[sid] = {
            "orch":             orch,
            "red_model":        red_m,
            "blue_model":       blue_m,
            "model_type":       m_type,
            "host_order":       host_order,
            "red_recent":       [],
            "blue_recent":      [],
            # In-memory accumulators — no per-step DB commit needed
            "max_steps":        payload.max_steps,
            "total_steps":      0,
            "total_red_reward": 0.0,
            "total_blue_reward":0.0,
        }
    log.info("Session %s: using %s for live step-by-step", sid, m_type)

    sim = Simulation(
        scenario_id=payload.scenario_id, session_id=sid,
        status=SimulationStatus.RUNNING, max_steps=payload.max_steps,
        user_id=user_id,
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
        ctx = _sessions.get(session_id)
    if not ctx:
        # Session was lost (backend restart cleared _sessions). Mark as FAILED
        # so subsequent calls get a clean error instead of the same 400 loop.
        sim.status = SimulationStatus.FAILED
        db.commit()
        raise ValueError("Session expired — the backend was restarted. Please launch a new drill.")

    orch        = ctx["orch"]
    red_m       = ctx.get("red_model")
    blue_m      = ctx.get("blue_model")
    m_type      = ctx.get("model_type")
    host_order  = ctx.get("host_order")
    red_recent  = ctx.setdefault("red_recent", [])
    blue_recent = ctx.setdefault("blue_recent", [])

    entry = _sb3_step(orch, red_m, blue_m, host_order, m_type, red_recent, blue_recent)

    # ── Update in-memory accumulators ONLY — zero DB I/O per step ──────────
    # All steps are stored in orch.logs already. We flush them to the database
    # in a single bulk commit when the simulation finishes (or is stopped).
    # This eliminates the per-step db.commit() that was triggering SQLite WAL
    # checkpoints and blocking step 2+ for 30-60 s on accumulated test data.
    ctx["total_steps"]       = entry["step"]
    ctx["total_red_reward"]  = ctx.get("total_red_reward",  0.0) + entry["red_reward"]
    ctx["total_blue_reward"] = ctx.get("total_blue_reward", 0.0) + entry["blue_reward"]

    remaining  = ctx["max_steps"] - ctx["total_steps"]
    sim_status = SimulationStatus.RUNNING

    if remaining <= 0:
        # Bulk-write all accumulated steps + mark completed — ONE commit total
        sim_status = SimulationStatus.COMPLETED
        _flush_steps_to_db(db, sim, ctx, final_env=entry["environment"])
        with _lock:
            _sessions.pop(session_id, None)

    return {
        "step": {
            "step_number": entry["step"],
            "red_action":  entry["red_action"],
            "blue_action": entry["blue_action"],
            "red_reward":  entry["red_reward"],
            "blue_reward": entry["blue_reward"],
        },
        "simulation_status": sim_status.value,
        "steps_remaining": max(0, remaining),
    }


def run_full_simulation(db: Session, payload: SimulationCreate, user_id=None):
    from sqlalchemy import or_
    q = db.query(Scenario).filter(Scenario.id == payload.scenario_id)
    if user_id is not None:
        q = q.filter(or_(Scenario.user_id == user_id, Scenario.is_demo == True))
    scenario = q.first()
    if not scenario:
        raise ValueError(f"Scenario {payload.scenario_id} not found")

    sid = str(uuid.uuid4())
    topo = _topo_path(scenario)
    orch = _init_orchestrator(topo)

    # Trained models required — no rule-based fallback.
    red_m, blue_m, m_type = _load_sb3_models(topo)
    host_order = list(orch.environment.hosts.keys())

    with _lock:
        _sessions[sid] = {
            "orch": orch,
            "red_model": red_m,
            "blue_model": blue_m,
            "model_type": m_type,
            "host_order": host_order,
        }

    sim = Simulation(
        scenario_id=payload.scenario_id, session_id=sid,
        status=SimulationStatus.RUNNING, max_steps=payload.max_steps,
        user_id=user_id,
    )
    db.add(sim)
    db.commit()
    db.refresh(sim)

    red_recent, blue_recent = [], []
    for _ in range(payload.max_steps):
        entry = _sb3_step(orch, red_m, blue_m, host_order, m_type, red_recent, blue_recent)

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


def get_simulation(db: Session, sim_id, user_id=None):
    q = db.query(Simulation).filter(Simulation.id == sim_id)
    if user_id is not None:
        q = q.filter(Simulation.user_id == user_id)
    return q.first()


def list_simulations(db: Session, scenario_id=None, user_id=None):
    q = db.query(Simulation).order_by(Simulation.created_at.desc())
    if scenario_id:
        q = q.filter(Simulation.scenario_id == scenario_id)
    if user_id is not None:
        q = q.filter(Simulation.user_id == user_id)
    return q.all()


def cleanup_session(session_id):
    with _lock:
        _sessions.pop(session_id, None)


def stop_simulation(db: Session, session_id: str, user_id=None):
    """Stop a running simulation early — flush all completed steps and mark done."""
    q = db.query(Simulation).filter(Simulation.session_id == session_id)
    if user_id is not None:
        q = q.filter(Simulation.user_id == user_id)
    sim = q.first()
    if not sim:
        raise ValueError(f"Simulation not found: {session_id}")
    if sim.status != SimulationStatus.RUNNING:
        return sim  # already done, nothing to do

    with _lock:
        ctx = _sessions.pop(session_id, None)

    if ctx and isinstance(ctx, dict) and ctx.get("orch"):
        # Flush whatever steps completed before Stop was pressed
        _flush_steps_to_db(db, sim, ctx)
    else:
        # Session already gone (e.g. backend restart) — just mark completed
        sim.status       = SimulationStatus.COMPLETED
        sim.completed_at = datetime.now(timezone.utc)
        db.commit()

    db.refresh(sim)
    return sim


def get_attack_path(db: Session, sim_id: int):
    sim = db.query(Simulation).filter(Simulation.id == sim_id).first()
    if not sim:
        raise ValueError(f"Simulation {sim_id} not found")

    steps = db.query(SimulationStep).filter(
        SimulationStep.simulation_id == sim_id
    ).order_by(SimulationStep.step_number).all()

    if not steps:
        return {
            "entry_point": None, "attack_sequence": [], "lateral_movements": [],
            "compromised_path": [], "exfiltrated_hosts": [], "path_string": "No attack data",
            "total_actions": 0, "successful_actions": 0, "action_breakdown": {},
        }

    attack_sequence = []
    lateral_movements = []
    entry_point = None
    compromised_ordered = []
    exfiltrated_hosts = []
    action_breakdown = {}

    for step in steps:
        ra = step.red_action or {}
        action = ra.get("action", "idle")
        target = ra.get("target")
        source = ra.get("source")
        success = ra.get("success", False)
        reward = step.red_reward or 0

        if action == "idle":
            continue

        action_breakdown[action] = action_breakdown.get(action, 0) + 1
        hit = bool(success) or reward > 0

        attack_sequence.append({
            "step": step.step_number, "action": action,
            "target": target, "source": source,
            "success": hit, "reward": round(reward, 2),
        })

        if action == "exploit" and hit and entry_point is None and target:
            entry_point = target
            compromised_ordered.append(target)

        elif action == "lateral_move" and hit and target:
            lateral_movements.append({"from": source, "to": target, "step": step.step_number})
            if target not in compromised_ordered:
                compromised_ordered.append(target)

        elif action == "exfiltrate" and hit and target:
            if target not in exfiltrated_hosts:
                exfiltrated_hosts.append(target)

    path_nodes = ["INTERNET"] + compromised_ordered
    if exfiltrated_hosts:
        path_nodes.append("EXFIL")
    path_string = " → ".join(path_nodes)

    successful = sum(1 for s in attack_sequence if s["success"])

    return {
        "entry_point": entry_point,
        "attack_sequence": attack_sequence,
        "lateral_movements": lateral_movements,
        "compromised_path": [
            {"host": h, "method": "exploit" if h == entry_point else "lateral_move"}
            for h in compromised_ordered
        ],
        "exfiltrated_hosts": exfiltrated_hosts,
        "path_string": path_string,
        "total_actions": len(attack_sequence),
        "successful_actions": successful,
        "action_breakdown": action_breakdown,
    }
