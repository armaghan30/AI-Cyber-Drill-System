from __future__ import annotations

from typing import Dict, Any, List

import numpy as np

from orchestrator.orchestrator_core import Orchestrator
from orchestrator.state_vectors import flatten_red_state, flatten_blue_state
from orchestrator.dqn_agent_red import DQNAgentRed
from orchestrator.dqn_agent_blue import DQNAgentBlue
from orchestrator.reward_engine import RewardEngine


def decode_red_action(index: int, host_order: List[str], orch: Orchestrator) -> Dict[str, Any]:
    n = len(host_order)
    action_dim = 5 * n + 1

    if index < 0 or index >= action_dim:
        raise ValueError(f"Invalid RED action index: {index}")

    if index < n:
        return orch.red_agent.scan(host_order[index])
    elif index < 2 * n:
        return orch.red_agent.exploit(host_order[index - n])
    elif index < 3 * n:
        return orch.red_agent.escalate_privileges(host_order[index - 2 * n])
    elif index < 4 * n:
        return orch.red_agent.lateral_move(host_order[index - 3 * n])
    elif index < 5 * n:
        return orch.red_agent.exfiltrate(host_order[index - 4 * n])
    else:
        return {"action": "idle", "target": None}


def decode_blue_action(index: int, host_order: List[str], orch: Orchestrator) -> Dict[str, Any]:
    n = len(host_order)
    action_dim = 5 * n + 1

    if index < 0 or index >= action_dim:
        raise ValueError(f"Invalid BLUE action index: {index}")

    if index < n:
        return {"action": "patch", "target": host_order[index]}
    elif index < 2 * n:
        return {"action": "isolate", "target": host_order[index - n]}
    elif index < 3 * n:
        return {"action": "restore", "target": host_order[index - 2 * n]}
    elif index < 4 * n:
        return orch.blue_agent.make_detect_action(host_order[index - 3 * n])
    elif index < 5 * n:
        return {"action": "harden", "target": host_order[index - 4 * n]}
    else:
        return {"action": "idle", "target": None}


def main():
    topology_path = "orchestrator/sample_topology.yaml"
    max_steps = 20

    # Orchestrator + environment + rule-based agents (for internal logic)
    orch = Orchestrator(topology_path)
    orch.load_topology()
    orch.build_environment()
    orch.init_red_agent()
    orch.init_blue_agent()

    env = orch.environment
    reward_engine = RewardEngine()
    host_order = list(env.hosts.keys())
    print(f"[EVAL] Host order: {host_order}")

    # Loading trained RL agents 
    red_agent = DQNAgentRed.load("red_dqn_model.pth")
    blue_agent = DQNAgentBlue.load("blue_dqn_model.pth")

    total_red_reward = 0.0
    total_blue_reward = 0.0

    print("\n=========== EVALUATION EPISODE START ===========\n")

    for step in range(1, max_steps + 1):
        red_state = orch.get_red_state()
        blue_state = orch.get_blue_state()

        red_vec = flatten_red_state(red_state, host_order)
        blue_vec = flatten_blue_state(blue_state, host_order)

        print(
            f"[DEBUG] Step {step} | red_vec dim={red_vec.shape[0]}, "
            f"blue_vec dim={blue_vec.shape[0]}"
        )

        # DQN choose discrete actions
        red_action_id = red_agent.act(red_vec, eval_mode=True)
        blue_action_id = blue_agent.act(blue_vec, eval_mode=True)

        # Decoding into concrete actions
        red_action = decode_red_action(red_action_id, host_order, orch)
        blue_action = decode_blue_action(blue_action_id, host_order, orch)

        prev_state = orch._snapshot_environment()
        env_state = env.step(red_action, blue_action)

        red_reward, blue_reward = reward_engine.compute_rewards(
            prev_state, env_state, red_action, blue_action
        )

        total_red_reward += red_reward
        total_blue_reward += blue_reward

        print(
            f"STEP {step} | RED={red_action} (R={red_reward:.2f}) | "
            f"BLUE={blue_action} (R={blue_reward:.2f})"
        )

    print("\n=========== EVALUATION COMPLETE ===========")
    print(f"Total RED Reward  = {total_red_reward:.2f}")
    print(f"Total BLUE Reward = {total_blue_reward:.2f}")


if __name__ == "__main__":
    main()
