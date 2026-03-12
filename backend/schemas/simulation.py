from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class SimulationCreate(BaseModel):
    scenario_id: int
    max_steps: int = Field(default=10, ge=1, le=100)


class SimulationStepResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    step_number: int
    red_action: Dict[str, Any]
    blue_action: Dict[str, Any]
    red_reward: float
    blue_reward: float
    red_state: Optional[Dict[str, Any]] = None
    blue_state: Optional[Dict[str, Any]] = None
    environment_state: Optional[Dict[str, Any]] = None


class SimulationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    scenario_id: int
    session_id: str
    status: str
    max_steps: int
    total_steps: int
    total_red_reward: float
    total_blue_reward: float
    created_at: datetime
    completed_at: Optional[datetime] = None


class SimulationDetailResponse(SimulationResponse):
    steps: List[SimulationStepResponse] = []
    final_state: Optional[Dict[str, Any]] = None


class StepActionResponse(BaseModel):
    session_id: str
    step: SimulationStepResponse
    simulation_status: str
    steps_remaining: int
