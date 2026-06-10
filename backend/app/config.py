"""Application settings, loaded from environment / backend/.env.

Defaults are chosen so the app runs fully offline with no configuration:
LLM_PROVIDER=local and the bundled mimic_demo + synthetic sources.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # LLM
    llm_provider: str = "local"  # local | anthropic | openai
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Data
    enabled_sources: str = "mimic_demo,synthetic"

    # Persistence
    database_url: str = "sqlite:///./ed_triage.sqlite3"

    # Comma-separated browser origins allowed by CORS. Defaults to the Vite dev
    # origins; set to your deployed frontend URL(s) in production.
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def enabled_source_list(self) -> list[str]:
        return [s.strip() for s in self.enabled_sources.split(",") if s.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


_settings: Settings | None = None


def get_settings() -> Settings:
    """Cached settings accessor (FastAPI dependency-friendly)."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
