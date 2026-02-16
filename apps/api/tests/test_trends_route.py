from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

import app.routes.trends as trends_route


def _iso(days_ago: int) -> str:
    return (date.today() - timedelta(days=days_ago)).isoformat()


@pytest.fixture(autouse=True)
def _force_control_threshold_policy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        trends_route,
        "_threshold_policy_for_user",
        lambda _uid: trends_route.ThresholdPolicy(
            variant="control", preview_n=20, min_n=50, high_n=100
        ),
    )


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


def _cohort_rpc_row(cohort_size: int) -> dict:
    return {
        "cohort_size": cohort_size,
        "active_users": cohort_size,
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


def test_trends_cohort_happy_path_includes_cohort_and_personal_metrics(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].side_effect = [
        [_opted_in_profile()],
        [_my_log_row(_iso(1)), _my_log_row(_iso(2)), _my_log_row(_iso(8))],
    ]
    supabase_mock["rpc"].return_value = [_cohort_rpc_row(60)]

    response = authenticated_client.get("/api/trends/cohort")

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["cohort_size"] == 60
    assert body["preview_sample_size"] == 20
    assert body["high_confidence_sample_size"] == 100
    assert body["threshold_variant"] == "control"
    assert body["preview_mode"] is False
    assert body["confidence_level"] == "medium"
    assert isinstance(body["metrics"], dict)
    assert body["metrics"]["focus_window_rate"] == 65.0
    assert body["my_focus_rate"] is not None
    assert body["my_rebound_rate"] is not None
    assert body["my_recovery_rate"] is not None
    assert isinstance(body["rank_label"], str) and body["rank_label"] != ""
    assert isinstance(body["actionable_tip"], str) and body["actionable_tip"] != ""


def test_trends_cohort_preview_mode_hides_rank_label(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].side_effect = [
        [_opted_in_profile()],
        [_my_log_row(_iso(1)), _my_log_row(_iso(2))],
    ]
    supabase_mock["rpc"].return_value = [_cohort_rpc_row(30)]

    response = authenticated_client.get("/api/trends/cohort")

    assert response.status_code == 200
    body = response.json()
    assert body["insufficient_sample"] is False
    assert body["preview_mode"] is True
    assert body["confidence_level"] == "low"
    assert body["rank_label"] == ""
    assert body["actionable_tip"] == ""
    assert ("미리보기" in body["message"]) or ("Preview" in body["message"])


@pytest.mark.parametrize(
    ("cohort_size", "expected_insufficient", "expected_preview_mode", "expected_confidence"),
    [
        (19, True, False, "low"),
        (20, False, True, "low"),
        (49, False, True, "low"),
        (50, False, False, "medium"),
        (99, False, False, "medium"),
        (100, False, False, "high"),
    ],
)
def test_trends_cohort_boundary_cases(
    authenticated_client: TestClient,
    supabase_mock,
    cohort_size: int,
    expected_insufficient: bool,
    expected_preview_mode: bool,
    expected_confidence: str,
) -> None:
    supabase_mock["select"].side_effect = [
        [_opted_in_profile()],
        [_my_log_row(_iso(1)), _my_log_row(_iso(2))],
    ]
    supabase_mock["rpc"].return_value = [_cohort_rpc_row(cohort_size)]

    response = authenticated_client.get("/api/trends/cohort")

    assert response.status_code == 200
    body = response.json()
    assert body["cohort_size"] == cohort_size
    assert body["min_sample_size"] == 50
    assert body["preview_sample_size"] == 20
    assert body["high_confidence_sample_size"] == 100
    assert body["threshold_variant"] == "control"
    assert body["insufficient_sample"] is expected_insufficient
    assert body["preview_mode"] is expected_preview_mode
    assert body["confidence_level"] == expected_confidence
    if expected_preview_mode:
        assert body["rank_label"] == ""
        assert body["actionable_tip"] == ""
    elif not expected_insufficient:
        assert body["rank_label"] != ""
        assert body["actionable_tip"] != ""


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
    assert body["preview_mode"] is False
    assert body["confidence_level"] == "low"
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
    assert body["insufficient_sample"] is True
    assert body["cohort_size"] == 0
    assert body["preview_mode"] is False
    assert body["confidence_level"] == "low"
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


def test_trends_cohort_candidate_variant_policy_is_applied(
    authenticated_client: TestClient, supabase_mock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        trends_route,
        "_threshold_policy_for_user",
        lambda _uid: trends_route.ThresholdPolicy(
            variant="candidate", preview_n=30, min_n=80, high_n=150
        ),
    )
    supabase_mock["select"].side_effect = [
        [_opted_in_profile()],
        [_my_log_row(_iso(1)), _my_log_row(_iso(2))],
    ]
    supabase_mock["rpc"].return_value = [_cohort_rpc_row(60)]

    response = authenticated_client.get("/api/trends/cohort")

    assert response.status_code == 200
    body = response.json()
    assert body["threshold_variant"] == "candidate"
    assert body["preview_sample_size"] == 30
    assert body["min_sample_size"] == 80
    assert body["high_confidence_sample_size"] == 150
    assert body["preview_mode"] is True
    assert body["rank_label"] == ""
    assert body["actionable_tip"] == ""


def test_trends_cohort_event_tracking_persists_usage_event(
    authenticated_client: TestClient, supabase_mock
) -> None:
    response = authenticated_client.post(
        "/api/trends/cohort/event",
        json={
            "event_type": "card_view",
            "threshold_variant": "candidate",
            "confidence_level": "low",
            "preview_mode": True,
            "cohort_size": 30,
            "window_days": 14,
            "compare_by": ["age_group", "job_family"],
        },
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert supabase_mock["insert_one"].await_count == 1
    inserted = supabase_mock["insert_one"].await_args.kwargs["row"]
    assert inserted["event_type"] == "cohort_card_view"
    assert inserted["model"] == "cohort-card"
    assert inserted["meta"]["threshold_variant"] == "candidate"
    assert inserted["meta"]["preview_mode"] is True


def test_trends_cohort_event_tracking_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/api/trends/cohort/event",
        json={"event_type": "card_view"},
    )
    assert response.status_code == 401
