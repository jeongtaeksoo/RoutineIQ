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

_TIME_SOURCE_VALUES = {"explicit", "relative", "window", "unknown"}
_TIME_CONFIDENCE_VALUES = {"high", "medium", "low"}
_TIME_WINDOW_VALUES = {"dawn", "morning", "lunch", "afternoon", "evening", "night"}

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
                "required": ["activity", "tags", "confidence"],
                "properties": {
                    "start": {
                        "anyOf": [
                            {"type": "string", "pattern": r"^\d{2}:\d{2}$"},
                            {"type": "null"},
                        ]
                    },
                    "end": {
                        "anyOf": [
                            {"type": "string", "pattern": r"^\d{2}:\d{2}$"},
                            {"type": "null"},
                        ]
                    },
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
                    "source_text": {
                        "anyOf": [
                            {"type": "string"},
                            {"type": "null"},
                        ]
                    },
                    "time_source": {
                        "anyOf": [
                            {
                                "type": "string",
                                "enum": ["explicit", "relative", "window", "unknown"],
                            },
                            {"type": "null"},
                        ]
                    },
                    "time_confidence": {
                        "anyOf": [
                            {
                                "type": "string",
                                "enum": ["high", "medium", "low"],
                            },
                            {"type": "null"},
                        ]
                    },
                    "time_window": {
                        "anyOf": [
                            {
                                "type": "string",
                                "enum": [
                                    "dawn",
                                    "morning",
                                    "lunch",
                                    "afternoon",
                                    "evening",
                                    "night",
                                ],
                            },
                            {"type": "null"},
                        ]
                    },
                    "crosses_midnight": {"type": "boolean"},
                },
            },
        },
        "meta": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "mood",
                "sleep_quality",
                "sleep_hours",
                "stress_level",
                "parse_issues",
            ],
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
                "parse_issues": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
        },
        "ai_note": {"type": "string"},
    },
}

_TIME_TOKEN_RE = re.compile(
    r"^\s*(?:(?P<ap>오전|오후|am|pm)\s*)?"
    r"(?P<h>\d{1,2})"
    r"(?:"
    r":(?P<m>\d{2})"
    r"|시\s*(?P<m2>\d{1,2})\s*분?"
    r"|시\s*반"
    r"|시"
    r")?\s*$",
    flags=re.IGNORECASE,
)
_RANGE_TIME_RE = re.compile(
    r"(?<!\d)(?P<start>(?:오전|오후|am|pm)\s*\d{1,2}(?::\d{2}|시(?:\s*\d{1,2}\s*분?|\s*반)?)|\d{1,2}:\d{2}|\d{1,2}시(?:\s*\d{1,2}\s*분?|\s*반)?)(?:\s*(?:부터|~|\-|–|to)\s*)(?P<end>(?:오전|오후|am|pm)\s*\d{1,2}(?::\d{2}|시(?:\s*\d{1,2}\s*분?|\s*반)?)|\d{1,2}:\d{2}|\d{1,2}시(?:\s*\d{1,2}\s*분?|\s*반)?)(?:\s*까지)?(?!\d)",
    flags=re.IGNORECASE,
)
_RANGE_HOUR_ONLY_RE = re.compile(
    r"(?<!\d)(?P<start>\d{1,2})\s*(?:~|\-|–)\s*(?P<end>\d{1,2})\s*시(?!\d)",
    flags=re.IGNORECASE,
)
_POINT_TIME_RE = re.compile(
    r"(?<!\d)(?P<point>(?:오전|오후|am|pm)\s*\d{1,2}(?::\d{2}|시(?:\s*\d{1,2}\s*분?|\s*반)?)|\d{1,2}:\d{2}|\d{1,2}시(?:\s*\d{1,2}\s*분?|\s*반)?)(?!\d)",
    flags=re.IGNORECASE,
)
_SENTENCE_SPLIT_RE = re.compile(r"[\n.!?]+")
_SLEEP_HOURS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:시간|hours?)", flags=re.IGNORECASE)

