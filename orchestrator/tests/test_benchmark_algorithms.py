import csv

import pytest
from sb3_contrib import MaskablePPO
from sb3_contrib.common.wrappers import ActionMasker

from orchestrator import benchmark_algorithms
from orchestrator.rl_env_blue import BlueRLEnvironment
from orchestrator.tests.conftest import TOPOLOGY_PATH


@pytest.fixture(scope="module")
def blue_opponent(tmp_path_factory):
    env = ActionMasker(BlueRLEnvironment(TOPOLOGY_PATH, max_steps=5), lambda e: e.action_masks())
    m = MaskablePPO("MlpPolicy", env, n_steps=32, batch_size=16, n_epochs=1, seed=0, verbose=0)
    m.learn(total_timesteps=32)
    path = str(tmp_path_factory.mktemp("opp") / "blue.zip")
    m.save(path)
    return path


def _rows(out, role="red"):
    with open(out / f"benchmark_{role}_sample_topology.csv") as f:
        return list(csv.DictReader(f))


def test_benchmark_against_self_play_opponent(tmp_path, blue_opponent):
    benchmark_algorithms.main([TOPOLOGY_PATH, "red", "200", "0", "2",
                               "--opponent", blue_opponent, "--out", str(tmp_path)])
    rows = _rows(tmp_path)
    assert [r["algorithm"] for r in rows] == ["dqn", "ppo", "maskable_ppo"]
    for r in rows:
        assert r["opponent"] == "blue.zip"
        assert 0.0 <= float(r["breach_rate"]) <= 1.0
    assert float(rows[-1]["invalid_action_rate"]) == 0.0  # masked agent never picks invalid actions


def test_benchmark_defaults_to_rule_based_opponent(tmp_path):
    benchmark_algorithms.main([TOPOLOGY_PATH, "blue", "200", "0", "1",
                               "--algos", "maskable_ppo", "--out", str(tmp_path)])
    rows = _rows(tmp_path, "blue")
    assert len(rows) == 1 and rows[0]["opponent"] == "rule-based"
