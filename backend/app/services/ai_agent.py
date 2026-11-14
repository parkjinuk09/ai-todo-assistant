"""Gemini function calling 기반 투두 에이전트.

LLM은 '도구 호출 의도'만 만들고, 실제 DB 변경은 서버의 서비스 레이어가 수행한다.
"""
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


class AIUnavailable(Exception):
    pass


def _client():
    if not settings.gemini_api_key:
        raise AIUnavailable("GEMINI_API_KEY가 설정되지 않았어요")
    from google import genai

    return genai.Client(api_key=settings.gemini_api_key)


def _parse_dt(value: str) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=settings.tz)


def build_tools(db: Session, actions: list[str]):
    """DB 세션에 바인딩된 도구 함수들. 시그니처/독스트링이 Gemini 스키마로 변환된다."""

    def list_todos(include_done: bool = False) -> list[dict]:
        """할 일 목록을 조회한다.

        Args:
            include_done: 완료된 항목도 포함할지 여부
        """
        todos = todo_service.list_todos(db, None if include_done else False)
        return [
            {"id": t.id, "title": t.title, "due_at": t.due_at.isoformat() if t.due_at else None,
             "category": t.category, "priority": t.priority, "done": t.done}
            for t in todos
        ]

    def add_todo(title: str, due_at: str = "", category: str = "기타", priority: int = 2) -> dict:
        """새 할 일을 추가한다.

        Args:
            title: 할 일 제목
            due_at: 마감 일시 ISO 8601 (없으면 빈 문자열)
            category: 공부/일/개인/건강/기타
            priority: 1(높음)~3(낮음)
        """
        todo = todo_service.create_todo(
            db, TodoCreate(title=title, due_at=_parse_dt(due_at), category=category,
                           priority=min(max(priority, 1), 3)))
        actions.append(f"추가: {todo.title}")
        return {"id": todo.id, "title": todo.title}

    def update_todo(todo_id: int, title: str = "", due_at: str = "", category: str = "",
                    priority: int = 0) -> dict:
        """할 일의 제목/마감/카테고리/우선순위를 수정한다. 바꾸지 않을 값은 기본값으로 둔다.

        Args:
            todo_id: 수정할 할 일 id
            title: 새 제목
            due_at: 새 마감 일시 ISO 8601
            category: 새 카테고리
            priority: 새 우선순위 1~3 (0이면 유지)
        """
        patch = {k: v for k, v in {"title": title, "due_at": _parse_dt(due_at),
                                   "category": category, "priority": priority or None}.items() if v}
        todo = todo_service.update_todo(db, todo_id, TodoUpdate(**patch))
        actions.append(f"수정: {todo.title}")
        return {"id": todo.id, "title": todo.title}

    def complete_todo(todo_id: int) -> dict:
        """할 일을 완료 처리한다.

        Args:
            todo_id: 완료할 할 일 id
        """
        todo = todo_service.update_todo(db, todo_id, TodoUpdate(done=True))
        actions.append(f"완료: {todo.title}")
        return {"id": todo.id, "done": True}

    def delete_todo(todo_id: int) -> dict:
        """할 일을 삭제한다.

        Args:
            todo_id: 삭제할 할 일 id
        """
        title = todo_service.get_todo(db, todo_id).title
        todo_service.delete_todo(db, todo_id)
        actions.append(f"삭제: {title}")
        return {"id": todo_id, "deleted": True}

    return [list_todos, add_todo, update_todo, complete_todo, delete_todo]


def chat(db: Session, message: str) -> tuple[str, list[str]]:
    from google.genai import types

    client = _client()
    history = list(db.scalars(select(ChatMessage).order_by(ChatMessage.id.desc()).limit(HISTORY_LIMIT)))
    contents = [types.Content(role=m.role, parts=[types.Part(text=m.content)]) for m in reversed(history)]
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))

    actions: list[str] = []
    now = datetime.now(settings.tz).strftime("%Y-%m-%d %H:%M (%a)")
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=f"{SYSTEM_PROMPT}\n현재 시각: {now} Asia/Seoul",
            tools=build_tools(db, actions),
        ),
    )
    reply = (response.text or "").strip() or "처리했어!"

    db.add_all([ChatMessage(role="user", content=message), ChatMessage(role="model", content=reply)])
    db.commit()
    return reply, actions


def generate_text(prompt: str) -> str:
    client = _client()
    response = client.models.generate_content(model=settings.gemini_model, contents=prompt)
    return (response.text or "").strip()
