from zoneinfo import ZoneInfo

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Vercel Marketplace(Neon/Upstash)가 주입하는 변수 이름도 함께 인식
    database_url: str = Field("sqlite:///./local.db", validation_alias=AliasChoices("DATABASE_URL", "POSTGRES_URL"))
    redis_url: str = Field("", validation_alias=AliasChoices("REDIS_URL", "KV_URL"))
    cache_enabled: bool = True
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    cors_origins: str = "*"
    timezone: str = "Asia/Seoul"

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return url.replace(prefix, "postgresql+psycopg://", 1)
        return url

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


settings = Settings()
