from __future__ import annotations

import csv
import os
import sys

from orchestrator.rl_env_blue import BlueRLEnvironment
from orchestrator.dqn_agent_blue import DQNAgentBlue


def _topo_tag(path: str) -> str:
    return os.path.splitext(os.path.basename(path))[0]


def main():
    topology_path = sys.argv[1] if len(sys.argv) > 1 else "orchestrator/sample_topology.yaml"
    num_episodes = int(sys.argv[2]) if len(sys.argv) > 2 else 500
    max_steps_per_episode = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    topo = _topo_tag(topology_path)

    os.makedirs("results/models", exist_ok=True)
    os.makedirs("results/csv", exist_ok=True)

    gamma = 0.99
    lr = 1e-3
    batch_size = 64
    buffer_capacity = 10_000
    epsilon_start = 1.0
    epsilon_end = 0.05
    epsilon_decay = 5_000
    target_update_freq = 500

    env = BlueRLEnvironment(topology_path, max_steps=max_steps_per_episode)
    state_vec, _ = env.reset()
    state_dim = state_vec.shape[0]
    action_dim = env.action_dim

    print(f"[BLUE TRAIN] state_dim={state_dim}, action_dim={action_dim}")

    agent = DQNAgentBlue(
        state_dim=state_dim,
        action_dim=action_dim,
        lr=lr,
        gamma=gamma,
        batch_size=batch_size,
        buffer_capacity=buffer_capacity,
        epsilon_start=epsilon_start,
        epsilon_end=epsilon_end,
        epsilon_decay=epsilon_decay,
        target_update_freq=target_update_freq,
    )

    episode_rewards = []

    for ep in range(1, num_episodes + 1):
        state, _ = env.reset()
        total_reward = 0.0

        print(f"[BLUE EPISODE {ep}/{num_episodes}] Starting...")

        for t in range(1, max_steps_per_episode + 1):
            action = agent.act(state)
            next_state, reward, terminated, truncated, info = env.step(action)

            done = terminated or truncated
            agent.store_transition(state, action, reward, next_state, done)
            agent.update()

            state = next_state
            total_reward += reward

            if done:
                break

        episode_rewards.append(total_reward)
        print(
            f"[BLUE EPISODE {ep}/{num_episodes}] "
            f"Finished in {t} steps | Total Reward = {total_reward:.2f} | Epsilon = {agent.epsilon:.3f}"
        )

    model_path = f"results/models/custom_dqn_blue_{topo}.pth"
    csv_path = f"results/csv/custom_dqn_blue_{topo}.csv"

    agent.save(model_path)
    print(f"[BLUE] Model saved -> {model_path}")

    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["episode", "reward", "topology"])
        for i, r in enumerate(episode_rewards, start=1):
            writer.writerow([i, r, topo])

    print(f"[BLUE] Training finished. Rewards saved -> {csv_path}")


if __name__ == "__main__":
    main()
