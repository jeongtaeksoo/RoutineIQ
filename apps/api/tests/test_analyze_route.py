from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

import app.routes.analyze as analyze_route


def _profile_row() -> dict:
    return {
        "age_group": "25_34",
        "gender": "prefer_not_to_say",
        "job_family": "engineering",
        "work_mode": "fixed",
    }


def _activity_log() -> dict:
    return {
        "date": "2026-02-15",
        "entries": [
            {
                "start": "09:00",
                "end": "10:00",
                "activity": "Deep work",
                "energy": 4,
                "focus": 5,
                "tags": ["focus"],
            }
        ],
        "note": "stable day",
    }


def test_analyze_success_returns_report(
    authenticated_client: TestClient, supabase_mock, openai_mock, monkeypatch
) -> None:
    monkeypatch.setattr(
        analyze_route,
        "get_subscription_info",
        AsyncMock(return_value=type("Sub", (), {"plan": "free"})()),
    )
    monkeypatch.setattr(
        analyze_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        analyze_route, "insert_usage_event", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        analyze_route, "cleanup_expired_reports", AsyncMock(return_value=None)
    )

    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],  # previous_report
        [],  # existing report for target date
        [_activity_log()],  # activity log
        [_activity_log()],  # recent activity logs
        [],  # yesterday report
    ]
    supabase_mock["upsert_one"].return_value = {}

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == "2026-02-15"
    assert body["cached"] is False
    assert "report" in body
    assert openai_mock.await_count == 1


def test_analyze_returns_429_on_rate_limit(
    authenticated_client: TestClient, monkeypatch
) -> None:
    async def _consume_rate_limited(
        *, key: str, limit: int, window_seconds: int
    ) -> None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"message": "Too many requests."},
        )

    monkeypatch.setattr(analyze_route, "consume", _consume_rate_limited)

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})
    assert response.status_code == 429


def test_analyze_openai_failure_returns_502(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    monkeypatch.setattr(
        analyze_route,
        "get_subscription_info",
        AsyncMock(return_value=type("Sub", (), {"plan": "free"})()),
    )
    monkeypatch.setattr(
        analyze_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        analyze_route,
        "call_openai_structured",
        AsyncMock(side_effect=httpx.ConnectError("boom")),
    )
    monkeypatch.setattr(analyze_route, "log_system_error", AsyncMock(return_value=None))

    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],  # previous_report
        [],  # existing report
        [_activity_log()],  # activity log
        [_activity_log()],  # recent activity logs
        [],  # yesterday report
    ]

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})

    assert response.status_code == 502
    assert "AI analysis failed" in response.json()["detail"]


def test_analyze_requires_auth(client: TestClient) -> None:
    response = client.post("/api/analyze", json={"date": "2026-02-15"})
    assert response.status_code == 401
