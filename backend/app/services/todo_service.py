from datetime import datetime, time, timedelta

from fastapi import HTTPException
from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import cache
from app.core.config import settings
from app.models import Todo
from app.models.todo import utcnow
from app.schemas.todo import TodoCreate, TodoOut, TodoUpdate

LIST_TTL = 60
_todo_list = TypeAdapter(list[TodoOut])


def list_todos(db: Session, done: bool | None = None) -> list[Todo]:
    stmt = select(Todo)
    if done is not None:
        stmt = stmt.where(Todo.done == done)
    # 미완료 → 마감 임박 → 우선순위 순
    stmt = stmt.order_by(Todo.done, Todo.due_at.is_(None), Todo.due_at, Todo.priority, Todo.id)
    return list(db.scalars(stmt))


def list_todos_cached(db: Session, done: bool | None = None) -> tuple[bytes, str]:
    key = cache.versioned(f"todos:list:{done}")
    return cache.get_or_set_raw(
        key, LIST_TTL,
        lambda: _todo_list.dump_json([TodoOut.model_validate(t) for t in list_todos(db, done)]),
    )


def get_todo(db: Session, todo_id: int) -> Todo:
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="할 일을 찾을 수 없어요")
    return todo


def create_todo(db: Session, data: TodoCreate) -> Todo:
    todo = Todo(**data.model_dump())
    db.add(todo)
    db.commit()
    db.refresh(todo)
    cache.bump_version()
    return todo


def update_todo(db: Session, todo_id: int, data: TodoUpdate) -> Todo:
    todo = get_todo(db, todo_id)
    fields = data.model_dump(exclude_unset=True)
    if "done" in fields and fields["done"] != todo.done:
        todo.completed_at = utcnow() if fields["done"] else None
    for key, value in fields.items():
        setattr(todo, key, value)
    db.commit()
    db.refresh(todo)
    cache.bump_version()
    return todo


def delete_todo(db: Session, todo_id: int) -> None:
    db.delete(get_todo(db, todo_id))
    db.commit()
    cache.bump_version()


def today_range() -> tuple[datetime, datetime]:
    now = datetime.now(settings.tz)
    start = datetime.combine(now.date(), time.min, tzinfo=settings.tz)
    return start, start + timedelta(days=1)


def briefing_buckets(db: Session) -> tuple[list[Todo], list[Todo]]:
    start, end = today_range()
    pending = list_todos(db, done=False)
    overdue = [t for t in pending if t.due_at and _aware(t.due_at) < start]
    today = [t for t in pending if t.due_at and start <= _aware(t.due_at) < end]
    return overdue, today


def _aware(dt: datetime) -> datetime:
    # SQLite는 tz 정보를 잃으므로 UTC로 간주
    return dt if dt.tzinfo else dt.replace(tzinfo=settings.tz).astimezone(settings.tz)
