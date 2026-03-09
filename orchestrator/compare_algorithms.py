from __future__ import annotations

import os
import sys
import csv
import time
import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from stable_baselines3 import PPO, DQN as SB3_DQN
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.callbacks import BaseCallback

from orchestrator.rl_env_red import RedRLEnvironment
from orchestrator.dqn_agent_red import DQNAgentRed


def _topo_tag(path: str) -> str:

    return os.path.splitext(os.path.basename(path))[0]


#-----------------------------------------------

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


# ----------------Training functions---------------------

def train_custom_dqn(topology_path, num_episodes, max_steps):
    env = RedRLEnvironment(topology_path, max_steps=max_steps)
    state_vec, _ = env.reset()
    state_dim = state_vec.shape[0]
    action_dim = env.action_dim

    agent = DQNAgentRed(
        state_dim=state_dim,
        action_dim=action_dim,
        lr=1e-3,
        gamma=0.99,
        batch_size=64,
        buffer_capacity=10_000,
        epsilon_start=1.0,
        epsilon_end=0.05,
        epsilon_decay=5_000,
        target_update_freq=500,
    )

    episode_rewards = []
    start = time.time()

    for ep in range(num_episodes):
        state, _ = env.reset()
        total_reward = 0.0
        for t in range(max_steps):
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

    elapsed = time.time() - start
    return episode_rewards, agent, elapsed


def train_sb3_dqn(topology_path, total_timesteps, max_steps):
    env = Monitor(RedRLEnvironment(topology_path, max_steps=max_steps))
    model = SB3_DQN(
        "MlpPolicy", env, verbose=0,
        learning_rate=1e-3,
        buffer_size=50_000,
        learning_starts=500,
        batch_size=64,
        gamma=0.99,
        target_update_interval=500,
        exploration_fraction=0.5,
        exploration_initial_eps=1.0,
        exploration_final_eps=0.05,
    )
    callback = RewardLoggerCallback()
    start = time.time()
    model.learn(total_timesteps=total_timesteps, callback=callback)
    elapsed = time.time() - start
    return callback.episode_rewards, model, elapsed


def train_sb3_ppo(topology_path, total_timesteps, max_steps):
    env = Monitor(RedRLEnvironment(topology_path, max_steps=max_steps))
    model = PPO(
        "MlpPolicy", env, verbose=0,
        learning_rate=3e-4,
        n_steps=128,
        batch_size=64,
        n_epochs=10,
        gamma=0.99,
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.01,
    )
    callback = RewardLoggerCallback()
    start = time.time()
    model.learn(total_timesteps=total_timesteps, callback=callback)
    elapsed = time.time() - start
    return callback.episode_rewards, model, elapsed


# -------------------Evaluation functions------------------------------------

def evaluate_custom_dqn(agent, topology_path, max_steps, num_episodes=20):
    env = RedRLEnvironment(topology_path, max_steps=max_steps)
    rewards = []
    for _ in range(num_episodes):
        obs, _ = env.reset()
        total = 0.0
        done = False
        while not done:
            action = agent.act(obs, eval_mode=True)
            obs, r, terminated, truncated, _ = env.step(action)
            total += r
            done = terminated or truncated
        rewards.append(total)
    return rewards


def evaluate_sb3_model(model, topology_path, max_steps, num_episodes=20):
    env = RedRLEnvironment(topology_path, max_steps=max_steps)
    rewards = []
    for _ in range(num_episodes):
        obs, _ = env.reset()
        total = 0.0
        done = False
        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, r, terminated, truncated, _ = env.step(int(action))
            total += r
            done = terminated or truncated
        rewards.append(total)
    return rewards


# -------------------------Plotting------------------------------

def smooth(data, window=10):
    if len(data) < window:
        return data
    return np.convolve(data, np.ones(window) / window, mode="valid").tolist()


