from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Request

from app.core.security import AuthDep
from app.schemas.analytics import AnalyticsEventRequest
from app.services.usage import insert_usage_event

router = APIRouter()


@router.post("/analytics/events")
async def track_analytics_event(
    body: AnalyticsEventRequest,
    request: Request,
    auth: AuthDep,
) -> dict[str, bool]:
    event_type = f"ux_{body.event_name}"[:64]
    correlation_id = getattr(request.state, "correlation_id", None)
    event_meta: dict[str, Any] = {
        **body.meta,
        "source": body.source,
        "path": body.path,
        "client_correlation_id": body.correlation_id,
        "server_correlation_id": correlation_id,
        "value": body.value,
    }
    # Remove empty keys to keep payload compact.
    compact_meta = {k: v for k, v in event_meta.items() if v is not None}

    await insert_usage_event(
        user_id=auth.user_id,
        event_date=date.today(),
        event_type=event_type,
        model="web_ui",
        tokens_prompt=None,
        tokens_completion=None,
        tokens_total=None,
        cost_usd=None,
        request_id=body.request_id,
        meta=compact_meta,
        access_token=auth.access_token,
    )
    return {"ok": True}
