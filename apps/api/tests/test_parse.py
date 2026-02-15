from __future__ import annotations

from unittest.mock import AsyncMock

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
