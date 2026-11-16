from calendar import monthrange
from datetime import date, datetime, time, timedelta

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


def _local(dt: datetime) -> datetime:
    return _aware(dt).astimezone(settings.tz)


def _end_of_day(dt: datetime) -> datetime:
    return _local(dt).replace(hour=23, minute=59, second=0, microsecond=0)


def create_todo(db: Session, data: TodoCreate) -> Todo:
    todo = Todo(**data.model_dump())
    _normalize(todo)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    cache.bump_version()
    return todo


def _normalize(todo: Todo) -> None:
    """하루 종일이면 시간을 그날 23:59로 맞춘다 (0시로 두면 하루가 시작하자마자 '지남'이 된다)."""
    if not todo.due_at:
        todo.all_day = False
    elif todo.all_day:
        todo.due_at = _end_of_day(todo.due_at)


def next_due(due: datetime, repeat: str, today: date) -> datetime:
    """반복 할 일의 다음 마감. 오래 밀린 일을 완료해도 지난 날짜가 아니라 오늘 이후로 잡는다."""
    d, months = due, 0
    while True:
        if repeat == "daily":
            d += timedelta(days=1)
        elif repeat == "weekdays":
            d += timedelta(days=1)
            while d.weekday() >= 5:
                d += timedelta(days=1)
        elif repeat == "weekly":
            d += timedelta(weeks=1)
        else:  # monthly: 31일처럼 없는 날은 그 달 말일
            months += 1
            y, m = divmod(due.year * 12 + due.month - 1 + months, 12)
            d = due.replace(year=y, month=m + 1, day=min(due.day, monthrange(y, m + 1)[1]))
        if d.date() >= today:
            return d


def _spawn_next(db: Session, todo: Todo) -> None:
    now = datetime.now(settings.tz)
    if todo.due_at:
        base, all_day = _local(todo.due_at), todo.all_day
    else:  # 마감 없는 반복은 오늘 기준, 하루 종일
        base, all_day = now.replace(hour=23, minute=59, second=0, microsecond=0), True
    nxt = Todo(title=todo.title, category=todo.category, priority=todo.priority, repeat=todo.repeat,
               note=todo.note, all_day=all_day, due_at=next_due(base, todo.repeat, now.date()),
               subtasks=[{**s, "done": False} for s in (todo.subtasks or [])])
    db.add(nxt)
    db.flush()
    todo.spawned_id = nxt.id


def update_todo(db: Session, todo_id: int, data: TodoUpdate) -> Todo:
    todo = get_todo(db, todo_id)
    fields = data.model_dump(exclude_unset=True)
    was_done = todo.done
    for key, value in fields.items():
        setattr(todo, key, value)
    _normalize(todo)
    if todo.done != was_done:
        if todo.done:
            todo.completed_at = utcnow()
            if todo.repeat and not todo.spawned_id:
                _spawn_next(db, todo)
        else:
            todo.completed_at = None
            # 완료를 되돌리면 그때 만든 다음 회차도 없앤다 (이미 완료했으면 그대로 둔다)
            nxt = db.get(Todo, todo.spawned_id) if todo.spawned_id else None
            if nxt and not nxt.done:
                db.delete(nxt)
            todo.spawned_id = None
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
