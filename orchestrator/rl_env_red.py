from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import gymnasium as gym
from gymnasium import spaces

from orchestrator.orchestrator_core import Orchestrator
from orchestrator.state_vectors import flatten_red_state
from orchestrator.reward_engine import RewardEngine


class RedRLEnvironment(gym.Env):

    metadata = {"render_modes": ["human"]}

    def __init__(self, topology_path: str, max_steps: int = 20, seed: int | None = None):
        super().__init__()
        self.topology_path = topology_path
        self.max_steps = max_steps
        self.current_step = 0

        self._build_orchestrator()

        self.reward_engine = RewardEngine()
        self.np_random = np.random.default_rng(seed)

        red_state = self.orch.get_red_state()
        self.host_order: List[str] = list(self.environment.hosts.keys())

        example_vec = flatten_red_state(red_state, self.host_order)
        self.state_dim = int(example_vec.shape[0])

        self.action_dim = 5 * len(self.host_order) + 1

        self.observation_space = spaces.Box(
            low=0.0, high=100.0, shape=(self.state_dim,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(self.action_dim)

        print(f"[INFO] RED RL Env -> state_dim={self.state_dim}, action_dim={self.action_dim}")

    # ---------------------------------------------------------------------------------
    def _build_orchestrator(self):
        self.orch = Orchestrator(self.topology_path)
        self.orch.load_topology()
        self.orch.build_environment()
        self.orch.init_red_agent()
        self.orch.init_blue_agent()

        self.environment = self.orch.environment
        self.red_agent = self.orch.red_agent
        self.blue_agent = self.orch.blue_agent

    # ------------------------------------------------------------------------------
    def _decode_red_action(self, index: int) -> Dict[str, Any]:
        n = len(self.host_order)

        if index < 0 or index >= self.action_dim:
            raise ValueError(f"Invalid RED action index: {index}")

        if index < n:
            host = self.host_order[index]
            return self.red_agent.scan(host)
        elif index < 2 * n:
            host = self.host_order[index - n]
            return self.red_agent.exploit(host)
        elif index < 3 * n:
            host = self.host_order[index - 2 * n]
            return self.red_agent.escalate_privileges(host)
        elif index < 4 * n:
            host = self.host_order[index - 3 * n]
            return self.red_agent.lateral_move(host)
        elif index < 5 * n:
            host = self.host_order[index - 4 * n]
            return self.red_agent.exfiltrate(host)
        else:
            return {"action": "idle", "target": None}

    # ------------------------------------------------------------
    def reset(self, seed: int | None = None, options: Dict | None = None):
        
        #Gymnasium-style reset:
        
        if seed is not None:
            self.np_random = np.random.default_rng(seed)

        self.current_step = 0
        self._build_orchestrator()

        red_state = self.orch.get_red_state()
        self.host_order = list(self.environment.hosts.keys())

        obs_vec = flatten_red_state(red_state, self.host_order)
        return np.array(obs_vec, dtype=np.float32), {}

    # ------------------------------------------------------------
    def step(self, action_index: int):
        
        #Gymnasium-style step:
        #returns (obs, reward, terminated, truncated, info)
        
        self.current_step += 1

        red_action = self._decode_red_action(int(action_index))

       
        blue_action = self.blue_agent.choose_action(red_action)

        prev_state = self.orch._snapshot_environment()

        # Apply actions to environment
        env_state = self.environment.step(red_action, blue_action)

        # Reward for RED
        red_reward, blue_reward = self.reward_engine.compute_rewards(
            prev_state, env_state, red_action, blue_action
        )

        # Build next observation
        red_state = self.orch.get_red_state()
        obs_vec = flatten_red_state(red_state, self.host_order)

        terminated = self.current_step >= self.max_steps
        truncated = False

        info = {
            "red_action": red_action,
            "blue_action": blue_action,
            "environment": env_state,
        }

        return np.array(obs_vec, dtype=np.float32), float(red_reward), terminated, truncated, info

    # ------------------------------------------------------------
    def render(self):
        snapshot = self.orch._snapshot_environment()
        print(f"[RED ENV] Step {self.current_step}/{self.max_steps}")
        for name, host in snapshot.get("hosts", {}).items():
            print(f"  {name}: compromised={host.get('is_compromised')}, "
                  f"access={host.get('access_level')}, vulns={len(host.get('vulnerabilities', []))}")

    def close(self):
        self.orch = None
