from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class TrainingCreate(BaseModel):
    scenario_id: int
    agent_role: str = Field(..., pattern="^(red|blue)$")
    algorithm: str = Field(..., pattern="^(dqn|ppo)$")
    total_timesteps: int = Field(default=10000, ge=1000, le=1000000)
    max_steps_per_episode: int = Field(default=20, ge=5, le=100)


class TrainingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scenario_id: int
    agent_role: str
    algorithm: str
    status: str
    total_timesteps: int
    max_steps_per_episode: int
    episodes_completed: int
    mean_reward: Optional[float] = None
    model_path: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
