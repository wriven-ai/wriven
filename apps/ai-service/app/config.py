"""Typed environment configuration.

One `settings` singleton is constructed at import time and consumed everywhere
else. `pydantic-settings` `BaseSettings` maps each attr to its SCREAMING_SNAKE
env var (`ai_api_key` -> `AI_API_KEY`, `internal_secret` -> `INTERNAL_SECRET`,
…). The `.env` file is loaded only for local dev; in production (Render) env
vars come from the platform.

Only non-secret infra has built-in defaults (`port`, `ai_timeout_ms`). Every
provider/secret field defaults to empty — the env var is the single source of
truth, so no provider opinion (e.g. OpenRouter) is baked in. An empty
`ai_api_key` means "not configured" -> `AI_NOT_CONFIGURED` per call (the
service still boots).
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM provider (generic OpenAI-compatible Chat Completions). All env-driven.
    ai_api_key: str = ""
    ai_base_url: str = ""
    ai_model: str = ""
    ai_timeout_ms: int = 30_000
    # Total wall-clock budget for one generation (initial call + one repair).
    # Kept just under core's AI_SERVICE_TIMEOUT_MS (35s default) so a slow
    # provider is cut off here and core receives our error JSON instead of
    # timing out the socket — and no provider tokens burn after core hung up.
    ai_generation_deadline_ms: int = 32_000
    # Hard service-wide ceilings. Operation policy can lower the output ceiling,
    # but never raise it. These protect provider spend even if core is bypassed.
    ai_max_input_chars: int = Field(default=24_000, ge=1_000, le=100_000)
    ai_max_output_tokens: int = Field(default=8_000, ge=64, le=8_000)
    ai_headers: str = ""
    internal_secret: str = ""
    environment: str = "development"

    port: int = 8000


settings = Settings()
