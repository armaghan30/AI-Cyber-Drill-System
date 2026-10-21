import enum
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Enum, func
from backend.database import Base


class AssessmentStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    kind = Column(String(20), nullable=False, default="standard")  # standard / what_if
    status = Column(Enum(AssessmentStatus), default=AssessmentStatus.QUEUED)
    drills_per_mode = Column(Integer, nullable=False)
    steps = Column(Integer, nullable=False)
    progress_done = Column(Integer, default=0)
    progress_total = Column(Integer, default=0)
    model_type = Column(String(20), nullable=True)
    result = Column(JSON, nullable=True)
    error_message = Column(String(1000), nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
