from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, func
from backend.database import Base


class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    filename = Column(String(255), nullable=False)
    num_hosts = Column(Integer, nullable=False)
    description = Column(String(500), nullable=True)
    # Demo scenarios (is_demo=True) are visible to all authenticated users
    # and cannot be modified or deleted via the API.
    is_demo = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
