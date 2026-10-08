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
    queue_capacity: int = Field(default=10000, ge=100, le=10000)
    edit_capacity: int = Field(default=20000, ge=100, le=100000)
    audit_capacity: int = Field(default=100000, ge=100, le=1000000)
    member_capacity: int = Field(default=1000, ge=4, le=10000)
    thread_capacity: int = Field(default=20000, ge=1, le=100000)
    comment_capacity: int = Field(default=100000, ge=1, le=1000000)
    threads_per_edit: int = Field(default=20, ge=1, le=20)
    comments_per_thread: int = Field(default=20, ge=1, le=20)
    sessions_per_member: int = Field(default=10, ge=1, le=20)
    request_bytes: int = Field(default=1048576, ge=1024, le=2097152)
    concurrent_requests: int = Field(default=16, ge=2, le=32)

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
