import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

# 서버리스(Vercel)에서는 인스턴스마다 풀을 들고 있으면 DB 커넥션이 고갈되므로
# 풀링은 Neon의 PgBouncer(pooled endpoint)에 맡기고 앱에서는 NullPool 사용
if os.getenv("VERCEL"):
    engine = create_engine(settings.sqlalchemy_url, poolclass=NullPool)
else:
    engine = create_engine(settings.sqlalchemy_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
