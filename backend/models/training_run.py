import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, func
from backend.database import Base


class TrainingStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class TrainingRun(Base):
    __tablename__ = "training_runs"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    agent_role = Column(String(10), nullable=False)  # red / blue
    algorithm = Column(String(20), nullable=False)  # dqn / ppo
    status = Column(Enum(TrainingStatus), default=TrainingStatus.QUEUED)
    total_timesteps = Column(Integer, nullable=False)
    max_steps_per_episode = Column(Integer, default=20)
    episodes_completed = Column(Integer, default=0)
    mean_reward = Column(Float, nullable=True)
    model_path = Column(String(500), nullable=True)
    csv_path = Column(String(500), nullable=True)
    error_message = Column(String(1000), nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
