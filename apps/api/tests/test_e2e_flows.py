from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import app.routes.analyze as analyze_route
import app.routes.parse as parse_route


def _eq(value: object) -> str | None:
    if isinstance(value, str) and value.startswith("eq."):
        return value[3:]
    return None


def _gte(value: object) -> str | None:
    if isinstance(value, str) and value.startswith("gte."):
        return value[4:]
    return None


def _lte(value: object) -> str | None:
    if isinstance(value, str) and value.startswith("lte."):
        return value[4:]
    return None


def _entry(start: str, end: str, activity: str, *, energy: int = 4, focus: int = 4) -> dict:
    return {
        "start": start,
        "end": end,
        "activity": activity,
        "energy": energy,
        "focus": focus,
        "tags": [],
    }


def _valid_ai_report() -> dict:
    return {
        "schema_version": 2,
        "summary": "Generated report from e2e test.",
        "productivity_peaks": [
            {"start": "09:00", "end": "10:00", "reason": "High focus"}
        ],
        "failure_patterns": [
            {
                "pattern": "Context switching",
                "trigger": "Frequent meetings",
                "fix": "Add transition buffers",
            }
        ],
        "tomorrow_routine": [
            {
                "start": "09:00",
                "end": "10:00",
                "activity": "Focus Window",
                "goal": "Finish one key task",
            }
        ],
        "if_then_rules": [
            {"if": "I get distracted", "then": "Take a 5-minute reset"}
        ],
        "coach_one_liner": "Protect your first focus block.",
        "yesterday_plan_vs_actual": {
            "comparison_note": "No previous plan data to compare.",
            "top_deviation": "NO_PREVIOUS_PLAN",
        },
        "wellbeing_insight": {
            "burnout_risk": "medium",
            "energy_curve_forecast": "Morning peak expected.",
            "note": "Keep one recovery buffer.",
        },
        "micro_advice": [
            {
                "action": "2-minute breathing",
                "when": "Before meetings",
                "reason": "Lower stress",
                "duration_min": 2,
            }
        ],
        "weekly_pattern_insight": "Trend remains stable.",
    }


