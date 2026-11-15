from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./local.db"
    redis_url: str = ""
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
