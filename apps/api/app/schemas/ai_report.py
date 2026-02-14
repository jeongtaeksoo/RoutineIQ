from __future__ import annotations

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
