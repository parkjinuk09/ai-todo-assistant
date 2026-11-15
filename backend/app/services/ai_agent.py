"""LLM tool calling 기반 투두 에이전트 (Vercel AI Gateway, OpenAI 호환 API).

LLM은 '도구 호출 의도'만 만들고, 실제 DB 변경은 서버의 서비스 레이어가 수행한다.
제공자 교체는 이 파일(클라이언트 생성부)과 환경변수만 바꾸면 된다.
"""
import json
import os
from contextvars import ContextVar
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ChatMessage
from app.schemas.todo import TodoCreate, TodoUpdate
from app.services import todo_service

SYSTEM_PROMPT = """너는 사용자의 개인 투두 비서야.
- 사용자가 할 일을 말하면 도구로 직접 추가/수정/완료/삭제해.
- 수정·완료·삭제 전에는 list_todos로 id를 먼저 확인해.
- 날짜·시간 표현(내일, 다음주 화요일 3시)은 현재 시각 기준으로 ISO 8601(+09:00)로 바꿔.
- category는 공부/일/개인/건강/기타 중 하나, priority는 1(높음)~3(낮음).
- 답변은 한국어 반말, 짧고 친근하게. 무엇을 바꿨는지 한 줄로 알려줘."""

HISTORY_LIMIT = 20
MAX_TOOL_ROUNDS = 6

# Vercel은 요청 헤더(x-vercel-oidc-token)로도 OIDC 토큰을 넘겨준다 → 미들웨어가 여기에 저장
request_oidc_token: ContextVar[str | None] = ContextVar("request_oidc_token", default=None)


class AIUnavailable(Exception):
    pass


def _api_key() -> str:
    key = settings.ai_gateway_api_key or request_oidc_token.get() or os.getenv("VERCEL_OIDC_TOKEN", "")
    if not key:
        raise AIUnavailable("AI 설정이 없어요 (AI_GATEWAY_API_KEY 또는 Vercel 배포 환경 필요)")
    return key


def _client():
    from openai import OpenAI

    return OpenAI(api_key=_api_key(), base_url=settings.ai_gateway_base_url, timeout=30, max_retries=1)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value)
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
    now = datetime.now(settings.tz).strftime("%Y-%m-%d %H:%M (%a)")
    messages: list[dict] = [{"role": "system", "content": f"{SYSTEM_PROMPT}\n현재 시각: {now} Asia/Seoul"}]
    messages += [{"role": "user" if m.role == "user" else "assistant", "content": m.content} for m in reversed(history)]
    messages.append({"role": "user", "content": message})

    actions: list[str] = []
    tools = build_tools(db, actions)
    reply = ""
    for _ in range(MAX_TOOL_ROUNDS):
        resp = client.chat.completions.create(model=settings.ai_model, messages=messages, tools=TOOL_SCHEMAS)
        msg = resp.choices[0].message
        if not msg.tool_calls:
            reply = (msg.content or "").strip()
            break
        messages.append({"role": "assistant", "content": msg.content or "",
                         "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "content": _run_tool(tools, tc.function.name, tc.function.arguments)})
    reply = reply or "처리했어!"

    db.add_all([ChatMessage(role="user", content=message), ChatMessage(role="assistant", content=reply)])
    db.commit()
    return reply, actions


def generate_text(prompt: str) -> str:
    resp = _client().chat.completions.create(
        model=settings.ai_model, messages=[{"role": "user", "content": prompt}])
    return (resp.choices[0].message.content or "").strip()
