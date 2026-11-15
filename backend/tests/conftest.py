import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["AI_GATEWAY_API_KEY"] = ""
os.environ.pop("VERCEL_OIDC_TOKEN", None)
os.environ["REDIS_URL"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    return TestClient(app)
