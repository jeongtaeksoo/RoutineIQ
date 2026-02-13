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
from app.services.privacy import sanitize_for_llm
from app.services.usage import (
    count_daily_analyze_calls,
    estimate_cost_usd,
    insert_usage_event,
)

router = APIRouter()


class ReflectRequest(BaseModel):
    date: str
    entries: list[dict[str, Any]]
    note: str | None = None


class ReflectResponse(BaseModel):
    question: str


REFLECT_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["question"],
    "properties": {
        "question": {"type": "string"},
    },
}

# Lightweight AI calls share a generous daily cap separate from analyze.
_DAILY_LIGHT_AI_LIMIT = 30


@router.post("/reflect")
async def reflect_on_day(body: ReflectRequest, auth: AuthDep) -> dict:
    call_day = datetime.now(timezone.utc).date()

    # Daily cap check
    used = await count_daily_analyze_calls(
        user_id=auth.user_id,
        event_date=call_day,
        event_type="reflect",
        access_token=auth.access_token,
    )
    if used >= _DAILY_LIGHT_AI_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily AI reflection limit reached. Try again tomorrow.",
        )

    # Build prompt
    system_prompt = (
        "You are an empathetic coach. "
        "Review the user's day and ask ONE thoughtful, open-ended question to help them reflect. "
        "Focus on their energy, focus levels, or specific activities. "
        "Output valid JSON only."
    )

    sanitized_entries = sanitize_for_llm(body.entries)
    sanitized_note = sanitize_for_llm(body.note or "None")
    user_prompt = f"Date: {body.date}. Entries: {json.dumps(sanitized_entries, ensure_ascii=False)}. Note: {sanitized_note}."

    try:
        obj, usage = await call_openai_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_schema=REFLECT_JSON_SCHEMA,
            schema_name="reflection_question",
        )

        # Record usage for cost tracking
        cost = estimate_cost_usd(
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
        )
        await insert_usage_event(
            user_id=auth.user_id,
            event_date=call_day,
            event_type="reflect",
            model=settings.openai_model,
            tokens_prompt=usage.get("input_tokens"),
            tokens_completion=usage.get("output_tokens"),
            tokens_total=usage.get("total_tokens"),
            cost_usd=cost,
            meta={"endpoint": "reflect"},
            access_token=auth.access_token,
        )

        return obj
    except HTTPException:
        raise
    except Exception as e:
        await log_system_error(
            route="/api/reflect",
            message="OpenAI reflection request failed",
            user_id=auth.user_id,
            err=e,
        )
        raise HTTPException(
            status_code=502, detail="AI reflection failed. Please try again."
        )
