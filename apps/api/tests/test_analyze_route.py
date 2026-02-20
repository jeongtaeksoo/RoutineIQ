from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

import app.routes.analyze as analyze_route


def _profile_row() -> dict:
    return {
        "age_group": "25_34",
        "gender": "prefer_not_to_say",
        "job_family": "engineering",
        "work_mode": "fixed",
    }


def _incomplete_profile_row() -> dict:
    return {
        "age_group": "unknown",
        "gender": "unknown",
        "job_family": "unknown",
        "work_mode": "unknown",
    }


def _activity_log() -> dict:
    return {
        "date": "2026-02-15",
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
    }


def _activity_log_signal_rich() -> dict:
    return {
        "date": "2026-02-15",
        "entries": [
            {
                "start": "09:00",
                "end": "10:10",
                "activity": "Deep work",
                "energy": 5,
                "focus": 5,
                "confidence": "high",
                "tags": ["focus"],
            },
            {
                "start": "10:20",
                "end": "11:20",
                "activity": "Execution",
                "energy": 4,
                "focus": 4,
                "confidence": "high",
                "tags": ["delivery"],
            },
            {
                "start": "14:00",
                "end": "14:40",
                "activity": "Coordination",
                "energy": 3,
                "focus": 3,
                "confidence": "medium",
                "tags": ["meeting"],
            },
        ],
        "note": "signal-rich day",
        "meta": {"mood": "good", "sleep_quality": 4, "sleep_hours": 7.0, "stress_level": 2},
    }


def _activity_log_signal_poor() -> dict:
    return {
        "date": "2026-02-15",
        "entries": [
            {
                "start": "09:00",
                "end": "10:00",
                "activity": "Work block",
                "confidence": "low",
                "tags": ["work"],
            },
            {
                "start": "13:00",
                "end": "14:20",
                "activity": "Meetings",
                "confidence": "low",
                "tags": ["meeting"],
            },
        ],
        "note": "minimal signals",
        "meta": {},
    }


def test_analyze_success_returns_report(
    authenticated_client: TestClient, supabase_mock, openai_mock, monkeypatch
) -> None:
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

    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],  # previous_report
        [_profile_row()],  # profile context
        [],  # existing report for target date
        [_activity_log()],  # activity log
        [_activity_log()],  # recent activity logs
        [],  # yesterday report
    ]
    supabase_mock["upsert_one"].return_value = {}

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == "2026-02-15"
    assert body["cached"] is False
    assert "report" in body
    assert isinstance(body["report"]["analysis_meta"], dict)
    assert body["report"]["analysis_meta"]["personalization_tier"] in {
        "low",
        "medium",
        "high",
    }
    assert 0 <= body["report"]["analysis_meta"]["input_quality_score"] <= 100
    assert openai_mock.await_count == 1


def test_analyze_done_idempotency_returns_cached_report_even_with_legacy_model_locale(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    monkeypatch.setattr(
        analyze_route,
        "get_subscription_info",
        AsyncMock(return_value=type("Sub", (), {"plan": "free"})()),
    )
    monkeypatch.setattr(
        analyze_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        analyze_route, "claim_idempotency_key", AsyncMock(return_value="done")
    )

    legacy_report_row = {
        "date": "2026-02-15",
        "report": {"summary": "legacy report"},
        "model": "gpt-4o-mini",
        "updated_at": "2026-02-15T00:00:00Z",
    }
    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],  # previous_report
        [_profile_row()],  # profile context
        [legacy_report_row],  # existing report for target date
        [_activity_log()],  # activity log
        [_activity_log()],  # recent activity logs
        [],  # yesterday report
        [legacy_report_row],  # idempotency retry lookup
    ]

    response = authenticated_client.post(
        "/api/analyze", json={"date": "2026-02-15", "force": True}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["cached"] is True
    assert body["report"]["summary"] == "legacy report"


def test_analyze_returns_429_on_rate_limit(
    authenticated_client: TestClient, monkeypatch
) -> None:
    async def _consume_rate_limited(
        *, key: str, limit: int, window_seconds: int
    ) -> None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"message": "Too many requests."},
        )

    monkeypatch.setattr(analyze_route, "consume", _consume_rate_limited)

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})
    assert response.status_code == 429


def test_analyze_openai_failure_returns_502(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    monkeypatch.setattr(
        analyze_route,
        "get_subscription_info",
        AsyncMock(return_value=type("Sub", (), {"plan": "free"})()),
    )
    monkeypatch.setattr(
        analyze_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        analyze_route,
        "call_openai_structured",
        AsyncMock(side_effect=httpx.ConnectError("boom")),
    )
    monkeypatch.setattr(analyze_route, "log_system_error", AsyncMock(return_value=None))
    clear_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(analyze_route, "clear_idempotency_key", clear_mock)

    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],  # previous_report
        [_profile_row()],  # profile context
        [],  # existing report
        [_activity_log()],  # activity log
        [_activity_log()],  # recent activity logs
        [],  # yesterday report
    ]

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})

    assert response.status_code == 502
    assert "AI analysis failed" in response.json()["detail"]
    assert clear_mock.await_count == 1


def test_analyze_requires_auth(client: TestClient) -> None:
    response = client.post("/api/analyze", json={"date": "2026-02-15"})
    assert response.status_code == 401


