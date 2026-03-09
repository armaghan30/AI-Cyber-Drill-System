from __future__ import annotations

import sys
import numpy as np

from stable_baselines3 import PPO, DQN

from orchestrator.rl_env_red import RedRLEnvironment
from orchestrator.rl_env_blue import BlueRLEnvironment


ALGO_MAP = {"ppo": PPO, "dqn": DQN}
ENV_MAP = {"red": RedRLEnvironment, "blue": BlueRLEnvironment}


def main():
    agent_color = sys.argv[1] if len(sys.argv) > 1 else "red"
    algo_name = sys.argv[2] if len(sys.argv) > 2 else "ppo"
    model_path = sys.argv[3] if len(sys.argv) > 3 else f"sb3_{algo_name}_{agent_color}"
    topology_path = sys.argv[4] if len(sys.argv) > 4 else "orchestrator/sample_topology.yaml"
    num_episodes = int(sys.argv[5]) if len(sys.argv) > 5 else 10
    max_steps = 20

    if algo_name not in ALGO_MAP:
        print(f"Unknown algorithm: {algo_name}. Use 'ppo' or 'dqn'.")
        return

    if agent_color not in ENV_MAP:
        print(f"Unknown agent: {agent_color}. Use 'red' or 'blue'.")
        return

    AlgoClass = ALGO_MAP[algo_name]
    EnvClass = ENV_MAP[agent_color]

    env = EnvClass(topology_path, max_steps=max_steps)
    model = AlgoClass.load(model_path)

    print(f"\n{'='*60}")
    print(f"  SB3 {algo_name.upper()} {agent_color.upper()} EVALUATION")
    print(f"  Topology: {topology_path}")
    print(f"  Episodes: {num_episodes}")
    print(f"{'='*60}\n")

    all_rewards = []
    for ep in range(1, num_episodes + 1):
        obs, _ = env.reset()
        total_reward = 0.0
        done = False
        steps = 0

        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, info = env.step(int(action))
            total_reward += reward
            steps += 1
            done = terminated or truncated

        all_rewards.append(total_reward)
        print(f"  Episode {ep:3d}: Reward = {total_reward:8.2f}  ({steps} steps)")

    print(f"\n{'='*60}")
    print(f"  SUMMARY")
    print(f"  Mean reward : {np.mean(all_rewards):8.2f}")
    print(f"  Std reward  : {np.std(all_rewards):8.2f}")
    print(f"  Max reward  : {np.max(all_rewards):8.2f}")
    print(f"  Min reward  : {np.min(all_rewards):8.2f}")
    print(f"{'='*60}")

    env.close()


if __name__ == "__main__":
    main()
