from __future__ import annotations

from datetime import date
from typing import Any

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

    start: str = Field(pattern=TIME_RE, description="HH:MM")
    end: str = Field(pattern=TIME_RE, description="HH:MM")
    activity: str = Field(min_length=1, max_length=120)
    energy: int | None = Field(default=None, ge=1, le=5)
    focus: int | None = Field(default=None, ge=1, le=5)
    tags: list[str] = Field(default_factory=list, max_length=12)
    note: str | None = Field(default=None, max_length=280)


class UpsertLogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    entries: list[ActivityLogEntry] = Field(default_factory=list)
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_entries(self):
        # Ensure each block has end > start and no overlaps.
        items = []
        for i, e in enumerate(self.entries):
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
    created_at: str | None = None
    updated_at: str | None = None
