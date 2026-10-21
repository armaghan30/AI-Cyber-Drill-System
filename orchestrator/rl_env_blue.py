from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import gymnasium as gym
from gymnasium import spaces

from orchestrator.orchestrator_core import Orchestrator
from orchestrator.state_vectors import flatten_blue_state, flatten_red_state
from orchestrator.reward_engine import RewardEngine, blue_outcome_reward
from orchestrator.action_masks import blue_action_mask, red_action_mask
from orchestrator.adversarial import decode_red_action, decode_blue_action, make_pool, act


class BlueRLEnvironment(gym.Env):

    metadata = {"render_modes": ["human"]}

    def __init__(self, topology_path: str, max_steps: int = 20, seed: int | None = None,
                 red_model=None):
        super().__init__()
        self.topology_path = topology_path
        self.max_steps = max_steps
        self.current_step = 0
        # trained Red opponent(s); None means the rule-based RedAgent
        self.red_pool = make_pool(red_model)

        self._build_orchestrator()

        self.reward_engine = RewardEngine()
        self.np_random = np.random.default_rng(seed)

        blue_state = self.orch.get_blue_state()
        self.host_order: List[str] = list(self.environment.hosts.keys())

        example_vec = flatten_blue_state(blue_state, self.host_order)
        self.state_dim = int(example_vec.shape[0])

        self.action_dim = 6 * len(self.host_order) + 1

        self.observation_space = spaces.Box(
            low=0.0, high=100.0, shape=(self.state_dim,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(self.action_dim)

        print(f"[BLUE INFO] State dim    : {self.state_dim}")
        print(f"[BLUE INFO] Actions      : {self.action_dim}")

    # ------------------------------------------------------------
    def _build_orchestrator(self):
        self.orch = Orchestrator(self.topology_path)
        self.orch.load_topology()
        self.orch.build_environment()
        self.orch.init_red_agent()
        self.orch.init_blue_agent()

        self.environment = self.orch.environment
        self.red_agent = self.orch.red_agent
        self.blue_agent = self.orch.blue_agent  

    # ------------------------------------------------------------
    def _decode_blue_action(self, index: int) -> Dict[str, Any]:
        if index < 0 or index >= self.action_dim:
            raise ValueError(f"Invalid BLUE action index: {index}")
        return decode_blue_action(self.blue_agent, self.host_order, index)

    # ------------------------------------------------------------
    def reset(self, seed: int | None = None, options: Dict | None = None):
        if seed is not None:
            self.np_random = np.random.default_rng(seed)

        self.current_step = 0
        self._build_orchestrator()
        if self.red_pool is not None:
            self.red_pool.sample()  # one opponent per episode

        blue_state = self.orch.get_blue_state()
        self.host_order = list(self.environment.hosts.keys())

        obs_vec = flatten_blue_state(blue_state, self.host_order)
        return np.array(obs_vec, dtype=np.float32), {}

    # ------------------------------------------------------------
    def step(self, action_index: int):
        self.current_step += 1

        blue_action = self._decode_blue_action(int(action_index))

        red_action = self._red_turn()

        prev_state = self.orch._snapshot_environment()
        env_state = self.environment.step(red_action, blue_action)

        # Reward for BLUE 
        red_reward, blue_reward = self.reward_engine.compute_rewards(
            prev_state, env_state, red_action, blue_action
        )

        blue_state = self.orch.get_blue_state()
        obs_vec = flatten_blue_state(blue_state, self.host_order)

        terminated = self.current_step >= self.max_steps
        truncated = False

        info = {
            "red_action": red_action,
            "blue_action": blue_action,
            "environment": env_state,
        }

        if terminated:
            # end-of-episode reward from the drill verdict: +50 DEFENDED, -50 BREACHED
            outcome = blue_outcome_reward(env_state["hosts"])
            blue_reward += outcome
            info["outcome_reward"] = outcome

        return np.array(obs_vec, dtype=np.float32), float(blue_reward), terminated, truncated, info

    # ------------------------------------------------------------
    def _red_turn(self) -> Dict[str, Any]:
        if self.red_pool is None:
            return self.red_agent.choose_action()
        obs = flatten_red_state(self.orch.get_red_state(), self.host_order)
        mask = red_action_mask(self.environment, self.host_order, self.red_agent)
        return decode_red_action(self.red_agent, self.host_order, act(self.red_pool.current, obs, mask))

    # ------------------------------------------------------------
    def action_masks(self) -> np.ndarray:
        return blue_action_mask(self.environment, self.host_order)

    # ------------------------------------------------------------
    def render(self):
        snapshot = self.orch._snapshot_environment()
        print(f"[BLUE ENV] Step {self.current_step}/{self.max_steps}")
        for name, host in snapshot.get("hosts", {}).items():
            print(f"  {name}: compromised={host.get('is_compromised')}, "
                  f"access={host.get('access_level')}, vulns={len(host.get('vulnerabilities', []))}")

    def close(self):
        self.orch = None
