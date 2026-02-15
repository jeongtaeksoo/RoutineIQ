from __future__ import annotations

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import app.routes.reflect as reflect_route


def _payload(entries: list[dict] | None = None) -> dict:
    return {
        "date": "2026-02-15",
        "entries": entries
        if entries is not None
        else [
            {
                "start": "09:00",
                "end": "10:00",
                "activity": "Deep work",
                "energy": 4,
                "focus": 5,
                "tags": ["focus"],
            }
        ],
        "note": "Productive morning",
    }


def test_reflect_happy_path_returns_question(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        reflect_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        reflect_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                {"question": "What made your 09:00 block so focused?"},
                {"input_tokens": 20, "output_tokens": 30, "total_tokens": 50},
            )
        ),
    )
    usage_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(reflect_route, "insert_usage_event", usage_mock)

    response = authenticated_client.post("/api/reflect", json=_payload())

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["question"], str)
    assert body["question"]
    assert usage_mock.await_count == 1


def test_reflect_requires_auth(client: TestClient) -> None:
    response = client.post("/api/reflect", json=_payload())
    assert response.status_code == 401


def test_reflect_returns_429_when_daily_limit_exceeded(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        reflect_route,
        "count_daily_analyze_calls",
        AsyncMock(return_value=30),
    )

    response = authenticated_client.post("/api/reflect", json=_payload())

    assert response.status_code == 429
    assert "Daily AI reflection limit reached" in response.json()["detail"]


def test_reflect_openai_failure_returns_502(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        reflect_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        reflect_route,
        "call_openai_structured",
        AsyncMock(side_effect=RuntimeError("openai down")),
    )
    monkeypatch.setattr(reflect_route, "log_system_error", AsyncMock(return_value=None))

    response = authenticated_client.post("/api/reflect", json=_payload())

    assert response.status_code == 502
    assert "AI reflection failed" in response.json()["detail"]


def test_reflect_handles_empty_entries_gracefully(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        reflect_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        reflect_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                {"question": "Which one small action would improve tomorrow?"},
                {"input_tokens": 10, "output_tokens": 12, "total_tokens": 22},
            )
        ),
    )
    monkeypatch.setattr(reflect_route, "insert_usage_event", AsyncMock(return_value=None))

    response = authenticated_client.post("/api/reflect", json=_payload(entries=[]))

    assert response.status_code == 200
    assert "question" in response.json()


def test_reflect_rejects_missing_entries_field(
    authenticated_client: TestClient,
) -> None:
    response = authenticated_client.post(
        "/api/reflect",
        json={"date": "2026-02-15", "note": "Missing entries"},
    )
    assert response.status_code == 422


def test_reflect_rejects_invalid_entries_type(
    authenticated_client: TestClient,
) -> None:
    response = authenticated_client.post(
        "/api/reflect",
        json={
            "date": "2026-02-15",
            "entries": "not-a-list",
            "note": "Invalid payload",
        },
    )
    assert response.status_code == 422
