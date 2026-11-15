import json
from types import SimpleNamespace

from app.core.database import SessionLocal
from app.services import ai_agent
from app.services.ai_agent import build_tools


def test_tools_mutate_db():
    db = SessionLocal()
    actions: list[str] = []
    t = build_tools(db, actions)

    created = t["add_todo"](title="치과 예약", due_at="2026-11-20T10:00:00", category="건강", priority=5)
    assert t["list_todos"]()[0]["priority"] == 3  # 범위 보정
    t["update_todo"](created["id"], title="치과 가기")
    t["complete_todo"](created["id"])
    assert t["list_todos"]() == [] and t["list_todos"](include_done=True)[0]["done"]
    t["delete_todo"](created["id"])
    assert actions == ["추가: 치과 예약", "수정: 치과 가기", "완료: 치과 가기", "삭제: 치과 가기"]
    db.close()


def test_tool_error_is_returned_to_llm():
    db = SessionLocal()
    out = json.loads(ai_agent._run_tool(build_tools(db, []), "complete_todo", '{"todo_id": 999}'))
    assert "error" in out
    db.close()


class FakeClient:
    """1회차: add_todo 도구 호출 → 2회차: 최종 답변"""

    def __init__(self):
        self.calls = 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            tc = SimpleNamespace(
                id="call_1", type="function",
                function=SimpleNamespace(name="add_todo", arguments='{"title": "OS 과제", "priority": 1}'),
                model_dump=lambda: {"id": "call_1", "type": "function",
                                    "function": {"name": "add_todo", "arguments": "{}"}},
            )
            msg = SimpleNamespace(content=None, tool_calls=[tc])
        else:
            assert kwargs["messages"][-1]["role"] == "tool"
            msg = SimpleNamespace(content="OS 과제 추가했어!", tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


def test_chat_tool_loop(client, monkeypatch):
    monkeypatch.setattr(ai_agent, "_client", lambda: FakeClient())
    body = client.post("/chat", json={"message": "OS 과제 넣어줘"}).json()
    assert body["reply"] == "OS 과제 추가했어!"
    assert body["actions"] == ["추가: OS 과제"]
    assert body["todos"][0]["title"] == "OS 과제"
    roles = [m["role"] for m in client.get("/chat").json()]
    assert roles == ["user", "assistant"]


def test_calendar_labels_weeks_from_monday():
    from datetime import datetime

    from app.core.config import settings
    from app.services.ai_agent import _calendar

    cal = _calendar(datetime(2026, 11, 15, 18, tzinfo=settings.tz)).splitlines()  # 일요일
    assert cal[0] == "2026-11-15 이번주 일요일 = 오늘"
    assert "2026-11-17 다음주 화요일 = 모레" in cal


def test_clean_reply_strips_echoed_prompt():
    from app.services.ai_agent import _clean_reply

    assert _clean_reply("추가했어.\n\n현재 시각: 2026-11-15\n[달력]\n...") == "추가했어."
    assert _clean_reply("완료했어.\n\n지금 할 일 목록:\n- id=3 치과") == "완료했어."
    assert _clean_reply("그대로") == "그대로"
