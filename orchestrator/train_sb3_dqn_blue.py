from __future__ import annotations

import sys
import os
import csv

from stable_baselines3 import DQN
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.callbacks import BaseCallback

from orchestrator.rl_env_blue import BlueRLEnvironment


def _topo_tag(path: str) -> str:
    return os.path.splitext(os.path.basename(path))[0]


class RewardLoggerCallback(BaseCallback):

    def __init__(self, verbose=0):
        super().__init__(verbose)
        self.episode_rewards = []

    def _on_step(self) -> bool:
        infos = self.locals.get("infos", [])
        for info in infos:
            if "episode" in info:
                self.episode_rewards.append(info["episode"]["r"])
        return True


def main():
    topology_path = sys.argv[1] if len(sys.argv) > 1 else "orchestrator/sample_topology.yaml"
    total_timesteps = int(sys.argv[2]) if len(sys.argv) > 2 else 10_000
    max_steps = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    topo = _topo_tag(topology_path)

    os.makedirs("results/models", exist_ok=True)
    os.makedirs("results/csv", exist_ok=True)

    env = Monitor(BlueRLEnvironment(topology_path, max_steps=max_steps))

    model = DQN(
        "MlpPolicy",
        env,
        learning_rate=1e-3,
        buffer_size=50_000,
        learning_starts=500,
        batch_size=64,
        gamma=0.99,
        target_update_interval=500,
        exploration_fraction=0.5,
        exploration_initial_eps=1.0,
        exploration_final_eps=0.05,
        verbose=1,
        tensorboard_log="./tb_logs/sb3_dqn_blue",
    )

    callback = RewardLoggerCallback()

    print(f"[SB3 DQN BLUE] Training for {total_timesteps} timesteps on {topology_path}...")
    model.learn(total_timesteps=total_timesteps, callback=callback)

    model_path = f"results/models/sb3_dqn_blue_{topo}"
    csv_path = f"results/csv/sb3_dqn_blue_{topo}.csv"

    model.save(model_path)
    print(f"[SB3 DQN BLUE] Model saved -> {model_path}.zip")

    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["episode", "reward", "topology"])
        for i, r in enumerate(callback.episode_rewards, start=1):
            writer.writerow([i, r, topo])

    print(f"[SB3 DQN BLUE] {len(callback.episode_rewards)} episodes logged -> {csv_path}")


if __name__ == "__main__":
    main()
