from __future__ import annotations

from pathlib import Path

from pydantic import AnyUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ENV_FILE), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_env: str = Field(default="development", alias="APP_ENV")
    frontend_url: AnyUrl = Field(alias="FRONTEND_URL")

    # Supabase
    supabase_url: AnyUrl = Field(alias="SUPABASE_URL")
    supabase_anon_key: str = Field(alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(alias="SUPABASE_SERVICE_ROLE_KEY")
    # Deprecated: Supabase moved to asymmetric signing keys (JWKS). We delegate auth verification
    # to Supabase Auth API instead of verifying JWTs locally.
    supabase_jwt_secret: str | None = Field(default=None, alias="SUPABASE_JWT_SECRET")

    # OpenAI
    openai_api_key: str = Field(alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    openai_price_input_per_1k: float | None = Field(
        default=None, alias="OPENAI_PRICE_INPUT_PER_1K"
    )
    openai_price_output_per_1k: float | None = Field(
        default=None, alias="OPENAI_PRICE_OUTPUT_PER_1K"
    )

    # Stripe
    # Optional: allow running core app without Stripe configured.
    stripe_secret_key: str | None = Field(default=None, alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str | None = Field(default=None, alias="STRIPE_WEBHOOK_SECRET")
    stripe_price_id_pro: str | None = Field(default=None, alias="STRIPE_PRICE_ID_PRO")
    stripe_success_url: AnyUrl | None = Field(default=None, alias="STRIPE_SUCCESS_URL")
    stripe_cancel_url: AnyUrl | None = Field(default=None, alias="STRIPE_CANCEL_URL")

    # Limits / retention
    free_daily_analyze_limit: int = Field(default=1, alias="FREE_DAILY_ANALYZE_LIMIT")
    pro_daily_analyze_limit: int = Field(default=10, alias="PRO_DAILY_ANALYZE_LIMIT")
    free_report_retention_days: int = Field(default=3, alias="FREE_REPORT_RETENTION_DAYS")
    pro_report_retention_days: int = Field(default=30, alias="PRO_REPORT_RETENTION_DAYS")

    def is_stripe_configured(self) -> bool:
        return bool(
            self.stripe_secret_key
            and self.stripe_webhook_secret
            and self.stripe_price_id_pro
            and self.stripe_success_url
            and self.stripe_cancel_url
        )


settings = Settings()  # singleton import
