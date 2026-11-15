"""부하 테스트용 더미 데이터. 사용: python -m scripts.seed 3000"""
import random
import sys
from datetime import datetime, timedelta

from sqlalchemy import delete

from app import models  # noqa: F401
from app.core.database import Base, SessionLocal, engine
from app.models import MonthlyReport, Todo

CATEGORIES = ["공부", "일", "개인", "건강", "기타"]


def main(n: int) -> None:
    Base.metadata.create_all(engine)
    random.seed(42)
    now = datetime.now().astimezone()
    db = SessionLocal()
    db.execute(delete(Todo))
    db.execute(delete(MonthlyReport))
    rows = []
    for i in range(n):
        created = now - timedelta(days=random.uniform(0, 90))
        due = created + timedelta(days=random.uniform(0, 10)) if random.random() < 0.7 else None
        done = random.random() < 0.6
        completed = created + timedelta(days=random.uniform(0, 12)) if done else None
        if completed and completed > now:
            completed = now
        rows.append(Todo(title=f"할 일 {i}", category=random.choice(CATEGORIES), priority=random.randint(1, 3),
                         created_at=created, due_at=due, done=done, completed_at=completed))
    db.add_all(rows)
    db.commit()
    db.close()
    print(f"seeded {n} todos")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 3000)
