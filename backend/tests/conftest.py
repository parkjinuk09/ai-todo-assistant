import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
# 닫힌 포트 → LLM 연결 실패를 빠르게 재현
os.environ["LLM_BASE_URL"] = "http://127.0.0.1:9/v1"
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
