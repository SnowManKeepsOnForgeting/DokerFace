from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="DOKERFACE_",
        extra="ignore",
    )

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://dokerface:dokerface@localhost:5432/dokerface"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    session_cookie_name: str = "dokerface_session"
    session_ttl_hours: int = Field(default=24 * 30, ge=1, le=24 * 365)
    bootstrap_admin_login: str | None = None
    bootstrap_admin_password: str | None = None

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
