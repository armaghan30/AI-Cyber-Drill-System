from __future__ import annotations

import csv
import numpy as np

from .orchestrator_core import Orchestrator
from .dqn_agent_red import DQNAgentRed
from .dqn_agent_blue import DQNAgentBlue
from .state_vectors import flatten_red_state, flatten_blue_state


def decode_red_action_id(action_id: int, host_order: list[str], orch: Orchestrator) -> dict:
    n = len(host_order)
    if action_id < n:
        return orch.red_agent.scan(host_order[action_id])
    elif action_id < 2 * n:
        return orch.red_agent.exploit(host_order[action_id - n])
    elif action_id < 3 * n:
        return orch.red_agent.escalate_privileges(host_order[action_id - 2 * n])
    elif action_id < 4 * n:
        return orch.red_agent.lateral_move(host_order[action_id - 3 * n])
    elif action_id < 5 * n:
        return orch.red_agent.exfiltrate(host_order[action_id - 4 * n])
    else:
        return {"action": "idle", "target": None}


def decode_blue_action_id(action_id: int, host_order: list[str], orch: Orchestrator) -> dict:
    n = len(host_order)
    if action_id < n:
        return {"action": "patch", "target": host_order[action_id]}
    elif action_id < 2 * n:
        return {"action": "isolate", "target": host_order[action_id - n]}
    elif action_id < 3 * n:
        return {"action": "restore", "target": host_order[action_id - 2 * n]}
    elif action_id < 4 * n:
        return orch.blue_agent.make_detect_action(host_order[action_id - 3 * n])
    elif action_id < 5 * n:
        return {"action": "harden", "target": host_order[action_id - 4 * n]}
    else:
        return {"action": "idle", "target": None}


def main():
    topology_path = "orchestrator/sample_topology.yaml"
    max_steps = 20
    num_episodes = 1  
    red_agent = DQNAgentRed.load("red_dqn_model.pth")
    red_agent.epsilon = 0.0
    blue_agent = DQNAgentBlue.load("blue_dqn_model.pth")
    blue_agent.epsilon = 0.0

    red_rewards = []
    blue_rewards = []

    for ep in range(1, num_episodes + 1):
        orch = Orchestrator(topology_path)
        orch.load_topology()
        orch.build_environment()
        orch.init_red_agent()
        orch.init_blue_agent()

        host_order = list(orch.environment.hosts.keys())

        total_red_reward = 0.0
        total_blue_reward = 0.0

        print("\n=========== MARL EVALUATION EPISODE START ===========\n")

        for step in range(1, max_steps + 1):
            prev_env_state = orch._snapshot_environment()

            # RED side
            red_state = orch.get_red_state()
            red_vec = flatten_red_state(red_state, host_order)
            red_action_id = red_agent.act(red_vec, eval_mode=True)
            red_action = decode_red_action_id(red_action_id, host_order, orch)

            # BLUE side
            blue_state = orch.get_blue_state()
            blue_vec = flatten_blue_state(blue_state, host_order)
            blue_action_id = blue_agent.act(blue_vec, eval_mode=True)
            blue_action = decode_blue_action_id(blue_action_id, host_order, orch)

            # Apply actions
            env_state = orch.environment.step(red_action, blue_action)

            red_r, blue_r = orch.reward_engine.compute_rewards(
                prev_env_state, env_state, red_action, blue_action
            )

            total_red_reward += red_r
            total_blue_reward += blue_r

            print(f"RED action : {red_action}")
            print(f"BLUE action: {blue_action}")
            print(f"Red Reward = {red_r:.2f} | Blue Reward = {blue_r:.2f}\n")

        print("=========== MARL EVALUATION COMPLETE ===========")
        print(f"Total RED Reward  = {total_red_reward:.2f}")
        print(f"Total BLUE Reward = {total_blue_reward:.2f}")
        print("Final environment state:")
        print(orch._snapshot_environment())

        red_rewards.append(total_red_reward)
        blue_rewards.append(total_blue_reward)

    # -------- Saveing rewards to CSV per-episode --------
    with open("marl_rewards_red.csv", "w", newline="") as f_red, open(
        "marl_rewards_blue.csv", "w", newline=""
    ) as f_blue:
        red_writer = csv.writer(f_red)
        blue_writer = csv.writer(f_blue)

        red_writer.writerow(["episode", "reward"])
        blue_writer.writerow(["episode", "reward"])

        for i, (rr, br) in enumerate(zip(red_rewards, blue_rewards), start=1):
            red_writer.writerow([i, rr])
            blue_writer.writerow([i, br])

    print("\n[MARL] Episode rewards saved to marl_rewards_red.csv and marl_rewards_blue.csv")


if __name__ == "__main__":
    main()
