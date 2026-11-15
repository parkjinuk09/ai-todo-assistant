from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  테이블 등록
from app.api.routes import chat, reports, todos
from app.core.config import settings
from app.core.database import Base, engine
from app.services import ai_agent

Base.metadata.create_all(engine)

app = FastAPI(title="AI Todo Assistant API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)



app.include_router(todos.router)
app.include_router(chat.router)
app.include_router(reports.router)


@app.get("/health", tags=["health"])
def health():
    """llm: 로컬 모델을 쓸 수 있는지. 프론트는 이걸 보고 채팅 입력을 막고 이유를 보여준다."""
    problem = ai_agent.llm_status()
    return {"status": "ok", "llm": problem is None, "llm_problem": problem, "model": settings.llm_model}
