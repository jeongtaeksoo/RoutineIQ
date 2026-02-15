from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TIME_RE = r"^\d{2}:\d{2}$"


class ProductivityPeak(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: str = Field(pattern=TIME_RE)
    end: str = Field(pattern=TIME_RE)
    reason: str


class FailurePattern(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pattern: str
    trigger: str
    fix: str


class TomorrowRoutineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: str = Field(pattern=TIME_RE)
    end: str = Field(pattern=TIME_RE)
    activity: str
    goal: str


class IfThenRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    if_: str = Field(alias="if")
    then: str


class YesterdayPlanVsActual(BaseModel):
    model_config = ConfigDict(extra="forbid")
    comparison_note: str
    top_deviation: str


class WellbeingInsight(BaseModel):
    model_config = ConfigDict(extra="forbid")
    burnout_risk: str = "medium"
    energy_curve_forecast: str = ""
    note: str = ""


class MicroAdviceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str
    when: str
    reason: str
    duration_min: int = Field(ge=1, le=20)


class AnalysisMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")
    input_quality_score: int = Field(ge=0, le=100)
    profile_coverage_pct: float = Field(ge=0, le=100)
    wellbeing_signals_count: int = Field(ge=0, le=6)
    logged_entry_count: int = Field(ge=0, le=200)
    schema_retry_count: int = Field(ge=0, le=3)
    personalization_tier: Literal["low", "medium", "high"]


class AIReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=2, ge=1, le=9)
    summary: str
    productivity_peaks: list[ProductivityPeak]
    failure_patterns: list[FailurePattern]
    tomorrow_routine: list[TomorrowRoutineItem]
    if_then_rules: list[IfThenRule]
    coach_one_liner: str
    yesterday_plan_vs_actual: YesterdayPlanVsActual
    wellbeing_insight: WellbeingInsight = Field(default_factory=WellbeingInsight)
    micro_advice: list[MicroAdviceItem] = Field(default_factory=list)
    weekly_pattern_insight: str = ""
    analysis_meta: AnalysisMeta | None = None
