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
        page = c.get("/")
        assert "web" in page.text
        assert page.headers["cache-control"] == "no-cache"  # 재설치 후 옛 화면 방지
        assert c.get("/health").json()["status"] == "ok"
    finally:
        monkeypatch.setattr(config.settings, "web_dist", "")
        importlib.reload(main_module)


def test_all_day_is_stored_as_end_of_day(client):
    r = client.post("/todos", json={"title": "선물 사기", "due_at": "2026-12-03T00:00:00+09:00", "all_day": True}).json()
    assert r["all_day"] is True and "T23:59" in r["due_at"]
    # 날짜가 없으면 하루 종일일 수 없다
    assert client.post("/todos", json={"title": "x", "all_day": True}).json()["all_day"] is False


def test_note_and_subtasks_roundtrip(client):
    r = client.post("/todos", json={"title": "발표 준비", "note": "https://example.com",
                                     "subtasks": [{"title": "자료 조사"}, {"title": "슬라이드"}]}).json()
    assert r["note"] == "https://example.com" and [s["done"] for s in r["subtasks"]] == [False, False]
    r = client.patch(f"/todos/{r['id']}", json={"subtasks": [{"title": "자료 조사", "done": True}]}).json()
    assert r["subtasks"] == [{"title": "자료 조사", "done": True}]


def test_completing_repeating_todo_creates_next_and_undo_removes_it(client):
    from datetime import datetime, timedelta

    from app.core.config import settings

    today = datetime.now(settings.tz).replace(hour=20, minute=0, second=0, microsecond=0)
    tid = client.post("/todos", json={"title": "영어 공부", "due_at": today.isoformat(), "repeat": "daily",
                                       "subtasks": [{"title": "단어", "done": True}]}).json()["id"]
    client.patch(f"/todos/{tid}", json={"done": True})
    pending = client.get("/todos?done=false").json()
    assert len(pending) == 1 and pending[0]["repeat"] == "daily"
    assert pending[0]["due_at"][:10] == (today + timedelta(days=1)).date().isoformat()
    assert pending[0]["subtasks"] == [{"title": "단어", "done": False}]

    client.patch(f"/todos/{tid}", json={"done": False})  # 되돌리기
    todos = client.get("/todos").json()
    assert [t["id"] for t in todos] == [tid] and todos[0]["done"] is False


def test_next_due_skips_to_today_and_handles_month_end():
    from datetime import date, datetime

    from app.services.todo_service import next_due

    # 오래 밀린 매일 할 일 → 오늘
    assert next_due(datetime(2026, 11, 1, 9), "daily", date(2026, 11, 16)).date() == date(2026, 11, 16)
    # 금요일 다음 평일은 월요일
    assert next_due(datetime(2026, 11, 20, 9), "weekdays", date(2026, 11, 20)).date() == date(2026, 11, 23)
    assert next_due(datetime(2026, 11, 16, 9), "weekly", date(2026, 11, 16)).date() == date(2026, 11, 23)
    # 1월 31일 매월 → 2월 28일 → 3월 31일
    assert next_due(datetime(2027, 1, 31, 9), "monthly", date(2027, 1, 31)).date() == date(2027, 2, 28)
    assert next_due(datetime(2027, 1, 31, 9), "monthly", date(2027, 3, 1)).date() == date(2027, 3, 31)


def test_add_missing_columns_upgrades_old_table(tmp_path):
    from sqlalchemy import create_engine, inspect, text

    from app.core.database import add_missing_columns

    old = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with old.begin() as c:
        c.execute(text("CREATE TABLE todos (id INTEGER PRIMARY KEY, title VARCHAR(200))"))
        c.execute(text("INSERT INTO todos (title) VALUES ('옛 할 일')"))
    added = add_missing_columns(old)
    assert "todos.all_day" in added and "todos.note" in added
    assert {"repeat", "subtasks", "spawned_id"} <= {c["name"] for c in inspect(old).get_columns("todos")}
    with old.begin() as c:
        assert c.execute(text("SELECT all_day, note FROM todos")).one() == (0, "")
    assert add_missing_columns(old) == []  # 두 번 돌려도 안전
