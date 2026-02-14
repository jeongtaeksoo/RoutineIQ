from __future__ import annotations

from fastapi.testclient import TestClient


def test_reports_returns_existing_report(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].return_value = [
        {
            "date": "2026-02-15",
            "report": {"summary": "ok"},
            "model": "gpt-4o-mini",
            "created_at": "2026-02-15T00:00:00+00:00",
            "updated_at": "2026-02-15T00:00:00+00:00",
        }
    ]

    response = authenticated_client.get("/api/reports", params={"date": "2026-02-15"})

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == "2026-02-15"
    assert body["report"]["summary"] == "ok"
    assert body["model"] == "gpt-4o-mini"


def test_reports_returns_404_when_missing(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].return_value = []

    response = authenticated_client.get("/api/reports", params={"date": "2026-02-15"})

    assert response.status_code == 404
    assert "No AI Coach Report" in response.json()["detail"]


def test_reports_requires_auth(client: TestClient) -> None:
    response = client.get("/api/reports", params={"date": "2026-02-15"})
    assert response.status_code == 401
