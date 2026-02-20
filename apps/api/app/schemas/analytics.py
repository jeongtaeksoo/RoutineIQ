from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AnalyticsEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_name: str = Field(min_length=3, max_length=64)
    source: str | None = Field(default=None, max_length=32)
    path: str | None = Field(default=None, max_length=256)
    request_id: str | None = Field(default=None, max_length=128)
    correlation_id: str | None = Field(default=None, max_length=128)
    value: float | None = None
    meta: dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_name")
    @classmethod
    def validate_event_name(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("event_name is required")
        allowed = set("abcdefghijklmnopqrstuvwxyz0123456789_:-.")
        if any(ch not in allowed for ch in normalized):
            raise ValueError("event_name contains unsupported characters")
        return normalized
