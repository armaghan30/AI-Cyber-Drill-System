from sqlalchemy import Column, Integer, String, DateTime, func
from backend.database import Base


class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    filename = Column(String(255), nullable=False)
    num_hosts = Column(Integer, nullable=False)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
