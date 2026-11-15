def test_crud_flow(client):
    r = client.post("/todos", json={"title": "OS 과제", "priority": 1, "category": "공부",
                                     "due_at": "2026-11-16T15:00:00+09:00"})
    assert r.status_code == 201
    tid = r.json()["id"]

    assert len(client.get("/todos").json()) == 1

    r = client.patch(f"/todos/{tid}", json={"done": True})
    assert r.json()["done"] is True and r.json()["completed_at"]

    assert client.get("/todos?done=false").json() == []
    assert client.delete(f"/todos/{tid}").status_code == 204
    assert client.patch(f"/todos/{tid}", json={"done": True}).status_code == 404


def test_validation(client):
    assert client.post("/todos", json={"title": ""}).status_code == 422
    assert client.post("/todos", json={"title": "x", "priority": 9}).status_code == 422


def test_chat_when_llm_down_returns_503(client):
    assert client.get("/health").json()["llm"] is False
    assert client.post("/chat", json={"message": "안녕"}).status_code == 503


def test_briefing_fallback(client):
    client.post("/todos", json={"title": "밀린 일", "due_at": "2020-01-01T00:00:00+09:00"})
    body = client.get("/briefing").json()
    assert len(body["overdue"]) == 1 and body["summary"]


def test_web_dist_is_served_after_api_routes(tmp_path, monkeypatch):
    """WEB_DIST를 주면 / 에서 프론트를, API 경로는 그대로 API를 준다."""
    import importlib

    from fastapi.testclient import TestClient

    import app.main as main_module
    from app.core import config

    (tmp_path / "index.html").write_text("<p>web</p>")
    monkeypatch.setattr(config.settings, "web_dist", str(tmp_path))
    reloaded = importlib.reload(main_module)
    try:
        c = TestClient(reloaded.app)
        assert "web" in c.get("/").text
        assert c.get("/health").json()["status"] == "ok"
    finally:
        monkeypatch.setattr(config.settings, "web_dist", "")
        importlib.reload(main_module)
