from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

from pydantic import AnyUrl, Field
from pydantic import model_validator
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

    # Observability
    sentry_dsn: str | None = Field(default=None, alias="SENTRY_DSN")
    sentry_traces_sample_rate: float = Field(
        default=0.0, alias="SENTRY_TRACES_SAMPLE_RATE"
    )

    # Stripe
    # Optional: allow running core app without Stripe configured.
    stripe_secret_key: str | None = Field(default=None, alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str | None = Field(
        default=None, alias="STRIPE_WEBHOOK_SECRET"
    )
    stripe_price_id_pro: str | None = Field(default=None, alias="STRIPE_PRICE_ID_PRO")
    stripe_success_url: AnyUrl | None = Field(default=None, alias="STRIPE_SUCCESS_URL")
    stripe_cancel_url: AnyUrl | None = Field(default=None, alias="STRIPE_CANCEL_URL")
    stripe_smoke_fake: bool = Field(default=False, alias="STRIPE_SMOKE_FAKE")

    # Limits / retention
    free_daily_analyze_limit: int = Field(default=1, alias="FREE_DAILY_ANALYZE_LIMIT")
    pro_daily_analyze_limit: int = Field(default=10, alias="PRO_DAILY_ANALYZE_LIMIT")
    free_report_retention_days: int = Field(
        default=3, alias="FREE_REPORT_RETENTION_DAYS"
    )
    pro_report_retention_days: int = Field(
        default=30, alias="PRO_REPORT_RETENTION_DAYS"
    )
    analyze_per_minute_limit: int = Field(default=6, alias="ANALYZE_PER_MINUTE_LIMIT")
    recovery_v1_enabled: bool = Field(default=False, alias="RECOVERY_V1_ENABLED")
    auto_lapse_enabled: bool = Field(default=False, alias="AUTO_LAPSE_ENABLED")
    recovery_nudge_enabled: bool = Field(default=False, alias="RECOVERY_NUDGE_ENABLED")
    recovery_lapse_default_threshold_hours: int = Field(
        default=12, alias="RECOVERY_LAPSE_DEFAULT_THRESHOLD_HOURS"
    )
    recovery_auto_lapse_cooldown_hours: int = Field(
        default=24, alias="RECOVERY_AUTO_LAPSE_COOLDOWN_HOURS"
    )
    recovery_nudge_cooldown_hours: int = Field(
        default=24, alias="RECOVERY_NUDGE_COOLDOWN_HOURS"
    )
    recovery_quiet_hours_start: int = Field(
        default=22, alias="RECOVERY_QUIET_HOURS_START"
    )
    recovery_quiet_hours_end: int = Field(default=8, alias="RECOVERY_QUIET_HOURS_END")
    recovery_cron_token: str | None = Field(default=None, alias="RECOVERY_CRON_TOKEN")
    recovery_auto_lapse_batch_size: int = Field(
        default=500, alias="RECOVERY_AUTO_LAPSE_BATCH_SIZE"
    )
    recovery_nudge_batch_size: int = Field(
        default=500, alias="RECOVERY_NUDGE_BATCH_SIZE"
    )
    cohort_window_days: int = Field(default=14, alias="COHORT_WINDOW_DAYS")
    cohort_min_sample_size: int = Field(default=50, alias="COHORT_MIN_SAMPLE_SIZE")
    cohort_preview_sample_size: int = Field(
        default=20, alias="COHORT_PREVIEW_SAMPLE_SIZE"
    )
    cohort_high_confidence_sample_size: int = Field(
        default=100, alias="COHORT_HIGH_CONFIDENCE_SAMPLE_SIZE"
    )
    cohort_threshold_experiment_enabled: bool = Field(
        default=True, alias="COHORT_THRESHOLD_EXPERIMENT_ENABLED"
    )
    cohort_threshold_experiment_rollout_pct: int = Field(
        default=50, alias="COHORT_THRESHOLD_EXPERIMENT_ROLLOUT_PCT"
    )
    cohort_experiment_min_sample_size: int = Field(
        default=80, alias="COHORT_EXPERIMENT_MIN_SAMPLE_SIZE"
    )
    cohort_experiment_preview_sample_size: int = Field(
        default=30, alias="COHORT_EXPERIMENT_PREVIEW_SAMPLE_SIZE"
    )
    cohort_experiment_high_confidence_sample_size: int = Field(
        default=150, alias="COHORT_EXPERIMENT_HIGH_CONFIDENCE_SAMPLE_SIZE"
    )

    @model_validator(mode="after")
    def validate_runtime_constraints(self) -> "Settings":
        env = (self.app_env or "").strip().lower()
        is_prod = env in {"production", "prod"}

        frontend_origin = urlparse(str(self.frontend_url))
        frontend_host = (frontend_origin.hostname or "").lower()
        if is_prod and frontend_host in {"localhost", "127.0.0.1"}:
            raise ValueError(
                "Invalid FRONTEND_URL for production: localhost is not allowed. "
                "Set FRONTEND_URL to your public web domain."
            )

        supabase_origin = urlparse(str(self.supabase_url))
        supabase_host = (supabase_origin.hostname or "").lower()
        if is_prod and supabase_host in {"localhost", "127.0.0.1"}:
            raise ValueError(
                "Invalid SUPABASE_URL for production: localhost is not allowed."
            )
        if is_prod and self.stripe_smoke_fake:
            raise ValueError("STRIPE_SMOKE_FAKE must be disabled in production.")

        if not (0 <= self.cohort_threshold_experiment_rollout_pct <= 100):
            raise ValueError("COHORT_THRESHOLD_EXPERIMENT_ROLLOUT_PCT must be 0..100")
        if self.cohort_preview_sample_size > self.cohort_min_sample_size:
            raise ValueError(
                "COHORT_PREVIEW_SAMPLE_SIZE must be <= COHORT_MIN_SAMPLE_SIZE"
            )
        if self.cohort_min_sample_size > self.cohort_high_confidence_sample_size:
            raise ValueError(
                "COHORT_MIN_SAMPLE_SIZE must be <= COHORT_HIGH_CONFIDENCE_SAMPLE_SIZE"
            )
        if (
            self.cohort_experiment_preview_sample_size
            > self.cohort_experiment_min_sample_size
        ):
            raise ValueError(
                "COHORT_EXPERIMENT_PREVIEW_SAMPLE_SIZE must be <= COHORT_EXPERIMENT_MIN_SAMPLE_SIZE"
            )
        if (
            self.cohort_experiment_min_sample_size
            > self.cohort_experiment_high_confidence_sample_size
        ):
            raise ValueError(
                "COHORT_EXPERIMENT_MIN_SAMPLE_SIZE must be <= COHORT_EXPERIMENT_HIGH_CONFIDENCE_SAMPLE_SIZE"
            )
        if not (1 <= self.recovery_lapse_default_threshold_hours <= 168):
            raise ValueError(
                "RECOVERY_LAPSE_DEFAULT_THRESHOLD_HOURS must be between 1 and 168"
            )
        if not (1 <= self.recovery_auto_lapse_cooldown_hours <= 336):
            raise ValueError(
                "RECOVERY_AUTO_LAPSE_COOLDOWN_HOURS must be between 1 and 336"
            )
        if not (1 <= self.recovery_nudge_cooldown_hours <= 336):
            raise ValueError("RECOVERY_NUDGE_COOLDOWN_HOURS must be between 1 and 336")
        if not (0 <= self.recovery_quiet_hours_start <= 23):
            raise ValueError("RECOVERY_QUIET_HOURS_START must be 0..23")
        if not (0 <= self.recovery_quiet_hours_end <= 23):
            raise ValueError("RECOVERY_QUIET_HOURS_END must be 0..23")
        if not (1 <= self.recovery_auto_lapse_batch_size <= 2000):
            raise ValueError("RECOVERY_AUTO_LAPSE_BATCH_SIZE must be 1..2000")
        if not (1 <= self.recovery_nudge_batch_size <= 2000):
            raise ValueError("RECOVERY_NUDGE_BATCH_SIZE must be 1..2000")

        return self

    def is_stripe_configured(self) -> bool:
        return bool(
            self.stripe_secret_key
            and self.stripe_webhook_secret
            and self.stripe_price_id_pro
            and self.stripe_success_url
            and self.stripe_cancel_url
        )


settings = Settings()  # type: ignore[call-arg]  # singleton import via env settings
