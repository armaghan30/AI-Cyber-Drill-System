"""Security assessment: run many drills and measure how often the network is breached."""
from __future__ import annotations

import math
import random
import secrets
from collections import Counter, defaultdict
from typing import Any, Callable, Dict, Optional

import numpy as np

from orchestrator.action_masks import red_action_mask, blue_action_mask
from orchestrator.adversarial import act, decode_blue_action, decode_red_action, load_policy
from orchestrator.state_vectors import flatten_red_state, flatten_blue_state
from orchestrator.verdict import BREACH_CRITERION, NIST_CITATION, drill_outcome, nist_likelihood

CURRENT_SECURITY = "current_security"
AI_DEFENCE = "ai_defence"
MODE_LABELS = {
    CURRENT_SECURITY: "Current security (no active defence)",
    AI_DEFENCE: "With AI defence (trained Blue agent)",
}

DEFAULT_DRILLS = 30
DEFAULT_STEPS = 15
TOP_N = 5


def wilson_interval(breaches, drills, z=1.96):
    """95% Wilson interval for the breach rate, in percent."""
    if drills <= 0:
        return 0.0, 0.0
    p = breaches / drills
    denom = 1 + z * z / drills
    centre = (p + z * z / (2 * drills)) / denom
    half = z * math.sqrt(p * (1 - p) / drills + z * z / (4 * drills * drills)) / denom
    return round(max(0.0, centre - half) * 100, 1), round(min(1.0, centre + half) * 100, 1)


def seed_everything(seed):
    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch
        torch.manual_seed(seed)
    except ImportError:
        pass


def run_drill(topology_path, red, blue=None, steps=DEFAULT_STEPS, deterministic=False):
    """One drill. If blue is None, Blue stays idle the whole time."""
    from orchestrator.orchestrator_core import Orchestrator

    orch = Orchestrator(topology_path)
    orch.load_topology()
    orch.build_environment()
    orch.init_red_agent()
    orch.init_blue_agent()
    env, hosts = orch.environment, list(orch.environment.hosts)
    trace, ever_compromised = [], set()

    for step in range(1, steps + 1):
        red_obs = flatten_red_state(orch.get_red_state(), hosts)
        red_mask = red_action_mask(env, hosts, orch.red_agent)
        red_action = decode_red_action(orch.red_agent, hosts, act(red, red_obs, red_mask, deterministic))

        if blue is None:
            blue_action = {"action": "idle", "target": None}
        else:
            blue_obs = flatten_blue_state(orch.get_blue_state(), hosts)
            blue_mask = blue_action_mask(env, hosts)
            blue_action = decode_blue_action(orch.blue_agent, hosts, act(blue, blue_obs, blue_mask, deterministic))

        env.step(red_action, blue_action)
        ever_compromised.update(n for n, h in env.hosts.items() if h.is_compromised)
        trace.append({"step": step, "red": _red_record(red_action), "blue": _blue_record(blue_action)})

    final_hosts = {n: {"is_compromised": h.is_compromised, "data_exfiltrated": h.data_exfiltrated}
                   for n, h in env.hosts.items()}
    return {"trace": trace, "final_hosts": final_hosts, "ever_compromised": sorted(ever_compromised)}


def _red_record(action):
    rec = {"action": action.get("action", "idle"), "target": action.get("target"),
           "success": bool(action.get("success", False))}
    if rec["action"] == "exploit" and rec["success"] and action.get("vulnerabilities"):
        rec["cve"] = action["vulnerabilities"][0]  # env removes this one on success
    for key in ("reason", "source"):
        if action.get(key):
            rec[key] = action[key]
    return rec


def _blue_record(action):
    rec = {"action": action.get("action", "idle"), "target": action.get("target")}
    if rec["action"] == "detect":
        rec["detected"] = bool(action.get("detected", False))
    return rec


def summarise_mode(mode, drills):
    n = len(drills)
    outcomes = [drill_outcome(d["final_hosts"]) for d in drills]
    breaches = sum(1 for o in outcomes if o["outcome"] == "breached")
    rate = round(breaches / n * 100, 1) if n else 0.0
    low, high = wilson_interval(breaches, n)

    compromised_in, exfiltrated_in = Counter(), Counter()
    cve_drills, cve_exploits, cve_hosts = Counter(), Counter(), defaultdict(set)
    for d in drills:
        compromised_in.update(d["ever_compromised"])
        exfiltrated_in.update(h for h, s in d["final_hosts"].items() if s["data_exfiltrated"])
        used = set()
        for s in d["trace"]:
            cve = s["red"].get("cve")
            if cve:
                cve_exploits[cve] += 1
                cve_hosts[cve].add(s["red"]["target"])
                used.add(cve)
        cve_drills.update(used)

    top_hosts = sorted(compromised_in, key=lambda h: (-compromised_in[h], -exfiltrated_in[h], h))[:TOP_N]
    top_cves = sorted(cve_drills, key=lambda c: (-cve_drills[c], -cve_exploits[c], c))[:TOP_N]

    def _mean(key):
        return round(sum(o[key] for o in outcomes) / n, 2) if n else 0.0

    return {
        "mode": mode,
        "label": MODE_LABELS[mode],
        "drills": n,
        "breaches": breaches,
        "defended": n - breaches,
        "breach_rate": rate,
        "ci95": {"low": low, "high": high},
        "nist": nist_likelihood(rate),
        "hosts_total": outcomes[0]["hosts_total"] if outcomes else 0,
        "mean_hosts_compromised": _mean("hosts_compromised"),
        "mean_hosts_exfiltrated": _mean("hosts_exfiltrated"),
        "top_hosts": [{"host": h, "compromised_drills": compromised_in[h], "exfiltrated_drills": exfiltrated_in[h]}
                      for h in top_hosts],
        "top_cves": [{"cve": c, "drills": cve_drills[c], "exploits": cve_exploits[c], "hosts": sorted(cve_hosts[c])}
                     for c in top_cves],
    }


def run_assessment(topology_path, red, blue=None, drills=DEFAULT_DRILLS, steps=DEFAULT_STEPS,
                   modes=(CURRENT_SECURITY, AI_DEFENCE), seed: Optional[int] = None,
                   progress: Optional[Callable[[int, int], None]] = None) -> Dict[str, Any]:
    if red is None:
        raise ValueError("The assessment needs a trained Red attacker")
    if AI_DEFENCE in modes and blue is None:
        raise ValueError("The ai_defence mode needs a trained Blue model")
    unknown = set(modes) - set(MODE_LABELS)
    if unknown:
        raise ValueError(f"Unknown assessment mode(s): {sorted(unknown)}")
    red, blue = load_policy(red), load_policy(blue)
    # loading a model resets the random seed, so reseed after loading
    seed_everything(seed if seed is not None else secrets.randbits(32))
    total, done = drills * len(modes), 0
    result = {
        "drills_per_mode": drills,
        "steps": steps,
        "breach_criterion": BREACH_CRITERION,
        "citation": NIST_CITATION,
        "seed": seed,
        "modes": {},
    }
    for mode in modes:
        runs = []
        for _ in range(drills):
            runs.append(run_drill(topology_path, red, blue if mode == AI_DEFENCE else None, steps))
            done += 1
            if progress:
                progress(done, total)
        summary = summarise_mode(mode, runs)
        summary["runs"] = runs
        result["modes"][mode] = summary

    if CURRENT_SECURITY in result["modes"] and AI_DEFENCE in result["modes"]:
        result["breach_rate_reduction"] = round(
            result["modes"][CURRENT_SECURITY]["breach_rate"] - result["modes"][AI_DEFENCE]["breach_rate"], 1)
    return result
