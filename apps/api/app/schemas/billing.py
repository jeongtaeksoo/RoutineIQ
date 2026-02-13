from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class CreateCheckoutSessionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str
