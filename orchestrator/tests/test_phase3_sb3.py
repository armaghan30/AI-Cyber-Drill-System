
import numpy as np
import pytest
import gymnasium as gym

from orchestrator.rl_env_red import RedRLEnvironment
from orchestrator.rl_env_blue import BlueRLEnvironment

TOPOLOGY_2HOST = "orchestrator/sample_topology.yaml"
TOPOLOGY_4HOST = "orchestrator/topology_4host.yaml"
TOPOLOGY_8HOST = "orchestrator/topology_8host.yaml"


# ------------Gymnasium.Env inheritance -----------------

class TestGymnasiumInheritance:
    def test_red_is_gym_env(self):
        env = RedRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        assert isinstance(env, gym.Env)

    def test_blue_is_gym_env(self):
        env = BlueRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        assert isinstance(env, gym.Env)

    def test_red_has_metadata(self):
        env = RedRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        assert hasattr(env, "metadata")
        assert "render_modes" in env.metadata

    def test_blue_has_metadata(self):
        env = BlueRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        assert hasattr(env, "metadata")
        assert "render_modes" in env.metadata

    def test_red_has_render(self):
        env = RedRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        assert callable(getattr(env, "render", None))

    def test_red_has_close(self):
        env = RedRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        assert callable(getattr(env, "close", None))

    def test_blue_has_render(self):
        env = BlueRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        assert callable(getattr(env, "render", None))

    def test_blue_has_close(self):
        env = BlueRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        assert callable(getattr(env, "close", None))


# ---- SB3 env_checker ----

class TestSB3EnvChecker:
    def test_red_passes_env_check_2host(self):
        from stable_baselines3.common.env_checker import check_env
        env = RedRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        check_env(env, warn=True)

    def test_blue_passes_env_check_2host(self):
        from stable_baselines3.common.env_checker import check_env
        env = BlueRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        check_env(env, warn=True)

    def test_red_passes_env_check_4host(self):
        from stable_baselines3.common.env_checker import check_env
        env = RedRLEnvironment(TOPOLOGY_4HOST, max_steps=5)
        check_env(env, warn=True)

    def test_blue_passes_env_check_4host(self):
        from stable_baselines3.common.env_checker import check_env
        env = BlueRLEnvironment(TOPOLOGY_4HOST, max_steps=5)
        check_env(env, warn=True)


# ---- SB3 Monitor wrapper ----

class TestMonitorWrapper:
    def test_red_with_monitor(self):
        from stable_baselines3.common.monitor import Monitor
        env = Monitor(RedRLEnvironment(TOPOLOGY_2HOST, max_steps=5))
        obs, info = env.reset()
        assert obs.shape[0] > 0
        for _ in range(5):
            action = env.action_space.sample()
            obs, reward, terminated, truncated, info = env.step(action)
            if terminated or truncated:
                break

    def test_blue_with_monitor(self):
        from stable_baselines3.common.monitor import Monitor
        env = Monitor(BlueRLEnvironment(TOPOLOGY_2HOST, max_steps=5))
        obs, info = env.reset()
        assert obs.shape[0] > 0
        for _ in range(5):
            action = env.action_space.sample()
            obs, reward, terminated, truncated, info = env.step(action)
            if terminated or truncated:
                break



class TestSB3PPOSmoke:
    def test_ppo_red_instantiate_and_train(self):
        from stable_baselines3 import PPO
        from stable_baselines3.common.monitor import Monitor
        env = Monitor(RedRLEnvironment(TOPOLOGY_2HOST, max_steps=5))
        model = PPO("MlpPolicy", env, n_steps=10, batch_size=5, n_epochs=1, verbose=0)
        model.learn(total_timesteps=20)

    def test_ppo_blue_instantiate_and_train(self):
        from stable_baselines3 import PPO
        from stable_baselines3.common.monitor import Monitor
        env = Monitor(BlueRLEnvironment(TOPOLOGY_2HOST, max_steps=5))
        model = PPO("MlpPolicy", env, n_steps=10, batch_size=5, n_epochs=1, verbose=0)
        model.learn(total_timesteps=20)

    def test_ppo_predict_returns_valid_action(self):
        from stable_baselines3 import PPO
        from stable_baselines3.common.monitor import Monitor
        env = Monitor(RedRLEnvironment(TOPOLOGY_2HOST, max_steps=5))
        model = PPO("MlpPolicy", env, n_steps=10, batch_size=5, n_epochs=1, verbose=0)
        model.learn(total_timesteps=20)
        obs, _ = env.reset()
        action, _ = model.predict(obs, deterministic=True)
        assert 0 <= int(action) < env.unwrapped.action_dim


# ---- SB3 DQN smoke tests ----

class TestSB3DQNSmoke:
    def test_dqn_red_instantiate_and_train(self):
        from stable_baselines3 import DQN
        from stable_baselines3.common.monitor import Monitor
        env = Monitor(RedRLEnvironment(TOPOLOGY_2HOST, max_steps=5))
        model = DQN("MlpPolicy", env, learning_starts=5, verbose=0)
        model.learn(total_timesteps=20)

    def test_dqn_blue_instantiate_and_train(self):
        from stable_baselines3 import DQN
        from stable_baselines3.common.monitor import Monitor
        env = Monitor(BlueRLEnvironment(TOPOLOGY_2HOST, max_steps=5))
        model = DQN("MlpPolicy", env, learning_starts=5, verbose=0)
        model.learn(total_timesteps=20)


# ---- Backward compatibility ----

class TestBackwardCompatibility:
    def test_red_env_still_works_without_sb3(self):

        env = RedRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        state, _ = env.reset()
        assert state.shape[0] == env.state_dim
        action = env.action_space.sample()
        next_state, reward, terminated, truncated, info = env.step(action)
        assert isinstance(reward, float)

    def test_blue_env_still_works_without_sb3(self):

        env = BlueRLEnvironment(TOPOLOGY_2HOST, max_steps=5)
        state, _ = env.reset()
        assert state.shape[0] == env.state_dim
        action = env.action_space.sample()
        next_state, reward, terminated, truncated, info = env.step(action)
        assert isinstance(reward, float)


# ---- Multi-topology support ----

class TestMultiTopology:
    @pytest.mark.parametrize("topo,expected_action_dim", [
        (TOPOLOGY_2HOST, 11),
        (TOPOLOGY_4HOST, 21),
        (TOPOLOGY_8HOST, 41),
    ])
    def test_ppo_works_on_all_topologies(self, topo, expected_action_dim):
        from stable_baselines3 import PPO
        from stable_baselines3.common.monitor import Monitor
        env = Monitor(RedRLEnvironment(topo, max_steps=5))
        assert env.unwrapped.action_dim == expected_action_dim
        model = PPO("MlpPolicy", env, n_steps=10, batch_size=5, n_epochs=1, verbose=0)
        model.learn(total_timesteps=20)
