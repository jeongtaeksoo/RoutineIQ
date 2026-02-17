from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.supabase_rest import SupabaseRestError


def _log_payload(date_value: str, *, meta: dict | None = None) -> dict:
    payload = {
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
        "note": "good session",
    }
    if meta is not None:
        payload["meta"] = meta
    return payload


def test_post_logs_creates_entry(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].side_effect = [
        {
            "id": "log-1",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": _log_payload("2026-02-15")["entries"],
            "note": "good session",
            "created_at": "2026-02-15T00:00:00+00:00",
            "updated_at": "2026-02-15T00:00:00+00:00",
        },
        {
            "id": "00000000-0000-4000-8000-000000000001",
            "current_streak": 1,
            "longest_streak": 1,
        },
    ]
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "log-1"
    assert body["date"] == "2026-02-15"
    assert supabase_mock["upsert_one"].await_count == 2
    profile_call = supabase_mock["upsert_one"].await_args_list[1].kwargs
    assert profile_call["table"] == "profiles"
    assert profile_call["on_conflict"] == "id"
    assert profile_call["row"]["current_streak"] == 1
    assert profile_call["row"]["longest_streak"] == 1


def test_post_logs_duplicate_date_uses_upsert_on_conflict(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].side_effect = [
        {
            "id": "log-1",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": _log_payload("2026-02-15")["entries"],
            "note": "first",
        },
        {
            "id": "00000000-0000-4000-8000-000000000001",
            "current_streak": 1,
            "longest_streak": 1,
        },
        {
            "id": "log-1",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": _log_payload("2026-02-15")["entries"],
            "note": "updated",
        },
        {
            "id": "00000000-0000-4000-8000-000000000001",
            "current_streak": 1,
            "longest_streak": 1,
        },
    ]
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    first = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))
    second_payload = _log_payload("2026-02-15")
    second_payload["note"] = "updated"
    second = authenticated_client.post("/api/logs", json=second_payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["note"] == "updated"
    assert supabase_mock["upsert_one"].await_count == 4
    call_conflicts = [
        call.kwargs["on_conflict"]
        for call in supabase_mock["upsert_one"].await_args_list
    ]
    assert call_conflicts.count("user_id,date") == 2
    assert call_conflicts.count("id") == 2


def test_get_logs_returns_saved_log(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["select"].return_value = [
        {
            "id": "log-2",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": _log_payload("2026-02-15")["entries"],
            "note": "from db",
            "meta": {"mood": "good"},
        }
    ]

    response = authenticated_client.get("/api/logs", params={"date": "2026-02-15"})

    assert response.status_code == 200
    assert response.json()["date"] == "2026-02-15"
    assert response.json()["note"] == "from db"
    assert response.json()["meta"] == {"mood": "good"}


def test_logs_requires_auth(client: TestClient) -> None:
    response = client.post("/api/logs", json=_log_payload("2026-02-15"))
    assert response.status_code == 401


def test_post_logs_updates_profile_streak_metrics(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].side_effect = [
        {
            "id": "log-5",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": _log_payload("2026-02-15")["entries"],
            "note": "good session",
        },
        {
            "id": "00000000-0000-4000-8000-000000000001",
            "current_streak": 5,
            "longest_streak": 5,
        },
    ]
    supabase_mock["select"].return_value = [
        {"date": "2026-02-11"},
        {"date": "2026-02-12"},
        {"date": "2026-02-13"},
        {"date": "2026-02-14"},
        {"date": "2026-02-15"},
    ]

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    profile_call = supabase_mock["upsert_one"].await_args_list[1].kwargs
    assert profile_call["table"] == "profiles"
    assert profile_call["on_conflict"] == "id"
    assert profile_call["row"]["current_streak"] == 5
    assert profile_call["row"]["longest_streak"] == 5


def test_post_logs_ignores_missing_streak_columns_until_migration_applied(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].side_effect = [
        {
            "id": "log-6",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": _log_payload("2026-02-15")["entries"],
            "note": "good session",
        },
        SupabaseRestError(
            status_code=400,
            code="42703",
            message='column "current_streak" does not exist',
        ),
    ]
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    assert response.json()["date"] == "2026-02-15"


def test_post_logs_persists_optional_daily_meta(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].side_effect = [
        {
            "id": "log-meta-1",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": _log_payload("2026-02-15")["entries"],
            "note": "good session",
            "meta": {"mood": "good", "sleep_quality": 4},
        },
        {
            "id": "00000000-0000-4000-8000-000000000001",
            "current_streak": 1,
            "longest_streak": 1,
        },
    ]
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post(
        "/api/logs",
        json=_log_payload(
            "2026-02-15",
            meta={"mood": "good", "sleep_quality": 4, "hydration_level": "ok"},
        ),
    )

    assert response.status_code == 200
    first_call = supabase_mock["upsert_one"].await_args_list[0].kwargs
    assert first_call["table"] == "activity_logs"
    assert first_call["row"]["meta"]["mood"] == "good"
    assert first_call["row"]["meta"]["sleep_quality"] == 4
    assert first_call["row"]["meta"]["hydration_level"] == "ok"


def test_post_logs_accepts_optional_entry_confidence(
    authenticated_client: TestClient, supabase_mock
) -> None:
    payload = _log_payload("2026-02-15")
    payload["entries"][0]["confidence"] = "low"
    supabase_mock["upsert_one"].side_effect = [
        {
            "id": "log-confidence-1",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": payload["entries"],
            "note": payload["note"],
            "meta": {},
        },
        {
            "id": "00000000-0000-4000-8000-000000000001",
            "current_streak": 1,
            "longest_streak": 1,
        },
    ]
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post("/api/logs", json=payload)

    assert response.status_code == 200
    first_call = supabase_mock["upsert_one"].await_args_list[0].kwargs
    assert first_call["row"]["entries"][0]["confidence"] == "low"


def test_post_logs_accepts_window_entry_without_exact_time(
    authenticated_client: TestClient, supabase_mock
) -> None:
    payload = {
        "date": "2026-02-15",
        "entries": [
            {
                "start": None,
                "end": None,
                "activity": "보고서 작성",
                "energy": None,
                "focus": None,
                "tags": ["문서"],
                "confidence": "low",
                "source_text": "하루종일 보고서를 썼다",
                "time_source": "window",
                "time_confidence": "low",
                "time_window": "afternoon",
                "crosses_midnight": False,
            }
        ],
        "note": "하루 회고",
        "meta": {"parse_issues": ["entry[1] time downgraded to null (no explicit time evidence)"]},
    }
    supabase_mock["upsert_one"].side_effect = [
        {
            "id": "log-window-1",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": payload["entries"],
            "note": payload["note"],
            "meta": payload["meta"],
        },
        {
            "id": "00000000-0000-4000-8000-000000000001",
            "current_streak": 1,
            "longest_streak": 1,
        },
    ]
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post("/api/logs", json=payload)

    assert response.status_code == 200
    first_call = supabase_mock["upsert_one"].await_args_list[0].kwargs
    assert first_call["row"]["entries"][0]["time_window"] == "afternoon"
    assert first_call["row"]["entries"][0]["start"] is None
    assert first_call["row"]["meta"]["parse_issues"]
