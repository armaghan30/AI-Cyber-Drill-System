# AI-Powered Cyber Drill System

Reinforcement Learning-based Red & Blue Team simulation on a custom Cyber Range Environment.

## Overview

This system simulates realistic cybersecurity scenarios using **Reinforcement Learning (RL)** where autonomous agents learn attack and defense strategies through experience:

- **Red Agent (Attacker)** — learns to scan, exploit, escalate privileges, move laterally, and exfiltrate data
- **Blue Agent (Defender)** — learns to patch, isolate, detect, restore, and harden network hosts
- Both agents are trained using **Stable Baselines 3 (SB3) DQN** on a custom Gymnasium-compatible cyber range environment
- The system supports **3 network topologies** of increasing complexity (2-host, 4-host, 8-host)

Built as a Final Year Project (FYP) to demonstrate AI-driven cybersecurity assessment.

---

## Key Features

- **Custom Cyber Range Environment** — built from scratch with configurable YAML-based network topologies
- **10 Agent Actions** — 5 Red attacks + 5 Blue defenses with realistic success probabilities
- **SB3 DQN Training** — industry-standard Deep Q-Network via Stable Baselines 3
- **Multi-Topology Support** — 2-host (simple), 4-host (medium), 8-host (enterprise 3-tier)
- **TensorBoard Integration** — real-time training monitoring
- **Automated Training Pipeline** — single command trains all agents across all topologies
- **Gymnasium API** — standard RL interface (`reset()`, `step()`, `render()`)

---

## Architecture

```
Network Topology (YAML)
        |
   Environment (Gymnasium)
   rl_env_red.py / rl_env_blue.py
        |
   Orchestrator Core
   (state vectors, reward engine, env builder)
        |
   SB3 DQN Agent
   (train_sb3_dqn_red.py / train_sb3_dqn_blue.py)
        |
   Trained Model (.zip)
        |
   Evaluation (eval_sb3.py)
```

### Red Agent Actions
| # | Action       | Description                                              |
|---|--------------|----------------------------------------------------------|
| 1 | Scan         | Discover vulnerabilities on a target host                |
| 2 | Exploit      | Attempt to compromise a host using known vulnerabilities |
| 3 | Escalate     | Elevate access from user to root on a compromised host   |
| 4 | Lateral Move | Spread to adjacent hosts in the network                  |
| 5 | Exfiltrate   | Steal data from a compromised host with root access      |

### Blue Agent Actions
| # | Action  | Description                                        |
|---|---------|--------------------------------------------------- |
| 1 | Patch   | Remove a vulnerability from a host                 |
| 2 | Isolate | Disconnect a host from the network                 |
| 3 | Restore | Reset a compromised host to clean state            |
| 4 | Detect  | Scan a host for signs of compromise                |
| 5 | Harden  | Remove vulnerabilities and increase host resilience|

---

## Network Topologies

| Topology               | Hosts | Actions/Agent | Description                                 |
|------------------------|-------|---------------|---------------------------------------------|
| `sample_topology.yaml` |  2    |    11         | Simple network (Windows + Linux)            |
| `topology_4host.yaml`  |  4    |    21         | Medium enterprise with dual attack paths    |
| `topology_8host.yaml`  |  8    |    41         | 3-tier enterprise (DMZ, Internal, Database) |

---

## Project Structure

```
AI-Powered Cyber Drill System/
|
|-- orchestrator/
|   |-- orchestrator_core.py        # Central simulation coordinator
|   |-- env_builder.py              # Host model + Environment state machine
|   |-- yaml_loader.py              # Topology YAML parser
|   |-- state_vectors.py            # State representation for RL
|   |-- reward_engine.py            # Reward shaping for agent learning
|   |-- rl_env_red.py               # Gymnasium env for Red agent
|   |-- rl_env_blue.py              # Gymnasium env for Blue agent
|   |-- multi_agent_env.py          # Multi-agent RL environment
|   |
|   |-- agents/
|   |   |-- red_agent.py            # Red agent strategies
|   |   |-- blue_agent.py           # Blue agent strategies
|   |   |-- base_agent.py           # Abstract agent interface
|   |
|   |-- train_sb3_dqn_red.py        # SB3 DQN training for Red
|   |-- train_sb3_dqn_blue.py       # SB3 DQN training for Blue
|   |-- run_training.py             # Master training runner (all topologies)
|   |-- eval_sb3.py                 # SB3 model evaluation
|   |-- plot_sb3_training.py        # Training reward visualization
|   |
|   |-- sample_topology.yaml        # 2-host topology
|   |-- topology_4host.yaml         # 4-host topology
|   |-- topology_8host.yaml         # 8-host topology
|   |
|   |-- tests/                      # 102 automated tests
|       |-- conftest.py
|       |-- test_*.py
|
|-- results/
|   |-- csv/                        # Training reward CSVs
|   |-- plots/                      # Training reward charts
|   |-- models/                     # Trained model files (gitignored)
|
|-- requirements.txt
|-- README.md
```

---

## How to Run

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Train Agents (all topologies)
```bash
python -m orchestrator.run_training --timesteps 10000
```

### Train on a Specific Topology
```bash
python -m orchestrator.train_sb3_dqn_red orchestrator/topology_8host.yaml 50000 20
python -m orchestrator.train_sb3_dqn_blue orchestrator/topology_8host.yaml 50000 20
```

### Evaluate a Trained Model
```bash
python -m orchestrator.eval_sb3 red dqn results/models/sb3_dqn_red_sample_topology orchestrator/sample_topology.yaml 20
```

### Generate Training Plots
```bash
python -m orchestrator.plot_sb3_training
```

### Run Tests
```bash
python -m pytest orchestrator/tests/ -v
```

### TensorBoard (optional)
```bash
tensorboard --logdir=./tb_logs
```

---

## Results

Training produces reward CSVs and visualization plots for each topology:

| File | Description |
|------|-------------|
| `results/csv/sb3_dqn_red_{topo}.csv` | Red agent reward per episode |
| `results/csv/sb3_dqn_blue_{topo}.csv` | Blue agent reward per episode |
| `results/plots/sb3_dqn_training_{topo}.png` | Training reward curves |

---

## Development History

This project evolved through 3 phases:

1. **Phase 1** — Project cleanup, fixed 7 broken files, rewrote 35 tests
2. **Phase 2** — Enhanced agents (5 Red + 5 Blue actions), 3 topologies, custom DQN training
3. **Phase 3** — Upgraded to Stable Baselines 3 DQN for industry-standard training, reproducibility, and TensorBoard support

The custom DQN implementation (Phase 2) served as the foundation to prove RL works in the cybersecurity domain. SB3 DQN (Phase 3) replaced it as the primary training approach for better stability, faster training, and production readiness.

---

## Tech Stack

| Component           | Technology               |
|---------------------|--------------------------|
| RL Framework        | Stable Baselines 3 (DQN) |
| Environment API     | Gymnasium                |
| Neural Networks     | PyTorch                  |
| Training Monitoring | TensorBoard              |
| Network Topologies  | YAML                     |
| Testing             | pytest (102 tests)       |
| Language            | Python 3.10+             |

---

## Testing

The project has 102 automated tests covering:
- Environment mechanics and state transitions
- Agent action execution and reward calculation
- YAML topology loading and validation
- SB3 compatibility (env checker, Monitor wrapper, DQN smoke tests)
- Multi-topology support (2-host, 4-host, 8-host)

```bash
python -m pytest orchestrator/tests/ -v
```
