from __future__ import annotations

from fastapi.testclient import TestClient


def _entry(start: str, end: str, activity: str) -> dict:
    return {
        "start": start,
        "end": end,
        "activity": activity,
        "energy": 4,
        "focus": 4,
        "tags": [],
    }


def test_weekly_insights_includes_streak_and_trend(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].side_effect = [
        [
            {
                "goal_keyword": "deep",
                "goal_minutes_per_day": 90,
            }
        ],
        [
            {"date": "2026-02-11"},
            {"date": "2026-02-12"},
            {"date": "2026-02-13"},
            {"date": "2026-02-14"},
            {"date": "2026-02-15"},
        ],
        [
            {"date": "2026-02-09", "entries": [_entry("09:00", "10:00", "Deep work")]},
            {"date": "2026-02-10", "entries": [_entry("09:00", "10:00", "Deep work")]},
            {
                "date": "2026-02-11",
                "entries": [
                    _entry("09:00", "11:00", "Deep work"),
                    _entry("13:00", "13:30", "Meeting"),
                ],
            },
            {"date": "2026-02-13", "entries": [_entry("08:00", "09:00", "Deep work")]},
            {"date": "2026-02-14", "entries": [_entry("08:00", "10:00", "Deep work")]},
            {
                "date": "2026-02-15",
                "entries": [
                    _entry("09:00", "11:00", "Deep work"),
                    _entry("14:00", "15:00", "deep review"),
                ],
            },
        ],
    ]

    response = authenticated_client.get(
        "/api/insights/weekly",
        params={"from": "2026-02-09", "to": "2026-02-15"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["streak"]["current"] == 5
    assert body["streak"]["longest"] == 5
    assert body["weekly"]["days_logged"] == 6
    assert body["weekly"]["days_total"] == 7
    assert body["trend"]["pattern"] == "improving"
    assert body["trend"]["deep_minutes_change_pct"] == 50.0
    assert len(body["trend"]["series"]) == 7


def test_weekly_insights_resets_current_streak_when_today_missing(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].side_effect = [
        [],
        [
            {"date": "2026-02-09"},
            {"date": "2026-02-10"},
            {"date": "2026-02-11"},
            {"date": "2026-02-12"},
            {"date": "2026-02-13"},
        ],
        [],
    ]

    response = authenticated_client.get(
        "/api/insights/weekly",
        params={"from": "2026-02-09", "to": "2026-02-15"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["streak"]["current"] == 0
    assert body["streak"]["longest"] == 5


def test_weekly_insights_rejects_date_window_over_31_days(
    authenticated_client: TestClient,
) -> None:
    response = authenticated_client.get(
        "/api/insights/weekly",
        params={"from": "2026-01-01", "to": "2026-02-15"},
    )
    assert response.status_code == 422
