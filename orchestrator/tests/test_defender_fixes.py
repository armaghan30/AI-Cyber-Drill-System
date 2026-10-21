import random

import numpy as np

from orchestrator.action_masks import red_action_mask
from orchestrator.reward_engine import RewardEngine, BLUE_OUTCOME_REWARD, blue_outcome_reward
from orchestrator.rl_env_blue import BlueRLEnvironment
from orchestrator.tests.conftest import TOPOLOGY_PATH

engine = RewardEngine()


def _detect_until_hit(blue_agent, host):
    random.seed(0)
    for _ in range(50):
        a = blue_agent.make_detect_action(host)
        if a["detected"]:
            return a
    raise AssertionError("never detected")


def _detect_reward(environment, action):
    snap = environment._snapshot()
    return engine.compute_rewards(snap, snap, None, action)[1]


def test_first_detection_is_new(blue_agent, environment):
    environment.hosts["H1"].is_compromised = True
    a = _detect_until_hit(blue_agent, "H1")
    assert a["new_detection"] is True
    assert _detect_reward(environment, a) == 12.0


def test_redetection_is_not_new_and_costs_1(blue_agent, environment):
    environment.hosts["H1"].is_compromised = True
    _detect_until_hit(blue_agent, "H1")
    again = _detect_until_hit(blue_agent, "H1")
    assert again["new_detection"] is False
    assert _detect_reward(environment, again) == -1.0


def test_detection_is_new_again_after_restore_and_recompromise(blue_agent, environment):
    h1 = environment.hosts["H1"]
    h1.is_compromised = True
    _detect_until_hit(blue_agent, "H1")
    environment.step(None, {"action": "restore", "target": "H1"})  # clears detected
    h1.is_compromised = True
    assert _detect_until_hit(blue_agent, "H1")["new_detection"] is True


def test_detect_farming_is_not_profitable(blue_agent, environment):
    environment.hosts["H1"].is_compromised = True
    total = sum(_detect_reward(environment, _detect_until_hit(blue_agent, "H1")) for _ in range(10))
    assert total < 12.0  # one +12, then only -1s


def test_detect_without_flag_keeps_old_reward(environment):
    action = {"action": "detect", "target": "H1", "detected": True}
    assert _detect_reward(environment, action) == 12.0


def _rooted(environment, host="H1"):
    h = environment.hosts[host]
    h.is_compromised, h.access_level = True, "root"
    return h


def test_isolated_host_cannot_exfiltrate(red_agent, environment):
    _rooted(environment)
    environment.step(None, {"action": "isolate", "target": "H1"})
    r = red_agent.exfiltrate("H1")
    assert r["success"] is False and r["reason"] == "host_isolated"
    assert environment.hosts["H1"].data_exfiltrated is False


def test_exfil_mask_excludes_isolated_hosts(red_agent, environment):
    hosts = list(environment.hosts)
    n, i = len(hosts), hosts.index("H1")
    _rooted(environment)
    assert red_action_mask(environment, hosts, red_agent)[4 * n + i]
    environment.step(None, {"action": "isolate", "target": "H1"})
    assert not red_action_mask(environment, hosts, red_agent)[4 * n + i]


def test_isolated_host_cannot_be_lateral_source(red_agent, environment):
    _rooted(environment)
    environment.step(None, {"action": "isolate", "target": "H1"})
    r = red_agent.lateral_move("H2")
    assert r["success"] is False and r["reason"] == "no_adjacent_compromised"
    assert not environment.is_reachable("H2")


def test_failed_exfil_from_isolated_host_costs_2(red_agent, environment):
    _rooted(environment)
    environment.step(None, {"action": "isolate", "target": "H1"})
    snap = environment._snapshot()
    action = red_agent.exfiltrate("H1")
    assert engine.compute_rewards(snap, snap, action, None)[0] == -2.0


def test_outcome_reward_follows_verdict():
    clean = {"A": {"is_compromised": False, "data_exfiltrated": False}}
    stolen = {"A": {"is_compromised": False, "data_exfiltrated": True}}
    assert blue_outcome_reward(clean) == BLUE_OUTCOME_REWARD == 50.0
    assert blue_outcome_reward(stolen) == -50.0


def _blue_episode(monkeypatch, breach):
    env = BlueRLEnvironment(TOPOLOGY_PATH, max_steps=3)
    env.reset(seed=0)
    monkeypatch.setattr(env.reward_engine, "compute_rewards", lambda *a: (0.0, 0.0))
    monkeypatch.setattr(env, "_red_turn", lambda: {"action": "idle", "target": None})
    if breach:
        env.environment.hosts["H1"].data_exfiltrated = True
    idle = env.action_dim - 1
    return [env.step(idle) for _ in range(3)]


def test_blue_env_adds_outcome_only_on_last_step(monkeypatch):
    steps = _blue_episode(monkeypatch, breach=False)
    assert [s[1] for s in steps] == [0.0, 0.0, 50.0]
    assert steps[-1][2] is True and steps[-1][4]["outcome_reward"] == 50.0
    assert "outcome_reward" not in steps[0][4]


def test_blue_env_penalises_breached_episode(monkeypatch):
    steps = _blue_episode(monkeypatch, breach=True)
    assert steps[-1][1] == -50.0
