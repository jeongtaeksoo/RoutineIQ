from __future__ import annotations

from datetime import date as Date

from pydantic import BaseModel, Field


class ParseDiaryRequest(BaseModel):
    date: Date
    diary_text: str = Field(min_length=10, max_length=5000)


class ParsedEntry(BaseModel):
    start: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    end: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    activity: str
    energy: int | None = Field(default=None, ge=1, le=5)
    focus: int | None = Field(default=None, ge=1, le=5)
    note: str | None = None
    tags: list[str] = Field(default_factory=list)
    confidence: str = Field(default="high")  # high, medium, low
    source_text: str | None = None
    time_source: str | None = None  # explicit, relative, window, unknown
    time_confidence: str | None = None  # high, medium, low
    time_window: str | None = None  # morning, lunch, afternoon, evening, night
    crosses_midnight: bool = False


class ParsedMeta(BaseModel):
    mood: str | None = None  # very_low, low, neutral, good, great
    sleep_quality: int | None = Field(default=None, ge=1, le=5)
    sleep_hours: float | None = Field(default=None, ge=0, le=14)
    stress_level: int | None = Field(default=None, ge=1, le=5)
    parse_issues: list[str] = Field(default_factory=list)


class ParseDiaryResponse(BaseModel):
    entries: list[ParsedEntry]
    meta: ParsedMeta
    ai_note: str = ""
