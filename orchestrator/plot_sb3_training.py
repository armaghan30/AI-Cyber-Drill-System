

from __future__ import annotations

import os
import csv
import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


TOPOLOGIES = [
    ("sample_topology", "2-Host Network"),
    ("topology_4host", "4-Host Network"),
    ("topology_8host", "8-Host Network"),
]


def load_rewards(csv_path: str) -> list[float]:
    """Load episode rewards from a CSV file."""
    rewards = []
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rewards.append(float(row["reward"]))
    return rewards


def smooth(data: list[float], window: int = 10) -> list[float]:
    """Rolling average for cleaner curves."""
    if len(data) < window:
        return data
    return np.convolve(data, np.ones(window) / window, mode="valid").tolist()


def main():
    os.makedirs("results/plots", exist_ok=True)

    plt.style.use("seaborn-v0_8-whitegrid")

    for topo_tag, topo_label in TOPOLOGIES:
        red_csv = f"results/csv/sb3_dqn_red_{topo_tag}.csv"
        blue_csv = f"results/csv/sb3_dqn_blue_{topo_tag}.csv"

        if not os.path.exists(red_csv) or not os.path.exists(blue_csv):
            print(f"[SKIP] Missing CSV for {topo_tag}")
            continue

        red_rewards = load_rewards(red_csv)
        blue_rewards = load_rewards(blue_csv)

        window = max(10, len(red_rewards) // 30)

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

        # Red Agent
        if red_rewards:
            raw_alpha = 0.2
            ax1.plot(range(len(red_rewards)), red_rewards,
                     alpha=raw_alpha, color="#e74c3c", linewidth=0.5)
            s = smooth(red_rewards, window)
            ax1.plot(range(len(s)), s,
                     label=f"SB3 DQN (smoothed, w={window})",
                     linewidth=2, color="#e74c3c")
        ax1.set_title(f"Red Agent (Attacker) — {topo_label}", fontsize=12, fontweight="bold")
        ax1.set_xlabel("Episode", fontsize=11)
        ax1.set_ylabel("Episode Reward", fontsize=11)
        ax1.legend(fontsize=9)
        ax1.grid(True, alpha=0.3)

        # Blue Agent
        if blue_rewards:
            ax2.plot(range(len(blue_rewards)), blue_rewards,
                     alpha=raw_alpha, color="#3498db", linewidth=0.5)
            s = smooth(blue_rewards, window)
            ax2.plot(range(len(s)), s,
                     label=f"SB3 DQN (smoothed, w={window})",
                     linewidth=2, color="#3498db")
        ax2.set_title(f"Blue Agent (Defender) — {topo_label}", fontsize=12, fontweight="bold")
        ax2.set_xlabel("Episode", fontsize=11)
        ax2.set_ylabel("Episode Reward", fontsize=11)
        ax2.legend(fontsize=9)
        ax2.grid(True, alpha=0.3)

        plt.suptitle(f"SB3 DQN Training Rewards — {topo_label}",
                     fontsize=14, fontweight="bold", y=1.02)
        plt.tight_layout()

        out_path = f"results/plots/sb3_dqn_training_{topo_tag}.png"
        plt.savefig(out_path, dpi=300, bbox_inches="tight")
        plt.close()

        print(f"[SAVED] {out_path}  (Red: {len(red_rewards)} eps, Blue: {len(blue_rewards)} eps)")

    print("\nDone! Training plots saved to results/plots/")


if __name__ == "__main__":
    main()