def main():
    topology_path = sys.argv[1] if len(sys.argv) > 1 else "orchestrator/sample_topology.yaml"
    num_episodes = int(sys.argv[2]) if len(sys.argv) > 2 else 300
    max_steps = 20
    topo = _topo_tag(topology_path)

    os.makedirs("results/csv", exist_ok=True)
    os.makedirs("results/plots", exist_ok=True)

    total_timesteps = num_episodes * max_steps

    print("=" * 60)
    print("  ALGORITHM COMPARISON: Custom DQN vs SB3 DQN")
    print(f"  Topology: {topology_path} ({topo})")
    print(f"  Episodes: {num_episodes} | Timesteps: {total_timesteps}")
    print("=" * 60)

    # --- Train algorithms ---
    print("\n[1/2] Training Custom DQN...")
    custom_rewards, custom_agent, custom_time = train_custom_dqn(
        topology_path, num_episodes, max_steps
    )
    print(f"       Done in {custom_time:.1f}s ({len(custom_rewards)} episodes)")

    print(f"\n[2/2] Training SB3 DQN ({total_timesteps} timesteps)...")
    sb3_dqn_rewards, sb3_dqn_model, sb3_dqn_time = train_sb3_dqn(
        topology_path, total_timesteps, max_steps
    )
    print(f"       Done in {sb3_dqn_time:.1f}s ({len(sb3_dqn_rewards)} episodes)")

    
    # --- FIGURE 1: Training reward curves ---
    plt.style.use("seaborn-v0_8-whitegrid")
    fig, ax = plt.subplots(figsize=(12, 6))

    window = max(10, num_episodes // 30)

    if custom_rewards:
        s = smooth(custom_rewards, window)
        ax.plot(range(len(s)), s, label="Custom DQN", linewidth=2, color="#2ecc71")

    if sb3_dqn_rewards:
        s = smooth(sb3_dqn_rewards, window)
        ax.plot(range(len(s)), s, label="SB3 DQN", linewidth=2, color="#3498db")

    

    ax.set_title(f"Red Agent Training: Reward Convergence ({topo})", fontsize=14, fontweight="bold")
    ax.set_xlabel("Episode", fontsize=12)
    ax.set_ylabel(f"Episode Reward (smoothed, window={window})", fontsize=12)
    ax.legend(fontsize=11)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    curve_path = f"results/plots/comparison_reward_curves_{topo}.png"
    plt.savefig(curve_path, dpi=300)
    plt.close()
    print(f"\nSaved -> {curve_path}")

    # --- Evaluate ---
    print("\nEvaluating trained models (20 episodes each)...")
    custom_eval = evaluate_custom_dqn(custom_agent, topology_path, max_steps)
    sb3_dqn_eval = evaluate_sb3_model(sb3_dqn_model, topology_path, max_steps)

    # NOTE: PPO eval will be added in final evaluation
    # sb3_ppo_eval = evaluate_sb3_model(sb3_ppo_model, topology_path, max_steps)

    # --- FIGURE 2: Box plot ---
    fig2, ax2 = plt.subplots(figsize=(8, 6))
    eval_data = [custom_eval, sb3_dqn_eval]
    eval_labels = ["Custom DQN", "SB3 DQN"]

    bp = ax2.boxplot(eval_data, labels=eval_labels, patch_artist=True, widths=0.5)
    colors = ["#2ecc71", "#3498db"]
    for patch, color in zip(bp["boxes"], colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.7)

    ax2.set_title(f"Evaluation Performance Comparison ({topo})", fontsize=14, fontweight="bold")
    ax2.set_ylabel("Total Episode Reward", fontsize=12)
    ax2.grid(True, alpha=0.3, axis="y")
    plt.tight_layout()
    box_path = f"results/plots/comparison_boxplot_{topo}.png"
    plt.savefig(box_path, dpi=300)
    plt.close()
    print(f"Saved -> {box_path}")

    # --- Summary table ---
    all_results = [
        ("Custom DQN", custom_rewards, custom_eval, custom_time),
        ("SB3 DQN", sb3_dqn_rewards, sb3_dqn_eval, sb3_dqn_time),
        # ("SB3 PPO", sb3_ppo_rewards, sb3_ppo_eval, sb3_ppo_time),  # Final eval
    ]

    print("\n" + "=" * 80)
    print(f"{'Algorithm':<15} {'Train Eps':<12} {'Train Mean':<12} "
          f"{'Eval Mean':<12} {'Eval Std':<10} {'Time (s)':<10}")
    print("-" * 80)

    for name, train_r, eval_r, t in all_results:
        print(
            f"{name:<15} {len(train_r):<12} {np.mean(train_r):<12.2f} "
            f"{np.mean(eval_r):<12.2f} {np.std(eval_r):<10.2f} {t:<10.1f}"
        )

    print("=" * 80)

    # --- Save summary CSV ---
    csv_path = f"results/csv/comparison_summary_{topo}.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "algorithm", "topology", "train_episodes", "train_mean_reward",
            "train_std_reward", "eval_mean_reward", "eval_std_reward",
            "eval_max_reward", "eval_min_reward", "training_time_s",
        ])
        for name, train_r, eval_r, t in all_results:
            writer.writerow([
                name, topo, len(train_r),
                f"{np.mean(train_r):.2f}", f"{np.std(train_r):.2f}",
                f"{np.mean(eval_r):.2f}", f"{np.std(eval_r):.2f}",
                f"{np.max(eval_r):.2f}", f"{np.min(eval_r):.2f}",
                f"{t:.1f}",
            ])

    print(f"\nSaved -> {csv_path}")
    print("\nDone! Check results/plots/ for your FYP report charts.")


if __name__ == "__main__":
    main()
