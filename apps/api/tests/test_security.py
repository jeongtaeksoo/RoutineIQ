from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.core.security as security
import app.routes.stripe_routes as stripe_routes
from app.services.supabase_rest import SupabaseRest

TEST_USER_ID = "00000000-0000-4000-8000-000000000001"
OTHER_USER_ID = "00000000-0000-4000-8000-000000000999"


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("post", "/api/logs", {"date": "2026-02-15", "entries": [], "note": None}),
        ("get", "/api/reports?date=2026-02-15", None),
        ("post", "/api/analyze", {"date": "2026-02-15"}),
    ],
)
def test_protected_endpoints_require_auth(
    client: TestClient, method: str, path: str, payload: dict | None
) -> None:
    req = getattr(client, method)
    response = req(path, json=payload) if payload is not None else req(path)
    assert response.status_code == 401


def test_expired_jwt_returns_401(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _expired(*, access_token: str, use_cache: bool = True):
        raise RuntimeError("token expired")

    monkeypatch.setattr(security, "get_current_user", _expired)
    response = client.get(
        "/api/logs?date=2026-02-15",
        headers={"Authorization": "Bearer a12345678901234567890"},
    )
    assert response.status_code == 401


def test_tampered_jwt_returns_401(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def _invalid(*, access_token: str, use_cache: bool = True):
        raise RuntimeError("signature mismatch")

    monkeypatch.setattr(security, "get_current_user", _invalid)
    response = client.get(
        "/api/reports?date=2026-02-15",
        headers={"Authorization": "Bearer z12345678901234567890"},
    )
    assert response.status_code == 401


def test_logs_get_scopes_queries_to_authenticated_user(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].return_value = []
    response = authenticated_client.get("/api/logs", params={"date": "2026-02-15"})
    assert response.status_code == 200
    params = supabase_mock["select"].await_args.kwargs["params"]
    assert params["user_id"] == f"eq.{TEST_USER_ID}"


def test_logs_post_forces_user_id_from_auth_context(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].return_value = {
        "id": "log-1",
        "user_id": TEST_USER_ID,
        "date": "2026-02-15",
        "entries": [],
        "note": None,
    }
    response = authenticated_client.post(
        "/api/logs",
        json={"date": "2026-02-15", "entries": [], "note": None},
    )
    assert response.status_code == 200
    log_call = next(
        call
        for call in supabase_mock["upsert_one"].await_args_list
        if call.kwargs.get("table") == "activity_logs"
    )
    row = log_call.kwargs["row"]
    assert row["user_id"] == TEST_USER_ID


def test_reports_get_scopes_queries_to_authenticated_user(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].return_value = []
    response = authenticated_client.get("/api/reports", params={"date": "2026-02-15"})
    assert response.status_code == 404
    params = supabase_mock["select"].await_args.kwargs["params"]
    assert params["user_id"] == f"eq.{TEST_USER_ID}"


def test_insights_weekly_scopes_queries_to_authenticated_user(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].side_effect = [[], [], []]
    response = authenticated_client.get(
        "/api/insights/weekly",
        params={"from": "2026-02-09", "to": "2026-02-15"},
    )
    assert response.status_code == 200
    call1 = supabase_mock["select"].await_args_list[0].kwargs["params"]
    call2 = supabase_mock["select"].await_args_list[1].kwargs["params"]
    call3 = supabase_mock["select"].await_args_list[2].kwargs["params"]
    assert call1["id"] == f"eq.{TEST_USER_ID}"
    assert call2["user_id"] == f"eq.{TEST_USER_ID}"
    assert f"user_id.eq.{TEST_USER_ID}" in call3["and"]


def test_preferences_profile_get_scopes_by_authenticated_user(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].return_value = []
    response = authenticated_client.get("/api/preferences/profile")
    assert response.status_code == 200
    params = supabase_mock["select"].await_args.kwargs["params"]
    assert params["id"] == f"eq.{TEST_USER_ID}"


def test_preferences_delete_scopes_by_authenticated_user(
    authenticated_client: TestClient, supabase_mock
) -> None:
    response = authenticated_client.delete("/api/preferences/data")
    assert response.status_code == 200
    first = supabase_mock["delete"].await_args_list[0].kwargs["params"]
    second = supabase_mock["delete"].await_args_list[1].kwargs["params"]
    assert first["user_id"] == f"eq.{TEST_USER_ID}"
    assert second["user_id"] == f"eq.{TEST_USER_ID}"


def test_preferences_delete_removes_only_my_rows(
    authenticated_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = {
        "ai_reports": [
            {"user_id": TEST_USER_ID, "date": "2026-02-15"},
            {"user_id": OTHER_USER_ID, "date": "2026-02-15"},
        ],
        "activity_logs": [
            {"user_id": TEST_USER_ID, "date": "2026-02-15"},
            {"user_id": OTHER_USER_ID, "date": "2026-02-15"},
        ],
    }

    async def _delete(
        self: SupabaseRest, table: str, *, bearer_token: str, params: dict
    ):
        target = str(params.get("user_id", "")).replace("eq.", "")
        store[table] = [row for row in store[table] if row["user_id"] != target]

    monkeypatch.setattr(SupabaseRest, "delete", _delete)

    response = authenticated_client.delete("/api/preferences/data")
    assert response.status_code == 200

    assert [r for r in store["ai_reports"] if r["user_id"] == TEST_USER_ID] == []
    assert [r for r in store["activity_logs"] if r["user_id"] == TEST_USER_ID] == []
    assert len([r for r in store["ai_reports"] if r["user_id"] == OTHER_USER_ID]) == 1
    assert (
        len([r for r in store["activity_logs"] if r["user_id"] == OTHER_USER_ID]) == 1
    )


def test_stripe_webhook_invalid_signature_returns_400(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(stripe_routes, "stripe_is_configured", lambda: True)
    monkeypatch.setattr(stripe_routes, "init_stripe", lambda: None)
    monkeypatch.setattr(stripe_routes, "log_system_error", AsyncMock(return_value=None))

    def _raise_invalid(*args, **kwargs):
        raise ValueError("bad signature")

    monkeypatch.setattr(stripe_routes.stripe.Webhook, "construct_event", _raise_invalid)
    response = client.post(
        "/api/stripe/webhook",
        data=b'{"id":"evt_bad"}',
        headers={"Stripe-Signature": "t=1,v1=invalid"},
    )
    assert response.status_code == 400


def test_stripe_webhook_replay_is_ignored(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(stripe_routes, "stripe_is_configured", lambda: True)
    monkeypatch.setattr(stripe_routes, "init_stripe", lambda: None)
    monkeypatch.setattr(stripe_routes, "log_system_error", AsyncMock(return_value=None))
    monkeypatch.setattr(
        stripe_routes.stripe.Webhook,
        "construct_event",
        lambda payload, sig_header, secret: {
            "id": "evt_replay_1",
            "type": "unknown.event",
            "data": {"object": {}},
        },
    )

    first = client.post(
        "/api/stripe/webhook",
        data=b'{"id":"evt_replay_1"}',
        headers={"Stripe-Signature": "t=1,v1=sig"},
    )
    second = client.post(
        "/api/stripe/webhook",
        data=b'{"id":"evt_replay_1"}',
        headers={"Stripe-Signature": "t=1,v1=sig"},
    )

    assert first.status_code == 200
    assert first.json() == {"ok": True}
    assert second.status_code == 200
    assert second.json() == {"ok": True, "replayed": True}
