from __future__ import annotations

from fastapi.testclient import TestClient


def _opted_in_profile(**overrides) -> dict:
    base = {
        "age_group": "25_34",
        "gender": "female",
        "job_family": "office_worker",
        "work_mode": "fixed",
        "trend_opt_in": True,
        "trend_compare_by": ["age_group", "job_family", "work_mode"],
    }
    base.update(overrides)
    return base


def _my_log_row(date_value: str) -> dict:
    return {
        "date": date_value,
        "entries": [
            {
                "start": "09:00",
                "end": "10:00",
                "activity": "Deep work",
                "energy": 4,
                "focus": 4,
            },
            {
                "start": "12:00",
                "end": "12:10",
                "activity": "break",
                "energy": 2,
                "focus": 2,
            },
            {
                "start": "14:00",
                "end": "14:30",
                "activity": "Admin",
                "energy": 2,
                "focus": 2,
            },
            {
                "start": "14:35",
                "end": "15:25",
                "activity": "Focus block",
                "energy": 4,
                "focus": 4,
            },
        ],
    }


def test_trends_cohort_happy_path_includes_cohort_and_personal_metrics(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].side_effect = [
        [_opted_in_profile()],
        [_my_log_row("2026-02-15"), _my_log_row("2026-02-14")],
    ]
    supabase_mock["rpc"].return_value = [
        {
            "cohort_size": 42,
            "active_users": 42,
            "focus_window_rate": 65.0,
            "rebound_rate": 45.0,
            "recovery_buffer_day_rate": 30.0,
            "focus_window_numerator": 65,
            "focus_window_denominator": 100,
            "rebound_numerator": 45,
            "rebound_denominator": 100,
            "recovery_day_numerator": 30,
            "recovery_day_denominator": 100,
        }
    ]

    response = authenticated_client.get("/api/trends/cohort")

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["cohort_size"] == 42
    assert isinstance(body["metrics"], dict)
    assert body["metrics"]["focus_window_rate"] == 65.0
    assert body["my_focus_rate"] is not None
    assert body["my_rebound_rate"] is not None
    assert body["my_recovery_rate"] is not None
    assert isinstance(body["rank_label"], str)
    assert isinstance(body["actionable_tip"], str)


def test_trends_cohort_requires_auth(client: TestClient) -> None:
    response = client.get("/api/trends/cohort")
    assert response.status_code == 401


def test_trends_cohort_returns_disabled_when_opt_in_is_false(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].return_value = [_opted_in_profile(trend_opt_in=False)]

    response = authenticated_client.get("/api/trends/cohort")

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["insufficient_sample"] is True
    assert body["cohort_size"] == 0


def test_trends_cohort_returns_default_metrics_on_empty_rpc(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].side_effect = [
        [_opted_in_profile()],
        [],
    ]
    supabase_mock["rpc"].return_value = []

    response = authenticated_client.get("/api/trends/cohort")

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["cohort_size"] == 0
    assert body["metrics"]["focus_window_numerator"] == 0
    assert body["metrics"]["rebound_numerator"] == 0


def test_trends_cohort_unknown_query_params_do_not_break_response(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].return_value = [_opted_in_profile(trend_opt_in=False)]

    response = authenticated_client.get(
        "/api/trends/cohort",
        params={"invalid": "true", "window_days": "not-an-int"},
    )

    # Current route does not define query params, so unknown params are ignored.
    assert response.status_code == 200
    assert "enabled" in response.json()


def test_trends_cohort_uses_profile_filters_in_rpc_call(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].side_effect = [
        [
            _opted_in_profile(
                age_group="35_44",
                gender="male",
                job_family="professional",
                work_mode="flex",
                trend_compare_by=["age_group", "job_family"],
            )
        ],
        [],
    ]
    supabase_mock["rpc"].return_value = [{"cohort_size": 10, "active_users": 10}]

    response = authenticated_client.get("/api/trends/cohort")

    assert response.status_code == 200
    rpc_params = supabase_mock["rpc"].await_args.kwargs["params"]
    assert rpc_params["p_age_group"] == "35_44"
    assert rpc_params["p_gender"] == "male"
    assert rpc_params["p_job_family"] == "professional"
    assert rpc_params["p_work_mode"] == "flex"
    assert rpc_params["p_compare_by"] == ["age_group", "job_family"]
