from __future__ import annotations


def test_track_analytics_event_writes_usage_event(
    authenticated_client, supabase_mock, fake_auth_context
):
    payload = {
        "event_name": "billing_cta_clicked",
        "source": "today",
        "path": "/app/today",
        "request_id": "evt-billing-cta-1",
        "meta": {"placement": "coach_card"},
    }

    response = authenticated_client.post("/api/analytics/events", json=payload)
    assert response.status_code == 200
    assert response.json() == {"ok": True}

    supabase_mock["upsert_one"].assert_awaited_once()
    called = supabase_mock["upsert_one"].await_args.kwargs
    assert called["table"] == "usage_events"
    assert called["row"]["user_id"] == fake_auth_context.user_id
    assert called["row"]["event_type"] == "ux_billing_cta_clicked"
    assert called["row"]["model"] == "web_ui"
    assert called["row"]["request_id"] == "evt-billing-cta-1"
    assert called["row"]["meta"]["source"] == "today"


def test_track_analytics_event_requires_auth(client):
    response = client.post(
        "/api/analytics/events",
        json={"event_name": "analyze_started"},
    )
    assert response.status_code == 401


def test_track_analytics_event_rejects_invalid_name(authenticated_client):
    response = authenticated_client.post(
        "/api/analytics/events",
        json={"event_name": "Billing CTA Clicked!"},
    )
    assert response.status_code == 422