def test_analyze_allows_first_run_with_incomplete_profile(
    authenticated_client: TestClient, supabase_mock, openai_mock, monkeypatch
) -> None:
    monkeypatch.setattr(
        analyze_route,
        "get_subscription_info",
        AsyncMock(return_value=type("Sub", (), {"plan": "free"})()),
    )
    monkeypatch.setattr(
        analyze_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    usage_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(analyze_route, "insert_usage_event", usage_mock)
    monkeypatch.setattr(
        analyze_route, "cleanup_expired_reports", AsyncMock(return_value=None)
    )

    supabase_mock["select"].side_effect = [
        [],  # previous_report (first run)
        [_incomplete_profile_row()],  # profile context (unknown)
        [],  # existing report for target date
        [_activity_log()],  # activity log
        [_activity_log()],  # recent activity logs
        [],  # yesterday report
    ]
    supabase_mock["upsert_one"].return_value = {}

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})

    assert response.status_code == 200
    assert response.json()["cached"] is False
    call_kwargs = usage_mock.await_args.kwargs
    assert call_kwargs["meta"]["first_analysis"] is True
    quality = call_kwargs["meta"]["quality"]
    assert quality["profile_required_fields_coverage_pct"] == 0.0
    assert set(quality["missing_profile_fields"]) == {
        "age_group",
        "gender",
        "job_family",
        "work_mode",
    }


def test_analyze_tracks_schema_retry_in_quality_meta(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    monkeypatch.setattr(
        analyze_route,
        "get_subscription_info",
        AsyncMock(return_value=type("Sub", (), {"plan": "free"})()),
    )
    monkeypatch.setattr(
        analyze_route, "count_daily_analyze_calls", AsyncMock(return_value=0)
    )
    usage_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(analyze_route, "insert_usage_event", usage_mock)
    monkeypatch.setattr(
        analyze_route, "cleanup_expired_reports", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(
        analyze_route,
        "call_openai_structured",
        AsyncMock(
            side_effect=[
                (
                    {"summary": "invalid-schema"},
                    {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
                ),
                (
                    {
                        "summary": "테스트 요약",
                        "productivity_peaks": [
                            {"start": "09:00", "end": "10:00", "reason": "집중"}
                        ],
                        "failure_patterns": [
                            {
                                "pattern": "전환 과다",
                                "trigger": "연속 회의",
                                "fix": "5분 리셋",
                            }
                        ],
                        "tomorrow_routine": [
                            {
                                "start": "09:00",
                                "end": "10:00",
                                "activity": "핵심 집중 블록",
                                "goal": "핵심 업무 1개 완료",
                            }
                        ],
                        "if_then_rules": [
                            {"if": "집중이 끊기면", "then": "5분 리셋 후 재시작"}
                        ],
                        "coach_one_liner": "09:00 집중 블록부터 시작하세요.",
                        "yesterday_plan_vs_actual": {
                            "comparison_note": "비교 데이터 부족",
                            "top_deviation": "전일 계획 없음",
                        },
                    },
                    {"input_tokens": 120, "output_tokens": 240, "total_tokens": 360},
                ),
            ]
        ),
    )

    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],  # previous_report
        [_profile_row()],  # profile context
        [],  # existing report for target date
        [_activity_log()],  # activity log
        [_activity_log()],  # recent activity logs
        [],  # yesterday report
    ]
    supabase_mock["upsert_one"].return_value = {}

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})

    assert response.status_code == 200
    quality = usage_mock.await_args.kwargs["meta"]["quality"]
    assert quality["schema_retry_count"] == 1
    assert quality["schema_validation_failed_once"] is True
    assert quality["analysis_meta"]["schema_retry_count"] == 1


def test_analyze_signal_rich_quality_score_is_higher_than_signal_poor(
    authenticated_client: TestClient, supabase_mock, openai_mock, monkeypatch
) -> None:
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

    supabase_mock["upsert_one"].return_value = {}
    rich_log = _activity_log_signal_rich()
    poor_log = _activity_log_signal_poor()

    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],
        [_profile_row()],
        [],
        [rich_log],
        [rich_log],
        [],
    ]
    rich_response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})
    assert rich_response.status_code == 200

    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],
        [_profile_row()],
        [],
        [poor_log],
        [poor_log],
        [],
    ]
    poor_response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15", "force": True})
    assert poor_response.status_code == 200

    rich_score = rich_response.json()["report"]["analysis_meta"]["input_quality_score"]
    poor_score = poor_response.json()["report"]["analysis_meta"]["input_quality_score"]
    assert rich_score > poor_score
    assert rich_score >= 55
    assert poor_score <= 55


def test_analyze_low_signal_data_adds_conservative_guidance(
    authenticated_client: TestClient, supabase_mock, openai_mock, monkeypatch
) -> None:
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

    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],
        [_profile_row()],
        [],
        [_activity_log_signal_poor()],
        [_activity_log_signal_poor()],
        [],
    ]
    supabase_mock["upsert_one"].return_value = {}

    response = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})
    assert response.status_code == 200
    summary = response.json()["report"]["summary"]
    assert "에너지/집중" in summary or "energy/focus" in summary.lower()
