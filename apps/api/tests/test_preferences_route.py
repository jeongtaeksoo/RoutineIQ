from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

import app.routes.preferences as preferences_route


def _profile_payload(**overrides) -> dict:
    payload = {
        "age_group": "25_34",
        "gender": "prefer_not_to_say",
        "job_family": "office_worker",
        "work_mode": "fixed",
        "trend_opt_in": True,
        "trend_compare_by": ["age_group", "job_family", "work_mode"],
        "goal_keyword": "deep",
        "goal_minutes_per_day": 90,
    }
    payload.update(overrides)
    return payload


def test_get_profile_returns_profile_with_job_family(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].return_value = [
        {
            "age_group": "25_34",
            "gender": "female",
            "job_family": "engineering",
            "work_mode": "fixed",
            "trend_opt_in": True,
            "trend_compare_by": ["age_group", "job_family"],
            "goal_keyword": "deep",
            "goal_minutes_per_day": 90,
        }
    ]

    response = authenticated_client.get("/api/preferences/profile")

    assert response.status_code == 200
    body = response.json()
    assert body["job_family"] == "office_worker"
    assert body["age_group"] == "25_34"


def test_put_profile_updates_and_returns_profile(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].return_value = {
        "age_group": "18_24",
        "gender": "male",
        "job_family": "student",
        "work_mode": "flex",
        "trend_opt_in": True,
        "trend_compare_by": ["age_group", "job_family"],
        "goal_keyword": "study",
        "goal_minutes_per_day": 120,
    }

    response = authenticated_client.put(
        "/api/preferences/profile",
        json=_profile_payload(
            age_group="18_24",
            gender="male",
            job_family="student",
            work_mode="flex",
            trend_compare_by=["age_group", "job_family"],
            goal_keyword="study",
            goal_minutes_per_day=120,
        ),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job_family"] == "student"
    assert body["goal_minutes_per_day"] == 120


def test_put_profile_invalid_job_family_returns_422(
    authenticated_client: TestClient,
) -> None:
    response = authenticated_client.put(
        "/api/preferences/profile",
        json=_profile_payload(job_family="invalid_job_family"),
    )
    assert response.status_code == 422


def test_delete_data_returns_ok_and_calls_supabase_delete(
    authenticated_client: TestClient, supabase_mock
) -> None:
    response = authenticated_client.delete("/api/preferences/data")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert supabase_mock["delete"].await_count == 2
    first = supabase_mock["delete"].await_args_list[0].kwargs
    second = supabase_mock["delete"].await_args_list[1].kwargs
    assert first["table"] == "ai_reports"
    assert second["table"] == "activity_logs"


def test_delete_account_returns_ok_and_calls_account_deletes(
    authenticated_client: TestClient, supabase_mock, monkeypatch: pytest.MonkeyPatch
) -> None:
    class _Resp:
        status_code = 200

    class _HttpClient:
        delete = AsyncMock(return_value=_Resp())

    fake_http = _HttpClient()
    monkeypatch.setattr(preferences_route, "get_http", lambda: fake_http)

    response = authenticated_client.delete("/api/preferences/account")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert supabase_mock["delete"].await_count == 5
    tables = [call.kwargs["table"] for call in supabase_mock["delete"].await_args_list]
    assert tables == ["ai_reports", "activity_logs", "usage_events", "subscriptions", "profiles"]
    assert fake_http.delete.await_count == 1


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("get", "/api/preferences/profile", None),
        ("put", "/api/preferences/profile", _profile_payload()),
        ("delete", "/api/preferences/data", None),
        ("delete", "/api/preferences/account", None),
    ],
)
def test_preferences_endpoints_require_auth(
    client: TestClient,
    method: str,
    path: str,
    payload: dict | None,
) -> None:
    req = getattr(client, method)
    response = req(path, json=payload) if payload is not None else req(path)
    assert response.status_code == 401


def test_put_profile_deduplicates_trend_compare_by(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].return_value = {
        "age_group": "25_34",
        "gender": "female",
        "job_family": "creator",
        "work_mode": "other",
        "trend_opt_in": True,
        "trend_compare_by": ["age_group", "age_group", "work_mode"],
        "goal_keyword": None,
        "goal_minutes_per_day": None,
    }

    response = authenticated_client.put(
        "/api/preferences/profile",
        json=_profile_payload(
            gender="female",
            job_family="creator",
            work_mode="other",
            trend_compare_by=["age_group", "age_group", "work_mode"],
            goal_keyword=None,
            goal_minutes_per_day=None,
        ),
    )

    assert response.status_code == 200
    assert response.json()["trend_compare_by"] == ["age_group", "work_mode"]


def test_put_profile_falls_back_to_service_role_on_rls_error(
    authenticated_client: TestClient, supabase_mock
) -> None:
    rls_exc = preferences_route.SupabaseRestError(
        status_code=403,
        code="42501",
        message="new row violates row-level security policy",
    )
    supabase_mock["upsert_one"].side_effect = [
        rls_exc,
        {
            "age_group": "45_plus",
            "gender": "female",
            "job_family": "professional",
            "work_mode": "fixed",
            "trend_opt_in": True,
            "trend_compare_by": ["age_group", "job_family", "work_mode"],
            "goal_keyword": "health",
            "goal_minutes_per_day": 60,
        },
    ]

    response = authenticated_client.put(
        "/api/preferences/profile",
        json=_profile_payload(
            age_group="45_plus",
            gender="female",
            job_family="professional",
            goal_keyword="health",
            goal_minutes_per_day=60,
        ),
    )

    assert response.status_code == 200
    assert supabase_mock["upsert_one"].await_count == 2


def test_put_profile_returns_500_when_upsert_returns_empty_row(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].return_value = {}

    response = authenticated_client.put(
        "/api/preferences/profile",
        json=_profile_payload(),
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Failed to save preferences"
