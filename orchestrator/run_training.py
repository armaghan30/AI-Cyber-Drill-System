

from __future__ import annotations

import os
import sys
import time
import subprocess

TOPOLOGIES = [
    "orchestrator/sample_topology.yaml",
    "orchestrator/topology_4host.yaml",
    "orchestrator/topology_8host.yaml",
]

PYTHON = sys.executable


def run_cmd(label: str, cmd: list[str]) -> bool:
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"  CMD: {' '.join(cmd)}")
    print(f"{'='*60}")

    start = time.time()
    result = subprocess.run(cmd, cwd=os.path.dirname(os.path.dirname(__file__)))
    elapsed = time.time() - start

    if result.returncode == 0:
        print(f"  DONE in {elapsed:.1f}s")
        return True
    else:
        print(f"  FAILED (exit code {result.returncode}) after {elapsed:.1f}s")
        return False


def main():
    timesteps = 10_000

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--timesteps" and i + 1 < len(args):
            timesteps = int(args[i + 1])
            i += 2
        else:
            i += 1

    print("=" * 60)
    print("  AI-Powered Cyber Drill System — SB3 DQN Training")
    print(f"  Timesteps:   {timesteps}")
    print(f"  Topologies:  {len(TOPOLOGIES)}")
    print("=" * 60)

    os.makedirs("results/models", exist_ok=True)
    os.makedirs("results/csv", exist_ok=True)
    os.makedirs("results/plots", exist_ok=True)

    total_start = time.time()
    results = []

    for topo in TOPOLOGIES:
        topo_name = os.path.splitext(os.path.basename(topo))[0]

        ok = run_cmd(
            f"SB3 DQN RED on {topo_name}",
            [PYTHON, "-m", "orchestrator.train_sb3_dqn_red", topo, str(timesteps), "20"],
        )
        results.append(("SB3 DQN RED", topo_name, ok))

        ok = run_cmd(
            f"SB3 DQN BLUE on {topo_name}",
            [PYTHON, "-m", "orchestrator.train_sb3_dqn_blue", topo, str(timesteps), "20"],
        )
        results.append(("SB3 DQN BLUE", topo_name, ok))

    total_elapsed = time.time() - total_start

    # --- Summary ---
    print("\n\n" + "=" * 60)
    print("  TRAINING SUMMARY")
    print("=" * 60)
    passed = sum(1 for _, _, ok in results if ok)
    failed = len(results) - passed

    for name, topo_name, ok in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name} ({topo_name})")

    print(f"\n  Total: {passed}/{len(results)} passed")
    print(f"  Total time: {total_elapsed:.0f}s ({total_elapsed/60:.1f} min)")
    print("=" * 60)

    # Show output files
    print("\n  Files in results/csv/:")
    for f in sorted(os.listdir("results/csv")):
        size = os.path.getsize(f"results/csv/{f}")
        print(f"    {f} ({size:,} bytes)")

    if failed > 0:
        print(f"\n  WARNING: {failed} training job(s) failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
