from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

_TIME_BUDGET_BUCKET = Literal[2, 10, 25]


class RecoveryLapseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lapse_start_ts: datetime | None = None
    lapse_type: str | None = Field(default=None, max_length=40)
    entry_surface: str | None = Field(default=None, max_length=40)


class RecoverySessionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    status: Literal["open", "completed"]
    lapse_start_ts: datetime
    created: bool
    correlation_id: str


class RecoveryActiveResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    has_open_session: bool
    session_id: str | None = None
    lapse_start_ts: datetime | None = None
    elapsed_min: int | None = None
    correlation_id: str


class RecoveryModeOpenedRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    entry_surface: str = Field(min_length=1, max_length=40)


class RecoveryCheckinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    energy_level: int = Field(ge=1, le=5)
    time_budget_bucket: _TIME_BUDGET_BUCKET
    context_tag: str = Field(min_length=1, max_length=40)


class RecoveryProtocolStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    protocol_type: str = Field(min_length=1, max_length=40)
    intensity_level: int = Field(ge=1, le=5)


class RecoveryActionCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    action_type: str = Field(min_length=1, max_length=40)
    duration_min: int = Field(ge=1, le=60)


class RecoveryCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str


class RecoveryCompleteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    status: Literal["completed"]
    rt_min: int
    correlation_id: str


class RecoverySummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    window_days: int
    started_count: int
    completed_count: int
    completion_rate: float
    rt_p50_min: int | None
    correlation_id: str


class RecoveryAutoLapseRunResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scanned_users: int
    created_count: int
    suppressed_count: int
    suppressed_by_reason: dict[str, int] = Field(default_factory=dict)
    correlation_id: str


class RecoveryNudgeRunResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scanned_sessions: int
    scheduled_count: int
    shown_count: int
    suppressed_count: int
    suppressed_by_reason: dict[str, int] = Field(default_factory=dict)
    correlation_id: str


class RecoveryNudgePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nudge_id: str
    session_id: str
    message: str
    lapse_start_ts: datetime
    created_at: datetime
    correlation_id: str


class RecoveryNudgeEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    has_nudge: bool
    nudge: RecoveryNudgePayload | None = None
    correlation_id: str


class RecoveryNudgeAckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nudge_id: str


class LapseDetectedEventMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detection_source: Literal["self", "auto"]
    lapse_id: str
    lapse_start_ts: datetime
    lapse_type: str | None = None


class RecoveryModeOpenedEventMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entry_surface: str
    lapse_id: str


class CheckinSubmittedEventMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    energy_level: int = Field(ge=1, le=5)
    time_budget_bucket: _TIME_BUDGET_BUCKET
    context_tag: str
    lapse_id: str


class RecoveryProtocolStartedEventMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    protocol_type: str
    intensity_level: int
    lapse_id: str


class MinimumActionCompletedEventMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_type: str
    duration_min: int
    lapse_id: str


class RecoveryCompletedEventMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rt_min: int = Field(ge=0)
    protocol_type: str | None = None
    intensity_level: int | None = None
    lapse_id: str


class NudgeScheduledEventMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lapse_id: str
    nudge_id: str
    channel: Literal["in_app"]


class NudgeShownEventMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lapse_id: str
    nudge_id: str
    channel: Literal["in_app"]


class NudgeSuppressedEventMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lapse_id: str
    reason: str
