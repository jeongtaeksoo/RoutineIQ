from __future__ import annotations

from app.core.config import settings


def test_entitlements_returns_free_by_default(
    authenticated_client, supabase_mock, fake_auth_context
):
    async def _select(*, table, **kwargs):
        if table == "subscriptions":
            return []
        if table == "usage_events":
            return []
        return []

    supabase_mock["select"].side_effect = _select

    response = authenticated_client.get("/api/me/entitlements")
    assert response.status_code == 200
    body = response.json()

    assert body["plan"] == "free"
    assert body["is_pro"] is False
    assert body["needs_email_setup"] is False
    assert body["can_use_checkout"] is True
    assert body["analyze_used_today"] == 0
    assert body["analyze_remaining_today"] == settings.free_daily_analyze_limit
    assert body["limits"]["daily_analyze_limit"] == settings.free_daily_analyze_limit
    assert (
        body["limits"]["report_retention_days"] == settings.free_report_retention_days
    )

    calls = [call.kwargs for call in supabase_mock["select"].await_args_list]
    subscription_calls = [c for c in calls if c.get("table") == "subscriptions"]
    assert len(subscription_calls) == 1
    called = subscription_calls[0]
    assert called["bearer_token"] == fake_auth_context.access_token
    assert called["params"]["user_id"] == f"eq.{fake_auth_context.user_id}"


def test_entitlements_returns_pro_when_subscription_active(
    authenticated_client, supabase_mock
):
    async def _select(*, table, **kwargs):
        if table == "subscriptions":
            return [
                {
                    "plan": "pro",
                    "status": "active",
                    "current_period_end": "2099-01-01T00:00:00+00:00",
                    "cancel_at_period_end": False,
                }
            ]
        if table == "usage_events":
            return [{"id": "u1"}, {"id": "u2"}]
        return []

    supabase_mock["select"].side_effect = _select

    response = authenticated_client.get("/api/me/entitlements")
    assert response.status_code == 200
    body = response.json()

    assert body["plan"] == "pro"
    assert body["is_pro"] is True
    assert body["analyze_used_today"] == 2
    assert body["analyze_remaining_today"] == max(settings.pro_daily_analyze_limit - 2, 0)
    assert body["limits"]["daily_analyze_limit"] == settings.pro_daily_analyze_limit
    assert (
        body["limits"]["report_retention_days"] == settings.pro_report_retention_days
    )


def test_entitlements_requires_auth(client):
    response = client.get("/api/me/entitlements")
    assert response.status_code == 401


def test_activation_defaults_to_profile_step(authenticated_client, supabase_mock):
    async def _select(*, table, **kwargs):
        if table == "profiles":
            return []
        if table == "activity_logs":
            return []
        if table == "ai_reports":
            return []
        return []

    supabase_mock["select"].side_effect = _select

    response = authenticated_client.get("/api/me/activation")
    assert response.status_code == 200
    body = response.json()

    assert body == {
        "profile_complete": False,
        "has_any_log": False,
        "has_any_report": False,
        "activation_complete": False,
        "next_step": "profile",
    }


def test_activation_complete_when_profile_log_report_exist(
    authenticated_client, supabase_mock
):
    async def _select(*, table, **kwargs):
        if table == "profiles":
            return [
                {
                    "age_group": "25_34",
                    "gender": "female",
                    "job_family": "office_worker",
                    "work_mode": "flex",
                }
            ]
        if table == "activity_logs":
            return [{"id": "log-1", "date": "2026-02-20"}]
        if table == "ai_reports":
            return [{"id": "rep-1", "date": "2026-02-20"}]
        return []

    supabase_mock["select"].side_effect = _select

    response = authenticated_client.get("/api/me/activation")
    assert response.status_code == 200
    body = response.json()

    assert body["profile_complete"] is True
    assert body["has_any_log"] is True
    assert body["has_any_report"] is True
    assert body["activation_complete"] is True
    assert body["next_step"] == "complete"
