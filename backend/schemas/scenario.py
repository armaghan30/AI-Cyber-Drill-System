from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class ScenarioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    filename: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)


class ScenarioUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class ScenarioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    filename: str
    num_hosts: int
    description: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


class ScenarioDetailResponse(ScenarioResponse):
    topology_data: Dict[str, Any]
    host_names: List[str]
    edge_count: int
