from __future__ import annotations

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import app.routes.analyze as analyze_route
import app.routes.parse as parse_route
import app.routes.reflect as reflect_route
import app.routes.suggest as suggest_route
from app.core.security import AuthContext, verify_token
from app.main import app
from app.services.supabase_rest import SupabaseRestError


def _profile_row() -> dict:
    return {
        "age_group": "25_34",
        "gender": "prefer_not_to_say",
        "job_family": "office_worker",
        "work_mode": "fixed",
        "goal_keyword": "deep",
        "goal_minutes_per_day": 90,
    }


def _activity_log(date_value: str = "2026-02-15") -> dict:
    return {
        "date": date_value,
        "entries": [
            {
                "start": "09:00",
                "end": "10:00",
                "activity": "Deep work",
                "energy": 4,
                "focus": 5,
                "tags": ["focus"],
            }
        ],
        "note": "stable day",
        "meta": {},
    }


def _valid_ai_report() -> dict:
    return {
        "schema_version": 2,
        "summary": "Solid execution day with one strong focus window.",
        "productivity_peaks": [
            {"start": "09:00", "end": "10:00", "reason": "High focus and low switching"}
        ],
        "failure_patterns": [
            {
                "pattern": "Afternoon drift",
                "trigger": "Context switching",
                "fix": "Add a 5-minute reset before transitions",
            }
        ],
        "tomorrow_routine": [
            {
                "start": "09:00",
                "end": "10:00",
                "activity": "Focus Window",
                "goal": "Finish one high-impact task",
            }
        ],
        "if_then_rules": [
            {"if": "I feel distracted", "then": "Take a 5-minute reset and restart."}
        ],
        "coach_one_liner": "Protect your first focus block before meetings.",
        "yesterday_plan_vs_actual": {
            "comparison_note": "No previous plan data to compare.",
            "top_deviation": "NO_PREVIOUS_PLAN",
        },
        "wellbeing_insight": {
            "burnout_risk": "low",
            "energy_curve_forecast": "Best focus in the morning.",
            "note": "Keep your recovery rhythm.",
        },
        "micro_advice": [
            {
                "action": "3-minute breathing reset",
                "when": "Before the second focus block",
                "reason": "Lowers switching friction",
                "duration_min": 3,
            }
        ],
        "weekly_pattern_insight": "Focus trend is stable across recent logs.",
    }


def _mock_analyze_dependencies(monkeypatch) -> None:
    monkeypatch.setattr(
        analyze_route,
        "get_subscription_info",
        AsyncMock(return_value=type("Sub", (), {"plan": "free"})()),
    )
    monkeypatch.setattr(
        analyze_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        analyze_route, "insert_usage_event", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        analyze_route, "cleanup_expired_reports", AsyncMock(return_value=None)
    )


def test_parse_diary_empty_text_returns_422(authenticated_client: TestClient) -> None:
    response = authenticated_client.post(
        "/api/parse-diary",
        json={"date": "2026-02-15", "diary_text": ""},
    )
    assert response.status_code == 422


def test_parse_diary_too_long_text_returns_422(authenticated_client: TestClient) -> None:
    response = authenticated_client.post(
        "/api/parse-diary",
        json={"date": "2026-02-15", "diary_text": "a" * 10000},
    )
    assert response.status_code == 422


def test_analyze_with_future_date_is_handled(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    _mock_analyze_dependencies(monkeypatch)
    monkeypatch.setattr(
        analyze_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                _valid_ai_report(),
                {"input_tokens": 80, "output_tokens": 160, "total_tokens": 240},
            )
        ),
    )
    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],
        [_profile_row()],
        [],
        [],
        [],
        [],
    ]
    supabase_mock["upsert_one"].return_value = {}

    response = authenticated_client.post("/api/analyze", json={"date": "2099-01-01"})

    assert response.status_code == 200
    assert response.json()["cached"] is False


def test_analyze_with_old_date_is_handled(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    _mock_analyze_dependencies(monkeypatch)
    monkeypatch.setattr(
        analyze_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                _valid_ai_report(),
                {"input_tokens": 90, "output_tokens": 170, "total_tokens": 260},
            )
        ),
    )
    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],
        [_profile_row()],
        [],
        [_activity_log("2025-01-01")],
        [_activity_log("2025-01-01")],
        [],
    ]
    supabase_mock["upsert_one"].return_value = {}

    response = authenticated_client.post("/api/analyze", json={"date": "2025-01-01"})

    assert response.status_code == 200
    assert response.json()["date"] == "2025-01-01"


def test_parse_diary_malformed_openai_output_returns_502(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        parse_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                {"entries": "bad-shape", "meta": {}, "ai_note": "broken"},
                {"input_tokens": 10, "output_tokens": 20, "total_tokens": 30},
            )
        ),
    )
    monkeypatch.setattr(parse_route, "log_system_error", AsyncMock(return_value=None))

    response = authenticated_client.post(
        "/api/parse-diary",
        json={"date": "2026-02-15", "diary_text": "Today I wrote code and took a break."},
    )

    assert response.status_code == 502
    body = response.json()
    assert isinstance(body.get("detail"), dict)
    assert body["detail"]["code"] == "PARSE_SCHEMA_INVALID"


