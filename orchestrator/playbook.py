"""AI defence playbook: what the trained Blue agent did in the assessment drills, and how much it helped."""
from __future__ import annotations

from collections import Counter, defaultdict
from statistics import median

from orchestrator.assessment import AI_DEFENCE, CURRENT_SECURITY

PROTECT = ("deploy_firewall", "patch", "harden")
RESPONSE = ("detect", "isolate", "restore")
EARLY_STEPS = 3
ADVICE = {"deploy_firewall": "Deploy a firewall on {}", "patch": "Patch {}", "harden": "Harden {}"}


def load_host_info(topology_path):
    from orchestrator.env_builder import Environment
    from orchestrator.yaml_loader import YAMLLoader

    env = Environment(YAMLLoader(topology_path).parse())
    return {n: {"os": h.os, "services": list(h.services), "sensitivity": h.sensitivity, "exposed": bool(h.exposed)}
            for n, h in env.hosts.items()}


def host_damage(runs):
    compromised, stolen = Counter(), Counter()
    for d in runs:
        compromised.update(d["ever_compromised"])
        stolen.update(h for h, s in d["final_hosts"].items() if s["data_exfiltrated"])
    return compromised, stolen


def _immediate(runs, top):
    drills, steps = Counter(), defaultdict(list)
    for d in runs:
        seen = set()
        for s in d["trace"][:EARLY_STEPS]:
            key = (s["blue"]["action"], s["blue"]["target"])
            if key[0] == "idle" or key in seen:
                continue
            seen.add(key)
            drills[key] += 1
            steps[key].append(s["step"])
    items = []
    for (action, host), count in sorted(drills.items(), key=lambda kv: (-kv[1], median(steps[kv[0]])))[:top]:
        items.append({"action": action, "host": host, "drills": count, "typical_step": int(median(steps[(action, host)])),
                      "advice": ADVICE.get(action, action.capitalize() + " {}").format(host)})
    return items


def _hardening(runs, before, after, host_info, top):
    per_host, first_step = defaultdict(Counter), defaultdict(list)
    for d in runs:
        done = defaultdict(set)
        for s in d["trace"]:
            a, h = s["blue"]["action"], s["blue"]["target"]
            if a in PROTECT and a not in done[h]:
                done[h].add(a)
                if len(done[h]) == 1:
                    first_step[h].append(s["step"])
        for h, actions in done.items():
            per_host[h]["_drills"] += 1
            per_host[h].update(actions)

    items = []
    for h in sorted(per_host, key=lambda h: (-per_host[h]["_drills"], median(first_step[h]), h))[:top]:
        actions = {a: per_host[h][a] for a in PROTECT if per_host[h][a]}
        main = max(actions, key=actions.get)
        item = {"host": h, "drills": per_host[h]["_drills"], "actions": actions,
                "typical_first_step": int(median(first_step[h])),
                "compromised_after": after[0][h], "stolen_after": after[1][h],
                "advice": ADVICE[main].format(h)}
        if before:
            item["compromised_before"], item["stolen_before"] = before[0][h], before[1][h]
        item.update(host_info.get(h, {}))
        items.append(item)
    return items


def _incident_response(runs):
    total = sum(len(d["trace"]) for d in runs)
    counts = Counter(s["blue"]["action"] for d in runs for s in d["trace"] if s["blue"]["action"] in RESPONSE)
    detections = followed_up = responses = still_stolen = 0
    for d in runs:
        trace = d["trace"]
        for i, s in enumerate(trace):
            b = s["blue"]
            if b["action"] == "detect" and b.get("detected"):
                detections += 1
                later = trace[i + 1:i + 1 + EARLY_STEPS]
                if any(t["blue"]["target"] == b["target"] and t["blue"]["action"] in ("isolate", "restore") for t in later):
                    followed_up += 1
            if b["action"] in ("isolate", "restore"):
                responses += 1
                if d["final_hosts"].get(b["target"], {}).get("data_exfiltrated"):
                    still_stolen += 1

    used = sum(counts.values())
    if used == 0:
        note = f"The trained defender never used detect, isolate or restore in {total} steps; it relied on prevention."
    elif used / total < 0.05:
        note = f"The trained defender relied mostly on prevention; detect, isolate or restore were used in {used} of {total} steps."
    else:
        note = f"Detect, isolate or restore were used in {used} of {total} steps."
    return {"steps_total": total, "counts": {a: counts[a] for a in RESPONSE}, "detections": detections,
            "detections_followed_up": followed_up, "isolate_or_restore": responses,
            "data_stolen_anyway": still_stolen, "note": note}


def _gaps(runs, after, protected, host_info, top):
    cves = defaultdict(Counter)
    for d in runs:
        for s in d["trace"]:
            if s["red"].get("cve"):
                cves[s["red"]["target"]][s["red"]["cve"]] += 1
    compromised, stolen = after
    hosts = sorted(compromised, key=lambda h: (-stolen[h], -compromised[h], h))[:top]
    items = []
    for h in hosts:
        used = [c for c, _ in cves[h].most_common()]
        item = {"host": h, "compromised": compromised[h], "stolen": stolen[h], "protected_drills": protected.get(h, 0),
                "cves_used": used,
                "advice": f"Patch {', '.join(used)} on {h}" if used else f"Limit access to {h} from compromised neighbours"}
        item.update(host_info.get(h, {}))
        items.append(item)
    return items


def build_playbook(result, host_info=None, top=5, top_hardening=10):
    """Returns None when the result has no AI-defence drill traces."""
    modes = (result or {}).get("modes", {})
    ai = modes.get(AI_DEFENCE)
    if not ai or not ai.get("runs"):
        return None
    runs, host_info = ai["runs"], host_info or {}
    cur = modes.get(CURRENT_SECURITY)
    before = host_damage(cur["runs"]) if cur and cur.get("runs") else None
    after = host_damage(runs)

    hardening = _hardening(runs, before, after, host_info, None)
    protected = {i["host"]: i["drills"] for i in hardening}
    return {
        "drills": len(runs),
        "immediate": _immediate(runs, top),
        "hardening": hardening[:top_hardening],
        "incident_response": _incident_response(runs),
        "gaps": _gaps(runs, after, protected, host_info, top_hardening),
    }
