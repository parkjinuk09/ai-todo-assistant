"""월간 기록 리포트.

- 집계는 SQL(GROUP BY)로, 해석(회고 코멘트)은 LLM으로 분리
- 지난 달 리포트는 한 번 생성 후 DB에 저장(확정)해서 재사용 → LLM 호출 비용 절감
- 이번 달은 진행 중이므로 매번 새로 집계
"""
import re
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import MonthlyReport, Todo
from app.models.todo import utcnow
from app.schemas.report import CategoryStat, ReportOut, ReportStats
from app.services import ai_agent

WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def month_range(month: str) -> tuple[datetime, datetime]:
    if not MONTH_RE.match(month):
        raise HTTPException(status_code=422, detail="month는 YYYY-MM 형식이어야 해요")
    y, m = map(int, month.split("-"))
    start = datetime(y, m, 1, tzinfo=settings.tz)
    end = datetime(y + (m == 12), m % 12 + 1, 1, tzinfo=settings.tz)
    return start, end


def current_month() -> str:
    return datetime.now(settings.tz).strftime("%Y-%m")


def compute_stats(db: Session, month: str) -> ReportStats:
    start, end = month_range(month)
    created_in = and_(Todo.created_at >= start, Todo.created_at < end)
    completed_in = and_(Todo.completed_at >= start, Todo.completed_at < end)

    created, completed_of_created, pending = db.execute(
        select(
            func.count(),
            func.count().filter(Todo.done.is_(True)),
            func.count().filter(Todo.done.is_(False)),
        ).where(created_in)
    ).one()

    completed, on_time, late = db.execute(
        select(
            func.count(),
            func.count().filter(and_(Todo.due_at.is_not(None), Todo.completed_at <= Todo.due_at)),
            func.count().filter(and_(Todo.due_at.is_not(None), Todo.completed_at > Todo.due_at)),
        ).where(completed_in)
    ).one()

    rows = db.execute(
        select(
            Todo.category,
            func.sum(case((created_in, 1), else_=0)),
            func.sum(case((completed_in, 1), else_=0)),
        )
        .where(created_in | completed_in)
        .group_by(Todo.category)
        .order_by(func.count().desc())
    ).all()
    by_category = [CategoryStat(category=c, created=int(cr or 0), completed=int(co or 0)) for c, cr, co in rows]

    # 요일 추출 함수는 DB마다 달라서(EXTRACT/strftime) 완료 시각만 가져와 앱에서 집계
    by_weekday = {d: 0 for d in WEEKDAYS}
    for (ts,) in db.execute(select(Todo.completed_at).where(completed_in)):
        local = (ts if ts.tzinfo else ts.replace(tzinfo=settings.tz)).astimezone(settings.tz)
        by_weekday[WEEKDAYS[local.weekday()]] += 1
    best = max(by_weekday, key=by_weekday.get) if completed else None

    return ReportStats(
        created=created,
        completed=completed,
        completion_rate=round(completed_of_created / created * 100, 1) if created else 0.0,
        on_time=on_time,
        late=late,
        still_pending=pending,
        by_category=by_category,
        by_weekday=by_weekday,
        best_weekday=best,
    )


def ai_comment(month: str, stats: ReportStats) -> str:
    if stats.created == 0 and stats.completed == 0:
        return "이번 달은 기록이 없어. 다음 달엔 작은 것부터 하나씩 적어보자!"
    cats = ", ".join(f"{c.category} {c.completed}/{c.created}" for c in stats.by_category) or "없음"
    prompt = (
        f"{month} 한 달 투두 기록이야.\n"
        f"- 만든 할 일 {stats.created}개, 완료 {stats.completed}개, 완료율 {stats.completion_rate}%\n"
        f"- 마감 전 완료 {stats.on_time}개, 마감 지나서 완료 {stats.late}개, 남은 일 {stats.still_pending}개\n"
        f"- 카테고리별 완료/생성: {cats}\n"
        f"- 가장 많이 끝낸 요일: {stats.best_weekday}\n\n"
        "친구처럼 반말로 한 달 회고를 써줘. 잘한 점 1개, 아쉬운 점 1개, 다음 달 제안 1개. 4줄 이내."
    )
    try:
        return ai_agent.generate_text(prompt)
    except Exception:
        return (f"{stats.completed}개를 끝냈고 완료율은 {stats.completion_rate}%야. "
                f"{stats.best_weekday or '-'}요일에 제일 열심히 했어!")


def get_monthly_report(db: Session, month: str | None = None, regenerate: bool = False) -> ReportOut:
    month = month or current_month()
    month_range(month)  # 형식 검증
    if month > current_month():
        raise HTTPException(status_code=422, detail="미래 달의 리포트는 만들 수 없어요")
    finalized = month < current_month()

    saved = db.scalar(select(MonthlyReport).where(MonthlyReport.month == month))
    if finalized and saved and not regenerate:
        return ReportOut(month=month, stats=ReportStats(**saved.stats), ai_comment=saved.ai_comment,
                         generated_at=saved.generated_at, finalized=True)

    stats = compute_stats(db, month)
    comment = ai_comment(month, stats)

    if finalized:  # 지난 달만 확정본으로 저장
        if saved is None:
            saved = MonthlyReport(month=month)
            db.add(saved)
        saved.stats, saved.ai_comment, saved.generated_at = stats.model_dump(), comment, utcnow()
        db.commit()

    return ReportOut(month=month, stats=stats, ai_comment=comment, generated_at=utcnow(), finalized=finalized)


def list_saved_months(db: Session) -> list[str]:
    return list(db.scalars(select(MonthlyReport.month).order_by(MonthlyReport.month.desc())))
