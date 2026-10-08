from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WIKIWATCH_", env_file=".env", extra="ignore")
    base_path: str = "/wikiwatch-service/v1"
    database_url: str = "sqlite+aiosqlite:///./wikiwatch.db"
    cors_allow_origins: list[str] = ["http://localhost:5173"]
    access_minutes: int = Field(default=15, ge=1, le=60)
    refresh_days: int = Field(default=7, ge=1, le=30)
    queue_capacity: int = Field(default=10000, ge=100)

    @field_validator("base_path")
    @classmethod
    def normalize(cls, value):
        return "/" + value.strip("/")

    @field_validator("cors_allow_origins")
    @classmethod
    def origins(cls, value):
        if not value or "*" in value:
            raise ValueError("Set explicit browser origins, without paths or wildcard")
        return value


@lru_cache
def get_settings():
    return Settings()


settings = get_settings()
