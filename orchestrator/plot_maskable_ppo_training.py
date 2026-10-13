
from __future__ import annotations

import os
import csv
import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


CSV_DIR = "results/csv"
PLOT_DIR = "results/plots"


def load_rewards(path: str) -> list[float]:
    rewards = []
    with open(path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rewards.append(float(row["reward"]))
    return rewards


def smooth(data: list[float], window: int = 50) -> list[float]:
    if len(data) < window:
        return data
    return np.convolve(data, np.ones(window) / window, mode="valid").tolist()


def plot_50host():
    red_path = f"{CSV_DIR}/maskable_ppo_red_topology_50host.csv"
    blue_path = f"{CSV_DIR}/maskable_ppo_blue_topology_50host.csv"

    if not os.path.exists(red_path) or not os.path.exists(blue_path):
        print("[SKIP] 50-host CSVs not found")
        return

    red_r = load_rewards(red_path)
    blue_r = load_rewards(blue_path)

    window = 200

    fig, axes = plt.subplots(1, 2, figsize=(15, 5))
    fig.suptitle("MaskablePPO Training — 50-Host Network (251 Actions)", fontsize=14, fontweight="bold")

    # Red agent
    ax = axes[0]
    ax.plot(range(len(red_r)), red_r, alpha=0.15, color="#e74c3c", linewidth=0.4)
    s = smooth(red_r, window)
    ax.plot(range(len(s)), s, color="#e74c3c", linewidth=2,
            label=f"Smoothed (window={window})")
    ax.axhline(np.mean(red_r[-2000:]), color="#c0392b", linestyle="--", linewidth=1.2,
               label=f"Last 20% mean: {np.mean(red_r[-2000:]):.1f}")
    ax.set_title("Red Agent (Attacker)", fontsize=12, fontweight="bold")
    ax.set_xlabel("Episode")
    ax.set_ylabel("Episode Reward")
    ax.legend(fontsize=9)
    ax.grid(True, alpha=0.3)

    # Blue agent
    ax = axes[1]
    ax.plot(range(len(blue_r)), blue_r, alpha=0.15, color="#3498db", linewidth=0.4)
    s = smooth(blue_r, window)
    ax.plot(range(len(s)), s, color="#3498db", linewidth=2,
            label=f"Smoothed (window={window})")
    ax.axhline(np.mean(blue_r[-2000:]), color="#2980b9", linestyle="--", linewidth=1.2,
               label=f"Last 20% mean: {np.mean(blue_r[-2000:]):.1f}")
    ax.set_title("Blue Agent (Defender)", fontsize=12, fontweight="bold")
    ax.set_xlabel("Episode")
    ax.set_ylabel("Episode Reward")
    ax.legend(fontsize=9)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    out = f"{PLOT_DIR}/maskable_ppo_training_50host.png"
    plt.savefig(out, dpi=300, bbox_inches="tight")
    plt.close()
    print(f"[SAVED] {out}  (Red: {len(red_r)} eps, Blue: {len(blue_r)} eps)")


def plot_scale_comparison():
    # Compare Red agent reward across 4-host DQN, 8-host PPO, 50-host MaskablePPO
    configs = [
        ("DQN\n4-Host",  f"{CSV_DIR}/sb3_dqn_red_topology_4host.csv",  "#95a5a6"),
        ("PPO\n8-Host",  f"{CSV_DIR}/sb3_ppo_red_topology_8host.csv",   "#e67e22"),
        ("MaskablePPO\n50-Host", f"{CSV_DIR}/maskable_ppo_red_topology_50host.csv", "#e74c3c"),
    ]

    fig, ax = plt.subplots(figsize=(10, 5))
    fig.suptitle("Red Agent — Scaling Comparison (DQN → PPO → MaskablePPO)", fontsize=13, fontweight="bold")

    for label, path, color in configs:
        if not os.path.exists(path):
            print(f"[SKIP] {path}")
            continue
        r = load_rewards(path)
        window = max(10, len(r) // 40)
        s = smooth(r, window)
        ax.plot(
            np.linspace(0, 100, len(s)),
            s,
            label=label.replace("\n", " "),
            linewidth=2,
            color=color,
        )

    ax.set_xlabel("Training Progress (%)")
    ax.set_ylabel("Episode Reward (smoothed)")
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    out = f"{PLOT_DIR}/scale_comparison_red.png"
    plt.savefig(out, dpi=300, bbox_inches="tight")
    plt.close()
    print(f"[SAVED] {out}")


def plot_blue_comparison():
    # Blue agent: DQN 8host (known failure) vs PPO 8host vs MaskablePPO 50host
    configs = [
        ("DQN\n8-Host",  f"{CSV_DIR}/sb3_dqn_blue_topology_8host.csv",  "#95a5a6"),
        ("PPO\n8-Host",  f"{CSV_DIR}/sb3_ppo_blue_topology_8host.csv",   "#3498db"),
        ("MaskablePPO\n50-Host", f"{CSV_DIR}/maskable_ppo_blue_topology_50host.csv", "#1abc9c"),
    ]

    fig, ax = plt.subplots(figsize=(10, 5))
    fig.suptitle("Blue Agent — DQN Failure vs PPO vs MaskablePPO", fontsize=13, fontweight="bold")

    for label, path, color in configs:
        if not os.path.exists(path):
            print(f"[SKIP] {path}")
            continue
        r = load_rewards(path)
        window = max(10, len(r) // 40)
        s = smooth(r, window)
        ax.plot(
            np.linspace(0, 100, len(s)),
            s,
            label=label.replace("\n", " "),
            linewidth=2,
            color=color,
        )

    ax.set_xlabel("Training Progress (%)")
    ax.set_ylabel("Episode Reward (smoothed)")
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    out = f"{PLOT_DIR}/scale_comparison_blue.png"
    plt.savefig(out, dpi=300, bbox_inches="tight")
    plt.close()
    print(f"[SAVED] {out}")


if __name__ == "__main__":
    os.makedirs(PLOT_DIR, exist_ok=True)
    plot_50host()
    plot_scale_comparison()
    plot_blue_comparison()
    print("\nDone.")