def _install_inmemory_supabase(
    supabase_mock,
    *,
    initial_profiles: dict[str, dict] | None = None,
    initial_logs: dict[tuple[str, str], dict] | None = None,
    initial_reports: dict[tuple[str, str], dict] | None = None,
) -> dict:
    profiles: dict[str, dict] = deepcopy(initial_profiles or {})
    logs: dict[tuple[str, str], dict] = deepcopy(initial_logs or {})
    reports: dict[tuple[str, str], dict] = deepcopy(initial_reports or {})

    def _log_ts(date_value: str) -> str:
        return f"{date_value}T00:00:00+00:00"

    def _report_ts(date_value: str) -> str:
        return f"{date_value}T12:00:00+00:00"

    async def _select(*, table: str, bearer_token: str, params: dict) -> list[dict]:
        if table == "profiles":
            user_id = _eq(params.get("id"))
            if not user_id:
                return []
            row = profiles.get(user_id)
            return [deepcopy(row)] if row else []

        if table == "activity_logs":
            if isinstance(params.get("and"), str):
                expr = str(params["and"]).strip().strip("()")
                parts = [p.strip() for p in expr.split(",")]
                user_id = ""
                from_date = "0000-01-01"
                to_date = "9999-12-31"
                for part in parts:
                    if part.startswith("user_id.eq."):
                        user_id = part[len("user_id.eq.") :]
                    elif part.startswith("date.gte."):
                        from_date = part[len("date.gte.") :]
                    elif part.startswith("date.lte."):
                        to_date = part[len("date.lte.") :]
                rows = [
                    deepcopy(r)
                    for (uid, day), r in logs.items()
                    if uid == user_id and from_date <= day <= to_date
                ]
                rows.sort(key=lambda x: str(x.get("date") or ""))
                return rows

            user_id = _eq(params.get("user_id"))
            if not user_id:
                return []
            date_eq = _eq(params.get("date"))
            date_gte = _gte(params.get("date"))
            date_lte = _lte(params.get("date"))

            if date_eq:
                row = logs.get((user_id, date_eq))
                return [deepcopy(row)] if row else []

            rows = [deepcopy(r) for (uid, _day), r in logs.items() if uid == user_id]
            if date_gte:
                rows = [r for r in rows if str(r.get("date") or "") >= date_gte]
            if date_lte:
                rows = [r for r in rows if str(r.get("date") or "") <= date_lte]

            order = params.get("order")
            if order == "date.desc":
                rows.sort(key=lambda x: str(x.get("date") or ""), reverse=True)
            elif order == "date.asc":
                rows.sort(key=lambda x: str(x.get("date") or ""))

            limit = params.get("limit")
            if isinstance(limit, int) and limit > 0:
                rows = rows[:limit]
            return rows

        if table == "ai_reports":
            user_id = _eq(params.get("user_id"))
            if not user_id:
                return []
            date_eq = _eq(params.get("date"))

            rows = [deepcopy(r) for (uid, _day), r in reports.items() if uid == user_id]
            if date_eq:
                rows = [r for r in rows if str(r.get("date") or "") == date_eq]
            order = params.get("order")
            if order == "date.desc":
                rows.sort(key=lambda x: str(x.get("date") or ""), reverse=True)
            elif order == "date.asc":
                rows.sort(key=lambda x: str(x.get("date") or ""))
            limit = params.get("limit")
            if isinstance(limit, int) and limit > 0:
                rows = rows[:limit]
            return rows

        return []

    async def _upsert_one(
        *, table: str, bearer_token: str, row: dict, on_conflict: str
    ) -> dict:
        if table == "activity_logs":
            user_id = str(row.get("user_id") or "")
            day = str(row.get("date") or "")
            key = (user_id, day)
            prev = logs.get(key, {})
            merged = {
                **prev,
                **deepcopy(row),
                "id": prev.get("id") or f"log-{len(logs) + 1}",
                "created_at": prev.get("created_at") or _log_ts(day),
                "updated_at": _log_ts(day),
            }
            logs[key] = merged
            return deepcopy(merged)

        if table == "profiles":
            user_id = str(row.get("id") or "")
            prev = profiles.get(user_id, {"id": user_id})
            merged = {**prev, **deepcopy(row)}
            profiles[user_id] = merged
            return deepcopy(merged)

        if table == "ai_reports":
            user_id = str(row.get("user_id") or "")
            day = str(row.get("date") or "")
            key = (user_id, day)
            prev = reports.get(key, {})
            merged = {
                **prev,
                **deepcopy(row),
                "created_at": prev.get("created_at") or _report_ts(day),
                "updated_at": _report_ts(day),
            }
            reports[key] = merged
            return deepcopy(merged)

        return deepcopy(row)

    async def _rpc(*, fn_name: str, bearer_token: str, params: dict | None = None) -> list[dict]:
        if fn_name == "cohort_trend_summary":
            return [
                {
                    "cohort_size": 42,
                    "active_users": 42,
                    "focus_window_rate": 65.0,
                    "rebound_rate": 48.0,
                    "recovery_buffer_day_rate": 30.0,
                    "focus_window_numerator": 65,
                    "focus_window_denominator": 100,
                    "rebound_numerator": 48,
                    "rebound_denominator": 100,
                    "recovery_day_numerator": 30,
                    "recovery_day_denominator": 100,
                }
            ]
        return []

    supabase_mock["select"].side_effect = _select
    supabase_mock["upsert_one"].side_effect = _upsert_one
    supabase_mock["rpc"].side_effect = _rpc

    return {
        "profiles": profiles,
        "logs": logs,
        "reports": reports,
    }


def _mock_analyze_runtime(monkeypatch, *, openai_result: Callable[[], dict] | None = None) -> AsyncMock:
    monkeypatch.setattr(
        analyze_route,
        "get_subscription_info",
        AsyncMock(return_value=type("Sub", (), {"plan": "free"})()),
    )
    monkeypatch.setattr(
        analyze_route,
        "count_daily_analyze_calls",
        AsyncMock(return_value=0),
    )
    monkeypatch.setattr(
        analyze_route,
        "insert_usage_event",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        analyze_route,
        "cleanup_expired_reports",
        AsyncMock(return_value=None),
    )
    result = openai_result() if openai_result else _valid_ai_report()
    openai_mock = AsyncMock(
        return_value=(
            result,
            {"input_tokens": 100, "output_tokens": 200, "total_tokens": 300},
        )
    )
    monkeypatch.setattr(analyze_route, "call_openai_structured", openai_mock)
    return openai_mock


