from __future__ import annotations

import hashlib
import json
from json import JSONDecodeError
from typing import Any
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

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
                    "start": {"type": "string"},
                    "end": {"type": "string"},
                    "activity": {"type": "string"},
                    "energy": {
                        "anyOf": [
                            {"type": "integer"},
                            {"type": "null"},
                        ]
                    },
                    "focus": {
                        "anyOf": [
                            {"type": "integer"},
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
                        {"type": "integer"},
                        {"type": "null"},
                    ]
                },
                "sleep_hours": {
                    "anyOf": [
                        {"type": "number"},
                        {"type": "null"},
                    ]
                },
                "stress_level": {
                    "anyOf": [
                        {"type": "integer"},
                        {"type": "null"},
                    ]
                },
            },
        },
        "ai_note": {"type": "string"},
    },
}


def _error_payload(
    *,
    code: str,
    message: str,
    request_id: str,
    retryable: bool = False,
) -> dict[str, Any]:
    hint = f"Reference ID: {request_id}"
    if retryable:
        hint = f"{hint}. Please retry once in a few seconds."
    return {
        "code": code,
        "message": message,
        "hint": hint,
        "retryable": retryable,
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
    request_id = uuid4().hex[:12]
    diary_digest = hashlib.sha256(body.diary_text.encode("utf-8")).hexdigest()[:16]
    request_meta = {
        "request_id": request_id,
        "locale": auth.locale,
        "date": body.date.isoformat(),
        "diary_chars": len(body.diary_text),
        "diary_digest": diary_digest,
    }

    try:
        obj, _usage = await call_openai_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_schema=PARSE_DIARY_JSON_SCHEMA,
            schema_name="parse_diary_response",
        )
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        await log_system_error(
            route="/api/parse-diary",
            message="AI diary parsing timed out",
            user_id=auth.user_id,
            err=exc,
            meta={**request_meta, "code": "PARSE_UPSTREAM_TIMEOUT"},
        )
        raise HTTPException(
            status_code=502,
            detail=_error_payload(
                code="PARSE_UPSTREAM_TIMEOUT",
                message="AI diary parsing timed out. Please try again.",
                request_id=request_id,
                retryable=True,
            ),
        )
    except httpx.HTTPStatusError as exc:
        await log_system_error(
            route="/api/parse-diary",
            message="AI diary parsing upstream HTTP error",
            user_id=auth.user_id,
            err=exc,
            meta={
                **request_meta,
                "code": "PARSE_UPSTREAM_HTTP_ERROR",
                "status_code": exc.response.status_code,
            },
        )
        raise HTTPException(
            status_code=502,
            detail=_error_payload(
                code="PARSE_UPSTREAM_HTTP_ERROR",
                message="AI diary parsing service is temporarily unavailable. Please retry.",
                request_id=request_id,
                retryable=True,
            ),
        )
    except Exception as exc:
        if isinstance(exc, (ValidationError, JSONDecodeError, ValueError)):
            await log_system_error(
                route="/api/parse-diary",
                message="AI diary parsing schema validation failed",
                user_id=auth.user_id,
                err=exc,
                meta={**request_meta, "code": "PARSE_SCHEMA_INVALID"},
            )
            raise HTTPException(
                status_code=502,
                detail=_error_payload(
                    code="PARSE_SCHEMA_INVALID",
                    message="AI diary parsing returned an invalid response. Please retry.",
                    request_id=request_id,
                    retryable=True,
                ),
            )
        await log_system_error(
            route="/api/parse-diary",
            message="AI diary parsing failed",
            user_id=auth.user_id,
            err=exc,
            meta={**request_meta, "code": "PARSE_UPSTREAM_FAILURE"},
        )
        raise HTTPException(
            status_code=502,
            detail=_error_payload(
                code="PARSE_UPSTREAM_FAILURE",
                message="AI diary parsing failed. Please try again.",
                request_id=request_id,
                retryable=False,
            ),
        )

    try:
        return ParseDiaryResponse.model_validate(obj)
    except ValidationError as exc:
        await log_system_error(
            route="/api/parse-diary",
            message="AI diary parsing schema validation failed",
            user_id=auth.user_id,
            err=exc,
            meta={**request_meta, "code": "PARSE_SCHEMA_INVALID"},
        )
        raise HTTPException(
            status_code=502,
            detail=_error_payload(
                code="PARSE_SCHEMA_INVALID",
                message="AI diary parsing returned an invalid response. Please retry.",
                request_id=request_id,
                retryable=True,
            ),
        )
