from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.rate_limit import consume
from app.core.security import AuthDep
from app.schemas.parse import ParseDiaryRequest, ParseDiaryResponse
from app.services.error_log import log_system_error
from app.services.openai_service import call_openai_structured
from app.services.privacy import sanitize_for_llm

router = APIRouter()

_LANG_NAME = {
    "ko": "Korean",
    "en": "English",
    "ja": "Japanese",
    "zh": "Chinese",
    "es": "Spanish",
}


PARSE_DIARY_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["entries", "meta", "ai_note"],
    "properties": {
        "entries": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["start", "end", "activity", "tags", "confidence"],
                "properties": {
                    "start": {"type": "string", "pattern": "^\\d{2}:\\d{2}$"},
                    "end": {"type": "string", "pattern": "^\\d{2}:\\d{2}$"},
                    "activity": {"type": "string"},
                    "energy": {
                        "anyOf": [
                            {"type": "integer", "minimum": 1, "maximum": 5},
                            {"type": "null"},
                        ]
                    },
                    "focus": {
                        "anyOf": [
                            {"type": "integer", "minimum": 1, "maximum": 5},
                            {"type": "null"},
                        ]
                    },
                    "note": {
                        "anyOf": [
                            {"type": "string"},
                            {"type": "null"},
                        ]
                    },
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "confidence": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                },
            },
        },
        "meta": {
            "type": "object",
            "additionalProperties": False,
            "required": ["mood", "sleep_quality", "sleep_hours", "stress_level"],
            "properties": {
                "mood": {
                    "anyOf": [
                        {
                            "type": "string",
                            "enum": ["very_low", "low", "neutral", "good", "great"],
                        },
                        {"type": "null"},
                    ]
                },
                "sleep_quality": {
                    "anyOf": [
                        {"type": "integer", "minimum": 1, "maximum": 5},
                        {"type": "null"},
                    ]
                },
                "sleep_hours": {
                    "anyOf": [
                        {"type": "number", "minimum": 0, "maximum": 14},
                        {"type": "null"},
                    ]
                },
                "stress_level": {
                    "anyOf": [
                        {"type": "integer", "minimum": 1, "maximum": 5},
                        {"type": "null"},
                    ]
                },
            },
        },
        "ai_note": {"type": "string"},
    },
}


@router.post("/parse-diary", response_model=ParseDiaryResponse)
async def parse_diary(body: ParseDiaryRequest, auth: AuthDep) -> ParseDiaryResponse:
    await consume(key=f"parse-diary:{auth.user_id}", limit=5, window_seconds=60)

    lang_name = _LANG_NAME.get(auth.locale, "Korean")
    system_prompt = (
        "You are a diary parser that converts a user's free-form daily reflection "
        "into structured time-based activity blocks.\n"
        "Rules:\n"
        "1) If no time is explicitly stated, estimate conservatively from context.\n"
        "2) Infer energy/focus from descriptions (1-5 scale), use null if uncertain.\n"
        "3) Extract mood, sleep, and stress signals into meta.\n"
        "4) Mark uncertain items with confidence='low'.\n"
        "5) Never fabricate facts not present in the diary.\n"
        "6) Output JSON only.\n"
        f"7) All natural-language text fields must be written in {lang_name} "
        f"(locale='{auth.locale}').\n"
    )

    safe_diary_text = sanitize_for_llm(body.diary_text)
    user_prompt = (
        f"date: {body.date.isoformat()}\n"
        f"locale: {auth.locale}\n"
        f"diary_text: {json.dumps(safe_diary_text, ensure_ascii=False)}"
    )

    try:
        obj, _usage = await call_openai_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_schema=PARSE_DIARY_JSON_SCHEMA,
            schema_name="parse_diary_response",
        )
        return ParseDiaryResponse.model_validate(obj)
    except HTTPException:
        raise
    except Exception as exc:
        await log_system_error(
            route="/api/parse-diary",
            message="AI diary parsing failed",
            user_id=auth.user_id,
            err=exc,
        )
        raise HTTPException(
            status_code=502, detail="AI diary parsing failed. Please try again."
        )
