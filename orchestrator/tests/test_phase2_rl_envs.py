import numpy as np

from orchestrator.rl_env_red import RedRLEnvironment
from orchestrator.rl_env_blue import BlueRLEnvironment


def test_red_rl_dims_2host():
    env = RedRLEnvironment("orchestrator/sample_topology.yaml", max_steps=5)
    assert env.action_dim == 11    # 5*2 + 1
    assert env.state_dim == 21     # 3 + 9*2


def test_blue_rl_dims_2host():
    env = BlueRLEnvironment("orchestrator/sample_topology.yaml", max_steps=5)
    assert env.action_dim == 11    # 5*2 + 1
    assert env.state_dim == 18     # 2 + 8*2


def test_red_rl_dims_4host():
    env = RedRLEnvironment("orchestrator/topology_4host.yaml", max_steps=5)
    assert env.action_dim == 21    # 5*4 + 1
    assert env.state_dim == 39     # 3 + 9*4


def test_blue_rl_dims_4host():
    env = BlueRLEnvironment("orchestrator/topology_4host.yaml", max_steps=5)
    assert env.action_dim == 21    # 5*4 + 1
    assert env.state_dim == 34     # 2 + 8*4


def test_red_rl_dims_8host():
    env = RedRLEnvironment("orchestrator/topology_8host.yaml", max_steps=5)
    assert env.action_dim == 41    # 5*8 + 1
    assert env.state_dim == 75     # 3 + 9*8


def test_blue_rl_dims_8host():
    env = BlueRLEnvironment("orchestrator/topology_8host.yaml", max_steps=5)
    assert env.action_dim == 41    # 5*8 + 1
    assert env.state_dim == 66     # 2 + 8*8


def test_red_decode_all_actions_2host():
    env = RedRLEnvironment("orchestrator/sample_topology.yaml", max_steps=5)
    actions = []
    for i in range(env.action_dim):
        a = env._decode_red_action(i)
        actions.append(a["action"])

    assert actions[0] == "scan"       # scan H1
    assert actions[1] == "scan"       # scan H2
    assert actions[2] == "exploit"    # exploit H1
    assert actions[3] == "exploit"    # exploit H2
    assert actions[4] == "escalate"   # escalate H1
    assert actions[5] == "escalate"   # escalate H2
    assert actions[6] == "lateral_move"  # lateral H1
    assert actions[7] == "lateral_move"  # lateral H2
    assert actions[8] == "exfiltrate"    # exfil H1
    assert actions[9] == "exfiltrate"    # exfil H2
    assert actions[10] == "idle"


def test_blue_decode_all_actions_2host():
    env = BlueRLEnvironment("orchestrator/sample_topology.yaml", max_steps=5)
    actions = []
    for i in range(env.action_dim):
        a = env._decode_blue_action(i)
        actions.append(a["action"])

    assert actions[0] == "patch"
    assert actions[1] == "patch"
    assert actions[2] == "isolate"
    assert actions[3] == "isolate"
    assert actions[4] == "restore"
    assert actions[5] == "restore"
    assert actions[6] == "detect"
    assert actions[7] == "detect"
    assert actions[8] == "harden"
    assert actions[9] == "harden"
    assert actions[10] == "idle"


def test_red_full_episode_2host():
    env = RedRLEnvironment("orchestrator/sample_topology.yaml", max_steps=10)
    obs, _ = env.reset()
    for _ in range(10):
        action = env.action_space.sample()
        obs, reward, terminated, truncated, info = env.step(action)
        assert obs.shape[0] == env.state_dim
        if terminated or truncated:
            break


def test_red_full_episode_4host():
    env = RedRLEnvironment("orchestrator/topology_4host.yaml", max_steps=10)
    obs, _ = env.reset()
    for _ in range(10):
        action = env.action_space.sample()
        obs, reward, terminated, truncated, info = env.step(action)
        assert obs.shape[0] == env.state_dim
        if terminated or truncated:
            break


def test_red_full_episode_8host():
    env = RedRLEnvironment("orchestrator/topology_8host.yaml", max_steps=10)
    obs, _ = env.reset()
    for _ in range(10):
        action = env.action_space.sample()
        obs, reward, terminated, truncated, info = env.step(action)
        assert obs.shape[0] == env.state_dim
        if terminated or truncated:
            break
