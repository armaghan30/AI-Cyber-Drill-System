
from __future__ import annotations

import math
import random
from collections import deque
from typing import Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim


class QNetwork(nn.Module):

    def __init__(self, input_dim: int, output_dim: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 128),
            nn.ReLU(),
            nn.Linear(128, output_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class DQNAgentBlue:
    def __init__(
        self,
        state_dim: int,
        action_dim: int,
        lr: float = 1e-3,
        gamma: float = 0.99,
        batch_size: int = 64,
        buffer_capacity: int = 50_000,
        epsilon_start: float = 1.0,
        epsilon_end: float = 0.05,
        epsilon_decay: int = 5_000,
        target_update_freq: int = 500,
    ):
        self.state_dim = state_dim
        self.action_dim = action_dim

        self.gamma = gamma
        self.batch_size = batch_size
        self.buffer_capacity = buffer_capacity

        self.epsilon_start = epsilon_start
        self.epsilon_end = epsilon_end
        self.epsilon_decay = epsilon_decay
        self.epsilon = epsilon_start
        self.steps_done = 0
        self.target_update_freq = target_update_freq

        self.memory = deque(maxlen=buffer_capacity)

        self.device = torch.device("cpu")

        self.online = QNetwork(state_dim, action_dim).to(self.device)
        self.target = QNetwork(state_dim, action_dim).to(self.device)
        self.target.load_state_dict(self.online.state_dict())
        self.optimizer = optim.Adam(self.online.parameters(), lr=lr)

        self.mse_loss = nn.MSELoss()

    # --------------------------------------------------
    def _update_epsilon(self):
        self.steps_done += 1
        frac = min(self.steps_done / float(self.epsilon_decay), 1.0)
        self.epsilon = self.epsilon_end + (self.epsilon_start - self.epsilon_end) * math.exp(
            -5.0 * frac
        )

    # --------------------------------------------------
    def act(self, state: np.ndarray, eval_mode: bool = False) -> int:
        state_t = torch.as_tensor(state, dtype=torch.float32, device=self.device).unsqueeze(0)

        if not eval_mode:
            self._update_epsilon()
            if random.random() < self.epsilon:
                return random.randrange(self.action_dim)

        with torch.no_grad():
            q_values = self.online(state_t)
            action = int(torch.argmax(q_values, dim=1).item())
        return action

    # --------------------------------------------------
    def store_transition(
        self,
        state: np.ndarray,
        action: int,
        reward: float,
        next_state: np.ndarray,
        done: bool,
    ):
        self.memory.append((state, action, reward, next_state, done))

    # --------------------------------------------------
    def update(self):
        if len(self.memory) < self.batch_size:
            return

        batch = random.sample(self.memory, self.batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)

        states_t = torch.as_tensor(states, dtype=torch.float32, device=self.device)
        actions_t = torch.as_tensor(actions, dtype=torch.long, device=self.device)
        rewards_t = torch.as_tensor(rewards, dtype=torch.float32, device=self.device)
        next_states_t = torch.as_tensor(next_states, dtype=torch.float32, device=self.device)
        dones_t = torch.as_tensor(dones, dtype=torch.float32, device=self.device)

        q_values = self.online(states_t)
        q_sa = q_values.gather(1, actions_t.unsqueeze(1)).squeeze(1)

        with torch.no_grad():
            next_q_values = self.target(next_states_t)
            max_next_q = torch.max(next_q_values, dim=1)[0]
            target_q = rewards_t + self.gamma * max_next_q * (1.0 - dones_t)

        loss = self.mse_loss(q_sa, target_q)

        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()

        if self.steps_done % self.target_update_freq == 0:
            self.target.load_state_dict(self.online.state_dict())

    # --------------------------------------------------
    def save(self, path: str):
        torch.save(
            {
                "state_dim": self.state_dim,
                "action_dim": self.action_dim,
                "online_state_dict": self.online.state_dict(),
                "target_state_dict": self.target.state_dict(),
                "optimizer_state_dict": self.optimizer.state_dict(),
                "epsilon": self.epsilon,
                "steps_done": self.steps_done,
            },
            path,
        )
        print(f"[BLUE DQN] Model saved -> {path}")

    # --------------------------------------------------
    @classmethod
    def load(cls, path: str) -> "DQNAgentBlue":
        ckpt = torch.load(path, map_location="cpu", weights_only=False)

        state_dim = ckpt["state_dim"]
        action_dim = ckpt["action_dim"]

        agent = cls(
            state_dim=state_dim,
            action_dim=action_dim,
        )

        if "online_state_dict" in ckpt:
            agent.online.load_state_dict(ckpt["online_state_dict"])
            if "target_state_dict" in ckpt:
                agent.target.load_state_dict(ckpt["target_state_dict"])
        else:
            agent.online.load_state_dict(ckpt)
            agent.target.load_state_dict(ckpt)

        if "optimizer_state_dict" in ckpt:
            agent.optimizer.load_state_dict(ckpt["optimizer_state_dict"])

        agent.epsilon = ckpt.get("epsilon", 0.0)
        agent.steps_done = ckpt.get("steps_done", 0)

        print(f"[BLUE DQN] Loaded from {path} (state_dim={state_dim}, action_dim={action_dim})")
        return agent
