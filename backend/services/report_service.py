import csv
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.simulation import Simulation, SimulationStep, SimulationStatus
from backend.models.training_run import TrainingRun, TrainingStatus
from orchestrator.verdict import BREACH_CRITERION


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
        "outcome": sim.outcome,
        "reason": sim.reason,
        "verdict": sim.verdict,
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
                if parts[0] == "maskable":
                    # maskable_ppo_red_topology_X
                    algo = "maskable_ppo"
                    role = parts[2] if len(parts) > 2 else "unknown"
                    topo = "_".join(parts[3:]) if len(parts) > 3 else ""
                else:
                    # sb3_dqn_red_topology_X  or  sb3_ppo_red_topology_X
                    algo = parts[1]
                    role = parts[2]
                    topo = "_".join(parts[3:])
                files.append({
                    "filename": name,
                    "agent_role": role,
                    "algorithm": algo,
                    "topology": topo,
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

    return {
        "report_type": "simulation",
        "simulation_id": sim_id,
        "status": sim.status.value if hasattr(sim.status, 'value') else sim.status,
        "total_steps": sim.total_steps,
        "total_red_reward": round(sim.total_red_reward, 2),
        "total_blue_reward": round(sim.total_blue_reward, 2),
        "outcome": sim.outcome,
        "reason": sim.reason,
        "verdict": sim.verdict,
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


def get_defense_analysis(db: Session, user_id=None):
    q = db.query(Simulation).filter(Simulation.status == SimulationStatus.COMPLETED)
    if user_id is not None:
        q = q.filter(Simulation.user_id == user_id)
    sims = q.all()

    if not sims:
        return {
            "total_simulations": 0, "drills_defended": 0, "drills_breached": 0,
            "defended_rate": 0, "breach_rate": 0, "avg_blue_reward": 0,
            "breach_criterion": BREACH_CRITERION,
            "defense_actions": {}, "recent_simulations": [],
        }

    # drills with no final state are skipped
    judged = [s for s in sims if s.outcome]
    defended = sum(1 for s in judged if s.outcome == "defended")
    breached = len(judged) - defended
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
        "drills_defended": defended,
        "drills_breached": breached,
        "defended_rate": round(defended / len(judged) * 100, 1) if judged else 0,
        "breach_rate": round(breached / len(judged) * 100, 1) if judged else 0,
        "breach_criterion": BREACH_CRITERION,
        "avg_blue_reward": round(avg_blue, 2),
        "defense_actions": def_actions,
        "recent_simulations": [{
            "id": s.id, "total_steps": s.total_steps,
            "red_reward": round(s.total_red_reward, 2),
            "blue_reward": round(s.total_blue_reward, 2),
            "outcome": s.outcome,
            "reason": s.reason,
        } for s in recent],
    }


def get_firewall_analysis(db: Session, sim_id: int):
    sim = db.query(Simulation).filter(Simulation.id == sim_id).first()
    if not sim:
        return None

    steps = db.query(SimulationStep).filter(
        SimulationStep.simulation_id == sim_id
    ).order_by(SimulationStep.step_number).all()

    if not steps:
        return {
            "simulation_id": sim_id,
            "total_firewall_rules": 0,
            "firewall_rules": [],
            "lateral_moves_blocked": 0,
            "recommended_rules": [],
        }

    firewall_rules = []   # edges removed by Blue isolate actions
    blocked_lateral = 0   # red lateral moves that failed because target was isolated
    prev_edges = None

    for s in steps:
        env = s.environment_state or {}
        curr_edges = set(tuple(sorted(e)) for e in env.get("edges", []))

        if prev_edges is not None:
            removed = prev_edges - curr_edges
            b = s.blue_action or {}
            if b.get("action") == "isolate" and removed:
                for edge in removed:
                    firewall_rules.append({
                        "step": s.step_number,
                        "host_a": edge[0],
                        "host_b": edge[1],
                        "rule": f"{edge[0]} ↔ {edge[1]}",
                        "blocked_by": b.get("target", "unknown"),
                    })

        # count red lateral moves that failed because target was isolated
        r = s.red_action or {}
        if r.get("action") == "lateral_move" and not r.get("success") and r.get("reason") == "target_isolated":
            blocked_lateral += 1

        prev_edges = curr_edges

    # unique edges that were blocked — recommend as permanent firewall rules
    seen = set()
    recommended = []
    for rule in firewall_rules:
        key = rule["rule"]
        if key not in seen:
            seen.add(key)
            recommended.append(key)

    return {
        "simulation_id": sim_id,
        "total_firewall_rules": len(firewall_rules),
        "firewall_rules": firewall_rules,
        "lateral_moves_blocked": blocked_lateral,
        "recommended_rules": recommended,
        "summary": f"Blue agent applied {len(seen)} unique firewall rules across {len(firewall_rules)} events, blocking {blocked_lateral} Red lateral movement attempts.",
    }


def get_ai_recommendations(db: Session, scenario_id: int):
    
    sims = db.query(Simulation).filter(
        Simulation.scenario_id == scenario_id,
        Simulation.status == SimulationStatus.COMPLETED
    ).all()

    if not sims:
        return None

    sim_ids = [s.id for s in sims]
    all_steps = db.query(SimulationStep).filter(
        SimulationStep.simulation_id.in_(sim_ids)
    ).all()

    # tally red targets and actions
    red_target_hits = {}   
    red_action_hits = {}   
    red_action_total = {}  
    blue_action_uses = {}
    lateral_targets = {}  

    for s in all_steps:
        ra = s.red_action or {}
        ba = s.blue_action or {}
        r_action = ra.get("action", "unknown")
        r_target = ra.get("target") or "unknown"
        b_action = ba.get("action", "unknown")

        # track red targeting
        red_target_hits[r_target] = red_target_hits.get(r_target, 0) + 1
        red_action_total[r_action] = red_action_total.get(r_action, 0) + 1

        # count what actually worked, not what earned training reward
        if ra.get("success"):
            red_action_hits[r_action] = red_action_hits.get(r_action, 0) + 1

        if b_action not in ("idle", "unknown"):
            blue_action_uses[b_action] = blue_action_uses.get(b_action, 0) + 1

        if r_action == "lateral_move":
            lateral_targets[r_target] = lateral_targets.get(r_target, 0) + 1

    n_sims = len(sims)
    n_steps = len(all_steps)

    # sort targets by hit count
    sorted_targets = sorted(red_target_hits.items(), key=lambda x: x[1], reverse=True)
    top_red_action = max(red_action_hits, key=red_action_hits.get) if red_action_hits else "exploit"
    top_blue_action = max(blue_action_uses, key=blue_action_uses.get) if blue_action_uses else "patch"

    # build recommendations list
    recs = []

    # 1. most targeted hosts — harden these first
    for host, hits in sorted_targets[:3]:
        if host == "unknown":
            continue
        pct = round(hits / n_steps * 100, 1)
        # figure out which action was most used against this host
        host_actions = {}
        for s in all_steps:
            ra = s.red_action or {}
            if ra.get("target") == host:
                a = ra.get("action", "unknown")
                host_actions[a] = host_actions.get(a, 0) + 1
        top_act = max(host_actions, key=host_actions.get) if host_actions else "exploit"
        priority = "CRITICAL" if pct > 20 else "HIGH" if pct > 10 else "MEDIUM"
        recs.append({
            "type": "host_hardening",
            "priority": priority,
            "title": f"Harden {host} — most targeted host",
            "detail": (
                f"Red agent attacked {host} in {hits}/{n_steps} steps ({pct}%) "
                f"across {n_sims} simulation(s). Primary technique: "
                f"{top_act.replace('_', ' ')}."
            ),
            "action": (
                f"Patch all CVEs on {host}. Restrict inbound connections. "
                f"Deploy host-based IDS. Counter: {top_act.replace('_', ' ')} → "
                + {"scan": "deploy IDS/NIDS", "exploit": "patch CVEs + WAF",
                   "escalate": "enforce least privilege", "lateral_move": "network isolation",
                   "exfiltrate": "DLP + data encryption"}.get(top_act, "apply vendor hardening")
                + "."
            ),
        })

    # 2. lateral movement targets — recommend firewall/isolation rules
    for host, hits in sorted(lateral_targets.items(), key=lambda x: x[1], reverse=True)[:3]:
        if host == "unknown":
            continue
        recs.append({
            "type": "firewall_rule",
            "priority": "HIGH",
            "title": f"Block lateral movement to {host}",
            "detail": (
                f"Red agent attempted lateral movement into {host} {hits} time(s). "
                f"This host is a key stepping-stone in the attack path."
            ),
            "action": (
                f"Apply firewall rule: DENY lateral connections to {host}. "
                f"Enable Blue agent 'isolate' action for this host. "
                f"Consider network micro-segmentation."
            ),
        })

    # 3. what the trained defender relied on most
    if top_blue_action and top_blue_action != "unknown":
        uses = blue_action_uses.get(top_blue_action, 0)
        recs.append({
            "type": "defense_strategy",
            "priority": "INFO",
            "title": f"AI defender's main response: '{top_blue_action.replace('_', ' ')}'",
            "detail": (
                f"The trained Blue agent used '{top_blue_action}' {uses} times across these drills, "
                "more than any other action. Run a security assessment to measure how much it helps."
            ),
            "action": (
                f"Automate '{top_blue_action.replace('_', ' ')}' in your SOAR playbook as first response. "
                + {"patch": "Set up auto-patching pipelines with a tested rollback plan.",
                   "isolate": "Integrate with firewall API to auto-quarantine suspicious hosts.",
                   "detect": "Feed alerts into SIEM and trigger playbook on signature match.",
                   "harden": "Apply CIS Benchmark hardening scripts on a scheduled basis.",
                   "restore": "Maintain offline backups and test restore procedures monthly.",
                   "deploy_firewall": "Turn on host firewalls on the most-attacked servers."
                   }.get(top_blue_action, "Document as standard operating procedure.")
            ),
        })

    # 4. most dangerous Red technique
    if top_red_action and top_red_action != "unknown":
        success = red_action_hits.get(top_red_action, 0)
        total = red_action_total.get(top_red_action, 0)
        hit_rate = round(success / total * 100, 1) if total else 0
        recs.append({
            "type": "threat_intel",
            "priority": "HIGH",
            "title": f"Top threat: '{top_red_action.replace('_', ' ')}' — {hit_rate}% success rate",
            "detail": (
                f"Red agent used '{top_red_action}' {total} time(s) with a "
                f"{hit_rate}% success rate. This was the attacker's most successful technique."
            ),
            "action": (
                "Deploy targeted countermeasures: "
                + {"scan": "deploy IDS/IPS to detect and block reconnaissance activity",
                   "exploit": "prioritize CVE patching — especially CRITICAL and HIGH severity",
                   "escalate": "enforce least-privilege and audit SUID/sudo configurations",
                   "lateral_move": "segment network and apply zero-trust between segments",
                   "exfiltrate": "enable DLP, encrypt sensitive data, monitor outbound traffic"
                   }.get(top_red_action, "apply vendor security recommendations")
                + "."
            ),
        })

    return {
        "scenario_id": scenario_id,
        "simulations_analyzed": n_sims,
        "total_steps_analyzed": n_steps,
        "stats": {
            "most_targeted_host": sorted_targets[0][0] if sorted_targets else "N/A",
            "top_red_technique": top_red_action,
            "top_blue_defense": top_blue_action,
            "lateral_move_targets": len(lateral_targets),
        },
        "recommendations": recs,
    }


def get_dashboard_stats(db: Session, user_id=None):
    sim_q       = db.query(func.count(Simulation.id))
    sim_done_q  = db.query(func.count(Simulation.id)).filter(Simulation.status == SimulationStatus.COMPLETED)
    train_q     = db.query(func.count(TrainingRun.id))
    train_done_q = db.query(func.count(TrainingRun.id)).filter(TrainingRun.status == TrainingStatus.COMPLETED)

    if user_id is not None:
        sim_q       = sim_q.filter(Simulation.user_id == user_id)
        sim_done_q  = sim_done_q.filter(Simulation.user_id == user_id)
        train_q     = train_q.filter(TrainingRun.user_id == user_id)
        train_done_q = train_done_q.filter(TrainingRun.user_id == user_id)

    return {
        "total_simulations": sim_q.scalar(),
        "completed_simulations": sim_done_q.scalar(),
        "total_training_runs": train_q.scalar(),
        "completed_training_runs": train_done_q.scalar(),
    }
