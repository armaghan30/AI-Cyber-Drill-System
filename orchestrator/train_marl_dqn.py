import csv

from orchestrator.multi_agent_env import MultiAgentEnv
from orchestrator.dqn_agent_red import DQNAgentRed
from orchestrator.dqn_agent_blue import DQNAgentBlue


def main():
    import sys
    topology_path = sys.argv[1] if len(sys.argv) > 1 else "orchestrator/sample_topology.yaml"
    num_episodes = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    max_steps_per_episode = int(sys.argv[3]) if len(sys.argv) > 3 else 20

    gamma = 0.99
    lr = 1e-3
    batch_size = 64
    buffer_capacity = 5000
    epsilon_start = 1.0
    epsilon_end = 0.05
    epsilon_decay_steps = 5000
    target_update_freq = 500

    env = MultiAgentEnv(topology_path, max_steps=max_steps_per_episode)

    # Inspect initial observation shapes & action dims
    obs, _ = env.reset()
    red_state_dim = obs["red"].shape[0]
    blue_state_dim = obs["blue"].shape[0]
    red_action_dim = env.red_action_dim
    blue_action_dim = env.blue_action_dim

    print(f"[MARL INFO] RED  state_dim={red_state_dim}, action_dim={red_action_dim}")
    print(f"[MARL INFO] BLUE state_dim={blue_state_dim}, action_dim={blue_action_dim}")

    # Use the same DQN architecture for both agents
    red_agent = DQNAgentRed(
        state_dim=red_state_dim,
        action_dim=red_action_dim,
        lr=lr,
        gamma=gamma,
        batch_size=batch_size,
        buffer_capacity=buffer_capacity,
        epsilon_start=epsilon_start,
        epsilon_end=epsilon_end,
        epsilon_decay=epsilon_decay_steps,
        target_update_freq=target_update_freq,
    )

    blue_agent = DQNAgentBlue(
        state_dim=blue_state_dim,
        action_dim=blue_action_dim,
        lr=lr,
        gamma=gamma,
        batch_size=batch_size,
        buffer_capacity=buffer_capacity,
        epsilon_start=epsilon_start,
        epsilon_end=epsilon_end,
        epsilon_decay=epsilon_decay_steps,
        target_update_freq=target_update_freq,
    )

    red_rewards = []
    blue_rewards = []

    for episode in range(1, num_episodes + 1):
        obs, _ = env.reset()
        red_state = obs["red"]
        blue_state = obs["blue"]

        done = False
        step_counter = 0
        ep_red_reward = 0.0
        ep_blue_reward = 0.0

        print(f"\n[MARL EPISODE {episode}/{num_episodes}] Starting...")

        while not done:
            step_counter += 1
            if step_counter > max_steps_per_episode:
                print(f"[MARL EPISODE {episode}] Safety break at {step_counter} steps.")
                break

            # Each agent chooses an action based on its own state
            red_action_id = red_agent.act(red_state)
            blue_action_id = blue_agent.act(blue_state)

            next_obs, rewards, terminated, truncated, info = env.step(
                {"red": red_action_id, "blue": blue_action_id}
            )
            done = terminated or truncated

            red_next_state = next_obs["red"]
            blue_next_state = next_obs["blue"]

            red_r = rewards["red"]
            blue_r = rewards["blue"]

            # Store transitions and train
            red_agent.store_transition(red_state, red_action_id, red_r, red_next_state, done)
            red_agent.update()

            blue_agent.store_transition(blue_state, blue_action_id, blue_r, blue_next_state, done)
            blue_agent.update()

            red_state = red_next_state
            blue_state = blue_next_state

            ep_red_reward += red_r
            ep_blue_reward += blue_r

        red_rewards.append(ep_red_reward)
        blue_rewards.append(ep_blue_reward)

        print(
            f"[MARL EPISODE {episode}/{num_episodes}] "
            f"Steps={step_counter} | "
            f"RedReward={ep_red_reward:.2f} | BlueReward={ep_blue_reward:.2f} | "
            f"RedEps={red_agent.epsilon:.3f} | BlueEps={blue_agent.epsilon:.3f}"
        )

    # Save trained models
    red_agent.save("marl_red_dqn.pth")
    blue_agent.save("marl_blue_dqn.pth")
    print("\n[MARL INFO] Training finished. Models saved as marl_red_dqn.pth and marl_blue_dqn.pth")

    # Save episode rewards
        
    with open("marl_rewards_red.csv", "w", newline="") as f_red:
        with open("marl_rewards_blue.csv", "w", newline="") as f_blue:
            red_writer = csv.writer(f_red)
            blue_writer = csv.writer(f_blue)

            red_writer.writerow(["episode", "reward"])
            blue_writer.writerow(["episode", "reward"])

            for i, (rr, br) in enumerate(zip(red_rewards, blue_rewards), start=1):
                red_writer.writerow([i, rr])
                blue_writer.writerow([i, br])


    print("[MARL INFO] Episode rewards saved to marl_rewards_red.csv & marl_rewards_blue.csv")


if __name__ == "__main__":
    main()
