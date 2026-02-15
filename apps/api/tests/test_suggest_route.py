from __future__ import annotations

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import app.routes.suggest as suggest_route


def _payload(*, context: str | None = "Need a quick reset") -> dict:
    return {
        "current_time": "14:30",
        "context": context,
    }


def test_suggest_happy_path_returns_activity(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        suggest_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        suggest_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                {
                    "activity": "5-minute walk",
                    "reason": "A short walk can restore focus quickly.",
                },
                {"input_tokens": 15, "output_tokens": 22, "total_tokens": 37},
            )
        ),
    )
    usage_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(suggest_route, "insert_usage_event", usage_mock)

    response = authenticated_client.post("/api/suggest", json=_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["activity"]
    assert body["reason"]
    assert usage_mock.await_count == 1


def test_suggest_requires_auth(client: TestClient) -> None:
    response = client.post("/api/suggest", json=_payload())
    assert response.status_code == 401


def test_suggest_returns_429_when_daily_limit_exceeded(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        suggest_route,
        "count_daily_analyze_calls",
        AsyncMock(return_value=30),
    )

    response = authenticated_client.post("/api/suggest", json=_payload())

    assert response.status_code == 429
    assert "Daily AI suggestion limit reached" in response.json()["detail"]


def test_suggest_openai_failure_returns_502(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        suggest_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        suggest_route,
        "call_openai_structured",
        AsyncMock(side_effect=RuntimeError("upstream unavailable")),
    )
    monkeypatch.setattr(suggest_route, "log_system_error", AsyncMock(return_value=None))

    response = authenticated_client.post("/api/suggest", json=_payload())

    assert response.status_code == 502
    assert "AI suggestion failed" in response.json()["detail"]


def test_suggest_rejects_missing_required_fields(
    authenticated_client: TestClient,
) -> None:
    response = authenticated_client.post("/api/suggest", json={"context": "only context"})
    assert response.status_code == 422


def test_suggest_accepts_null_context(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        suggest_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        suggest_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                {"activity": "Hydration break", "reason": "You may be dehydrated."},
                {"input_tokens": 11, "output_tokens": 13, "total_tokens": 24},
            )
        ),
    )
    monkeypatch.setattr(suggest_route, "insert_usage_event", AsyncMock(return_value=None))

    response = authenticated_client.post("/api/suggest", json=_payload(context=None))

    assert response.status_code == 200
    assert response.json()["activity"] == "Hydration break"


def test_suggest_rejects_non_string_current_time(
    authenticated_client: TestClient,
) -> None:
    response = authenticated_client.post(
        "/api/suggest",
        json={"current_time": 1430, "context": "after meeting"},
    )
    assert response.status_code == 422


def test_suggest_rejects_invalid_time_format(
    authenticated_client: TestClient,
) -> None:
    response = authenticated_client.post(
        "/api/suggest",
        json={"current_time": "25:61", "context": "after meeting"},
    )
    assert response.status_code == 422
