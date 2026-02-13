from __future__ import annotations

from datetime import date as Date

from pydantic import BaseModel


class GoalPrefs(BaseModel):
    keyword: str
    minutes_per_day: int


class WeeklySeriesPoint(BaseModel):
    date: Date
    day: str
    blocks: int


class ConsistencyPayload(BaseModel):
    score: int
    days_logged: int
    days_total: int
    series: list[WeeklySeriesPoint]


class WeeklySummaryPayload(BaseModel):
    days_logged: int
    days_total: int
    total_blocks: int
    deep_minutes: int
    goal: GoalPrefs | None = None


class InsightsWeeklyResponse(BaseModel):
    from_date: Date
    to_date: Date
    consistency: ConsistencyPayload
    weekly: WeeklySummaryPayload
