from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Todo(Base):
    __tablename__ = "todos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(30), default="기타")
    priority: Mapped[int] = mapped_column(Integer, default=2)  # 1 높음 ~ 3 낮음
    done: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # 하루 종일: 시간이 없는 할 일. due_at은 그날 23:59로 두고 화면에는 날짜만 보여준다
    all_day: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    repeat: Mapped[str | None] = mapped_column(String(10), nullable=True)  # daily/weekdays/weekly/monthly
    note: Mapped[str] = mapped_column(Text, default="", server_default=text("''"))
    subtasks: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [{"title": str, "done": bool}]
    # 반복 할 일을 완료하면서 만든 다음 회차 (완료를 되돌릴 때 같이 지운다)
    spawned_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
