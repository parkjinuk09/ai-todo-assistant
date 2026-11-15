"""LLM tool calling 기반 투두 에이전트 (OpenAI 호환 API, 기본: 로컬 Ollama).

LLM은 '도구 호출 의도'만 만들고, 실제 DB 변경은 서버의 서비스 레이어가 수행한다.
제공자 교체는 환경변수(LLM_BASE_URL / LLM_API_KEY / LLM_MODEL)만 바꾸면 된다.
"""
import json
from datetime import datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ChatMessage
from app.schemas.todo import TodoCreate, TodoUpdate
from app.services import todo_service

SYSTEM_PROMPT = """너는 사용자의 개인 투두 비서야.
- 사용자가 할 일을 말하면 반드시 도구를 호출해서 직접 추가/수정/완료/삭제해. 도구 호출을 글로 흉내 내지 마.
- 수정·완료·삭제할 때는 아래 '지금 할 일' 목록의 id를 써. 목록에 없을 때만 list_todos로 찾아.
- 날짜는 아래 달력을 보고 'YYYY-MM-DDTHH:MM' 형식으로 넣어. 시간을 말 안 했으면 날짜만 넣어.
- category는 공부/일/개인/건강/기타 중 하나, priority는 1(높음)~3(낮음).
- 답변은 한국어 반말로 한두 문장. 무엇을 바꿨는지만 말해."""

HISTORY_LIMIT = 4  # 작은 로컬 모델은 예전 답(특히 실패 답)을 따라 하므로 짧게
MAX_TOOL_ROUNDS = 6
WEEKDAYS = "월화수목금토일"


class AIUnavailable(Exception):
    pass


def _client():
    from openai import OpenAI

    return OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url,
                  timeout=settings.llm_timeout, max_retries=0)


def _complete(client, **kwargs):
    """연결 실패(Ollama 꺼짐 등)는 AIUnavailable로 바꿔 503으로 응답하게 한다."""
    from openai import APIConnectionError, NotFoundError

    try:
        return client.chat.completions.create(model=settings.llm_model, **kwargs)
    except APIConnectionError as e:
        raise AIUnavailable("LLM 서버에 연결할 수 없어요. 터미널에서 `ollama serve`를 실행해 주세요.") from e
    except NotFoundError as e:
        raise AIUnavailable(f"모델 {settings.llm_model}이 없어요. `ollama pull {settings.llm_model}`") from e


def llm_status() -> str | None:
    """None이면 사용 가능. 아니면 사람이 읽을 수 있는 이유 (서버 꺼짐 / 모델 미설치)."""
    try:
        res = httpx.get(f"{settings.llm_base_url.rstrip('/')}/models", timeout=1.0,
                        headers={"Authorization": f"Bearer {settings.llm_api_key}"})
        res.raise_for_status()
    except httpx.HTTPError:
        return "로컬 모델 서버에 연결할 수 없어. 터미널에서 `ollama serve`를 실행해 줘."
    ids = {m.get("id") for m in res.json().get("data", [])}
    if settings.llm_model not in ids and f"{settings.llm_model}:latest" not in ids:
        return f"모델 {settings.llm_model}이 설치돼 있지 않아. `ollama pull {settings.llm_model}`"
    return None


def _calendar(now: datetime) -> str:
    """작은 로컬 모델은 '다음주 화요일' 같은 날짜 계산을 자주 틀린다 → 2주치 달력을 직접 준다."""
    week0 = now.date() - timedelta(days=now.weekday())  # 이번 주 월요일
    lines = []
    for i in range(15):
        d = now.date() + timedelta(days=i)
        week = ["이번주", "다음주", "다다음주"][(d - week0).days // 7]
        extra = {0: " = 오늘", 1: " = 내일", 2: " = 모레"}.get(i, "")
        lines.append(f"{d.isoformat()} {week} {WEEKDAYS[d.weekday()]}요일{extra}")
    return "\n".join(lines)


def _pending_snapshot(db: Session) -> str:
    """남은 할 일을 프롬프트에 직접 넣어 '목록 조회 → 수정' 두 단계를 한 단계로 줄인다."""
    todos = todo_service.list_todos(db, done=False)[:30]
    if not todos:
        return "(없음)"
    return "\n".join(
        f"- id={t.id} {t.title}" + (f" (마감 {t.due_at.astimezone(settings.tz):%m-%d %H:%M})" if t.due_at else "")
        for t in todos)


CONTEXT_MARKERS = ("현재 시각:", "[달력]", "[지금 할 일]", "지금 할 일 목록:")


def _clean_reply(text: str) -> str:
    """작은 모델이 시스템 프롬프트의 달력·목록을 답변에 그대로 붙이는 경우 잘라낸다."""
    cut = min((i for i in (text.find(m) for m in CONTEXT_MARKERS) if i >= 0), default=len(text))
    lines = [ln for ln in text[:cut].splitlines() if "id=" not in ln]  # 내부 id 노출 방지
    return "\n".join(lines).strip()


def _parse_dt(value: str | None) -> datetime | None:
    """'2026-11-16', '2026-11-16 15:00', '...T15:00:00+09:00', '...Z' 모두 허용."""
    if not value:
        return None
    dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=settings.tz)


def _fn(name: str, description: str, properties: dict, required: list[str] | None = None) -> dict:
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": properties, "required": required or []},
    }}


