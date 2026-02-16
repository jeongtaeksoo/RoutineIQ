from __future__ import annotations

import hashlib
import json
import re
from json import JSONDecodeError
from typing import Any
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.core.rate_limit import consume
from app.core.security import AuthDep
from app.schemas.parse import (
    ParseDiaryRequest,
    ParseDiaryResponse,
    ParsedEntry,
    ParsedMeta,
)
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

_TIME_RANGE_RE = re.compile(
    r"(?P<sh>\d{1,2})(?::(?P<sm>\d{2}))?\s*(?P<sap>am|pm|오전|오후)?\s*(?:시)?\s*(?:부터|~|-|–|to)\s*"
    r"(?P<eh>\d{1,2})(?::(?P<em>\d{2}))?\s*(?P<eap>am|pm|오전|오후)?\s*(?:시)?",
    flags=re.IGNORECASE,
)
_TIME_POINT_RE = re.compile(
    r"(?P<h>\d{1,2})(?::(?P<m>\d{2}))?\s*(?P<ap>am|pm|오전|오후)?\s*(?:시)?",
    flags=re.IGNORECASE,
)
_SENTENCE_SPLIT_RE = re.compile(r"[\n.!?]+")
_SLEEP_HOURS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:시간|hours?)", flags=re.IGNORECASE)

_FALLBACK_ACTIVITY = {
    "ko": "기록된 활동",
    "en": "Logged activity",
    "ja": "記録された活動",
    "zh": "记录的活动",
    "es": "Actividad registrada",
}
_FALLBACK_AI_NOTE = {
    "ko": "AI 파싱이 불안정하여 참고용 임시 블록을 만들었습니다. 시간/활동을 확인 후 저장해 주세요.",
    "en": "AI parsing was unstable, so preview fallback blocks were generated. Please review time and activity before saving.",
    "ja": "AI解析が不安定だったため、参考用の暫定ブロックを生成しました。時間と活動を確認して保存してください。",
    "zh": "AI 解析暂时不稳定，已生成参考用临时区块。请先确认时间与活动后再保存。",
    "es": "El análisis de IA fue inestable, así que se generaron bloques temporales de vista previa. Revisa hora y actividad antes de guardar.",
}

_POSITIVE_HINTS = (
    "집중",
    "잘됨",
    "좋았",
    "productive",
    "focused",
    "great",
    "energized",
)
_NEGATIVE_HINTS = (
    "피곤",
    "힘들",
    "산만",
    "스트레스",
    "tired",
    "exhausted",
    "stressed",
    "distracted",
)


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


def _locale_or_default(locale: str) -> str:
    return locale if locale in _FALLBACK_AI_NOTE else "ko"


def _to_minutes(
    hour_s: str | None, minute_s: str | None, ap_s: str | None
) -> int | None:
    if hour_s is None:
        return None
    try:
        hour = int(hour_s)
        minute = int(minute_s or "0")
    except ValueError:
        return None

    ap = (ap_s or "").strip().lower()
    if ap in {"pm", "오후"} and 1 <= hour <= 11:
        hour += 12
    elif ap in {"am", "오전"} and hour == 12:
        hour = 0

    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def _hhmm(total_minutes: int) -> str:
    mins = max(0, min(total_minutes, 23 * 60 + 59))
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _clean_activity(segment: str, locale: str) -> str:
    cleaned = _TIME_RANGE_RE.sub(" ", segment)
    cleaned = _TIME_POINT_RE.sub(" ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -,:;")
    return cleaned[:120] if cleaned else _FALLBACK_ACTIVITY[_locale_or_default(locale)]


def _infer_energy_focus(text: str) -> tuple[int | None, int | None]:
    lowered = text.lower()
    if any(hint in lowered for hint in _POSITIVE_HINTS):
        return 4, 4
    if any(hint in lowered for hint in _NEGATIVE_HINTS):
        return 2, 2
    return None, None


