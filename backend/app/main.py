from fastapi import FastAPI, Request
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


@app.middleware("http")
async def capture_oidc_token(request: Request, call_next):
    """Vercel 배포 환경: 요청 헤더의 OIDC 토큰으로 AI Gateway 인증 (키 저장 불필요)."""
    token = request.headers.get("x-vercel-oidc-token")
    reset = ai_agent.request_oidc_token.set(token) if token else None
    try:
        return await call_next(request)
    finally:
        if reset is not None:
            ai_agent.request_oidc_token.reset(reset)


app.include_router(todos.router)
app.include_router(chat.router)
app.include_router(reports.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
