"""Evaluate saved Red/Blue snapshots against each other with drills."""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import random
import re
from collections import Counter

import numpy as np
import torch
from sb3_contrib import MaskablePPO

from orchestrator.adversarial import RANDOM, play_drill
from orchestrator.verdict import drill_outcome

FIXED = ("random", "rule-based script")


def _seed(s):
    random.seed(s)
    np.random.seed(s)
    torch.manual_seed(s)


def evaluate(topology, red, blue, episodes, steps):
    rows, red_mix = [], Counter()
    for ep in range(episodes):
        _seed(10_000 + ep)
        with contextlib.redirect_stdout(io.StringIO()):
            final_hosts, red_actions, _ = play_drill(topology, red, blue, steps=steps)
        rows.append(drill_outcome(final_hosts))
        red_mix.update(red_actions)
    total = sum(red_mix.values()) or 1
    return {
        "breach_rate_pct": round(100 * float(np.mean([r["outcome"] == "breached" for r in rows])), 1),
        "hosts_compromised": round(float(np.mean([r["hosts_compromised"] for r in rows])), 2),
        "hosts_exfiltrated": round(float(np.mean([r["hosts_exfiltrated"] for r in rows])), 2),
        "red_action_mix_pct": {k: round(100 * v / total, 1) for k, v in sorted(red_mix.items())},
    }


def _rounds(arm_dir):
    found = [int(m.group(1)) for d in os.listdir(arm_dir) if (m := re.fullmatch(r"round_(\d+)", d))]
    return sorted(found)


def _snapshots(arms, role, final_only):
    snaps = {"random": RANDOM, "rule-based script": None}
    for name, d in arms.items():
        rounds = _rounds(d)
        for k in (rounds[-1:] if final_only else rounds):
            path = f"{d}/round_{k}/{role}.zip"
            if os.path.exists(path):
                snaps[f"{name} {role.capitalize()} r{k}"] = MaskablePPO.load(path)
    return snaps


def main(argv=None):
    p = argparse.ArgumentParser(description="Evaluate trained Red/Blue snapshots")
    p.add_argument("topology")
    p.add_argument("--arm", action="append", required=True, help="name=dir, repeatable")
    p.add_argument("--episodes", type=int, default=100)
    p.add_argument("--steps", type=int, default=15, help="drill length (the app's posture test uses 15)")
    p.add_argument("--out", required=True)
    p.add_argument("--final-only", action="store_true", help="only each arm's last round (faster)")
    a = p.parse_args(argv)
    torch.set_num_threads(1)
    os.makedirs(a.out, exist_ok=True)
    arms = dict(x.split("=", 1) for x in a.arm)

    reds = _snapshots(arms, "red", a.final_only)
    blues = _snapshots(arms, "blue", a.final_only)

    matrix = {}
    for rn, red in reds.items():
        for bn, blue in blues.items():
            matrix.setdefault(rn, {})[bn] = r = evaluate(a.topology, red, blue, a.episodes, a.steps)
            print(f"[matrix] {rn} vs {bn}: breach {r['breach_rate_pct']}%", flush=True)
    br = lambda rn, bn: matrix[rn][bn]["breach_rate_pct"]

    learned_reds = [r for r in reds if r not in FIXED]
    learned_blues = [b for b in blues if b not in FIXED]
    curves = {name: [{"round": k, **matrix[f"{name} Red r{k}"][f"{name} Blue r{k}"]}
                     for k in _rounds(d)
                     if f"{name} Red r{k}" in matrix and f"{name} Blue r{k}" in blues]
              for name, d in arms.items()}
    red_scores = {rn: {"vs_random_blue": br(rn, "random"),
                       "mean_vs_learned_blues": round(float(np.mean([br(rn, b) for b in learned_blues])), 1)}
                  for rn in learned_reds}
    blue_scores = {bn: {"vs_rule_based_red": br("rule-based script", bn),
                        "mean_vs_learned_reds": round(float(np.mean([br(r, bn) for r in learned_reds])), 1),
                        "worst_vs_learned_reds": max(br(r, bn) for r in learned_reds)}
                   for bn in learned_blues}

    result = {"episodes": a.episodes, "steps": a.steps, "curves": curves, "matrix": matrix,
              "red_scores": red_scores, "blue_scores": blue_scores}
    with open(os.path.join(a.out, "evaluation.json"), "w") as f:
        json.dump(result, f, indent=1)

    # markdown summary
    finals = {name: _rounds(d)[-1] for name, d in arms.items()}
    fr = list(FIXED) + [f"{n} Red r{k}" for n, k in finals.items() if f"{n} Red r{k}" in reds]
    fb = list(FIXED) + [f"{n} Blue r{k}" for n, k in finals.items() if f"{n} Blue r{k}" in blues]
    lines = [f"Breach rate (%) over {a.episodes} drills of {a.steps} steps; rows = Red, columns = Blue.", "",
             "Final-round agents:", "",
             "| Red \\ Blue | " + " | ".join(fb) + " |", "|---" * (len(fb) + 1) + "|"]
    lines += [f"| {rn} | " + " | ".join(str(br(rn, bn)) for bn in fb) + " |" for rn in fr]
    lines += ["", "Learning curve (Red_k vs Blue_k of the same arm):", ""]
    lines += [f"- {name}: " + ", ".join(f"r{c['round']} {c['breach_rate_pct']}%" for c in curve)
              for name, curve in curves.items()]
    lines += ["", "Red snapshots (attack strength):", "",
              "| Red | vs random Blue | mean vs learned Blues |", "|---|---|---|"]
    lines += [f"| {rn} | {s['vs_random_blue']} | {s['mean_vs_learned_blues']} |" for rn, s in red_scores.items()]
    lines += ["", "Blue snapshots (robustness; lower is better):", "",
              "| Blue | vs rule-based Red | mean vs learned Reds | worst vs learned Reds |", "|---|---|---|---|"]
    lines += [f"| {bn} | {s['vs_rule_based_red']} | {s['mean_vs_learned_reds']} | {s['worst_vs_learned_reds']} |"
              for bn, s in blue_scores.items()]
    with open(os.path.join(a.out, "summary.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
