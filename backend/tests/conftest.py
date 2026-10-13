import os
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.dependencies import get_db, get_current_user
from backend.main import app

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

FIXTURE_TOPO = os.path.join(os.path.dirname(__file__), "fixtures", "test_topology.yaml")


class _StubPolicy:
    """Stands in for a trained MaskablePPO model: always picks the first valid action.
    Lets the API tests exercise the full drill pipeline without trained model files."""

    def predict(self, obs, deterministic=False, action_masks=None):
        if action_masks is not None and np.any(action_masks):
            return np.array(int(np.flatnonzero(action_masks)[0])), None
        return np.array(0), None


@pytest.fixture(autouse=True)
def stub_trained_models(monkeypatch):
    from backend.services import simulation_service
    monkeypatch.setattr(simulation_service, "_load_sb3_models",
                        lambda topo: (_StubPolicy(), _StubPolicy(), "maskable_ppo"))


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    s = TestSession()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def client(db_session):
    from backend.models.user import User

    test_user = User(id=1, username="testuser", email="test@test.com")
    test_user.set_password("testpass")
    db_session.add(test_user)
    db_session.commit()

    def override_db():
        try:
            yield db_session
        finally:
            pass

    def override_user():
        return test_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
