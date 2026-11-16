from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import models  # noqa: F401  테이블 등록
from app.api.routes import chat, reports, todos
from app.core.config import settings
from app.core.database import Base, add_missing_columns, engine
from app.services import ai_agent

Base.metadata.create_all(engine)
add_missing_columns()

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


# 라우트를 다 등록한 뒤에 붙여야 API 경로가 먼저 잡힌다
if settings.web_dist and Path(settings.web_dist).is_dir():
    class WebFiles(StaticFiles):
        """index.html은 매번 새로 확인하게 한다. 안 그러면 다시 설치해도 옛 화면이 캐시에서 뜬다."""

        async def get_response(self, path, scope):
            response = await super().get_response(path, scope)
            if not path.startswith("assets/"):  # assets는 파일 이름에 해시가 있어 캐시해도 안전
                response.headers["Cache-Control"] = "no-cache"
            return response

    app.mount("/", WebFiles(directory=settings.web_dist, html=True), name="web")
