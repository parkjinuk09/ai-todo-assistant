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


def test_chat_without_key_returns_503(client):
    assert client.post("/chat", json={"message": "안녕"}).status_code == 503


def test_briefing_fallback(client):
    client.post("/todos", json={"title": "밀린 일", "due_at": "2020-01-01T00:00:00+09:00"})
    body = client.get("/briefing").json()
    assert len(body["overdue"]) == 1 and body["summary"]
