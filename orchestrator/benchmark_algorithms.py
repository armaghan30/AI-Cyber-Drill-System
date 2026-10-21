"""
Controlled algorithm comparison: DQN vs PPO vs MaskablePPO.

All three algorithms are trained on the SAME topology, with the SAME timestep
budget, episode length and random seeds, then evaluated on the same fixed set
of evaluation episodes. This makes the rewards directly comparable (unlike
comparing runs on different network sizes).

Usage:
    python -m orchestrator.benchmark_algorithms <topology.yaml> <role: red|blue> <timesteps> [seeds=0,1,2] [eval_episodes=50] [--opponent model.zip]

Output:
    results/benchmark/benchmark_<role>_<topology>.csv   (one row per algorithm x seed)
"""
from __future__ import annotations

import argparse
import contextlib
import csv
import io
import os
import random
import time

import numpy as np
import torch
from stable_baselines3 import DQN, PPO
from stable_baselines3.common.monitor import Monitor
from sb3_contrib import MaskablePPO
from sb3_contrib.common.wrappers import ActionMasker

from orchestrator.rl_env_red import RedRLEnvironment
from orchestrator.rl_env_blue import BlueRLEnvironment
from orchestrator.verdict import is_breach

MAX_STEPS = 20
torch.set_num_threads(1)


def _quiet():
    # the rule-based opponent agents print every action; silence them during benchmark runs
    return contextlib.redirect_stdout(io.StringIO())


def _seed_all(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def _make_env(role, topology_path, opponent=None):
    # opponent: loaded model of the other side, or None for the rule-based agent
    if role == "red":
        return RedRLEnvironment(topology_path, max_steps=MAX_STEPS, blue_model=opponent)
    return BlueRLEnvironment(topology_path, max_steps=MAX_STEPS, red_model=opponent)


def _build_model(algo, env, seed):
    if algo == "dqn":
        # same hyperparameters as the original SB3 DQN training scripts
        return DQN("MlpPolicy", Monitor(env), learning_rate=1e-3, buffer_size=50_000,
                   learning_starts=500, batch_size=64, gamma=0.99,
                   target_update_interval=500, exploration_fraction=0.5,
                   exploration_initial_eps=1.0, exploration_final_eps=0.05,
                   seed=seed, verbose=0)
    ppo_kwargs = dict(learning_rate=3e-4, n_steps=128, batch_size=64, n_epochs=10,
                      gamma=0.99, gae_lambda=0.95, clip_range=0.2, ent_coef=0.01,
                      seed=seed, verbose=0)
    if algo == "ppo":
        return PPO("MlpPolicy", Monitor(env), **ppo_kwargs)
    masked = ActionMasker(env, lambda e: e.action_masks())
    return MaskablePPO("MlpPolicy", Monitor(masked), **ppo_kwargs)


def _host_outcomes(env):
    hosts = env.environment.hosts
    compromised = sum(1 for h in hosts.values() if h.is_compromised)
    exfiltrated = sum(1 for h in hosts.values() if h.data_exfiltrated)
    breached = is_breach({n: {"is_compromised": h.is_compromised, "data_exfiltrated": h.data_exfiltrated}
                          for n, h in hosts.items()})
    return compromised, exfiltrated, breached


def _evaluate(algo, model, role, topology_path, episodes, opponent=None):
    """Deterministic evaluation on a fixed list of episode seeds (identical for every algorithm)."""
    env = _make_env(role, topology_path, opponent)
    returns, compromised, exfiltrated, invalid, breaches = [], [], [], [], []
    for ep in range(episodes):
        _seed_all(10_000 + ep)
        obs, _ = env.reset()
        done, total, bad = False, 0.0, 0
        while not done:
            mask = env.action_masks()
            if algo == "maskable_ppo":
                action, _ = model.predict(obs, action_masks=mask, deterministic=True)
            else:
                action, _ = model.predict(obs, deterministic=True)
            action = int(action)
            if not mask[action]:
                bad += 1
            obs, reward, terminated, truncated, _ = env.step(action)
            total += reward
            done = terminated or truncated
        c, x, b = _host_outcomes(env)
        returns.append(total)
        compromised.append(c)
        exfiltrated.append(x)
        breaches.append(b)
        invalid.append(bad / MAX_STEPS)
    return (float(np.mean(returns)), float(np.mean(compromised)),
            float(np.mean(exfiltrated)), float(np.mean(invalid)), float(np.mean(breaches)))


def main(argv=None):
    p = argparse.ArgumentParser(description="DQN vs PPO vs MaskablePPO benchmark")
    p.add_argument("topology")
    p.add_argument("role", choices=["red", "blue"])
    p.add_argument("timesteps", type=int)
    p.add_argument("seeds", nargs="?", default="0,1,2")
    p.add_argument("eval_episodes", nargs="?", type=int, default=50)
    p.add_argument("--opponent", help="frozen MaskablePPO model of the other side (default: rule-based agent)")
    p.add_argument("--out", default="results/benchmark")
    p.add_argument("--algos", default="dqn,ppo,maskable_ppo")
    a = p.parse_args(argv)

    topology_path, role, timesteps, eval_episodes = a.topology, a.role, a.timesteps, a.eval_episodes
    seeds = [int(s) for s in a.seeds.split(",")]
    opponent = MaskablePPO.load(a.opponent) if a.opponent else None
    opponent_name = os.path.basename(a.opponent) if a.opponent else "rule-based"

    topo = os.path.splitext(os.path.basename(topology_path))[0]
    os.makedirs(a.out, exist_ok=True)
    out_path = os.path.join(a.out, f"benchmark_{role}_{topo}.csv")

    rows = []
    for algo in a.algos.split(","):
        for seed in seeds:
            _seed_all(seed)
            with _quiet():
                env = _make_env(role, topology_path, opponent)
                model = _build_model(algo, env, seed)
                start = time.time()
                model.learn(total_timesteps=timesteps)
                train_s = time.time() - start
                ret, comp, exf, inv, br = _evaluate(algo, model, role, topology_path, eval_episodes, opponent)
            row = dict(topology=topo, role=role, algorithm=algo, seed=seed, timesteps=timesteps,
                       eval_episodes=eval_episodes, opponent=opponent_name, mean_return=round(ret, 2),
                       mean_hosts_compromised=round(comp, 2), mean_hosts_exfiltrated=round(exf, 2),
                       breach_rate=round(br, 3), invalid_action_rate=round(inv, 3),
                       train_seconds=round(train_s, 1))
            rows.append(row)
            print(row, flush=True)
            with open(out_path, "w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
                w.writeheader()
                w.writerows(rows)

    print(f"\nSaved -> {out_path}")


if __name__ == "__main__":
    main()
