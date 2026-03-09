

from __future__ import annotations

from orchestrator.rl_env_red import RedRLEnvironment
from orchestrator.dqn_agent_red import DQNAgentRed


def load_red_agent(path: str) -> DQNAgentRed:
    agent = DQNAgentRed.load(path)
    agent.epsilon = 0.0  
    print("[EVAL RED] RED DQN model loaded successfully.")
    return agent


def main():
    model_path = "red_dqn_model.pth"
    topology_path = "orchestrator/sample_topology.yaml"
    max_steps = 20

    # 1) Load agent
    agent = load_red_agent(model_path)

    # 2) Build environment
    env = RedRLEnvironment(topology_path, max_steps=max_steps)

    # 3) Run a single evaluation episode
    state, _ = env.reset()
    total_reward = 0.0

    print("=========== RED DQN EVALUATION START ===========\n")

    for step in range(1, max_steps + 1):
        action = agent.act(state, eval_mode=True)
        next_state, reward, terminated, truncated, info = env.step(action)

        red_action = info["red_action"]
        blue_action = info["blue_action"]

        print(f"--- Step {step} ---")
        print(f"RED action : {red_action}")
        print(f"BLUE action: {blue_action}")
        print(f"Red Reward = {reward:.2f}\n")

        total_reward += reward
        state = next_state

        if terminated or truncated:
            break

    print("=========== RED DQN EVALUATION COMPLETE ===========")
    print(f"Total RED Reward = {total_reward:.2f}")


if __name__ == "__main__":
    main()
