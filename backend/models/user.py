import hashlib
import os
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    salt = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def set_password(self, pwd):
        self.salt = os.urandom(32).hex()
        self.password_hash = hashlib.sha256((pwd + self.salt).encode()).hexdigest()

    def check_password(self, pwd):
        hashed = hashlib.sha256((pwd + self.salt).encode()).hexdigest()
        return hashed == self.password_hash