TOOL_SCHEMAS = [
    _fn("list_todos", "할 일 목록을 조회한다.",
        {"include_done": {"type": "boolean", "description": "완료된 항목도 포함할지"}}),
    _fn("add_todo", "새 할 일을 추가한다.", {
        "title": {"type": "string"},
        "due_at": {"type": "string", "description": "마감 일시 ISO 8601, 없으면 생략"},
        "category": {"type": "string", "enum": ["공부", "일", "개인", "건강", "기타"]},
        "priority": {"type": "integer", "description": "1(높음)~3(낮음)"},
    }, ["title"]),
    _fn("update_todo", "할 일의 제목/마감/카테고리/우선순위를 수정한다. 바꿀 값만 보낸다.", {
        "todo_id": {"type": "integer"},
        "title": {"type": "string"},
        "due_at": {"type": "string"},
        "category": {"type": "string"},
        "priority": {"type": "integer"},
    }, ["todo_id"]),
    _fn("complete_todo", "할 일을 완료 처리한다.", {"todo_id": {"type": "integer"}}, ["todo_id"]),
    _fn("delete_todo", "할 일을 삭제한다.", {"todo_id": {"type": "integer"}}, ["todo_id"]),
]


def build_tools(db: Session, actions: list[str]) -> dict:
    """DB 세션에 바인딩된 도구 함수들 (이름 → callable)."""

    def list_todos(include_done: bool = False) -> list[dict]:
        todos = todo_service.list_todos(db, None if include_done else False)
        return [
            {"id": t.id, "title": t.title, "due_at": t.due_at.isoformat() if t.due_at else None,
             "category": t.category, "priority": t.priority, "done": t.done}
            for t in todos
        ]

    def add_todo(title: str, due_at: str | None = None, category: str = "기타", priority: int = 2) -> dict:
        todo = todo_service.create_todo(
            db, TodoCreate(title=title, due_at=_parse_dt(due_at), category=category,
                           priority=min(max(int(priority), 1), 3)))
        actions.append(f"추가: {todo.title}")
        return {"id": todo.id, "title": todo.title}

    def update_todo(todo_id: int, title: str | None = None, due_at: str | None = None,
                    category: str | None = None, priority: int | None = None) -> dict:
        patch = {k: v for k, v in {"title": title, "due_at": _parse_dt(due_at), "category": category,
                                   "priority": min(max(int(priority), 1), 3) if priority else None}.items() if v}
        todo = todo_service.update_todo(db, todo_id, TodoUpdate(**patch))
        actions.append(f"수정: {todo.title}")
        return {"id": todo.id, "title": todo.title}

    def complete_todo(todo_id: int) -> dict:
        todo = todo_service.update_todo(db, todo_id, TodoUpdate(done=True))
        actions.append(f"완료: {todo.title}")
        return {"id": todo.id, "done": True}

    def delete_todo(todo_id: int) -> dict:
        title = todo_service.get_todo(db, todo_id).title
        todo_service.delete_todo(db, todo_id)
        actions.append(f"삭제: {title}")
        return {"id": todo_id, "deleted": True}

    return {f.__name__: f for f in (list_todos, add_todo, update_todo, complete_todo, delete_todo)}


def _run_tool(tools: dict, name: str, raw_args: str) -> str:
    """도구 실행 결과(또는 에러)를 JSON 문자열로 돌려준다. 에러도 LLM에게 알려 스스로 복구하게 한다."""
    fn = tools.get(name)
    if fn is None:
        return json.dumps({"error": f"unknown tool {name}"})
    try:
        return json.dumps(fn(**json.loads(raw_args or "{}")), ensure_ascii=False, default=str)
    except Exception as e:  # 404, 검증 오류 등
        detail = getattr(e, "detail", None) or str(e)
        return json.dumps({"error": detail}, ensure_ascii=False)


def chat(db: Session, message: str) -> tuple[str, list[str]]:
    client = _client()
    history = list(db.scalars(select(ChatMessage).order_by(ChatMessage.id.desc()).limit(HISTORY_LIMIT)))
    now = datetime.now(settings.tz)
    system = (f"{SYSTEM_PROMPT}\n\n현재 시각: {now:%Y-%m-%d %H:%M} ({WEEKDAYS[now.weekday()]})\n"
              f"[달력]\n{_calendar(now)}\n\n[지금 할 일]\n{_pending_snapshot(db)}")
    messages: list[dict] = [{"role": "system", "content": system}]
    messages += [{"role": "user" if m.role == "user" else "assistant", "content": m.content} for m in reversed(history)]
    messages.append({"role": "user", "content": message})

    actions: list[str] = []
    tools = build_tools(db, actions)
    reply = ""
    for _ in range(MAX_TOOL_ROUNDS):
        resp = _complete(client, messages=messages, tools=TOOL_SCHEMAS)
        msg = resp.choices[0].message
        if not msg.tool_calls:
            reply = (msg.content or "").strip()
            break
        messages.append({"role": "assistant", "content": msg.content or "",
                         "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "content": _run_tool(tools, tc.function.name, tc.function.arguments)})
    reply = _clean_reply(reply) or ("처리했어." if actions else "무슨 말인지 잘 모르겠어. 다시 말해 줄래?")

    db.add_all([ChatMessage(role="user", content=message), ChatMessage(role="assistant", content=reply)])
    db.commit()
    return reply, actions


def generate_text(prompt: str) -> str:
    resp = _complete(_client(), messages=[{"role": "user", "content": prompt}])
    return (resp.choices[0].message.content or "").strip()
