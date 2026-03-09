from __future__ import annotations

from typing import Dict, Any, Tuple

import numpy as np
import gymnasium as gym
from gymnasium import spaces

from orchestrator.orchestrator_core import Orchestrator
from orchestrator.state_vectors import flatten_red_state


def build_blue_obs(env_state: Dict[str, Any], host_order) -> np.ndarray:
    hosts = env_state.get("hosts", {})
    feats: list[float] = []

    total_comp = 0
    total_vulns = 0

    for name in host_order:
        h = hosts[name]
        is_comp = float(h.get("is_compromised", False))
        num_v = float(len(h.get("vulnerabilities", [])))
        is_iso = float(h.get("is_isolated", False))
        detected = float(h.get("detected", False))
        hardened = float(h.get("hardened_level", 0))
        exfil = float(h.get("data_exfiltrated", False))

        total_comp += int(is_comp)
        total_vulns += int(num_v)

        feats.extend([is_comp, num_v, is_iso, detected, hardened, exfil])

    feats.append(float(total_comp))
    feats.append(float(total_vulns))

    return np.array(feats, dtype=np.float32)


class MultiAgentEnv(gym.Env):
    

    metadata = {"render_modes": ["human"]}

    def __init__(self, topology_path: str, max_steps: int = 20):
        super().__init__()
        self.topology_path = topology_path
        self.max_steps = max_steps
        self.step_counter = 0

        # built orchestrator + env + agents
        self.orch = Orchestrator(self.topology_path)
        self.orch.load_topology()
        self.orch.build_environment()
        self.orch.init_red_agent()
        self.orch.init_blue_agent()

        # host order
        self.host_order = list(self.orch.environment.hosts.keys())
        self.num_hosts = len(self.host_order)

        # action spaces
        self.red_action_dim = 5 * self.num_hosts + 1
        self.blue_action_dim = 5 * self.num_hosts + 1

        self.action_space = spaces.Dict({
            "red": spaces.Discrete(self.red_action_dim),
            "blue": spaces.Discrete(self.blue_action_dim),
        })

        red_state = self.orch.get_red_state()
        red_vec = flatten_red_state(red_state, self.host_order)

        snap = self.orch._snapshot_environment()
        blue_vec = build_blue_obs(snap, self.host_order)

        self.observation_space = spaces.Dict({
            "red": spaces.Box(
                low=-np.inf,
                high=np.inf,
                shape=(red_vec.shape[0],),
                dtype=np.float32,
            ),
            "blue": spaces.Box(
                low=-np.inf,
                high=np.inf,
                shape=(blue_vec.shape[0],),
                dtype=np.float32,
            ),
        })

    # ---------------------------------------------------------------------------------------
    def reset(self, seed=None, options=None) -> Tuple[Dict[str, np.ndarray], dict]:
        super().reset(seed=seed)
        self.step_counter = 0

        # rebuilt env + agents fresh
        self.orch.load_topology()
        self.orch.build_environment()
        self.orch.init_red_agent()
        self.orch.init_blue_agent()

        self.host_order = list(self.orch.environment.hosts.keys())
        self.num_hosts = len(self.host_order)
        self.red_action_dim = 5 * self.num_hosts + 1
        self.blue_action_dim = 5 * self.num_hosts + 1

        red_state = self.orch.get_red_state()
        red_vec = flatten_red_state(red_state, self.host_order)

        snap = self.orch._snapshot_environment()
        blue_vec = build_blue_obs(snap, self.host_order)

        obs = {"red": red_vec, "blue": blue_vec}
        info: dict = {}
        return obs, info

    def _decode_red_action(self, action_id: int) -> Dict[str, Any]:
        n = self.num_hosts
        if action_id < 0 or action_id >= self.red_action_dim:
            raise ValueError(f"Invalid RED action_id={action_id}")

        if action_id < n:
            target = self.host_order[action_id]
            return self.orch.red_agent.scan(target)
        elif action_id < 2 * n:
            target = self.host_order[action_id - n]
            return self.orch.red_agent.exploit(target)
        elif action_id < 3 * n:
            target = self.host_order[action_id - 2 * n]
            return self.orch.red_agent.escalate_privileges(target)
        elif action_id < 4 * n:
            target = self.host_order[action_id - 3 * n]
            return self.orch.red_agent.lateral_move(target)
        elif action_id < 5 * n:
            target = self.host_order[action_id - 4 * n]
            return self.orch.red_agent.exfiltrate(target)
        else:
            return {"action": "idle", "target": None}

    def _decode_blue_action(self, action_id: int) -> Dict[str, Any]:
        n = self.num_hosts
        if action_id < 0 or action_id >= self.blue_action_dim:
            raise ValueError(f"Invalid BLUE action_id={action_id}")

        if action_id < n:
            target = self.host_order[action_id]
            return {"action": "patch", "target": target}
        elif action_id < 2 * n:
            target = self.host_order[action_id - n]
            return {"action": "isolate", "target": target}
        elif action_id < 3 * n:
            target = self.host_order[action_id - 2 * n]
            return {"action": "restore", "target": target}
        elif action_id < 4 * n:
            target = self.host_order[action_id - 3 * n]
            return self.orch.blue_agent.make_detect_action(target)
        elif action_id < 5 * n:
            target = self.host_order[action_id - 4 * n]
            return {"action": "harden", "target": target}
        else:
            return {"action": "idle", "target": None}

    # ----------------------------------------------------------------------------------
    def step(self, actions: Dict[str, int]):
        
        red_id = int(actions["red"])
        blue_id = int(actions["blue"])

        prev_state = self.orch._snapshot_environment()

        red_action = self._decode_red_action(red_id)
        blue_action = self._decode_blue_action(blue_id)

        new_state = self.orch.environment.step(red_action, blue_action)

        red_r, blue_r = self.orch.reward_engine.compute_rewards(
            prev_state, new_state, red_action, blue_action
        )

        # built next observations
        red_state = self.orch.get_red_state()
        red_vec = flatten_red_state(red_state, self.host_order)
        blue_vec = build_blue_obs(new_state, self.host_order)

        self.step_counter += 1
        terminated = self.step_counter >= self.max_steps
        truncated = False  

        obs = {"red": red_vec, "blue": blue_vec}
        rewards = {"red": float(red_r), "blue": float(blue_r)}
        info = {
            "red_action": red_action,
            "blue_action": blue_action,
            "state": new_state,
        }

        return obs, rewards, terminated, truncated, info

    # ---------------------------------------------------------------------------------
    def render(self):
        print(self.orch._snapshot_environment())

    def close(self):
        self.orch = None