def _infer_meta(text: str) -> ParsedMeta:
    lowered = text.lower()

    mood: str | None = None
    if any(token in lowered for token in ("매우 좋", "great", "excellent", "최고")):
        mood = "great"
    elif any(token in lowered for token in ("좋", "good", "괜찮")):
        mood = "good"
    elif any(token in lowered for token in ("피곤", "힘들", "tired", "low energy")):
        mood = "low"
    elif any(token in lowered for token in ("최악", "very bad", "burnout", "번아웃")):
        mood = "very_low"
    elif any(token in lowered for token in ("보통", "neutral", "무난")):
        mood = "neutral"

    sleep_hours: float | None = None
    sleep_match = _SLEEP_HOURS_RE.search(text)
    if sleep_match:
        try:
            parsed = float(sleep_match.group(1))
            if 0 <= parsed <= 14:
                sleep_hours = parsed
        except ValueError:
            sleep_hours = None

    sleep_quality: int | None = None
    if any(token in lowered for token in ("숙면", "well slept", "slept well")):
        sleep_quality = 4
    elif any(
        token in lowered for token in ("잠 부족", "insomnia", "poor sleep", "못 잤")
    ):
        sleep_quality = 2

    stress_level: int | None = None
    if any(token in lowered for token in ("스트레스", "stress", "anxious", "압박")):
        stress_level = 4
    elif any(token in lowered for token in ("편안", "calm", "relaxed")):
        stress_level = 2

    return ParsedMeta(
        mood=mood,
        sleep_quality=sleep_quality,
        sleep_hours=sleep_hours,
        stress_level=stress_level,
    )


def _build_fallback_entries(diary_text: str, locale: str) -> list[ParsedEntry]:
    segments = [
        seg.strip()
        for seg in _SENTENCE_SPLIT_RE.split(diary_text)
        if seg and seg.strip()
    ]
    if not segments:
        segments = [diary_text.strip()] if diary_text.strip() else []

    entries: list[ParsedEntry] = []
    cursor = 9 * 60

    for segment in segments[:8]:
        start_min: int | None = None
        end_min: int | None = None
        confidence = "low"

        range_match = _TIME_RANGE_RE.search(segment)
        if range_match:
            start_min = _to_minutes(
                range_match.group("sh"),
                range_match.group("sm"),
                range_match.group("sap"),
            )
            end_min = _to_minutes(
                range_match.group("eh"),
                range_match.group("em"),
                range_match.group("eap"),
            )
            confidence = "medium"
        else:
            point_matches = list(_TIME_POINT_RE.finditer(segment))
            if point_matches:
                first = point_matches[0]
                start_min = _to_minutes(
                    first.group("h"),
                    first.group("m"),
                    first.group("ap"),
                )
                if len(point_matches) >= 2:
                    second = point_matches[1]
                    end_min = _to_minutes(
                        second.group("h"),
                        second.group("m"),
                        second.group("ap"),
                    )
                    confidence = "medium"

        if start_min is None:
            start_min = cursor
        if entries:
            prev_end = int(entries[-1].end[:2]) * 60 + int(entries[-1].end[3:])
            if start_min <= prev_end:
                start_min = min(prev_end + 5, 23 * 60)
        if end_min is None or end_min <= start_min:
            end_min = min(start_min + 90, 23 * 60 + 59)

        activity = _clean_activity(segment, locale)
        energy, focus = _infer_energy_focus(segment)
        entry = ParsedEntry(
            start=_hhmm(start_min),
            end=_hhmm(end_min),
            activity=activity,
            energy=energy,
            focus=focus,
            note=None,
            tags=[],
            confidence=confidence,
        )
        entries.append(entry)
        cursor = min(end_min + 15, 23 * 60)

    if entries:
        return entries

    return [
        ParsedEntry(
            start="09:00",
            end="10:00",
            activity=_FALLBACK_ACTIVITY[_locale_or_default(locale)],
            energy=None,
            focus=None,
            note=None,
            tags=[],
            confidence="low",
        )
    ]


def _fallback_response(diary_text: str, locale: str) -> ParseDiaryResponse:
    safe_locale = _locale_or_default(locale)
    return ParseDiaryResponse(
        entries=_build_fallback_entries(diary_text, safe_locale),
        meta=_infer_meta(diary_text),
        ai_note=_FALLBACK_AI_NOTE[safe_locale],
    )


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
        return _fallback_response(body.diary_text, auth.locale)
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
        return _fallback_response(body.diary_text, auth.locale)
    except Exception as exc:
        if isinstance(exc, (ValidationError, JSONDecodeError, ValueError)):
            await log_system_error(
                route="/api/parse-diary",
                message="AI diary parsing schema validation failed",
                user_id=auth.user_id,
                err=exc,
                meta={**request_meta, "code": "PARSE_SCHEMA_INVALID"},
            )
            return _fallback_response(body.diary_text, auth.locale)
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
        return _fallback_response(body.diary_text, auth.locale)
