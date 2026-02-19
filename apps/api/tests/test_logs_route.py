from __future__ import annotations

from unittest.mock import AsyncMock

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


def test_post_logs_conflict_409_recovers_from_existing_row(
    authenticated_client: TestClient, supabase_mock
) -> None:
    conflict = SupabaseRestError(
        status_code=409,
        code="23505",
        message='duplicate key value violates unique constraint "activity_logs_user_id_date_key"',
    )
    existing_row = {
        "id": "log-existing-1",
        "user_id": "00000000-0000-4000-8000-000000000001",
        "date": "2026-02-15",
        "entries": _log_payload("2026-02-15")["entries"],
        "note": "already saved",
        "meta": {"mood": "neutral"},
        "created_at": "2026-02-15T00:00:00+00:00",
        "updated_at": "2026-02-15T00:00:00+00:00",
    }
    supabase_mock["upsert_one"].side_effect = [
        conflict,  # activity_logs first attempt
        conflict,  # activity_logs second attempt
        {  # profiles upsert
            "id": "00000000-0000-4000-8000-000000000001",
            "current_streak": 1,
            "longest_streak": 1,
        },
    ]
    supabase_mock["select"].side_effect = [
        [existing_row],  # conflict recovery select
        [{"date": "2026-02-15"}],  # streak rows select
    ]

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "log-existing-1"
    assert body["note"] == "already saved"
    assert supabase_mock["upsert_one"].await_count == 3


def test_post_logs_conflict_409_falls_back_to_insert_when_select_empty(
    authenticated_client: TestClient, supabase_mock
) -> None:
    conflict = SupabaseRestError(
        status_code=409,
        code="23505",
        message='duplicate key value violates unique constraint "activity_logs_user_id_date_key"',
    )
    inserted_row = {
        "id": "log-inserted-1",
        "user_id": "00000000-0000-4000-8000-000000000001",
        "date": "2026-02-15",
        "entries": _log_payload("2026-02-15")["entries"],
        "note": "insert fallback",
        "meta": {"mood": "neutral"},
    }
    supabase_mock["upsert_one"].side_effect = [
        conflict,  # activity_logs first upsert
        conflict,  # activity_logs second upsert
        {  # profiles upsert
            "id": "00000000-0000-4000-8000-000000000001",
            "current_streak": 1,
            "longest_streak": 1,
        },
    ]
    supabase_mock["select"].side_effect = [
        [],  # conflict recovery select: no row found
        [{"date": "2026-02-15"}],  # streak rows select
    ]
    supabase_mock["insert_one"].return_value = inserted_row

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "log-inserted-1"
    assert supabase_mock["insert_one"].await_count == 1


def test_post_logs_conflict_409_route_level_recovers_with_existing_id_upsert(
    authenticated_client: TestClient, supabase_mock
) -> None:
    conflict = SupabaseRestError(
        status_code=409,
        code="23505",
        message='duplicate key value violates unique constraint "activity_logs_user_id_date_key"',
    )
    existing_row = {
        "id": "log-existing-2",
        "user_id": "00000000-0000-4000-8000-000000000001",
        "date": "2026-02-15",
        "entries": _log_payload("2026-02-15")["entries"],
        "note": "old note",
        "meta": {"mood": "neutral"},
    }
    refreshed_row = {
        "id": "log-existing-2",
        "user_id": "00000000-0000-4000-8000-000000000001",
        "date": "2026-02-15",
        "entries": _log_payload("2026-02-15")["entries"],
        "note": "good session",
        "meta": {"mood": "good"},
    }

    supabase_mock["upsert_one"].side_effect = [
        conflict,  # activity_logs first upsert
        conflict,  # activity_logs second upsert
        refreshed_row,  # route-level fallback: update existing by id
        {  # profiles upsert
            "id": "00000000-0000-4000-8000-000000000001",
            "current_streak": 1,
            "longest_streak": 1,
        },
    ]
    supabase_mock["insert_one"].side_effect = [
        conflict,  # insert fallback also conflicts
    ]
    supabase_mock["select"].side_effect = [
        [],  # helper recovery select after upsert conflicts
        [],  # helper recovery select after insert conflict
        [existing_row],  # route-level recovery select
        [{"date": "2026-02-15"}],  # streak rows select
    ]

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "log-existing-2"
    assert body["note"] == "good session"
    assert supabase_mock["upsert_one"].await_count == 4
    route_level_upsert_call = supabase_mock["upsert_one"].await_args_list[2].kwargs
    assert route_level_upsert_call["on_conflict"] == "id"
    assert route_level_upsert_call["row"]["id"] == "log-existing-2"


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


def test_post_logs_ignores_profile_conflict_error(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].side_effect = [
        {
            "id": "log-7",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": _log_payload("2026-02-15")["entries"],
            "note": "good session",
            "meta": {},
        },
        SupabaseRestError(
            status_code=409,
            code="23505",
            message='duplicate key value violates unique constraint "profiles_pkey"',
        ),
    ]
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    assert response.json()["id"] == "log-7"


def test_post_logs_returns_200_when_streak_select_side_effect_fails(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    supabase_mock["upsert_one"].return_value = {
        "id": "log-sidefx-1",
        "user_id": "00000000-0000-4000-8000-000000000001",
        "date": "2026-02-15",
        "entries": _log_payload("2026-02-15")["entries"],
        "note": "good session",
        "meta": {},
    }
    supabase_mock["select"].side_effect = SupabaseRestError(
        status_code=500,
        code="XX000",
        message="temporary read failure",
    )
    log_mock = AsyncMock(return_value=None)
    monkeypatch.setattr("app.routes.logs.log_system_error", log_mock)

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    assert response.json()["id"] == "log-sidefx-1"
    assert log_mock.await_count == 1


def test_post_logs_returns_200_when_profile_upsert_side_effect_fails(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    supabase_mock["upsert_one"].side_effect = [
        {
            "id": "log-sidefx-2",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": _log_payload("2026-02-15")["entries"],
            "note": "good session",
            "meta": {},
        },
        SupabaseRestError(
            status_code=400,
            code="23502",
            message='null value in column "age_group" violates not-null constraint',
        ),
    ]
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]
    log_mock = AsyncMock(return_value=None)
    monkeypatch.setattr("app.routes.logs.log_system_error", log_mock)

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    assert response.json()["id"] == "log-sidefx-2"
    assert log_mock.await_count == 1


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
