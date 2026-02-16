from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AgeGroup = Literal["0_17", "18_24", "25_34", "35_44", "45_plus", "unknown"]
Gender = Literal["female", "male", "nonbinary", "prefer_not_to_say", "unknown"]
JobFamily = Literal[
    "office_worker",
    "professional",
    "creator",
    "student",
    "self_employed",
    "other",
    "unknown",
]
WorkMode = Literal["fixed", "flex", "shift", "freelance", "other", "unknown"]
CompareDimension = Literal["age_group", "gender", "job_family", "work_mode"]
CohortConfidenceLevel = Literal["low", "medium", "high"]
CohortThresholdVariant = Literal["control", "candidate"]
CohortEventType = Literal[
    "card_view",
    "preview_badge_seen",
    "rank_seen",
    "tip_seen",
    "preferences_click",
]


DEFAULT_COMPARE_BY: tuple[CompareDimension, ...] = (
    "age_group",
    "job_family",
    "work_mode",
)


class ProfilePreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    age_group: AgeGroup = "unknown"
    gender: Gender = "unknown"
    job_family: JobFamily = "unknown"
    work_mode: WorkMode = "unknown"
    trend_opt_in: bool = False
    trend_compare_by: list[CompareDimension] = Field(
        default_factory=lambda: list(DEFAULT_COMPARE_BY), min_length=1, max_length=5
    )
    goal_keyword: str | None = Field(default=None, max_length=60)
    goal_minutes_per_day: int | None = Field(default=None, ge=10, le=600)

    @field_validator("trend_compare_by")
    @classmethod
    def validate_compare_by(
        cls, value: list[CompareDimension]
    ) -> list[CompareDimension]:
        deduped: list[CompareDimension] = []
        for item in value:
            if item not in deduped:
                deduped.append(item)
        if not deduped:
            return list(DEFAULT_COMPARE_BY)
        return deduped

    @field_validator("goal_keyword")
    @classmethod
    def normalize_goal_keyword(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        return text or None


class CohortTrendMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    focus_window_rate: float | None = None
    rebound_rate: float | None = None
    recovery_buffer_day_rate: float | None = None
    focus_window_numerator: int = 0
    focus_window_denominator: int = 0
    rebound_numerator: int = 0
    rebound_denominator: int = 0
    recovery_day_numerator: int = 0
    recovery_day_denominator: int = 0


class CohortTrendResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool
    insufficient_sample: bool
    min_sample_size: int
    preview_sample_size: int
    high_confidence_sample_size: int
    threshold_variant: CohortThresholdVariant = "control"
    preview_mode: bool = False
    confidence_level: CohortConfidenceLevel = "low"
    cohort_size: int
    active_users: int
    window_days: int
    compare_by: list[CompareDimension] = Field(default_factory=list)
    filters: dict[str, str] = Field(default_factory=dict)
    metrics: CohortTrendMetrics
    message: str
    my_focus_rate: float | None = None
    my_rebound_rate: float | None = None
    my_recovery_rate: float | None = None
    my_focus_delta_7d: float | None = None
    my_rebound_delta_7d: float | None = None
    my_recovery_delta_7d: float | None = None
    rank_label: str = ""
    actionable_tip: str = ""


class CohortTrendEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: CohortEventType
    threshold_variant: CohortThresholdVariant = "control"
    confidence_level: CohortConfidenceLevel | None = None
    preview_mode: bool | None = None
    cohort_size: int | None = Field(default=None, ge=0)
    window_days: int | None = Field(default=None, ge=1)
    compare_by: list[CompareDimension] = Field(default_factory=list)
