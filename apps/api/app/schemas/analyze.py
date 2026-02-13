from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    force: bool = Field(
        default=False, description="When true, re-run AI even if report exists."
    )
