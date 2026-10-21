"""What-if hardening: apply the top fixes to a copy of the network and assess it again."""
from __future__ import annotations

import copy
import os
import shutil
import tempfile

import yaml

from orchestrator.assessment import AI_DEFENCE, CURRENT_SECURITY, DEFAULT_DRILLS, DEFAULT_STEPS, run_assessment
from orchestrator.playbook import host_damage
from orchestrator.yaml_loader import YAMLLoader

DEFAULT_FIXES = 10
CAVEAT = ("This shows how well the fixes stop the attacks found in this assessment. "
          "An attacker who studies the hardened network may still find other paths.")
METRICS = ("drills", "breaches", "breach_rate", "ci95", "nist", "mean_hosts_compromised",
           "mean_hosts_exfiltrated", "top_hosts")


def select_fixes(result, playbook, topology, k=DEFAULT_FIXES):
    runs = result["modes"][CURRENT_SECURITY]["runs"]
    n = len(runs)
    compromised, stolen = host_damage(runs)
    hosts = topology["network"]["hosts"]
    playbook = playbook or {}

    # hosts the trained defender went for, in its own order, with what it did most there
    blue_order, blue_actions = [], {}
    for item in playbook.get("immediate", []) + playbook.get("hardening", []):
        h = item["host"]
        if h not in blue_order:
            blue_order.append(h)
        acts = item.get("actions") or {item.get("action"): item.get("drills", 1)}
        blue_actions.setdefault(h, {}).update(acts)

    # Red got in through a CVE here, so patching is the fix; a firewall only helps against moving sideways
    ai_runs = result["modes"].get(AI_DEFENCE, {}).get("runs", [])
    exploited = {s["red"]["target"] for d in runs + ai_runs for s in d["trace"] if s["red"].get("cve")}

    # one fix per host
    candidates = []
    for h in sorted(exploited | set(blue_order)):
        cfg = hosts.get(h)
        if cfg is None:
            continue
        cves = list(cfg.get("vulnerabilities") or [])
        acts = blue_actions.get(h, {})
        main = max(acts, key=acts.get) if acts else None
        if cves and (h in exploited or main in ("patch", "harden")):
            candidates.append(("patch", h, cves))
        elif "deploy_firewall" in acts and not cfg.get("firewall_active"):
            candidates.append(("firewall", h, []))

    def rank(c):
        kind, h, _ = c
        blue_rank = blue_order.index(h) if h in blue_order else len(blue_order)
        return (-(compromised[h] + stolen[h]), blue_rank, kind != "patch", h)

    fixes = []
    for kind, h, cves in sorted(candidates, key=rank)[:k]:
        c, s = compromised[h], stolen[h]
        if c or s:
            reason = f"compromised in {c}/{n} drills, data stolen in {s}/{n} with no active defence"
        else:
            reason = "chosen early by the AI defender"
        advice = f"Patch {h} ({', '.join(cves)})" if kind == "patch" else f"Turn on the firewall on {h}"
        fixes.append({"kind": kind, "host": h, "cves": cves, "compromised": c, "stolen": s,
                      "reason": reason, "advice": advice})
    return fixes


def apply_fixes(topology, fixes):
    hardened = copy.deepcopy(topology)
    hosts = hardened["network"]["hosts"]
    for f in fixes:
        if f["kind"] == "patch":
            hosts[f["host"]]["vulnerabilities"] = []
        elif f["kind"] == "firewall":
            hosts[f["host"]]["firewall_active"] = True
    return hardened


def remaining_entry_points(topology):
    """Internet-facing hosts that still have known CVEs, so an attacker can still get in there."""
    from orchestrator.env_builder import Environment

    env = Environment(topology)
    return [{"host": h.name, "cves": list(h.vulnerabilities), "firewall": h.firewall_active,
             "sensitivity": h.sensitivity}
            for h in env.hosts.values() if h.exposed and h.vulnerabilities]


def _metrics(summary):
    return {k: summary[k] for k in METRICS}


def _entry_note(entry):
    if not entry:
        return "No internet-facing host has a known CVE left after these fixes."
    names = ", ".join(e["host"] for e in entry)
    return (f"{len(entry)} internet-facing host(s) still have known CVEs ({names}). "
            "An attacker could still try to get in there.")


def run_what_if(topology_path, red, result, playbook, k=DEFAULT_FIXES, drills=DEFAULT_DRILLS,
                steps=DEFAULT_STEPS, seed=None, progress=None):
    topology = YAMLLoader(topology_path).parse()
    fixes = select_fixes(result, playbook, topology, k)
    before = _metrics(result["modes"][CURRENT_SECURITY])
    hardened = apply_fixes(topology, fixes)
    entry = remaining_entry_points(hardened)
    out = {"fixes_requested": k, "fixes": fixes, "before": before, "after": None, "caveat": CAVEAT,
           "remaining_entry_points": entry, "entry_points_note": _entry_note(entry)}
    if not fixes:
        return out

    tmp = tempfile.mkdtemp(prefix="whatif_")
    try:
        path = os.path.join(tmp, os.path.basename(topology_path))
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(hardened, f, sort_keys=False)
        after = run_assessment(path, red, None, drills=drills, steps=steps, modes=(CURRENT_SECURITY,),
                               seed=seed, progress=progress)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    out["after"] = _metrics(after["modes"][CURRENT_SECURITY])
    out["breach_rate_change"] = round(out["after"]["breach_rate"] - before["breach_rate"], 1)
    return out
