from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class AssessmentCreate(BaseModel):
    scenario_id: int
    drills: int = Field(default=30, ge=5, le=100)
    steps: int = Field(default=15, ge=5, le=50)


class AssessmentResponse(BaseModel):
    id: int
    scenario_id: int
    kind: str
    status: str
    drills_per_mode: int
    steps: int
    progress_done: int
    progress_total: int
    model_type: Optional[str] = None
    result: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
