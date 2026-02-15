from __future__ import annotations

import re
from datetime import date, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.routes.analyze as analyze_route
from app.core.security import AuthContext, verify_token
from app.main import app
from tests.eval_scenarios import ANALYZE_SCENARIOS

_HHMM_RE = re.compile(r"^\d{2}:\d{2}$")
_HANGUL_RE = re.compile(r"[가-힣]")
_EN_RE = re.compile(r"[A-Za-z]")


def _activity_row(log_date: str, entries: list[dict], note: str) -> dict:
    return {"date": log_date, "entries": entries, "note": note}


@pytest.mark.parametrize(
    "scenario",
    ANALYZE_SCENARIOS,
    ids=[scenario["scenario_name"] for scenario in ANALYZE_SCENARIOS],
)
def test_analyze_eval_scenarios(
    client: TestClient,
    supabase_mock,
    monkeypatch: pytest.MonkeyPatch,
    scenario: dict,
) -> None:
    target_date = date(2026, 2, 15)
    locale = scenario["locale"]
    scenario_name = scenario["scenario_name"]
    entries = scenario["entries"]
    recent_days = scenario["recent_days"]
    has_yesterday_plan = scenario["has_yesterday_plan"]

    token = f"analyze-eval-token-{scenario_name}"

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
        recent_rows.append(_activity_row(d, entries, note=f"{scenario_name}-recent-{i}"))

    yesterday_activity = "핵심 집중 블록" if locale == "ko" else "Focus Window"
    yesterday_goal = "핵심 1개 완료" if locale == "ko" else "Finish one high-impact output"
    yesterday_rows = (
        [
            {
                "report": {
                    "tomorrow_routine": [
                        {
                            "start": "09:00",
                            "end": "10:00",
                            "activity": yesterday_activity,
                            "goal": yesterday_goal,
                        }
                    ]
                }
            }
        ]
        if has_yesterday_plan
        else []
    )

    supabase_mock["select"].side_effect = [
        [{"date": "2026-02-14"}],  # previous_report exists
        [scenario["profile"]],  # profile context
        [],  # existing report cache miss
        [_activity_row(target_date.isoformat(), entries, note=scenario_name)],  # target activity log
        recent_rows,  # recent trends source
        yesterday_rows,  # yesterday report source
    ]
    supabase_mock["upsert_one"].return_value = {}

    mock_openai = AsyncMock(
        return_value=(
            scenario["mock_report"],
            {"input_tokens": 300, "output_tokens": 600, "total_tokens": 900},
        )
    )
    monkeypatch.setattr(analyze_route, "call_openai_structured", mock_openai)

    response = client.post("/api/analyze", json={"date": target_date.isoformat()})

    assert response.status_code == 200
    body = response.json()
    assert body["cached"] is False

    report = body["report"]
    assert isinstance(report.get("summary"), str) and report["summary"].strip()
    assert isinstance(report.get("coach_one_liner"), str) and report["coach_one_liner"].strip()
    assert isinstance(report.get("productivity_peaks"), list)
    assert isinstance(report.get("failure_patterns"), list)

    tomorrow_routine = report.get("tomorrow_routine")
    assert isinstance(tomorrow_routine, list) and len(tomorrow_routine) >= 1
    for item in tomorrow_routine:
        assert set(["start", "end", "activity", "goal"]).issubset(item.keys())
        assert _HHMM_RE.fullmatch(item["start"])
        assert _HHMM_RE.fullmatch(item["end"])
        assert isinstance(item["activity"], str) and item["activity"].strip()
        assert isinstance(item["goal"], str) and item["goal"].strip()

    locale_probe_text = f"{report['summary']} {report['coach_one_liner']}"
    if locale == "ko":
        assert _HANGUL_RE.search(locale_probe_text)
    else:
        assert _EN_RE.search(locale_probe_text)
        assert not _HANGUL_RE.search(locale_probe_text)

    if has_yesterday_plan:
        y = report.get("yesterday_plan_vs_actual")
        assert isinstance(y, dict)
        assert isinstance(y.get("comparison_note"), str) and y["comparison_note"].strip()
        assert isinstance(y.get("top_deviation"), str) and y["top_deviation"].strip()

    wellbeing = report.get("wellbeing_insight")
    if isinstance(wellbeing, dict):
        assert wellbeing.get("burnout_risk") in {"low", "medium", "high"}

    assert mock_openai.await_count == 1
