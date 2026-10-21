import random

import numpy as np
import pytest
from sb3_contrib import MaskablePPO
from sb3_contrib.common.wrappers import ActionMasker

from orchestrator.adversarial import (RANDOM, OpponentPool, act, decode_blue_action,
                                      make_pool, play_drill)
from orchestrator.action_masks import red_action_mask
from orchestrator.rl_env_red import RedRLEnvironment
from orchestrator.rl_env_blue import BlueRLEnvironment
from orchestrator.tests.conftest import TOPOLOGY_PATH
from orchestrator.verdict import drill_outcome

RED_TYPES = ("scan", "exploit", "escalate", "lateral_move", "exfiltrate", "idle")
BLUE_TYPES = ("patch", "isolate", "restore", "detect", "harden", "deploy_firewall", "idle")


@pytest.fixture(scope="module")
def tiny_models(tmp_path_factory):
    """Barely-trained Red and Blue models: enough to exercise the code paths."""
    d = tmp_path_factory.mktemp("models")
    paths = {}
    for role, Env in (("red", RedRLEnvironment), ("blue", BlueRLEnvironment)):
        env = ActionMasker(Env(TOPOLOGY_PATH, max_steps=5), lambda e: e.action_masks())
        m = MaskablePPO("MlpPolicy", env, n_steps=32, batch_size=16, n_epochs=1, seed=0, verbose=0)
        m.learn(total_timesteps=32)
        paths[role] = str(d / f"{role}.zip")
        m.save(paths[role])
    return paths


def _guard(agent, name):
    """Make a rule-based agent method record calls, to prove it is not used."""
    calls, orig = [], getattr(agent, name)
    setattr(agent, name, lambda *a: calls.append(1) or orig(*a))
    return calls


def _run(env, steps):
    infos = []
    for _ in range(steps):
        _, _, term, _, info = env.step(int(np.flatnonzero(env.action_masks())[-1]))
        infos.append(info)
        if term:
            break
    return infos


def test_make_pool_variants(tiny_models):
    assert make_pool(None) is None
    assert make_pool(RANDOM).policies == [RANDOM]
    pool = make_pool([RANDOM, tiny_models["red"]])
    assert isinstance(pool, OpponentPool) and len(pool.policies) == 2
    assert pool.current is pool.policies[-1]


def test_pool_samples_latest_and_older():
    a_old, b_old, latest = object(), object(), object()  # stand-ins for loaded models
    pool = OpponentPool([a_old, b_old, latest], latest_weight=0.5)
    random.seed(0)
    picks = [pool.sample() for _ in range(400)]
    assert 150 < picks.count(latest) < 250          # latest ~50%
    assert picks.count(a_old) > 50 and picks.count(b_old) > 50


def test_pool_samples_uniformly_by_default():
    snaps = [object() for _ in range(4)]
    pool = OpponentPool(snaps)
    random.seed(0)
    counts = [0] * 4
    for _ in range(800):
        counts[snaps.index(pool.sample())] += 1
    assert all(150 < c < 250 for c in counts)  # ~200 each


def test_random_policy_only_picks_valid_actions():
    mask = np.zeros(11, dtype=bool)
    mask[[2, 7]] = True
    np.random.seed(0)
    assert {act(RANDOM, None, mask) for _ in range(50)} == {2, 7}


def test_red_env_against_learned_blue(tiny_models):
    env = RedRLEnvironment(TOPOLOGY_PATH, max_steps=6, blue_model=[RANDOM, tiny_models["blue"]])
    env.reset(seed=0)
    calls = _guard(env.blue_agent, "choose_action")
    for info in _run(env, 6):
        assert info["blue_action"]["action"] in BLUE_TYPES
    assert calls == []


def test_blue_env_against_learned_red(tiny_models):
    env = BlueRLEnvironment(TOPOLOGY_PATH, max_steps=6, red_model=tiny_models["red"])
    env.reset(seed=0)
    calls = _guard(env.red_agent, "choose_action")
    for info in _run(env, 6):
        assert info["red_action"]["action"] in RED_TYPES
    assert calls == []


def test_envs_default_to_rule_based_opponents():
    red_env = RedRLEnvironment(TOPOLOGY_PATH, max_steps=3)
    blue_env = BlueRLEnvironment(TOPOLOGY_PATH, max_steps=3)
    assert red_env.blue_pool is None and blue_env.red_pool is None
    red_env.reset(seed=0)
    blue_env.reset(seed=0)
    assert "action" in _run(red_env, 1)[0]["blue_action"]
    assert "action" in _run(blue_env, 1)[0]["red_action"]


def test_learned_red_respects_masks(tiny_models):
    # a masked opponent may only take actions its own mask allows
    model = MaskablePPO.load(tiny_models["red"])
    env = BlueRLEnvironment(TOPOLOGY_PATH, max_steps=5)
    env.reset(seed=0)
    hosts = env.host_order
    for _ in range(20):
        mask = red_action_mask(env.environment, hosts, env.red_agent)
        assert mask[act(model, np.zeros(model.observation_space.shape, np.float32), mask)]


def test_blue_decoding_shared_with_env():
    env = BlueRLEnvironment(TOPOLOGY_PATH, max_steps=3)
    env.reset(seed=0)
    for idx in (0, 2, 4, 8, 10, 12):  # skip detect slots (random outcome)
        if 6 <= idx < 8:
            continue
        assert env._decode_blue_action(idx) == decode_blue_action(env.blue_agent, env.host_order, idx)


@pytest.mark.parametrize("red,blue", [(None, None), (RANDOM, RANDOM), ("model", "model"), ("model", None)])
def test_play_drill_any_opponents(tiny_models, red, blue):
    load = lambda p, role: MaskablePPO.load(tiny_models[role]) if p == "model" else p
    np.random.seed(0)
    random.seed(0)
    final_hosts, red_actions, blue_actions = play_drill(TOPOLOGY_PATH, load(red, "red"), load(blue, "blue"), steps=8)
    assert sum(red_actions.values()) == 8 and sum(blue_actions.values()) == 8
    assert set(red_actions) <= set(RED_TYPES) and set(blue_actions) <= set(BLUE_TYPES)
    assert drill_outcome(final_hosts)["hosts_total"] == 2
