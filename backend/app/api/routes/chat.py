from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import ChatMessage
from app.schemas.chat import BriefingOut, ChatIn, ChatMessageOut, ChatOut
from app.services import ai_agent, todo_service

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatOut)
def chat(body: ChatIn, db: Session = Depends(get_db)):
    try:
        reply, actions = ai_agent.chat(db, body.message)
    except ai_agent.AIUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:  # 외부 API 오류는 502로 감싼다
        db.rollback()
        raise HTTPException(status_code=502, detail=f"AI 호출 실패: {e.__class__.__name__}")
    return ChatOut(reply=reply, actions=actions, todos=todo_service.list_todos(db))


@router.get("/chat", response_model=list[ChatMessageOut])
def chat_history(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.scalars(select(ChatMessage).order_by(ChatMessage.id.desc()).limit(limit))
    return list(reversed(list(rows)))


@router.get("/briefing", response_model=BriefingOut)
def briefing(db: Session = Depends(get_db)):
    overdue, today = todo_service.briefing_buckets(db)
    pending = todo_service.list_todos(db, done=False)
    if not pending:
        return BriefingOut(summary="남은 할 일이 없어! 오늘은 푹 쉬어 🙌", overdue=[], today=[])

    lines = "\n".join(
        f"- {t.title} (마감 {t.due_at.isoformat() if t.due_at else '없음'}, 우선순위 {t.priority})"
        for t in pending[:20]
    )
    prompt = (f"아래는 내 남은 할 일이야. 밀린 것 {len(overdue)}개, 오늘 마감 {len(today)}개.\n{lines}\n\n"
              "오늘 뭐부터 하면 좋을지 3줄 이내 반말로 추천해줘.")
    try:
        summary = ai_agent.generate_text(prompt)
    except Exception:
        summary = f"밀린 일 {len(overdue)}개, 오늘 마감 {len(today)}개가 있어. 마감 빠른 것부터 하자!"
    return BriefingOut(summary=summary, overdue=overdue, today=today)
