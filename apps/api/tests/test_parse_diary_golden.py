from __future__ import annotations

import copy
import re
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.routes.parse as parse_route
from app.core.security import AuthContext, verify_token
from app.main import app
from tests.fixtures.parse_golden_cases import PARSE_GOLDEN_CASES

_HHMM_RE = re.compile(r"^\d{2}:\d{2}$")


def _set_auth_locale(locale: str) -> None:
    async def _override_verify_token() -> AuthContext:
        return AuthContext(
            user_id="00000000-0000-4000-8000-000000000001",
            email="pytest-user@rutineiq.test",
            is_anonymous=False,
            locale=locale,
            access_token="token-parse-golden",
        )

    app.dependency_overrides[verify_token] = _override_verify_token


@pytest.mark.parametrize(
    "case",
    PARSE_GOLDEN_CASES,
    ids=[case["id"] for case in PARSE_GOLDEN_CASES],
)
def test_parse_diary_golden_invariants(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    case: dict,
) -> None:
    diary_text = case["diary_text"]
    _set_auth_locale(case["locale"])

    mock_openai = AsyncMock(
        return_value=(
            copy.deepcopy(case["mock_response"]),
            {"input_tokens": 120, "output_tokens": 220, "total_tokens": 340},
        )
    )
    monkeypatch.setattr(parse_route, "call_openai_structured", mock_openai)

    response = client.post(
        "/api/parse-diary",
        json={"date": "2026-02-16", "diary_text": diary_text},
    )

    assert response.status_code == 200
    body = response.json()
    entries = body["entries"]
    assert isinstance(entries, list)
    assert len(entries) >= case["expected_min_entries"]

    explicit_candidates = parse_route._extract_explicit_time_candidates(diary_text)
    if not explicit_candidates:
        assert all(entry.get("start") is None and entry.get("end") is None for entry in entries)

    if case["expect_all_times_null"]:
        assert all(entry.get("start") is None and entry.get("end") is None for entry in entries)
    else:
        assert any(
            isinstance(entry.get("start"), str) and isinstance(entry.get("end"), str)
            for entry in entries
        )

    if case["expect_crosses_midnight"]:
        assert any(entry.get("crosses_midnight") is True for entry in entries)

    for entry in entries:
        assert "activity" in entry and str(entry["activity"]).strip()
        assert "confidence" in entry
        assert entry["confidence"] in {"high", "medium", "low"}
        source_text = entry.get("source_text")
        if source_text is not None:
            assert isinstance(source_text, str)
            assert source_text in diary_text

        start = entry.get("start")
        end = entry.get("end")
        assert start is None or _HHMM_RE.fullmatch(start)
        assert end is None or _HHMM_RE.fullmatch(end)

        if start is not None and end is not None:
            assert entry.get("time_source") in {"explicit", "relative", "window", "unknown", None}
            if entry.get("time_source") in {"window", "unknown"}:
                pytest.fail("window/unknown time_source must not keep explicit start/end")

    meta = body["meta"]
    assert isinstance(meta.get("parse_issues"), list)
    issues = "\n".join(meta.get("parse_issues", []))
    for token in case["expected_issue_contains"]:
        assert token in issues


@pytest.mark.parametrize(
    "diary_text",
    [
        "07:30~08:10 아침 루틴. 09:00 회의.",
        "오전 7시 반 기상, 오후 1시 20분 점심.",
        "아침에 메일 정리하고 오후에 문서 작업했다.",
    ],
)
def test_extract_time_candidates_is_deterministic(diary_text: str) -> None:
    first = parse_route._extract_explicit_time_candidates(diary_text)
    for _ in range(10):
        assert parse_route._extract_explicit_time_candidates(diary_text) == first


@pytest.mark.parametrize(
    "mock_entries, expected_issue",
    [
        (
            [
                {
                    "start": "10:00",
                    "end": "09:00",
                    "activity": "기획",
                    "energy": None,
                    "focus": None,
                    "note": None,
                    "tags": [],
                    "confidence": "high",
                    "source_text": "09:00~10:00 기획",
                    "time_source": "explicit",
                    "time_confidence": "high",
                    "time_window": None,
                    "crosses_midnight": False,
                }
            ],
            "end must be after start",
        ),
        (
            [
                {
                    "start": "09:00",
                    "end": "10:00",
                    "activity": "기획",
                    "energy": None,
                    "focus": None,
                    "note": None,
                    "tags": [],
                    "confidence": "high",
                    "source_text": "09:00~10:00 기획",
                    "time_source": "explicit",
                    "time_confidence": "high",
                    "time_window": None,
                    "crosses_midnight": False,
                },
                {
                    "start": "09:30",
                    "end": "10:30",
                    "activity": "개발",
                    "energy": None,
                    "focus": None,
                    "note": None,
                    "tags": [],
                    "confidence": "high",
                    "source_text": "09:30~10:30 개발",
                    "time_source": "explicit",
                    "time_confidence": "high",
                    "time_window": None,
                    "crosses_midnight": False,
                },
            ],
            "overlap",
        ),
    ],
)
def test_parse_diary_invalid_timeline_is_corrected(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    mock_entries: list[dict],
    expected_issue: str,
) -> None:
    diary_text = "09:00~10:00 기획. 09:30~10:30 개발."
    _set_auth_locale("ko")
    monkeypatch.setattr(
        parse_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                {
                    "entries": mock_entries,
                    "meta": {"mood": None, "sleep_quality": None, "sleep_hours": None, "stress_level": None},
                    "ai_note": "테스트",
                },
                {"input_tokens": 10, "output_tokens": 10, "total_tokens": 20},
            )
        ),
    )

    response = client.post(
        "/api/parse-diary",
        json={"date": "2026-02-16", "diary_text": diary_text},
    )

    assert response.status_code == 200
    body = response.json()
    assert expected_issue in "\n".join(body["meta"]["parse_issues"])
    assert any(entry.get("start") is None and entry.get("end") is None for entry in body["entries"])
