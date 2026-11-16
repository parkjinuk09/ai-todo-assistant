import os
from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
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


def add_missing_columns(bind=None) -> list[str]:
    """create_all은 이미 있는 테이블에 열을 추가하지 않는다 → 모델에만 있는 열을 ALTER TABLE로 붙인다.
    (기본값이 있거나 NULL을 허용하는 열만 추가할 수 있다)"""
    bind = bind or engine
    insp = inspect(bind)
    pg = bind.dialect.name == "postgresql"
    added = []
    with bind.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have:
                    continue
                ddl = (f"ALTER TABLE {table.name} ADD COLUMN {'IF NOT EXISTS ' if pg else ''}"
                       f"{col.name} {col.type.compile(bind.dialect)}")
                if col.server_default is not None:
                    ddl += f" DEFAULT {col.server_default.arg.text} NOT NULL"
                conn.execute(text(ddl))
                added.append(f"{table.name}.{col.name}")
    return added
