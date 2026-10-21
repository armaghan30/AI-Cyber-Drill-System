import csv
import json
import os

import pytest

from orchestrator import evaluate_adversarial, train_adversarial
from orchestrator.tests.conftest import TOPOLOGY_PATH


def _train(out, mode, roles="red,blue", extra=()):
    train_adversarial.main([TOPOLOGY_PATH, "--mode", mode, "--rounds", "2", "--steps", "128",
                            "--max-steps", "8", "--roles", roles, "--out", str(out), *extra])


@pytest.fixture(scope="module")
def arms(tmp_path_factory):
    d = tmp_path_factory.mktemp("exp")
    sp, rb = d / "selfplay", d / "rule"
    _train(sp, "selfplay")
    _train(rb, "rule", roles="red")      # rule arm can train roles in separate processes
    _train(rb, "rule", roles="blue")
    return d, sp, rb


def test_both_arms_save_every_round(arms):
    _, sp, rb = arms
    for arm in (sp, rb):
        for k in (1, 2):
            assert (arm / f"round_{k}" / "red.zip").exists()
            assert (arm / f"round_{k}" / "blue.zip").exists()
        with open(arm / "red_rewards.csv") as f:
            assert {row["round"] for row in csv.DictReader(f)} == {"1", "2"}


def test_evaluation_scores_every_snapshot(arms):
    d, sp, rb = arms
    out = d / "eval"
    evaluate_adversarial.main([TOPOLOGY_PATH, "--arm", f"rule={rb}", "--arm", f"selfplay={sp}",
                               "--episodes", "2", "--steps", "5", "--out", str(out)])
    res = json.loads((out / "evaluation.json").read_text())

    reds = {"random", "rule-based script"} | {f"{a} Red r{k}" for a in ("rule", "selfplay") for k in (1, 2)}
    blues = {"random", "rule-based script"} | {f"{a} Blue r{k}" for a in ("rule", "selfplay") for k in (1, 2)}
    assert set(res["matrix"]) == reds
    for row in res["matrix"].values():
        assert set(row) == blues
        assert all(0 <= cell["breach_rate_pct"] <= 100 for cell in row.values())

    assert [c["round"] for c in res["curves"]["selfplay"]] == [1, 2]
    assert set(res["red_scores"]) == reds - {"random", "rule-based script"}
    for s in res["blue_scores"].values():
        assert s["mean_vs_learned_reds"] <= s["worst_vs_learned_reds"]
    assert os.path.exists(out / "summary.md")


def test_final_only_evaluation(arms):
    d, sp, rb = arms
    out = d / "eval_final"
    evaluate_adversarial.main([TOPOLOGY_PATH, "--arm", f"rule={rb}", "--arm", f"selfplay={sp}",
                               "--episodes", "1", "--steps", "3", "--out", str(out), "--final-only"])
    res = json.loads((out / "evaluation.json").read_text())
    assert set(res["matrix"]) == {"random", "rule-based script", "rule Red r2", "selfplay Red r2"}


def test_selfplay_latest_weight_option(tmp_path):
    _train(tmp_path, "selfplay", extra=("--latest-weight", "0.5"))
    cfg = json.loads((tmp_path / "config_red_blue.json").read_text())
    assert cfg["latest_weight"] == 0.5


def test_selfplay_requires_both_roles(tmp_path):
    with pytest.raises(SystemExit):
        _train(tmp_path, "selfplay", roles="red")
