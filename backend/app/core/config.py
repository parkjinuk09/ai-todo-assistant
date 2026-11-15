from zoneinfo import ZoneInfo

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Vercel Marketplace(Neon/Upstash)가 주입하는 변수 이름도 함께 인식
    database_url: str = Field("sqlite:///./local.db", validation_alias=AliasChoices("DATABASE_URL", "POSTGRES_URL"))
    redis_url: str = Field("", validation_alias=AliasChoices("REDIS_URL", "KV_URL"))
    cache_enabled: bool = True
    # Vercel AI Gateway (OpenAI 호환). 로컬은 API 키, Vercel 배포에서는 OIDC 토큰으로 자동 인증
    ai_gateway_api_key: str = ""
    ai_gateway_base_url: str = "https://ai-gateway.vercel.sh/v1"
    ai_model: str = "google/gemini-2.5-flash-lite"
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
