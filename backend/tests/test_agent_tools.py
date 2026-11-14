from app.core.database import SessionLocal
from app.services.ai_agent import build_tools


def test_tools_mutate_db():
    db = SessionLocal()
    actions: list[str] = []
    list_todos, add_todo, update_todo, complete_todo, delete_todo = build_tools(db, actions)

    created = add_todo(title="치과 예약", due_at="2026-11-20T10:00:00", category="건강", priority=5)
    assert list_todos()[0]["priority"] == 3  # 범위 보정
    update_todo(created["id"], title="치과 가기")
    complete_todo(created["id"])
    assert list_todos() == [] and list_todos(include_done=True)[0]["done"]
    delete_todo(created["id"])
    assert actions == ["추가: 치과 예약", "수정: 치과 가기", "완료: 치과 가기", "삭제: 치과 가기"]
    db.close()
