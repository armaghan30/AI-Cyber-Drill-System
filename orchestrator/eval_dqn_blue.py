import numpy as np

from .rl_env_blue import BlueRLEnvironment
from .dqn_agent_blue import DQNAgentBlue


def main():
    print("\n========== BLUE DQN EVALUATION ==========\n")

    topology_path = "orchestrator/sample_topology.yaml"

    env = BlueRLEnvironment(topology_path, max_steps=20)

    # Load trained Blue model
    agent = DQNAgentBlue.load("blue_dqn_model.pth")
    agent.epsilon = 0.0  

    print("[INFO] Loaded Blue DQN model.")
    print(f"[INFO] Observation dim : {agent.state_dim}")
    print(f"[INFO] Action dim       : {agent.action_dim}")

    obs_vec, info = env.reset()

    done = False
    step = 0
    total_reward = 0.0

    print("\n===== STARTING BLUE EVALUATION =====\n")

    while not done:
        step += 1
        print(f"--- STEP {step} ---")

        # Choose action
        action_id = agent.act(obs_vec, eval_mode=True)
        next_obs, reward, terminated, truncated, info = env.step(action_id)

        done = terminated or truncated
        total_reward += reward
        obs_vec = next_obs

        print(f"RED ACTION : {info['red_action']}")
        print(f"BLUE ACTION: {info['blue_action']}")
        print(f"REWARD     : {reward}")
        print()

    print("\n===== BLUE EVALUATION COMPLETE =====")
    print(f"Total Reward: {total_reward:.2f}")


if __name__ == "__main__":
    main()
