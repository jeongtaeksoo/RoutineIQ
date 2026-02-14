from __future__ import annotations

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import app.routes.stripe_routes as stripe_routes


def test_stripe_webhook_accepts_valid_signature(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(stripe_routes, "stripe_is_configured", lambda: True)
    monkeypatch.setattr(stripe_routes, "init_stripe", lambda: None)
    monkeypatch.setattr(stripe_routes, "log_system_error", AsyncMock(return_value=None))
    monkeypatch.setattr(
        stripe_routes.stripe.Webhook,
        "construct_event",
        lambda payload, sig_header, secret: {
            "type": "unknown.event",
            "data": {"object": {}},
        },
    )

    response = client.post(
        "/api/stripe/webhook",
        data=b'{"id":"evt_1"}',
        headers={"Stripe-Signature": "t=1,v1=abc"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_stripe_webhook_rejects_missing_signature(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(stripe_routes, "stripe_is_configured", lambda: True)
    monkeypatch.setattr(stripe_routes, "init_stripe", lambda: None)

    response = client.post("/api/stripe/webhook", data=b"{}")

    assert response.status_code == 400
    assert "Missing Stripe-Signature" in response.json()["detail"]


def test_stripe_webhook_rejects_invalid_signature(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(stripe_routes, "stripe_is_configured", lambda: True)
    monkeypatch.setattr(stripe_routes, "init_stripe", lambda: None)
    monkeypatch.setattr(stripe_routes, "log_system_error", AsyncMock(return_value=None))

    def _raise_invalid(*args, **kwargs):
        raise ValueError("invalid signature")

    monkeypatch.setattr(
        stripe_routes.stripe.Webhook, "construct_event", _raise_invalid
    )

    response = client.post(
        "/api/stripe/webhook",
        data=b'{"id":"evt_2"}',
        headers={"Stripe-Signature": "t=1,v1=bad"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"
