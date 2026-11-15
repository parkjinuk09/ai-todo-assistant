from zoneinfo import ZoneInfo

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Vercel Marketplace(Neon/Upstash)가 주입하는 변수 이름도 함께 인식
    database_url: str = Field("sqlite:///./local.db", validation_alias=AliasChoices("DATABASE_URL", "POSTGRES_URL"))
    redis_url: str = Field("", validation_alias=AliasChoices("REDIS_URL", "KV_URL"))
    cache_enabled: bool = True
    # LLM: OpenAI 호환 엔드포인트. 기본값은 로컬 Ollama (키 불필요)
    llm_base_url: str = Field("http://localhost:11434/v1", validation_alias=AliasChoices("LLM_BASE_URL"))
    llm_api_key: str = Field("ollama", validation_alias=AliasChoices("LLM_API_KEY"))
    llm_model: str = Field("qwen2.5:7b", validation_alias=AliasChoices("LLM_MODEL"))
    llm_timeout: float = Field(120, validation_alias=AliasChoices("LLM_TIMEOUT"))
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
