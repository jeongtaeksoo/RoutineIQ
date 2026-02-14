from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.routes.analyze as analyze_route
from app.core.security import AuthContext, verify_token
from app.main import app


def _entry(start: str, end: str, activity: str, focus: int, energy: int) -> dict:
    return {
        "start": start,
        "end": end,
        "activity": activity,
        "focus": focus,
        "energy": energy,
        "tags": [],
    }


def _activity_row(log_date: str, entries: list[dict], note: str = "") -> dict:
    return {"date": log_date, "entries": entries, "note": note}


@pytest.mark.parametrize(
    "scenario_name, locale, entries, has_yesterday, recent_days, expect_korean",
    [
        (
            "worker_ko",
            "ko",
            [
                _entry("09:00", "11:00", "기획", 4, 4),
                _entry("13:00", "15:00", "집중 코딩", 5, 4),
            ],
            False,
            3,
            True,
        ),
        (
            "student_en",
            "en",
            [
                _entry("08:00", "10:00", "Study math", 4, 3),
                _entry("14:00", "16:00", "Lab report", 4, 3),
            ],
            False,
            3,
            False,
        ),
        ("low_activity", "ko", [], False, 1, True),
        (
            "day2_with_yesterday_plan",
            "ko",
            [_entry("10:00", "12:00", "집중 작업", 4, 4)],
            True,
            2,
            True,
        ),
        (
            "high_activity",
            "en",
            [
                _entry("07:00", "08:00", "Email", 2, 2),
                _entry("08:00", "10:00", "Deep work", 5, 4),
                _entry("10:30", "12:00", "Meetings", 2, 3),
                _entry("13:00", "15:00", "Execution", 4, 4),
                _entry("16:00", "18:00", "Planning", 3, 3),
            ],
            False,
            4,
            False,
        ),
    ],
)
def test_analyze_quality_scenarios(
    client: TestClient,
    supabase_mock,
    monkeypatch: pytest.MonkeyPatch,
    scenario_name: str,
    locale: str,
    entries: list[dict],
    has_yesterday: bool,
    recent_days: int,
    expect_korean: bool,
) -> None:
    target_date = date(2026, 2, 15)
    token = "quality-token-for-tests-1234567890"

    async def _override_verify_token() -> AuthContext:
        return AuthContext(
            user_id="00000000-0000-4000-8000-000000000001",
            email="pytest-user@rutineiq.test",
            is_anonymous=False,
            locale=locale,
            access_token=token,
        )

    app.dependency_overrides[verify_token] = _override_verify_token

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

    recent_rows = []
    for i in range(recent_days):
        d = (target_date - timedelta(days=i)).isoformat()
        recent_rows.append(_activity_row(d, entries, note=f"recent-{i}"))

    yesterday_rows = (
        [
            {
                "report": {
                    "tomorrow_routine": [
                        {
                            "start": "09:00",
                            "end": "10:00",
                            "activity": "핵심 집중 블록",
                            "goal": "핵심 1개 완료",
                        }
                    ]
                }
            }
        ]
        if has_yesterday
        else []
    )

    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],  # previous_report
        [],  # existing report cache miss
        [
            _activity_row(target_date.isoformat(), entries, note=scenario_name)
        ],  # activity log
        recent_rows,  # recent trend rows
        yesterday_rows,  # yesterday report
    ]
    supabase_mock["upsert_one"].return_value = {}

    async def _fake_openai_call(*, system_prompt: str, user_prompt: str):
        if has_yesterday:
            assert "Yesterday's recommended plan for today" in user_prompt
            assert "09:00" in user_prompt
        if recent_days >= 3:
            assert (
                '"days_with_logs": 3' in user_prompt
                or '"days_with_logs": 4' in user_prompt
            )

        if "locale='ko'" in system_prompt:
            summary = "한국어 리포트 요약"
            reason = "집중 시간대가 분명합니다."
            coach = "아침 09:00 블록부터 시작하세요."
        else:
            summary = "English report summary"
            reason = "Your peak focus window is clear."
            coach = "Start with a 09:00 focus block."

        report = {
            "summary": summary,
            "productivity_peaks": [
                {"start": "09:00", "end": "10:00", "reason": reason}
            ],
            "failure_patterns": [
                {
                    "pattern": "context switching",
                    "trigger": "notifications",
                    "fix": "2-minute reset before task switch",
                }
            ],
            "tomorrow_routine": [
                {
                    "start": "09:00",
                    "end": "10:00",
                    "activity": "Focus Window",
                    "goal": "Pick one highest-impact task and finish one output.",
                }
            ],
            "if_then_rules": [
                {
                    "if": "When notifications spike",
                    "then": "Enable focus mode for 25 minutes",
                }
            ],
            "coach_one_liner": coach,
            "yesterday_plan_vs_actual": {
                "comparison_note": "plan comparison complete",
                "top_deviation": "minor drift",
            },
        }
        return report, {"input_tokens": 100, "output_tokens": 200, "total_tokens": 300}

    monkeypatch.setattr(analyze_route, "call_openai_structured", _fake_openai_call)

    response = client.post("/api/analyze", json={"date": target_date.isoformat()})

    assert response.status_code == 200
    body = response.json()
    assert body["cached"] is False
    routine = body["report"]["tomorrow_routine"]
    assert isinstance(routine, list) and len(routine) >= 1
    assert "start" in routine[0] and "end" in routine[0] and "activity" in routine[0]
    if expect_korean:
        assert "요약" in body["report"]["summary"]
    else:
        assert "English" in body["report"]["summary"]
