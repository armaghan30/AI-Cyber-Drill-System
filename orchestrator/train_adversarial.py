"""Train Red and Blue in rounds, against rule-based opponents or each other (self-play)."""
from __future__ import annotations

import argparse
import contextlib
import csv
import io
import json
import os
import random
import sys
import time

import numpy as np
import torch
from sb3_contrib import MaskablePPO
from sb3_contrib.common.wrappers import ActionMasker
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.monitor import Monitor

from orchestrator.adversarial import RANDOM, OpponentPool
from orchestrator.rl_env_red import RedRLEnvironment
from orchestrator.rl_env_blue import BlueRLEnvironment

# same hyperparameters as train_maskable_ppo_red.py / _blue.py
PPO_KWARGS = dict(learning_rate=3e-4, n_steps=128, batch_size=64, n_epochs=10,
                  gamma=0.99, gae_lambda=0.95, clip_range=0.2, ent_coef=0.01)


class EpisodeLog(BaseCallback):
    def __init__(self):
        super().__init__()
        self.rewards = []

    def _on_step(self):
        for info in self.locals.get("infos", []):
            if "episode" in info:
                self.rewards.append(info["episode"]["r"])
        return True


def _quiet():
    # the environments and rule-based agents print every action
    return contextlib.redirect_stdout(io.StringIO())


def _make_env(role, topology, max_steps, opponent):
    with _quiet():
        if role == "red":
            base = RedRLEnvironment(topology, max_steps=max_steps, blue_model=opponent)
        else:
            base = BlueRLEnvironment(topology, max_steps=max_steps, red_model=opponent)
    return Monitor(ActionMasker(base, lambda e: e.action_masks()))


def _log_rewards(path, rnd, rewards):
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["round", "episode", "reward"])
        for i, r in enumerate(rewards, 1):
            w.writerow([rnd, i, r])


def main(argv=None):
    p = argparse.ArgumentParser(description="Train Red and Blue agents")
    p.add_argument("topology")
    p.add_argument("--mode", choices=["rule", "selfplay"], required=True)
    p.add_argument("--rounds", type=int, default=5)
    p.add_argument("--steps", type=int, default=100_000, help="timesteps per agent per round")
    p.add_argument("--out", required=True)
    p.add_argument("--roles", default="red,blue", help="rule mode only: train a subset, e.g. 'red'")
    p.add_argument("--max-steps", type=int, default=20, help="episode length")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--threads", type=int, default=1)
    p.add_argument("--latest-weight", type=float, default=None,
                   help="self-play: probability of the newest opponent (default: uniform over the pool)")
    a = p.parse_args(argv)

    roles = a.roles.split(",")
    if a.mode == "selfplay" and roles != ["red", "blue"]:
        p.error("self-play needs both roles")

    random.seed(a.seed)
    np.random.seed(a.seed)
    torch.manual_seed(a.seed)
    torch.set_num_threads(a.threads)
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, f"config_{'_'.join(roles)}.json"), "w") as f:
        json.dump(vars(a), f, indent=1)

    snapshots = {"red": [RANDOM], "blue": [RANDOM]}  # self-play pools start from a random opponent
    models = {}
    t0 = time.time()

    for rnd in range(1, a.rounds + 1):
        for role in roles:
            other = "blue" if role == "red" else "red"
            opponent = OpponentPool(snapshots[other], a.latest_weight) if a.mode == "selfplay" else None
            env = _make_env(role, a.topology, a.max_steps, opponent)
            if role not in models:
                models[role] = MaskablePPO("MlpPolicy", env, seed=a.seed, verbose=0, **PPO_KWARGS)
            else:
                models[role].set_env(env)

            log = EpisodeLog()
            with _quiet():
                models[role].learn(total_timesteps=a.steps, callback=log, reset_num_timesteps=False)

            rdir = os.path.join(a.out, f"round_{rnd}")
            os.makedirs(rdir, exist_ok=True)
            path = os.path.join(rdir, f"{role}.zip")
            models[role].save(path)
            snapshots[role].append(path)
            _log_rewards(os.path.join(a.out, f"{role}_rewards.csv"), rnd, log.rewards)

            mean = float(np.mean(log.rewards)) if log.rewards else 0.0
            pool = len(snapshots[other]) if a.mode == "selfplay" else "rule-based"
            sys.stderr.write(f"[{a.mode}] round {rnd}/{a.rounds} {role}: {len(log.rewards)} episodes, "
                             f"mean reward {mean:.1f}, opponents {pool}, t={time.time() - t0:.0f}s\n")
            sys.stderr.flush()

    sys.stderr.write(f"[{a.mode}] DONE in {time.time() - t0:.0f}s\n")


if __name__ == "__main__":
    main()
