from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.supabase_rest import SupabaseRestError


def test_health_echoes_incoming_correlation_id(client: TestClient) -> None:
    response = client.get("/health", headers={"x-correlation-id": "cid-health-echo"})
    assert response.status_code == 200
    assert response.headers.get("x-correlation-id") == "cid-health-echo"


def test_health_generates_correlation_id_when_missing(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    correlation_id = response.headers.get("x-correlation-id")
    assert correlation_id
    assert len(correlation_id) >= 8


def test_supabase_exception_response_keeps_same_correlation_id(
    authenticated_client: TestClient,
    supabase_mock,
) -> None:
    supabase_mock["select"].side_effect = SupabaseRestError(
        status_code=500,
        message="database unavailable",
        code="08006",
    )

    response = authenticated_client.get(
        "/api/me/entitlements",
        headers={"x-correlation-id": "cid-entitlements-error"},
    )
    assert response.status_code == 502
    assert response.headers.get("x-correlation-id") == "cid-entitlements-error"