def test_new_user_full_flow_save_parse_save_analyze_report(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    user_id = "00000000-0000-4000-8000-000000000001"
    _install_inmemory_supabase(
        supabase_mock,
        initial_profiles={
            user_id: {
                "id": user_id,
                "age_group": "25_34",
                "gender": "prefer_not_to_say",
                "job_family": "office_worker",
                "work_mode": "fixed",
                "trend_opt_in": True,
                "trend_compare_by": ["age_group", "job_family", "work_mode"],
            }
        },
    )

    parse_mock = AsyncMock(
        return_value=(
            {
                "entries": [
                    {
                        "start": "09:00",
                        "end": "10:00",
                        "activity": "Deep work",
                        "energy": 4,
                        "focus": 5,
                        "note": "Core feature implementation",
                        "tags": ["focus"],
                        "confidence": "high",
                    }
                ],
                "meta": {
                    "mood": "good",
                    "sleep_quality": 4,
                    "sleep_hours": 7.0,
                    "stress_level": 2,
                },
                "ai_note": "Parsed from diary successfully.",
            },
            {"input_tokens": 20, "output_tokens": 40, "total_tokens": 60},
        )
    )
    monkeypatch.setattr(parse_route, "call_openai_structured", parse_mock)
    analyze_openai_mock = _mock_analyze_runtime(monkeypatch)

    save_raw = authenticated_client.post(
        "/api/logs",
        json={"date": "2026-02-15", "entries": [], "note": "Worked on core tasks and took a walk."},
    )
    parse_resp = authenticated_client.post(
        "/api/parse-diary",
        json={
            "date": "2026-02-15",
            "diary_text": "At 9 I did deep work, had meetings after lunch, and went for a walk.",
        },
    )
    parsed = parse_resp.json()
    entries_for_save = [
        {
            k: v
            for k, v in entry.items()
            if k in {"start", "end", "activity", "energy", "focus", "confidence", "tags", "note"}
        }
        for entry in parsed["entries"]
    ]
    save_parsed = authenticated_client.post(
        "/api/logs",
        json={
            "date": "2026-02-15",
            "entries": entries_for_save,
            "note": "Worked on core tasks and took a walk.",
            "meta": parsed["meta"],
        },
    )
    analyze_resp = authenticated_client.post("/api/analyze", json={"date": "2026-02-15"})
    report_resp = authenticated_client.get("/api/reports", params={"date": "2026-02-15"})

    assert save_raw.status_code == 200
    assert parse_resp.status_code == 200
    assert save_parsed.status_code == 200
    assert save_parsed.json()["entries"][0]["confidence"] == "high"
    assert analyze_resp.status_code == 200
    assert analyze_resp.json()["cached"] is False
    assert report_resp.status_code == 200
    assert report_resp.json()["report"]["summary"]
    assert parse_mock.await_count == 1
    assert analyze_openai_mock.await_count == 1


def test_returning_user_flow_reuses_cached_report(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    user_id = "00000000-0000-4000-8000-000000000001"
    date_value = "2026-02-15"
    _install_inmemory_supabase(
        supabase_mock,
        initial_profiles={
            user_id: {
                "id": user_id,
                "age_group": "25_34",
                "gender": "prefer_not_to_say",
                "job_family": "office_worker",
                "work_mode": "fixed",
                "trend_opt_in": True,
                "trend_compare_by": ["age_group", "job_family", "work_mode"],
            }
        },
        initial_logs={
            (user_id, date_value): {
                "id": "log-1",
                "user_id": user_id,
                "date": date_value,
                "entries": [_entry("09:00", "10:00", "Deep work")],
                "note": "existing log",
                "meta": {},
                "created_at": f"{date_value}T00:00:00+00:00",
                "updated_at": f"{date_value}T00:00:00+00:00",
            }
        },
        initial_reports={
            (user_id, date_value): {
                "user_id": user_id,
                "date": date_value,
                "report": _valid_ai_report(),
                "model": "gpt-4o-mini|loc=ko",
                "created_at": f"{date_value}T12:00:00+00:00",
                "updated_at": f"{date_value}T12:00:00+00:00",
            }
        },
    )

    analyze_openai_mock = _mock_analyze_runtime(monkeypatch)

    get_log = authenticated_client.get("/api/logs", params={"date": date_value})
    analyze_resp = authenticated_client.post("/api/analyze", json={"date": date_value})

    assert get_log.status_code == 200
    assert get_log.json()["entries"]
    assert analyze_resp.status_code == 200
    assert analyze_resp.json()["cached"] is True
    assert analyze_openai_mock.await_count == 0


def test_preferences_and_cohort_flow_uses_updated_profile_filters(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    user_id = "00000000-0000-4000-8000-000000000001"
    _install_inmemory_supabase(
        supabase_mock,
        initial_profiles={
            user_id: {
                "id": user_id,
                "age_group": "unknown",
                "gender": "unknown",
                "job_family": "unknown",
                "work_mode": "unknown",
                "trend_opt_in": False,
                "trend_compare_by": ["age_group", "job_family", "work_mode"],
            }
        },
        initial_logs={
            (user_id, "2026-02-15"): {
                "id": "log-1",
                "user_id": user_id,
                "date": "2026-02-15",
                "entries": [_entry("09:00", "10:00", "Deep work")],
                "note": "log",
                "meta": {},
                "created_at": "2026-02-15T00:00:00+00:00",
                "updated_at": "2026-02-15T00:00:00+00:00",
            }
        },
    )

    put_profile = authenticated_client.put(
        "/api/preferences/profile",
        json={
            "age_group": "25_34",
            "gender": "prefer_not_to_say",
            "job_family": "office_worker",
            "work_mode": "fixed",
            "trend_opt_in": True,
            "trend_compare_by": ["age_group", "job_family", "work_mode"],
            "goal_keyword": "deep",
            "goal_minutes_per_day": 90,
        },
    )
    cohort_resp = authenticated_client.get("/api/trends/cohort")

    assert put_profile.status_code == 200
    assert cohort_resp.status_code == 200
    body = cohort_resp.json()
    assert body["enabled"] is True
    assert body["filters"]["job_family"] == "office_worker"

    rpc_params = supabase_mock["rpc"].await_args.kwargs["params"]
    assert rpc_params["p_job_family"] == "office_worker"
    assert rpc_params["p_work_mode"] == "fixed"


def test_multi_day_trend_flow_posts_7_days_and_returns_weekly_insights(
    authenticated_client: TestClient, supabase_mock
) -> None:
    user_id = "00000000-0000-4000-8000-000000000001"
    _install_inmemory_supabase(
        supabase_mock,
        initial_profiles={
            user_id: {
                "id": user_id,
                "age_group": "25_34",
                "gender": "prefer_not_to_say",
                "job_family": "office_worker",
                "work_mode": "fixed",
                "trend_opt_in": True,
                "trend_compare_by": ["age_group", "job_family", "work_mode"],
                "goal_keyword": "deep",
                "goal_minutes_per_day": 60,
            }
        },
    )

    days = [
        "2026-02-09",
        "2026-02-10",
        "2026-02-11",
        "2026-02-12",
        "2026-02-13",
        "2026-02-14",
        "2026-02-15",
    ]
    for day in days:
        resp = authenticated_client.post(
            "/api/logs",
            json={
                "date": day,
                "entries": [_entry("09:00", "10:00", "Deep work")],
                "note": f"log-{day}",
            },
        )
        assert resp.status_code == 200

    weekly = authenticated_client.get(
        "/api/insights/weekly",
        params={"from": "2026-02-09", "to": "2026-02-15"},
    )

    assert weekly.status_code == 200
    body = weekly.json()
    assert body["weekly"]["days_logged"] == 7
    assert body["streak"]["current"] == 7
    assert body["streak"]["longest"] == 7
    assert len(body["trend"]["series"]) == 7
