
from __future__ import annotations

import os
import csv
import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


CSV_DIR = "results/csv"
PLOT_DIR = "results/plots"

TOPOLOGIES = [
    ("topology_4host", "4 hosts"),
    ("topology_8host", "8 hosts"),
    ("corporate_office_nmap", "Nmap office scan"),
    ("topology_50host", "50 hosts"),
]
COLORS = {"red": "#e74c3c", "blue": "#3498db"}


def load_selfplay(path: str) -> tuple[list[int], list[float]]:
    rounds, rewards = [], []
    with open(path, "r") as f:
        for row in csv.DictReader(f):
            rounds.append(int(row["round"]))
            rewards.append(float(row["reward"]))
    return rounds, rewards


def smooth(data: list[float], window: int = 50) -> np.ndarray:
    if len(data) < window:
        return np.asarray(data)
    return np.convolve(data, np.ones(window) / window, mode="valid")


def draw_side(ax, rounds, rewards, color, window, raw=True):
    x = np.arange(1, len(rewards) + 1)
    if raw:
        ax.plot(x, rewards, alpha=0.08, color=color, linewidth=0.3)
    # smooth each round on its own so the curve doesn't blur across opponent changes
    for r in sorted(set(rounds)):
        idx = [i for i, v in enumerate(rounds) if v == r]
        s = smooth([rewards[i] for i in idx], window)
        start = idx[0] + 1 + (len(idx) - len(s)) // 2
        ax.plot(np.arange(start, start + len(s)), s, color=color, linewidth=1.8)
        if r > 1:
            ax.axvline(idx[0] + 1, color="grey", linestyle=":", linewidth=0.8)
    ax.grid(True, alpha=0.3)


def plot_50host():
    window = 300
    fig, axes = plt.subplots(1, 2, figsize=(15, 5))
    fig.suptitle("Self-play training on the 50-host network (MaskablePPO, 8 rounds)",
                 fontsize=14, fontweight="bold")

    for ax, side, title in [(axes[0], "red", "Red agent (attacker)"),
                            (axes[1], "blue", "Blue agent (defender)")]:
        path = f"{CSV_DIR}/selfplay_{side}_topology_50host.csv"
        if not os.path.exists(path):
            print(f"[SKIP] {path}")
            continue
        rounds, rewards = load_selfplay(path)
        draw_side(ax, rounds, rewards, COLORS[side], window)
        per_round = len(rewards) // max(rounds)
        for r in sorted(set(rounds)):
            ax.text((r - 0.5) * per_round, 0.97, f"R{r}", transform=ax.get_xaxis_transform(),
                    ha="center", va="top", fontsize=8, color="grey")
        ax.set_title(title, fontsize=12, fontweight="bold")
        ax.set_xlabel("Episode (dotted lines = new round, stronger opponent)")
        ax.set_ylabel("Episode reward")

    plt.tight_layout()
    out = f"{PLOT_DIR}/selfplay_training_50host.png"
    plt.savefig(out, dpi=200, bbox_inches="tight")
    plt.close()
    print(f"[SAVED] {out}")


def plot_all_topologies():
    fig, axes = plt.subplots(2, len(TOPOLOGIES), figsize=(18, 7))
    fig.suptitle("Self-play training on every shipped network (smoothed, per round)",
                 fontsize=14, fontweight="bold")

    for col, (topo, label) in enumerate(TOPOLOGIES):
        for row, side in enumerate(["red", "blue"]):
            ax = axes[row][col]
            path = f"{CSV_DIR}/selfplay_{side}_{topo}.csv"
            if not os.path.exists(path):
                print(f"[SKIP] {path}")
                continue
            rounds, rewards = load_selfplay(path)
            window = max(20, len(rewards) // max(rounds) // 15)
            draw_side(ax, rounds, rewards, COLORS[side], window, raw=False)
            if row == 0:
                ax.set_title(f"{label} ({max(rounds)} rounds)", fontsize=11, fontweight="bold")
            if col == 0:
                ax.set_ylabel(f"{side.capitalize()} reward")
            if row == 1:
                ax.set_xlabel("Episode")

    plt.tight_layout()
    out = f"{PLOT_DIR}/selfplay_training_all.png"
    plt.savefig(out, dpi=200, bbox_inches="tight")
    plt.close()
    print(f"[SAVED] {out}")


if __name__ == "__main__":
    os.makedirs(PLOT_DIR, exist_ok=True)
    plot_50host()
    plot_all_topologies()
