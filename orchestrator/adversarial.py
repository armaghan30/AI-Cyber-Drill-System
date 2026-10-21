"""Opponents for training and evaluation: a trained model, RANDOM, or None (rule-based agent)."""
from __future__ import annotations

import random
from collections import Counter
from typing import Any, Dict, List

import numpy as np

from orchestrator.action_masks import red_action_mask, blue_action_mask
from orchestrator.state_vectors import flatten_red_state, flatten_blue_state

RANDOM = "random"


def decode_red_action(red_agent, host_order: List[str], index: int) -> Dict[str, Any]:
    """Map a Red action index to the RedAgent call. 5 action types per host + idle."""
    n = len(host_order)
    if index < n:
        return red_agent.scan(host_order[index])
    elif index < 2 * n:
        return red_agent.exploit(host_order[index - n])
    elif index < 3 * n:
        return red_agent.escalate_privileges(host_order[index - 2 * n])
    elif index < 4 * n:
        return red_agent.lateral_move(host_order[index - 3 * n])
    elif index < 5 * n:
        return red_agent.exfiltrate(host_order[index - 4 * n])
    return {"action": "idle", "target": None}


def decode_blue_action(blue_agent, host_order: List[str], index: int) -> Dict[str, Any]:
    """Map a Blue action index to an action dict. 6 action types per host + idle."""
    n = len(host_order)
    if index < n:
        return {"action": "patch", "target": host_order[index]}
    elif index < 2 * n:
        return {"action": "isolate", "target": host_order[index - n]}
    elif index < 3 * n:
        return {"action": "restore", "target": host_order[index - 2 * n]}
    elif index < 4 * n:
        return blue_agent.make_detect_action(host_order[index - 3 * n])
    elif index < 5 * n:
        return {"action": "harden", "target": host_order[index - 4 * n]}
    elif index < 6 * n:
        return {"action": "deploy_firewall", "target": host_order[index - 5 * n]}
    return {"action": "idle", "target": None}


def load_policy(policy):
    if isinstance(policy, str) and policy != RANDOM:
        from sb3_contrib import MaskablePPO
        return MaskablePPO.load(policy)
    return policy


def act(policy, obs, mask, deterministic=False) -> int:
    """Action index from a trained model or the RANDOM policy (never the rule-based agent)."""
    if isinstance(policy, str) and policy == RANDOM:
        return int(np.random.choice(np.flatnonzero(mask)))
    idx, _ = policy.predict(obs, action_masks=mask, deterministic=deterministic)
    return int(idx)


class OpponentPool:
    """Past opponent snapshots; one is picked per episode."""

    def __init__(self, policies, latest_weight=None):
        if not policies:
            raise ValueError("OpponentPool needs at least one policy")
        self.policies = [load_policy(p) for p in policies]
        self.latest_weight = latest_weight
        self.current = self.policies[-1]

    def sample(self):
        if self.latest_weight is None:
            self.current = random.choice(self.policies)
        elif len(self.policies) == 1 or random.random() < self.latest_weight:
            self.current = self.policies[-1]
        else:
            self.current = random.choice(self.policies[:-1])
        return self.current


def make_pool(opponent):
    """None -> rule-based opponent (no pool); a model / path / RANDOM -> single opponent; list -> pool."""
    if opponent is None or isinstance(opponent, OpponentPool):
        return opponent
    if not isinstance(opponent, (list, tuple)):
        opponent = [opponent]
    return OpponentPool(opponent)


def play_drill(topology_path, red=None, blue=None, steps=15, deterministic=False):
    """One drill between any two opponents, same step order as the app."""
    from orchestrator.orchestrator_core import Orchestrator

    orch = Orchestrator(topology_path)
    orch.load_topology()
    orch.build_environment()
    orch.init_red_agent()
    orch.init_blue_agent()
    env, hosts = orch.environment, list(orch.environment.hosts)
    red_actions, blue_actions = Counter(), Counter()

    for _ in range(steps):
        red_obs = flatten_red_state(orch.get_red_state(), hosts)
        blue_obs = flatten_blue_state(orch.get_blue_state(), hosts)
        red_mask = red_action_mask(env, hosts, orch.red_agent)
        blue_mask = blue_action_mask(env, hosts)

        if red is None:
            red_action = orch.red_agent.choose_action()
        else:
            red_action = decode_red_action(orch.red_agent, hosts, act(red, red_obs, red_mask, deterministic))
        if blue is None:
            blue_action = orch.blue_agent.choose_action(red_action)
        else:
            blue_action = decode_blue_action(orch.blue_agent, hosts, act(blue, blue_obs, blue_mask, deterministic))

        env.step(red_action, blue_action)
        red_actions[red_action.get("action", "idle")] += 1
        blue_actions[blue_action.get("action", "idle")] += 1

    final_hosts = {n: {"is_compromised": h.is_compromised, "data_exfiltrated": h.data_exfiltrated}
                   for n, h in env.hosts.items()}
    return final_hosts, red_actions, blue_actions
