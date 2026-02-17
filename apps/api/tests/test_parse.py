from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
from fastapi.testclient import TestClient

import app.routes.parse as parse_route


def _parsed_response() -> dict:
    return {
        "entries": [
            {
                "start": "09:00",
                "end": "10:30",
                "activity": "Deep work",
                "energy": 4,
                "focus": 5,
                "note": "핵심 기능 개발",
                "tags": ["focus", "coding"],
                "confidence": "high",
            }
        ],
        "meta": {
            "mood": "good",
            "sleep_quality": 4,
            "sleep_hours": 7.5,
            "stress_level": 2,
        },
        "ai_note": "시간 표현이 없는 구간은 보수적으로 추정했습니다.",
    }


def test_parse_diary_success(
    authenticated_client: TestClient, monkeypatch
) -> None:
    mock_openai = AsyncMock(
        return_value=(
            _parsed_response(),
            {"input_tokens": 100, "output_tokens": 120, "total_tokens": 220},
        )
    )
    monkeypatch.setattr(parse_route, "call_openai_structured", mock_openai)

    response = authenticated_client.post(
        "/api/parse-diary",
        json={
            "date": "2026-02-15",
            "diary_text": "09시부터 집중해서 기능 개발을 했고, 오후에는 회의가 있었습니다.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["entries"]) == 1
    assert body["entries"][0]["activity"] == "Deep work"
    assert body["meta"]["mood"] == "good"
    assert mock_openai.await_count == 1


def test_parse_diary_rejects_short_text(authenticated_client: TestClient) -> None:
    response = authenticated_client.post(
        "/api/parse-diary",
        json={"date": "2026-02-15", "diary_text": "too short"},
    )
    assert response.status_code == 422


def test_parse_diary_request_schema_validation(authenticated_client: TestClient) -> None:
    response = authenticated_client.post(
        "/api/parse-diary",
        json={"date": "not-a-date", "diary_text": "충분히 긴 텍스트입니다. 구조화를 테스트합니다."},
    )
    assert response.status_code == 422


def test_parse_diary_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/api/parse-diary",
        json={
            "date": "2026-02-15",
            "diary_text": "아침에는 운동했고 오후에는 문서 작업을 했습니다.",
        },
    )
    assert response.status_code == 401


def test_parse_diary_timeout_returns_fallback_response(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        parse_route,
        "call_openai_structured",
        AsyncMock(side_effect=httpx.TimeoutException("upstream timeout")),
    )
    monkeypatch.setattr(parse_route, "log_system_error", AsyncMock(return_value=None))

    response = authenticated_client.post(
        "/api/parse-diary",
        json={
            "date": "2026-02-15",
            "diary_text": "09시부터 집중해서 기능 개발을 했고, 오후에는 회의가 있었습니다.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body.get("entries"), list)
    assert len(body["entries"]) >= 1
    assert body["entries"][0]["confidence"] in {"low", "medium", "high"}
    assert isinstance(body.get("ai_note"), str) and body["ai_note"].strip()


def test_parse_diary_invalid_schema_returns_fallback_response(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        parse_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                {"entries": "broken-shape", "meta": {}, "ai_note": "bad"},
                {"input_tokens": 20, "output_tokens": 20, "total_tokens": 40},
            )
        ),
    )
    monkeypatch.setattr(parse_route, "log_system_error", AsyncMock(return_value=None))

    response = authenticated_client.post(
        "/api/parse-diary",
        json={
            "date": "2026-02-15",
            "diary_text": "09시부터 집중해서 기능 개발을 했고, 오후에는 회의가 있었습니다.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body.get("entries"), list)
    assert len(body["entries"]) >= 1
    assert body["entries"][0]["confidence"] in {"low", "medium", "high"}
    assert isinstance(body.get("ai_note"), str) and body["ai_note"].strip()


def test_parse_diary_http_status_error_returns_fallback_response(
    authenticated_client: TestClient, monkeypatch
) -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(status_code=502, request=request)
    monkeypatch.setattr(
        parse_route,
        "call_openai_structured",
        AsyncMock(
            side_effect=httpx.HTTPStatusError(
                "Bad Gateway",
                request=request,
                response=response,
            )
        ),
    )
    monkeypatch.setattr(parse_route, "log_system_error", AsyncMock(return_value=None))

    res = authenticated_client.post(
        "/api/parse-diary",
        json={
            "date": "2026-02-15",
            "diary_text": "09:00 to 10:00 deep work, then meetings all afternoon.",
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert isinstance(body.get("entries"), list)
    assert len(body["entries"]) >= 1


def test_parse_diary_fallback_handles_timeline_text_without_year_misread(
    authenticated_client: TestClient, monkeypatch
) -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    monkeypatch.setattr(
        parse_route,
        "call_openai_structured",
        AsyncMock(side_effect=httpx.ConnectError("network issue", request=request)),
    )
    monkeypatch.setattr(parse_route, "log_system_error", AsyncMock(return_value=None))

    diary_text = (
        "2026년 2월 16일 (월)\n\n"
        "07:00 기상. 전날 늦게 자서 몸이 약간 무거웠다.\n"
        "07:30~08:10 아침 루틴(세면, 정리, 커피).\n"
        "09:00~11:30 RoutineIQ 웹 기능 수정 작업.\n"
        "12:00 점심 식사.\n"
        "13:30~14:00 영어 말하기 연습.\n"
        "15:00~16:00 논문 메일 초안 수정.\n"
        "18:00 가벼운 산책 20분.\n"
        "22:30 하루 정리."
    )

    res = authenticated_client.post(
        "/api/parse-diary",
        json={"date": "2026-02-16", "diary_text": diary_text},
    )

    assert res.status_code == 200
    body = res.json()
    entries = body["entries"]
    assert len(entries) >= 7
    assert entries[0]["start"] == "07:00"
    assert entries[0]["activity"].startswith("기상")
    assert entries[1]["start"] == "07:30"
    assert entries[1]["end"] == "08:10"
    assert all(entry["start"] != "20:00" for entry in entries)