def test_reflect_malformed_openai_output_returns_502(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        reflect_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        reflect_route,
        "call_openai_structured",
        AsyncMock(side_effect=ValueError("malformed json")),
    )
    monkeypatch.setattr(reflect_route, "log_system_error", AsyncMock(return_value=None))

    response = authenticated_client.post(
        "/api/reflect",
        json={"date": "2026-02-15", "entries": [], "note": "brief"},
    )

    assert response.status_code == 502


def test_suggest_malformed_openai_output_returns_502(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        suggest_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        suggest_route,
        "call_openai_structured",
        AsyncMock(side_effect=ValueError("malformed json")),
    )
    monkeypatch.setattr(suggest_route, "log_system_error", AsyncMock(return_value=None))

    response = authenticated_client.post(
        "/api/suggest",
        json={"current_time": "15:10", "context": "post meeting fatigue"},
    )

    assert response.status_code == 502


def test_analyze_malformed_openai_output_returns_502(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    _mock_analyze_dependencies(monkeypatch)
    monkeypatch.setattr(
        analyze_route,
        "call_openai_structured",
        AsyncMock(
            side_effect=[
                ({"summary": "missing required fields"}, {"input_tokens": 10, "output_tokens": 10, "total_tokens": 20}),
                ValueError("still malformed"),
            ]
        ),
    )
    monkeypatch.setattr(analyze_route, "log_system_error", AsyncMock(return_value=None))
    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],
        [_profile_row()],
        [],
        [_activity_log()],
        [_activity_log()],
        [],
    ]

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})

    assert response.status_code == 502


def test_analyze_supabase_select_failure_returns_502_or_500(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].side_effect = SupabaseRestError(
        status_code=500,
        code="XX000",
        message="database unavailable",
    )

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})

    assert response.status_code in {500, 502, 503}


def test_reflect_usage_backend_failure_returns_500(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        reflect_route,
        "count_daily_analyze_calls",
        AsyncMock(
            side_effect=SupabaseRestError(
                status_code=500,
                code="XX000",
                message="usage table unavailable",
            )
        ),
    )

    response = authenticated_client.post(
        "/api/reflect",
        json={"date": "2026-02-15", "entries": [], "note": "test"},
    )

    assert response.status_code in {502, 503}


def test_suggest_usage_backend_failure_returns_500(
    authenticated_client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(
        suggest_route,
        "count_daily_analyze_calls",
        AsyncMock(
            side_effect=SupabaseRestError(
                status_code=500,
                code="XX000",
                message="usage table unavailable",
            )
        ),
    )

    response = authenticated_client.post(
        "/api/suggest",
        json={"current_time": "16:00", "context": "test"},
    )

    assert response.status_code in {502, 503}


def test_analyze_missing_activity_log_still_returns_report(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    _mock_analyze_dependencies(monkeypatch)
    monkeypatch.setattr(
        analyze_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                _valid_ai_report(),
                {"input_tokens": 50, "output_tokens": 120, "total_tokens": 170},
            )
        ),
    )
    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],
        [_profile_row()],
        [],
        [],
        [],
        [],
    ]
    supabase_mock["upsert_one"].return_value = {}

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})

    assert response.status_code == 200
    assert response.json()["report"]["summary"]


def test_rate_limit_isolated_between_two_users(
    client: TestClient, supabase_mock, monkeypatch
) -> None:
    _mock_analyze_dependencies(monkeypatch)

    async def _count_daily(*, user_id: str, event_date, access_token: str) -> int:  # type: ignore[no-untyped-def]
        if user_id.endswith("0001"):
            return 1
        return 0

    monkeypatch.setattr(analyze_route, "count_daily_analyze_calls", _count_daily)
    monkeypatch.setattr(
        analyze_route,
        "call_openai_structured",
        AsyncMock(
            return_value=(
                _valid_ai_report(),
                {"input_tokens": 30, "output_tokens": 70, "total_tokens": 100},
            )
        ),
    )
    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],
        [_profile_row()],
        [],
        [{"date": "2026-02-14"}],
        [_profile_row()],
        [],
        [_activity_log()],
        [_activity_log()],
        [],
    ]
    supabase_mock["upsert_one"].return_value = {}

    user_a = AuthContext(
        user_id="00000000-0000-4000-8000-000000000001",
        email="a@rutineiq.test",
        is_anonymous=False,
        locale="ko",
        access_token="token-a-12345678901234567890",
    )
    user_b = AuthContext(
        user_id="00000000-0000-4000-8000-000000000002",
        email="b@rutineiq.test",
        is_anonymous=False,
        locale="ko",
        access_token="token-b-12345678901234567890",
    )
    current = {"ctx": user_a}

    async def _override_verify_token() -> AuthContext:
        return current["ctx"]

    app.dependency_overrides[verify_token] = _override_verify_token
    try:
        response_a = client.post("/api/analyze", json={"date": "2026-02-15"})
        current["ctx"] = user_b
        response_b = client.post("/api/analyze", json={"date": "2026-02-15"})
    finally:
        app.dependency_overrides.pop(verify_token, None)

    assert response_a.status_code == 429
    assert response_b.status_code == 200