_TIME_WINDOW_HINTS: dict[str, tuple[str, ...]] = {
    "dawn": ("새벽", "이른 아침", "dawn", "early morning"),
    "morning": ("아침", "오전", "morning"),
    "lunch": ("점심", "정오", "lunch", "noon"),
    "afternoon": ("오후", "afternoon"),
    "evening": ("저녁", "evening", "dinner"),
    "night": ("밤", "야간", "night", "late"),
}

_FALLBACK_ACTIVITY = {
    "ko": "기록된 활동",
    "en": "Logged activity",
    "ja": "記録された活動",
    "zh": "记录的活动",
    "es": "Actividad registrada",
}
_FALLBACK_AI_NOTE = {
    "ko": "AI 파싱이 불안정하여 보수적으로 구조화했습니다. 시간 근거가 없으면 null로 유지됩니다.",
    "en": "AI parsing was unstable, so fallback parsing was conservative. Times remain null when evidence is missing.",
    "ja": "AI解析が不安定だったため保守的に構造化しました。根拠がない時間はnullのままです。",
    "zh": "AI 解析暂时不稳定，已采用保守结构化。缺少依据的时间将保持为 null。",
    "es": "El análisis de IA fue inestable, por lo que se aplicó un parsing conservador. Si falta evidencia, la hora queda en null.",
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


def _locale_or_default(locale: str) -> str:
    return locale if locale in _FALLBACK_AI_NOTE else "ko"


def _hhmm(total_minutes: int) -> str:
    mins = max(0, min(total_minutes, 23 * 60 + 59))
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _hhmm_to_minutes(value: str | None) -> int | None:
    if not isinstance(value, str):
        return None
    m = re.fullmatch(r"(\d{2}):(\d{2})", value.strip())
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2))
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def _parse_time_token(token: str, *, allow_plain_hour: bool = False) -> int | None:
    m = _TIME_TOKEN_RE.match(token)
    if not m:
        return None

    raw = token.strip().lower()
    has_marker = (
        ":" in raw
        or "시" in token
        or bool(m.group("ap"))
    )
    if not has_marker and not allow_plain_hour:
        return None

    hour = int(m.group("h"))
    minute = 0
    if m.group("m") is not None:
        minute = int(m.group("m"))
    elif m.group("m2") is not None:
        minute = int(m.group("m2"))
    elif "반" in token:
        minute = 30

    ap = (m.group("ap") or "").lower()
    if ap in {"오후", "pm"}:
        if hour == 12:
            hour = 12
        elif 1 <= hour <= 11:
            hour += 12
        else:
            return None
    elif ap in {"오전", "am"}:
        if hour == 12:
            hour = 0
        elif 1 <= hour <= 11:
            hour = hour
        else:
            return None

    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def _span_overlaps(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return max(a_start, b_start) < min(a_end, b_end)


def _extract_explicit_time_candidates(diary_text: str) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    occupied_spans: list[tuple[int, int]] = []

    def _append_candidate(
        *,
        raw_text: str,
        start_idx: int,
        end_idx: int,
        start_min: int | None,
        end_min: int | None,
        kind: str,
    ) -> None:
        key = (start_idx, end_idx, start_min, end_min, kind)
        if any(
            (c["start_idx"], c["end_idx"], c.get("start_min"), c.get("end_min"), c["kind"]) == key
            for c in candidates
        ):
            return
        crosses_midnight = (
            start_min is not None
            and end_min is not None
            and end_min < start_min
        )
        candidates.append(
            {
                "raw_text": raw_text,
                "start_idx": start_idx,
                "end_idx": end_idx,
                "start_min": start_min,
                "end_min": end_min,
                "start_time": _hhmm(start_min) if start_min is not None else None,
                "end_time": _hhmm(end_min) if end_min is not None else None,
                "crosses_midnight": crosses_midnight,
                "kind": kind,
            }
        )

    for match in _RANGE_TIME_RE.finditer(diary_text):
        span = match.span()
        start_min = _parse_time_token(match.group("start"))
        end_min = _parse_time_token(match.group("end"))
        if start_min is None or end_min is None:
            continue
        occupied_spans.append(span)
        _append_candidate(
            raw_text=diary_text[span[0] : span[1]],
            start_idx=span[0],
            end_idx=span[1],
            start_min=start_min,
            end_min=end_min,
            kind="range",
        )

    for match in _RANGE_HOUR_ONLY_RE.finditer(diary_text):
        span = match.span()
        if any(_span_overlaps(span[0], span[1], o[0], o[1]) for o in occupied_spans):
            continue
        start_min = _parse_time_token(match.group("start"), allow_plain_hour=True)
        end_min = _parse_time_token(match.group("end"), allow_plain_hour=True)
        if start_min is None or end_min is None:
            continue
        occupied_spans.append(span)
        _append_candidate(
            raw_text=diary_text[span[0] : span[1]],
            start_idx=span[0],
            end_idx=span[1],
            start_min=start_min,
            end_min=end_min,
            kind="range",
        )

    for match in _POINT_TIME_RE.finditer(diary_text):
        span = match.span("point")
        if any(_span_overlaps(span[0], span[1], o[0], o[1]) for o in occupied_spans):
            continue
        start_min = _parse_time_token(match.group("point"))
        if start_min is None:
            continue
        _append_candidate(
            raw_text=diary_text[span[0] : span[1]],
            start_idx=span[0],
            end_idx=span[1],
            start_min=start_min,
            end_min=None,
            kind="point",
        )

    candidates.sort(key=lambda item: (item["start_idx"], item["end_idx"]))
    return candidates


def _clean_activity(text: str, locale: str) -> str:
    cleaned = re.sub(r"^\s*[-•\d.)\s]+", " ", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -,:;()[]")
    if "." in cleaned:
        cleaned = cleaned.split(".", 1)[0].strip()
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
        parse_issues=[],
    )


def _infer_time_window(text: str) -> str | None:
    lowered = text.lower()
    for window, hints in _TIME_WINDOW_HINTS.items():
        if any(hint in lowered for hint in hints):
            return window
    return None


def _normalize_source_text(
    *,
    source_text: str | None,
    activity: str,
    diary_text: str,
) -> str | None:
    if source_text and source_text in diary_text:
        return source_text
    if activity and activity in diary_text:
        return activity
    return None


def _entry_has_explicit_time_evidence(
    *,
    entry: ParsedEntry,
    time_candidates: list[dict[str, Any]],
) -> bool:
    if entry.start is None or entry.end is None:
        return False
    source = (entry.source_text or "").strip()
    if entry.time_source == "relative":
        return bool(source) and bool(time_candidates)
    if not source:
        return False
    start = entry.start
    end = entry.end
    for candidate in time_candidates:
        cand_start = candidate.get("start_time")
        cand_end = candidate.get("end_time")
        raw = str(candidate.get("raw_text") or "")
        if cand_start == start and cand_end == end:
            return True
        if raw and raw in source:
            return True
    return False


def _append_issue(issues: list[str], message: str) -> None:
    if message not in issues:
        issues.append(message)


def _downgrade_entry_time(
    *,
    entry: ParsedEntry,
    idx: int,
    issues: list[str],
    reason: str,
    source_for_window: str,
) -> None:
    entry.start = None
    entry.end = None
    entry.crosses_midnight = False
    entry.time_source = "unknown"
    entry.time_confidence = "low"
    if entry.time_window not in _TIME_WINDOW_VALUES:
        entry.time_window = _infer_time_window(source_for_window)
    _append_issue(issues, f"entry[{idx}] {reason}")


def _post_validate_response(
    *,
    response: ParseDiaryResponse,
    diary_text: str,
    time_candidates: list[dict[str, Any]],
    locale: str,
) -> ParseDiaryResponse:
    issues = list(response.meta.parse_issues)
    has_explicit_candidates = bool(time_candidates)
    safe_locale = _locale_or_default(locale)

    for idx, entry in enumerate(response.entries, start=1):
        entry.activity = _clean_activity(entry.activity, safe_locale)
        source = _normalize_source_text(
            source_text=entry.source_text,
            activity=entry.activity,
            diary_text=diary_text,
        )
        if entry.source_text and source is None:
            _append_issue(issues, f"entry[{idx}] source_text not found in diary")
        entry.source_text = source

        source_for_window = entry.source_text or entry.activity

        time_source = (entry.time_source or "").strip().lower()
        if time_source not in _TIME_SOURCE_VALUES:
            if entry.start is None and entry.end is None:
                time_source = "window" if _infer_time_window(source_for_window) else "unknown"
            else:
                time_source = "explicit"
        entry.time_source = time_source

        time_confidence = (entry.time_confidence or "").strip().lower()
        if time_confidence not in _TIME_CONFIDENCE_VALUES:
            if time_source == "explicit":
                time_confidence = "high"
            elif time_source == "relative":
                time_confidence = "medium"
            else:
                time_confidence = "low"
        entry.time_confidence = time_confidence

        if entry.time_window not in _TIME_WINDOW_VALUES:
            entry.time_window = None
        if entry.time_window is None and entry.start is None and entry.end is None:
            entry.time_window = _infer_time_window(source_for_window)

        if not has_explicit_candidates and (entry.start is not None or entry.end is not None):
            _downgrade_entry_time(
                entry=entry,
                idx=idx,
                issues=issues,
                reason="time downgraded to null (no explicit time evidence)",
                source_for_window=source_for_window,
            )
            continue

        if time_source in {"window", "unknown"} and (entry.start is not None or entry.end is not None):
            _downgrade_entry_time(
                entry=entry,
                idx=idx,
                issues=issues,
                reason=f"time removed because time_source='{time_source}'",
                source_for_window=source_for_window,
            )
            continue

        if (entry.start is None) ^ (entry.end is None):
            _downgrade_entry_time(
                entry=entry,
                idx=idx,
                issues=issues,
                reason="partial time detected (start/end mismatch)",
                source_for_window=source_for_window,
            )
            continue

        if entry.start is not None and entry.end is not None and not _entry_has_explicit_time_evidence(
            entry=entry,
            time_candidates=time_candidates,
        ):
            _downgrade_entry_time(
                entry=entry,
                idx=idx,
                issues=issues,
                reason="time downgraded to null (entry-level explicit evidence missing)",
                source_for_window=source_for_window,
            )
            continue

        if entry.start is not None and entry.end is not None:
            start_min = _hhmm_to_minutes(entry.start)
            end_min = _hhmm_to_minutes(entry.end)
            if start_min is None or end_min is None:
                _downgrade_entry_time(
                    entry=entry,
                    idx=idx,
                    issues=issues,
                    reason="invalid HH:MM format",
                    source_for_window=source_for_window,
                )
                continue
            if end_min <= start_min and not entry.crosses_midnight:
                _downgrade_entry_time(
                    entry=entry,
                    idx=idx,
                    issues=issues,
                    reason="end must be after start unless crosses_midnight=true",
                    source_for_window=source_for_window,
                )

    explicit_segments: list[tuple[int, int, int]] = []
    for idx, entry in enumerate(response.entries, start=1):
        if entry.start is None or entry.end is None or entry.crosses_midnight:
            continue
        start_min = _hhmm_to_minutes(entry.start)
        end_min = _hhmm_to_minutes(entry.end)
        if start_min is None or end_min is None:
            continue
        explicit_segments.append((start_min, end_min, idx))

    explicit_segments.sort(key=lambda item: (item[0], item[1], item[2]))
    for prev, cur in zip(explicit_segments, explicit_segments[1:], strict=False):
        prev_start, prev_end, prev_idx = prev
        cur_start, _cur_end, cur_idx = cur
        if cur_start < prev_end:
            target = response.entries[cur_idx - 1]
            _downgrade_entry_time(
                entry=target,
                idx=cur_idx,
                issues=issues,
                reason=f"overlap with entry[{prev_idx}]",
                source_for_window=target.source_text or target.activity,
            )

    response.meta.parse_issues = issues
    return response


def _build_fallback_entries(
    diary_text: str,
    locale: str,
    time_candidates: list[dict[str, Any]],
) -> list[ParsedEntry]:
    segments = [line.strip() for line in diary_text.splitlines() if line.strip()]
    if len(segments) <= 1:
        segments = [
            seg.strip() for seg in _SENTENCE_SPLIT_RE.split(diary_text) if seg and seg.strip()
        ]

    if not segments:
        segments = [_FALLBACK_ACTIVITY[_locale_or_default(locale)]]

    entries: list[ParsedEntry] = []
    cursor = 0

    for segment in segments:
        if len(entries) >= 12:
            break
        seg_start = diary_text.find(segment, cursor)
        if seg_start < 0:
            seg_start = cursor
        seg_end = seg_start + len(segment)
        cursor = seg_end

        related = [
            c for c in time_candidates if seg_start <= int(c["start_idx"]) < seg_end
        ]
        energy, focus = _infer_energy_focus(segment)

        if related:
            for cand in related:
                raw = str(cand["raw_text"])
                activity = _clean_activity(segment.replace(raw, " "), locale)
                entries.append(
                    ParsedEntry(
                        start=cand.get("start_time"),
                        end=cand.get("end_time"),
                        activity=activity,
                        energy=energy,
                        focus=focus,
                        note=None,
                        tags=[],
                        confidence="medium" if cand.get("kind") == "point" else "high",
                        source_text=raw if raw in diary_text else segment,
                        time_source="explicit",
                        time_confidence="high",
                        time_window=None,
                        crosses_midnight=bool(cand.get("crosses_midnight")),
                    )
                )
                if len(entries) >= 12:
                    break
        else:
            source_for_window = segment
            entries.append(
                ParsedEntry(
                    start=None,
                    end=None,
                    activity=_clean_activity(segment, locale),
                    energy=energy,
                    focus=focus,
                    note=None,
                    tags=[],
                    confidence="low",
                    source_text=segment if segment in diary_text else None,
                    time_source="window" if _infer_time_window(source_for_window) else "unknown",
                    time_confidence="low",
                    time_window=_infer_time_window(source_for_window),
                    crosses_midnight=False,
                )
            )

    if entries:
        return entries

    return [
        ParsedEntry(
            start=None,
            end=None,
            activity=_FALLBACK_ACTIVITY[_locale_or_default(locale)],
            energy=None,
            focus=None,
            note=None,
            tags=[],
            confidence="low",
            source_text=None,
            time_source="unknown",
            time_confidence="low",
            time_window=None,
            crosses_midnight=False,
        )
    ]


def _fallback_response(
    *,
    diary_text: str,
    locale: str,
    time_candidates: list[dict[str, Any]],
) -> ParseDiaryResponse:
    safe_locale = _locale_or_default(locale)
    response = ParseDiaryResponse(
        entries=_build_fallback_entries(diary_text, safe_locale, time_candidates),
        meta=_infer_meta(diary_text),
        ai_note=_FALLBACK_AI_NOTE[safe_locale],
    )
    return _post_validate_response(
        response=response,
        diary_text=diary_text,
        time_candidates=time_candidates,
        locale=locale,
    )


@router.post("/parse-diary", response_model=ParseDiaryResponse)
async def parse_diary(body: ParseDiaryRequest, auth: AuthDep) -> ParseDiaryResponse:
    await consume(key=f"parse-diary:{auth.user_id}", limit=5, window_seconds=60)

    lang_name = _LANG_NAME.get(auth.locale, "Korean")
    system_prompt = (
        "You are a structured extraction engine for a daily diary.\n"
        "Your job: convert free-form diary text into a chronological list of activity blocks.\n"
        "\n"
        "CRITICAL RULES (must follow)\n"
        "1) Do NOT invent times. If a time is not explicitly stated, set start/end to null.\n"
        "2) If the diary only implies a general time-of-day (dawn/morning/lunch/afternoon/evening/night), do NOT convert it into an exact time. Use time_window instead.\n"
        "3) Every entry MUST include source_text: an exact quote (substring) from the diary that supports the entry.\n"
        "4) Separate multiple activities even if they are in one sentence.\n"
        "5) Output JSON ONLY that matches the provided schema. No extra keys.\n"
        "\n"
        "TIME NORMALIZATION\n"
        "- Normalize explicit times to 24-hour HH:MM in Asia/Seoul timezone.\n"
        "- Support Korean time expressions: 오전/오후, 시, 분, 반, ~, 부터/까지.\n"
        "- If a time range crosses midnight (end earlier than start), set crosses_midnight=true for that entry.\n"
        "\n"
        "CONFIDENCE\n"
        "- time_source: explicit | relative | window | unknown\n"
        "- time_confidence: high | medium | low\n"
        "\n"
        "QUALITY CHECK\n"
        "- If an entry has explicit times, ensure start <= end unless crosses_midnight=true.\n"
        "- Avoid overlapping explicit-time entries; if unavoidable, downgrade one entry to null times and add issue note.\n"
        "\n"
        f"LOCALE\n- Use {lang_name} (locale='{auth.locale}') for natural-language fields.\n"
        "- Never fabricate facts not in the diary.\n"
    )

    safe_diary_text = sanitize_for_llm(body.diary_text)
    time_candidates = _extract_explicit_time_candidates(body.diary_text)
    candidate_payload = [
        {
            "raw_text": c["raw_text"],
            "start_idx": c["start_idx"],
            "end_idx": c["end_idx"],
            "start_time": c["start_time"],
            "end_time": c["end_time"],
            "crosses_midnight": c["crosses_midnight"],
            "kind": c["kind"],
        }
        for c in time_candidates
    ]

    user_prompt = (
        f"date: {body.date.isoformat()}\n"
        f"locale: {auth.locale}\n"
        f"diary_text:\n\"\"\"\n{safe_diary_text}\n\"\"\"\n\n"
        "extracted_time_candidates:\n"
        + json.dumps(candidate_payload, ensure_ascii=False)
    )

    request_id = uuid4().hex[:12]
    diary_digest = hashlib.sha256(body.diary_text.encode("utf-8")).hexdigest()[:16]
    request_meta = {
        "request_id": request_id,
        "locale": auth.locale,
        "date": body.date.isoformat(),
        "diary_chars": len(body.diary_text),
        "diary_digest": diary_digest,
        "time_candidate_count": len(candidate_payload),
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
        return _fallback_response(
            diary_text=body.diary_text,
            locale=auth.locale,
            time_candidates=time_candidates,
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
        return _fallback_response(
            diary_text=body.diary_text,
            locale=auth.locale,
            time_candidates=time_candidates,
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
            return _fallback_response(
                diary_text=body.diary_text,
                locale=auth.locale,
                time_candidates=time_candidates,
            )
        await log_system_error(
            route="/api/parse-diary",
            message="AI diary parsing failed",
            user_id=auth.user_id,
            err=exc,
            meta={**request_meta, "code": "PARSE_UPSTREAM_FAILURE"},
        )
        return _fallback_response(
            diary_text=body.diary_text,
            locale=auth.locale,
            time_candidates=time_candidates,
        )

    try:
        parsed = ParseDiaryResponse.model_validate(obj)
        return _post_validate_response(
            response=parsed,
            diary_text=body.diary_text,
            time_candidates=time_candidates,
            locale=auth.locale,
        )
    except ValidationError as exc:
        await log_system_error(
            route="/api/parse-diary",
            message="AI diary parsing schema validation failed",
            user_id=auth.user_id,
            err=exc,
            meta={**request_meta, "code": "PARSE_SCHEMA_INVALID"},
        )
        return _fallback_response(
            diary_text=body.diary_text,
            locale=auth.locale,
            time_candidates=time_candidates,
        )
