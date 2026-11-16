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
    assert "2026-11-17 다음주 화요일 = 모레 = 다가오는 화요일" in cal
    assert cal[8] == "2026-11-23 다다음주 월요일"


def test_clean_reply_strips_echoed_prompt():
    from app.services.ai_agent import _clean_reply

    assert _clean_reply("추가했어.\n\n현재 시각: 2026-11-15\n[달력]\n...") == "추가했어."
    assert _clean_reply("완료했어.\n\n지금 할 일 목록:\n- id=3 치과") == "완료했어."
    assert _clean_reply("추가했어. 내일 오전 10시截止输入") == "추가했어. 내일 오전 10시"
    assert _clean_reply("그대로") == "그대로"


class LyingClient:
    """도구를 부르지 않고 '추가했어'라고만 답하는 모델. replies를 차례로 돌려준다."""

    def __init__(self, replies):
        self.replies, self.seen = list(replies), []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.seen.append(kwargs["messages"])
        msg = SimpleNamespace(content=self.replies.pop(0), tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


def test_claimed_change_without_tool_call_is_retried_then_reported(client, monkeypatch):
    fake = LyingClient(["치과 추가했어!", "치과 추가 완료!"])
    monkeypatch.setattr(ai_agent, "_client", lambda: fake)
    body = client.post("/chat", json={"message": "치과 추가"}).json()
    assert len(fake.seen) == 2 and fake.seen[1][-1]["content"] == ai_agent.NUDGE  # 한 번 다시 시킴
    assert body["actions"] == [] and "바꾼 건 없어" in body["reply"]          # 거짓 성공을 그대로 전달하지 않음


def test_plain_answer_is_not_retried(client, monkeypatch):
    fake = LyingClient(["천만에!"])
    monkeypatch.setattr(ai_agent, "_client", lambda: fake)
    assert client.post("/chat", json={"message": "고마워"}).json()["reply"] == "천만에!"
    assert len(fake.seen) == 1


def test_parse_dt_date_only_is_end_of_day():
    from app.services.ai_agent import _parse_dt

    dt = _parse_dt("2026-11-20")
    assert (dt.hour, dt.minute) == (23, 59) and dt.utcoffset().total_seconds() == 9 * 3600
    assert _parse_dt("2026-11-20 15:00").hour == 15


def test_clean_reply_hides_ids_and_markup():
    from app.services.ai_agent import _clean_reply

    assert _clean_reply("독후감을 추가했어. (id: 18937)") == "독후감을 추가했어."
    assert _clean_reply("<내일 마감>에는 은행 가기가 있어.") == "내일 마감에는 은행 가기가 있어."


def test_priority_ignored_unless_user_mentions_it():
    db = SessionLocal()
    tools = build_tools(db, [], allow_priority=False)
    assert tools["add_todo"](title="은행", priority=3)["title"] == "은행"
    tools_ok = build_tools(db, [], allow_priority=True)
    tools_ok["add_todo"](title="발표", priority=1)
    got = {t["title"]: t["priority"] for t in tools["list_todos"]()}
    assert got == {"은행": 2, "발표": 1}
    db.close()


def test_query_answered_from_db_without_llm(client, monkeypatch):
    from datetime import datetime, timedelta

    from app.core.config import settings

    def boom():
        raise AssertionError("조회에는 LLM을 쓰지 않는다")

    monkeypatch.setattr(ai_agent, "_client", boom)
    tomorrow = (datetime.now(settings.tz) + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
    client.post("/todos", json={"title": "은행 가기", "due_at": tomorrow.isoformat()})
    body = client.post("/chat", json={"message": "오늘이랑 내일 할 일 뭐 있어?"}).json()
    assert body["actions"] == []
    lines = body["reply"].splitlines()
    assert lines[0].endswith("없어") and "은행 가기 10:00" in lines[1]


def test_is_query_routing():
    from app.services.ai_agent import is_query

    assert is_query("내일 뭐 있어?") and is_query("남은 할 일 목록 보여줘")
    assert not is_query("내일 치과 추가해줘") and not is_query("오늘 뭐부터 해야 돼?")
    assert not is_query("빨래 완료")


def test_clean_reply_hides_bare_bracket_ids():
    from app.services.ai_agent import _clean_reply

    assert _clean_reply("은행 가기 [18940], 발표 [18939]") == "은행 가기, 발표"


def _no_llm(monkeypatch):
    def boom():
        raise AssertionError("LLM을 부르면 안 된다")

    monkeypatch.setattr(ai_agent, "_client", boom)


def test_quick_delete_and_complete_without_llm(client, monkeypatch):
    _no_llm(monkeypatch)
    client.post("/todos", json={"title": "치과 예약"})
    client.post("/todos", json={"title": "빨래"})
    body = client.post("/chat", json={"message": "치과 예약 삭제해줘"}).json()
    assert body["actions"] == ["삭제: 치과 예약"] and [t["title"] for t in body["todos"]] == ["빨래"]
    body = client.post("/chat", json={"message": "빨래 완료"}).json()
    assert body["actions"] == ["완료: 빨래"] and body["todos"][0]["done"] is True


def test_quick_command_asks_when_ambiguous(client, monkeypatch):
    _no_llm(monkeypatch)
    client.post("/todos", json={"title": "영어 단어"})
    client.post("/todos", json={"title": "영어 회화"})
    body = client.post("/chat", json={"message": "영어 지워"}).json()
    assert body["actions"] == [] and "영어 단어" in body["reply"] and len(body["todos"]) == 2


def test_quick_command_leaves_unclear_requests_to_llm():
    db = SessionLocal()
    build_tools(db, [])["add_todo"](title="치과 예약")
    assert ai_agent.quick_command(db, "치과 예약 취소 전화하기 추가") is None   # 추가 요청
    assert ai_agent.quick_command(db, "치과 예약 내일로 바꿔") is None          # 수정은 LLM
    assert ai_agent.quick_command(db, "없는 일 삭제") is None                   # 못 찾으면 LLM
    db.close()


def test_gibberish_changes_nothing(client, monkeypatch):
    _no_llm(monkeypatch)
    body = client.post("/chat", json={"message": "ㄴㅇㄹㅇㄴㄹ"}).json()
    assert body["actions"] == [] and "모르겠어" in body["reply"]


def test_add_todo_does_not_duplicate():
    db = SessionLocal()
    actions: list[str] = []
    t = build_tools(db, actions)
    first = t["add_todo"](title="독후감", due_at="2026-11-20T18:00")
    again = t["add_todo"](title="독후감", due_at="2026-11-20T18:00")
    assert again["id"] == first["id"] and again["already_exists"] and len(t["list_todos"]()) == 1
    assert actions == ["추가: 독후감"]
    later: list[str] = []
    build_tools(db, later)["add_todo"](title="독후감", due_at="2026-11-20T18:00")
    assert later == ["이미 있음: 독후감"]
    db.close()


def test_date_only_and_midnight_become_all_day_and_repeat_is_saved():
    db = SessionLocal()
    t = build_tools(db, [])
    t["add_todo"](title="선물 사기", due_at="2026-12-03T00:00")
    made = t["add_todo"](title="영어 공부", due_at="2026-11-20T20:00", repeat="daily")
    got = {x.title: x for x in ai_agent.todo_service.list_todos(db)}
    assert got["선물 사기"].all_day and got["선물 사기"].due_at.hour == 23
    assert not got["영어 공부"].all_day and got["영어 공부"].repeat == "daily"
    t["update_todo"](made["id"], repeat="none")
    db.expire_all()
    assert ai_agent.todo_service.get_todo(db, made["id"]).repeat is None
    db.close()


def test_clean_reply_drops_date_hint_and_iso():
    from app.services.ai_agent import _clean_reply

    assert _clean_reply('"선물 사기"를 추가했어. (날짜 참고: 2026-12-03T00:00)') == '"선물 사기"를 추가했어.'
    assert _clean_reply("마감은 2026-12-03T15:00:00+09:00 이야.") == "마감은 12월 3일 이야."
