import torch
import numpy as np
import matplotlib.pyplot as plt

from orchestrator.dqn_agent_red import DQNAgentRed
from orchestrator.rl_env_red import RedRLEnvironment
from orchestrator.state_vectors import flatten_red_state


def evaluate_model(
    model_path="red_dqn_model.pth",
    topology_path="orchestrator/sample_topology.yaml",
    episodes=20,
    max_steps=20,
    save_plot="red_eval_plot.png"
):
    print("\n========== RED DQN EVALUATION REPORT ==========\n")
    print(f"Loading model from: {model_path}")

    # -------- Environment --------
    env = RedRLEnvironment(topology_path, max_steps=max_steps)

    # -------------------Gymnasium reset --------------
    _, _ = env.reset()

    init_state = env.orch.get_red_state()

    host_order = sorted(env.orch.environment.hosts.keys())
    state_dim = flatten_red_state(init_state, host_order).shape[0]
    action_dim = env.action_dim

    # -------- Agent --------
    agent = DQNAgentRed.load(model_path)
    agent.epsilon = 0.0
    agent.online.eval()

    print(f"[INFO] Hosts: {host_order}")
    print(f"[INFO] State dim = {state_dim}, Actions = {action_dim}")

    episode_rewards = []
    episode_compromised = []

    # -------- RUN EVALUATION EPISODES --------
    for ep in range(1, episodes + 1):
        _, _ = env.reset()
        state_dict = env.orch.get_red_state()

        done = False
        total_reward = 0.0
        compromised = 0

        for step in range(max_steps):

            state_vec = flatten_red_state(state_dict, host_order)

            action_id = agent.act(state_vec, eval_mode=True)

            # Gymnasium step format
            next_obs, reward, terminated, truncated, info = env.step(action_id)
            done = terminated or truncated

            next_state_dict = env.orch.get_red_state()
            state_dict = next_state_dict

            total_reward += reward

            # Count current compromised hosts
            hosts = state_dict["hosts"]
            compromised = sum(h["is_compromised"] for h in hosts.values())

            if done:
                break

        episode_rewards.append(total_reward)
        episode_compromised.append(compromised)

        print(
            f"Episode {ep:02d}: "
            f"Reward = {total_reward:.2f}, "
            f"Compromised Hosts = {compromised}"
        )

   
    plt.figure(figsize=(10, 5))
    plt.plot(episode_rewards, marker="o")
    plt.title("Red Agent: Total Reward Per Episode")
    plt.xlabel("Episode")
    plt.ylabel("Total Reward")
    plt.grid(True)
    plt.tight_layout()
    plt.savefig("red_rewards_plot.png")
    print("\n Saved reward plot -> red_rewards_plot.png")

    plt.figure(figsize=(10, 5))
    plt.plot(episode_compromised, marker="s", color="red")
    plt.title("Red Agent: Number of Compromised Hosts Per Episode")
    plt.xlabel("Episode")
    plt.ylabel("Compromised Hosts")
    plt.grid(True)
    plt.tight_layout()
    plt.savefig("red_compromised_plot.png")
    print(" Saved compromised hosts plot -> red_compromised_plot.png")

    print("\n========== SUMMARY ==========")
    print(f" Episodes evaluated: {episodes}")
    print(f" Avg reward: {np.mean(episode_rewards):.2f}")
    print(f" Max reward: {np.max(episode_rewards):.2f}")
    print(f" Min reward: {np.min(episode_rewards):.2f}")
    print(f" Avg compromised hosts: {np.mean(episode_compromised):.2f}")
    print("=============================================\n")


if __name__ == "__main__":
    evaluate_model()
