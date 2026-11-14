from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  테이블 등록
from app.api.routes import chat, todos
from app.core.config import settings
from app.core.database import Base, engine

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


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
