from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal
from app.models import MonthlyReport, Todo
from app.services import report_service

KST = timezone(timedelta(hours=9))


def seed(db):
    def t(title, cat, created, due=None, completed=None):
        db.add(Todo(title=title, category=cat, created_at=created, due_at=due,
                    done=completed is not None, completed_at=completed))
    t("과제1", "공부", datetime(2025, 3, 2, 10, tzinfo=KST), datetime(2025, 3, 5, tzinfo=KST), datetime(2025, 3, 4, 9, tzinfo=KST))  # 화, 마감 전
    t("과제2", "공부", datetime(2025, 3, 3, tzinfo=KST), datetime(2025, 3, 4, tzinfo=KST), datetime(2025, 3, 6, 9, tzinfo=KST))     # 목, 늦음
    t("운동", "건강", datetime(2025, 3, 10, tzinfo=KST), None, datetime(2025, 3, 11, 9, tzinfo=KST))                                # 화
    t("미완료", "일", datetime(2025, 3, 20, tzinfo=KST))
    t("다른 달", "일", datetime(2025, 4, 2, tzinfo=KST))
    db.commit()


def test_compute_stats():
    db = SessionLocal()
    seed(db)
    s = report_service.compute_stats(db, "2025-03")
    assert (s.created, s.completed, s.still_pending) == (4, 3, 1)
    assert s.completion_rate == 75.0
    assert (s.on_time, s.late) == (1, 1)
    assert s.best_weekday == "화" and s.by_weekday["화"] == 2
    assert {c.category: (c.created, c.completed) for c in s.by_category}["공부"] == (2, 2)
    db.close()


def test_past_month_is_saved_and_reused(client):
    db = SessionLocal()
    seed(db)
    db.close()

    first = client.get("/reports/monthly?month=2025-03").json()
    assert first["finalized"] is True and first["stats"]["completed"] == 3

    db = SessionLocal()
    db.add(Todo(title="나중에 추가", category="일", created_at=datetime(2025, 3, 15, tzinfo=KST)))
    db.commit()
    assert db.query(MonthlyReport).count() == 1
    db.close()

    # 확정본 재사용 → 새 데이터 반영 안 됨, regenerate 시 반영
    assert client.get("/reports/monthly?month=2025-03").json()["stats"]["created"] == 4
    assert client.get("/reports/monthly?month=2025-03&regenerate=true").json()["stats"]["created"] == 5
    assert client.get("/reports/months").json() == ["2025-03"]


def test_current_month_not_saved(client):
    client.post("/todos", json={"title": "이번 달"})
    body = client.get("/reports/monthly").json()
    assert body["finalized"] is False and body["stats"]["created"] == 1
    assert client.get("/reports/months").json() == []


def test_invalid_month(client):
    assert client.get("/reports/monthly?month=2025-13").status_code == 422
    assert client.get("/reports/monthly?month=2999-01").status_code == 422


def test_upsert_is_idempotent():
    db = SessionLocal()
    report_service._upsert_report(db, "2025-01", {"a": 1}, "first")
    report_service._upsert_report(db, "2025-01", {"a": 2}, "second")
    rows = db.query(MonthlyReport).all()
    assert len(rows) == 1 and rows[0].ai_comment == "second"
    db.close()
