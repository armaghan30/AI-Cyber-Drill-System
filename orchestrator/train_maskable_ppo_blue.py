from __future__ import annotations

import sys
import os
import csv

from sb3_contrib import MaskablePPO
from sb3_contrib.common.wrappers import ActionMasker
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.callbacks import BaseCallback

from orchestrator.rl_env_blue import BlueRLEnvironment


def _topo_tag(path):
    return os.path.splitext(os.path.basename(path))[0]


def mask_fn(env):
    return env.action_masks()


class RewardLoggerCallback(BaseCallback):

    def __init__(self, verbose=0):
        super().__init__(verbose)
        self.episode_rewards = []

    def _on_step(self):
        for info in self.locals.get("infos", []):
            if "episode" in info:
                self.episode_rewards.append(info["episode"]["r"])
        return True


def main():
    topology_path = sys.argv[1] if len(sys.argv) > 1 else "orchestrator/baselines/demo_corporate_network.yaml"
    total_timesteps = int(sys.argv[2]) if len(sys.argv) > 2 else 50_000
    max_steps = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    # optional: trained Red model to train against (default: rule-based Red)
    red_model_path = sys.argv[4] if len(sys.argv) > 4 else None
    topo = _topo_tag(topology_path)

    os.makedirs("results/models", exist_ok=True)
    os.makedirs("results/csv", exist_ok=True)

    base_env = BlueRLEnvironment(topology_path, max_steps=max_steps, red_model=red_model_path)
    if red_model_path:
        print(f"[MaskablePPO BLUE] Opponent: trained Red model {red_model_path}")
    env = Monitor(ActionMasker(base_env, mask_fn))

    model = MaskablePPO(
        "MlpPolicy",
        env,
        learning_rate=3e-4,
        n_steps=128,
        batch_size=64,
        n_epochs=10,
        gamma=0.99,
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.01,
        verbose=1,
    )

    callback = RewardLoggerCallback()

    print(f"[MaskablePPO BLUE] Training for {total_timesteps} timesteps on {topology_path}...")
    model.learn(total_timesteps=total_timesteps, callback=callback)

    model_path = f"results/models/maskable_ppo_blue_{topo}"
    csv_path = f"results/csv/maskable_ppo_blue_{topo}.csv"

    model.save(model_path)
    print(f"[MaskablePPO BLUE] Model saved -> {model_path}.zip")

    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["episode", "reward", "topology"])
        for i, r in enumerate(callback.episode_rewards, start=1):
            writer.writerow([i, r, topo])

    print(f"[MaskablePPO BLUE] {len(callback.episode_rewards)} episodes logged -> {csv_path}")


if __name__ == "__main__":
    main()
