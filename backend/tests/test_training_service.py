import numpy as np
import pytest
from sb3_contrib.common.wrappers import ActionMasker

from backend.services.training_service import _make_env
from backend.tests.conftest import FIXTURE_TOPO
from orchestrator.rl_env_red import RedRLEnvironment
from orchestrator.rl_env_blue import BlueRLEnvironment


def _masks(env):
    # same lookup MaskablePPO uses on the wrapped env
    return env.get_wrapper_attr("action_masks")()


@pytest.mark.parametrize("Env", [RedRLEnvironment, BlueRLEnvironment])
def test_maskable_env_uses_real_masks(Env):
    env = _make_env(Env, FIXTURE_TOPO, max_steps=10, is_maskable=True)
    env.reset(seed=0)
    base = env.unwrapped
    m = _masks(env)
    assert m.dtype == bool and m.shape == (env.action_space.n,)
    assert np.array_equal(m, base.action_masks())
    # at reset some actions are always invalid (red: exploit before scan, blue: restore non-isolated)
    assert not m.all()


@pytest.mark.parametrize("Env", [RedRLEnvironment, BlueRLEnvironment])
def test_masks_track_env_state(Env):
    env = _make_env(Env, FIXTURE_TOPO, max_steps=10, is_maskable=True)
    env.reset(seed=0)
    rng = np.random.default_rng(0)
    for _ in range(8):
        m = _masks(env)
        assert np.array_equal(m, env.unwrapped.action_masks())
        _, _, term, trunc, _ = env.step(int(rng.choice(np.flatnonzero(m))))
        if term or trunc:
            env.reset()


def test_non_maskable_env_has_no_masker():
    env = _make_env(RedRLEnvironment, FIXTURE_TOPO, max_steps=10, is_maskable=False)
    assert not isinstance(env.env, ActionMasker)


def test_maskable_ppo_trains_with_masks():
    from sb3_contrib import MaskablePPO
    env = _make_env(RedRLEnvironment, FIXTURE_TOPO, max_steps=10, is_maskable=True)
    model = MaskablePPO("MlpPolicy", env, n_steps=64, batch_size=32, n_epochs=1, seed=0, verbose=0)
    model.learn(total_timesteps=64)
    obs, _ = env.reset(seed=1)
    for _ in range(5):
        m = _masks(env)
        action, _ = model.predict(obs, action_masks=m, deterministic=False)
        assert m[int(action)]
        obs, _, term, trunc, _ = env.step(int(action))
        if term or trunc:
            break
