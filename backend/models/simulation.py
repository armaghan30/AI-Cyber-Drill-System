import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Enum, func
from sqlalchemy.orm import relationship
from backend.database import Base


class SimulationStatus(str, enum.Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Simulation(Base):
    __tablename__ = "simulations"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    session_id = Column(String(36), unique=True, nullable=False, index=True)
    status = Column(Enum(SimulationStatus), default=SimulationStatus.RUNNING)
    max_steps = Column(Integer, default=10)
    total_steps = Column(Integer, default=0)
    total_red_reward = Column(Float, default=0.0)
    total_blue_reward = Column(Float, default=0.0)
    final_state = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)

    steps = relationship("SimulationStep", back_populates="simulation",
                         order_by="SimulationStep.step_number")


class SimulationStep(Base):
    __tablename__ = "simulation_steps"

    id = Column(Integer, primary_key=True, index=True)
    simulation_id = Column(Integer, ForeignKey("simulations.id"), nullable=False)
    step_number = Column(Integer, nullable=False)
    red_action = Column(JSON, nullable=False)
    blue_action = Column(JSON, nullable=False)
    red_reward = Column(Float, nullable=False)
    blue_reward = Column(Float, nullable=False)
    red_state = Column(JSON, nullable=True)
    blue_state = Column(JSON, nullable=True)
    environment_state = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    simulation = relationship("Simulation", back_populates="steps")
