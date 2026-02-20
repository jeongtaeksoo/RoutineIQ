from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

Plan = Literal["free", "pro"]


class EntitlementLimits(BaseModel):
    model_config = ConfigDict(extra="forbid")

    daily_analyze_limit: int
    report_retention_days: int


class EntitlementsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: Plan
    is_pro: bool
    status: str | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool | None = None
    needs_email_setup: bool
    can_use_checkout: bool
    analyze_used_today: int
    analyze_remaining_today: int
    limits: EntitlementLimits


ActivationNextStep = Literal["profile", "log", "analyze", "complete"]


class ActivationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile_complete: bool
    has_any_log: bool
    has_any_report: bool
    activation_complete: bool
    next_step: ActivationNextStep
