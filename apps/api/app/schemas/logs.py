from __future__ import annotations

from datetime import date
from typing import Any
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TIME_RE = r"^\d{2}:\d{2}$"


def _to_minutes(hhmm: str) -> int:
    h_s, m_s = hhmm.split(":")
    h = int(h_s)
    m = int(m_s)
    if h < 0 or h > 23 or m < 0 or m > 59:
        raise ValueError("Invalid time")
    return h * 60 + m


class ActivityLogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: str | None = Field(default=None, pattern=TIME_RE, description="HH:MM")
    end: str | None = Field(default=None, pattern=TIME_RE, description="HH:MM")
    activity: str = Field(min_length=1, max_length=120)
    energy: int | None = Field(default=None, ge=1, le=5)
    focus: int | None = Field(default=None, ge=1, le=5)
    confidence: Literal["high", "medium", "low"] | None = None
    tags: list[str] = Field(default_factory=list, max_length=12)
    note: str | None = Field(default=None, max_length=280)
    source_text: str | None = Field(default=None, max_length=300)
    time_source: (
        Literal["explicit", "relative", "window", "unknown", "user_exact"] | None
    ) = None
    time_confidence: Literal["high", "medium", "low"] | None = None
    time_window: (
        Literal["dawn", "morning", "lunch", "afternoon", "evening", "night"] | None
    ) = None
    crosses_midnight: bool = False

    @model_validator(mode="after")
    def validate_time_shape(self):
        has_start = self.start is not None
        has_end = self.end is not None
        if has_start != has_end:
            raise ValueError("start/end must be provided together")
        if not has_start and not has_end:
            if self.crosses_midnight:
                raise ValueError("crosses_midnight requires explicit start/end")
            return self

        if self.start is None or self.end is None:
            raise ValueError("start/end must be provided together")

        s = _to_minutes(self.start)
        en = _to_minutes(self.end)
        if en <= s and not self.crosses_midnight:
            raise ValueError("end must be after start")
        return self


class DailySignals(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mood: str | None = Field(
        default=None, pattern="^(very_low|low|neutral|good|great)$"
    )
    sleep_quality: int | None = Field(default=None, ge=1, le=5)
    sleep_hours: float | None = Field(default=None, ge=0, le=14)
    stress_level: int | None = Field(default=None, ge=1, le=5)
    hydration_level: str | None = Field(default=None, pattern="^(low|ok|great)$")
    water_intake_ml: int | None = Field(default=None, ge=0, le=6000)
    micro_habit_done: bool | None = None
    parse_issues: list[str] = Field(default_factory=list)


class UpsertLogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    entries: list[ActivityLogEntry] = Field(default_factory=list)
    note: str | None = Field(default=None, max_length=5000)
    meta: DailySignals | None = None

    @model_validator(mode="after")
    def validate_entries(self):
        # Ensure explicit-time blocks have valid ordering and no overlaps.
        items = []
        for i, e in enumerate(self.entries):
            if e.start is None or e.end is None:
                continue
            if e.crosses_midnight:
                continue
            s = _to_minutes(e.start)
            en = _to_minutes(e.end)
            if en <= s:
                raise ValueError(f"entries[{i}]: end must be after start")
            items.append((s, en, i))

        items.sort(key=lambda x: x[0])
        for prev, cur in zip(items, items[1:], strict=False):
            prev_s, prev_e, prev_i = prev
            cur_s, cur_e, cur_i = cur
            if cur_s < prev_e:
                raise ValueError(f"entries[{cur_i}] overlaps with entries[{prev_i}]")
        return self


class ActivityLogRow(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    user_id: str
    date: date
    entries: list[dict[str, Any]]
    note: str | None = None
    meta: dict[str, Any] | None = None
    created_at: str | None = None
    updated_at: str | None = None
