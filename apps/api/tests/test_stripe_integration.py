from __future__ import annotations

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import app.routes.stripe_routes as stripe_routes
from app.core.security import AuthContext, verify_token
from app.main import app


def test_stripe_status_returns_availability(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(stripe_routes, "stripe_is_configured", lambda: True)
    monkeypatch.setattr(stripe_routes, "stripe_is_ready", lambda force=False: True)
    monkeypatch.setattr(stripe_routes, "stripe_is_fake_mode", lambda: False)

    response = authenticated_client.get("/api/stripe/status")

    assert response.status_code == 200
    assert response.json() == {"enabled": True, "ready": True, "mode": "live"}


def test_stripe_status_requires_auth(client: TestClient) -> None:
    response = client.get("/api/stripe/status")
    assert response.status_code == 401


def test_create_checkout_session_happy_path(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(stripe_routes, "stripe_is_ready", lambda force=False: True)
    checkout_mock = AsyncMock(return_value="https://checkout.stripe.test/session/123")
    monkeypatch.setattr(stripe_routes, "create_pro_checkout_session", checkout_mock)

    response = authenticated_client.post("/api/stripe/create-checkout-session")

    assert response.status_code == 200
    assert response.json()["url"].startswith("https://checkout.stripe.test")
    assert checkout_mock.await_count == 1


def test_create_checkout_session_requires_auth(client: TestClient) -> None:
    response = client.post("/api/stripe/create-checkout-session")
    assert response.status_code == 401


def test_create_checkout_session_requires_email_identity(
    client: TestClient, monkeypatch, fake_jwt_token: str
) -> None:
    monkeypatch.setattr(stripe_routes, "stripe_is_ready", lambda force=False: True)

    async def _anonymous_auth() -> AuthContext:
        return AuthContext(
            user_id="00000000-0000-4000-8000-000000000001",
            email=None,
            is_anonymous=True,
            locale="ko",
            access_token=fake_jwt_token,
        )

    # Keep override local to this test.
    app.dependency_overrides[verify_token] = _anonymous_auth
    try:
        response = client.post("/api/stripe/create-checkout-session")
    finally:
        app.dependency_overrides.pop(verify_token, None)

    assert response.status_code == 401
    detail = response.json()["detail"]
    assert detail["code"] == "EMAIL_REQUIRED"


def test_webhook_checkout_completed_updates_subscription(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(stripe_routes, "stripe_is_configured", lambda: True)
    monkeypatch.setattr(stripe_routes, "init_stripe", lambda: None)
    monkeypatch.setattr(stripe_routes, "log_system_error", AsyncMock(return_value=None))

    monkeypatch.setattr(
        stripe_routes.stripe.Webhook,
        "construct_event",
        lambda payload, sig_header, secret: {
            "id": "evt_checkout_completed_1",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "subscription": "sub_123",
                    "metadata": {
                        "user_id": "00000000-0000-4000-8000-000000000001"
                    },
                }
            },
        },
    )
    monkeypatch.setattr(
        stripe_routes.stripe.Subscription,
        "retrieve",
        lambda sub_id: {
            "id": sub_id,
            "status": "active",
            "customer": "cus_123",
            "items": {
                "data": [
                    {
                        "price": {
                            "id": "price_test_pro",
                        }
                    }
                ]
            },
        },
    )
    upsert_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(stripe_routes, "upsert_subscription_row", upsert_mock)

    response = client.post(
        "/api/stripe/webhook",
        data=b'{"id":"evt_checkout_completed_1"}',
        headers={"Stripe-Signature": "t=1,v1=sig"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert upsert_mock.await_count == 1
    kwargs = upsert_mock.await_args.kwargs
    assert kwargs["user_id"] == "00000000-0000-4000-8000-000000000001"
    assert kwargs["plan"] == "pro"


def test_webhook_subscription_deleted_triggers_downgrade(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(stripe_routes, "stripe_is_configured", lambda: True)
    monkeypatch.setattr(stripe_routes, "init_stripe", lambda: None)
    monkeypatch.setattr(stripe_routes, "log_system_error", AsyncMock(return_value=None))

    monkeypatch.setattr(
        stripe_routes.stripe.Webhook,
        "construct_event",
        lambda payload, sig_header, secret: {
            "id": "evt_sub_deleted_1",
            "type": "customer.subscription.deleted",
            "data": {
                "object": {
                    "id": "sub_456",
                    "customer": "cus_456",
                    "status": "canceled",
                    "metadata": {
                        "user_id": "00000000-0000-4000-8000-000000000001"
                    },
                }
            },
        },
    )
    downgrade_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(stripe_routes, "set_subscription_free", downgrade_mock)

    response = client.post(
        "/api/stripe/webhook",
        data=b'{"id":"evt_sub_deleted_1"}',
        headers={"Stripe-Signature": "t=1,v1=sig"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert downgrade_mock.await_count == 1
    kwargs = downgrade_mock.await_args.kwargs
    assert kwargs["user_id"] == "00000000-0000-4000-8000-000000000001"
    assert kwargs["subscription_id"] == "sub_456"
