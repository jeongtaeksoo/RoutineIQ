
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import AuthDep
from app.services.error_log import log_system_error
from app.services.openai_service import call_openai_structured
from app.services.usage import count_daily_analyze_calls, estimate_cost_usd, insert_usage_event

router = APIRouter()

class SuggestRequest(BaseModel):
    current_time: str  # "HH:MM"
    context: str | None = None  # e.g. "I feel tired", "Just finished meeting"

class SuggestResponse(BaseModel):
    activity: str
    reason: str

SUGGEST_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["activity", "reason"],
    "properties": {
        "activity": {"type": "string"},
        "reason": {"type": "string"},
    },
}

# Lightweight AI calls share a generous daily cap separate from analyze.
_DAILY_LIGHT_AI_LIMIT = 30


@router.post("/suggest")
async def suggest_activity(body: SuggestRequest, auth: AuthDep) -> dict:
    call_day = datetime.now(timezone.utc).date()

    # Daily cap check (uses the same usage_events table, event_type="suggest")
    used = await count_daily_analyze_calls(
        user_id=auth.user_id,
        event_date=call_day,
        access_token=auth.access_token,
    )
    if used >= _DAILY_LIGHT_AI_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily AI suggestion limit reached. Try again tomorrow.",
        )

    # Build prompt
    system_prompt = (
        "You are a helpful routine assistant. "
        "Suggest a short, actionable activity based on the time of day and user context. "
        "Your suggestion should be healthy, productive, or restorative. "
        "Output valid JSON only."
    )
    
    user_prompt = f"Current time: {body.current_time}. "
    if body.context:
        user_prompt += f"Context: {body.context}."
    else:
        user_prompt += "No specific context provided."

    try:
        obj, usage = await call_openai_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_schema=SUGGEST_JSON_SCHEMA,
            schema_name="activity_suggestion",
        )

        # Record usage for cost tracking
        cost = estimate_cost_usd(
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
        )
        await insert_usage_event(
            user_id=auth.user_id,
            event_date=call_day,
            model=settings.openai_model,
            tokens_prompt=usage.get("input_tokens"),
            tokens_completion=usage.get("output_tokens"),
            tokens_total=usage.get("total_tokens"),
            cost_usd=cost,
            meta={"endpoint": "suggest"},
            access_token=auth.access_token,
        )

        return obj
    except HTTPException:
        raise
    except Exception as e:
        await log_system_error(
            route="/api/suggest",
            message="OpenAI suggestion request failed",
            user_id=auth.user_id,
            err=e,
        )
        raise HTTPException(status_code=502, detail="AI suggestion failed. Please try again.")
