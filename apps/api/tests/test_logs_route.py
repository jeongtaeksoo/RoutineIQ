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


def _row(date_value: str, *, note: str = "good session", meta: dict | None = None) -> dict:
    return {
        "id": "log-1",
        "user_id": "00000000-0000-4000-8000-000000000001",
        "date": date_value,
        "entries": _log_payload(date_value)["entries"],
        "note": note,
        "meta": meta if meta is not None else {},
        "created_at": f"{date_value}T00:00:00+00:00",
        "updated_at": f"{date_value}T00:00:00+00:00",
    }


def _profile_row() -> dict:
    return {
        "id": "00000000-0000-4000-8000-000000000001",
        "current_streak": 1,
        "longest_streak": 1,
    }


# ── Happy-path: new row ────────────────────────────────────────────────────────

def test_post_logs_creates_entry(
    authenticated_client: TestClient, supabase_mock
) -> None:
    """PATCH returns 0 rows (no existing row) → INSERT creates it."""
    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].return_value = _row("2026-02-15")
    supabase_mock["upsert_one"].return_value = _profile_row()
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "log-1"
    assert body["date"] == "2026-02-15"
    assert supabase_mock["patch"].await_count == 1
    assert supabase_mock["insert_one"].await_count == 1
    # Profile streak upsert still happens
    assert supabase_mock["upsert_one"].await_count == 1
    profile_call = supabase_mock["upsert_one"].await_args_list[0].kwargs
    assert profile_call["table"] == "profiles"
    assert profile_call["on_conflict"] == "id"


# ── Happy-path: existing row ───────────────────────────────────────────────────

def test_post_logs_updates_existing_row_via_patch(
    authenticated_client: TestClient, supabase_mock
) -> None:
    """PATCH returns the updated row (existing row found and updated)."""
    updated_row = _row("2026-02-15", note="updated note")
    supabase_mock["patch"].return_value = [updated_row]
    supabase_mock["upsert_one"].return_value = _profile_row()
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    second_payload = _log_payload("2026-02-15")
    second_payload["note"] = "updated note"
    response = authenticated_client.post("/api/logs", json=second_payload)

    assert response.status_code == 200
    assert response.json()["note"] == "updated note"
    assert supabase_mock["patch"].await_count == 1
    # No INSERT needed when PATCH succeeds
    assert supabase_mock["insert_one"].await_count == 0


def test_post_logs_two_saves_same_date_both_succeed(
    authenticated_client: TestClient, supabase_mock
) -> None:
    """First save: PATCH → 0 rows → INSERT. Second save: PATCH → updated row."""
    first_row = _row("2026-02-15", note="first")
    second_row = _row("2026-02-15", note="updated")

    supabase_mock["patch"].side_effect = [
        [],        # first call: no existing row
        [second_row],  # second call: row now exists
    ]
    supabase_mock["insert_one"].return_value = first_row
    supabase_mock["upsert_one"].return_value = _profile_row()
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    first = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))
    second_payload = _log_payload("2026-02-15")
    second_payload["note"] = "updated"
    second = authenticated_client.post("/api/logs", json=second_payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["note"] == "updated"


# ── Race-condition: INSERT conflicts ──────────────────────────────────────────

def test_post_logs_insert_conflict_select_recovers(
    authenticated_client: TestClient, supabase_mock
) -> None:
    """PATCH → 0 rows, INSERT conflicts (race), SELECT finds the row."""
    existing_row = _row("2026-02-15", note="concurrent insert", meta={"mood": "neutral"})
    conflict = SupabaseRestError(
        status_code=409,
        code="23505",
        message='duplicate key value violates unique constraint "activity_logs_user_date_unique"',
    )

    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].side_effect = conflict
    supabase_mock["select"].side_effect = [
        [existing_row],  # race-condition recovery select
        [{"date": "2026-02-15"}],  # streak rows select
    ]
    supabase_mock["upsert_one"].return_value = _profile_row()

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    body = response.json()
    assert body["note"] == "concurrent insert"
    assert supabase_mock["insert_one"].await_count == 1
    assert supabase_mock["select"].await_count >= 1


def test_post_logs_insert_conflict_no_row_found_raises(
    authenticated_client: TestClient, supabase_mock
) -> None:
    """PATCH → 0 rows, INSERT conflicts, SELECT also finds nothing → propagates error."""
    conflict = SupabaseRestError(
        status_code=409,
        code="23505",
        message='duplicate key value violates unique constraint "activity_logs_user_date_unique"',
    )

    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].side_effect = conflict
    supabase_mock["select"].return_value = []  # no row found

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 409


# ── Meta column fallback ───────────────────────────────────────────────────────

def test_post_logs_meta_column_missing_patch_falls_back(
    authenticated_client: TestClient, supabase_mock
) -> None:
    """PATCH with meta fails (column missing) → retries without meta → inserts."""
    meta_error = SupabaseRestError(
        status_code=400,
        code="42703",
        message='column "meta" does not exist',
    )
    row_no_meta = {
        "id": "log-meta-fb",
        "user_id": "00000000-0000-4000-8000-000000000001",
        "date": "2026-02-15",
        "entries": _log_payload("2026-02-15")["entries"],
        "note": "good session",
    }

    supabase_mock["patch"].side_effect = [
        meta_error,  # first patch (with meta) fails
        [],          # second patch (without meta) → no row
    ]
    supabase_mock["insert_one"].return_value = row_no_meta
    supabase_mock["upsert_one"].return_value = _profile_row()
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post(
        "/api/logs",
        json=_log_payload("2026-02-15", meta={"mood": "good"}),
    )

    assert response.status_code == 200
    assert response.json()["id"] == "log-meta-fb"


# ── GET ────────────────────────────────────────────────────────────────────────

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


# ── Streak / profile side-effects ─────────────────────────────────────────────

def test_post_logs_updates_profile_streak_metrics(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].return_value = _row("2026-02-15")
    supabase_mock["upsert_one"].return_value = {
        "id": "00000000-0000-4000-8000-000000000001",
        "current_streak": 5,
        "longest_streak": 5,
    }
    supabase_mock["select"].return_value = [
        {"date": "2026-02-11"},
        {"date": "2026-02-12"},
        {"date": "2026-02-13"},
        {"date": "2026-02-14"},
        {"date": "2026-02-15"},
    ]

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    profile_call = supabase_mock["upsert_one"].await_args_list[0].kwargs
    assert profile_call["table"] == "profiles"
    assert profile_call["on_conflict"] == "id"
    assert profile_call["row"]["current_streak"] == 5
    assert profile_call["row"]["longest_streak"] == 5


def test_post_logs_ignores_missing_streak_columns_until_migration_applied(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].return_value = _row("2026-02-15")
    supabase_mock["upsert_one"].side_effect = SupabaseRestError(
        status_code=400,
        code="42703",
        message='column "current_streak" does not exist',
    )
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    assert response.json()["date"] == "2026-02-15"


def test_post_logs_ignores_profile_conflict_error(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].return_value = _row("2026-02-15")
    supabase_mock["upsert_one"].side_effect = SupabaseRestError(
        status_code=409,
        code="23505",
        message='duplicate key value violates unique constraint "profiles_pkey"',
    )
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    assert response.json()["id"] == "log-1"


def test_post_logs_returns_200_when_streak_select_side_effect_fails(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].return_value = _row("2026-02-15")
    supabase_mock["select"].side_effect = SupabaseRestError(
        status_code=500,
        code="XX000",
        message="temporary read failure",
    )
    log_mock = AsyncMock(return_value=None)
    monkeypatch.setattr("app.routes.logs.log_system_error", log_mock)

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    assert response.json()["id"] == "log-1"
    assert log_mock.await_count == 1


def test_post_logs_returns_200_when_profile_upsert_side_effect_fails(
    authenticated_client: TestClient, supabase_mock, monkeypatch
) -> None:
    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].return_value = _row("2026-02-15")
    supabase_mock["upsert_one"].side_effect = SupabaseRestError(
        status_code=400,
        code="23502",
        message='null value in column "age_group" violates not-null constraint',
    )
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]
    log_mock = AsyncMock(return_value=None)
    monkeypatch.setattr("app.routes.logs.log_system_error", log_mock)

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    assert response.json()["id"] == "log-1"
    assert log_mock.await_count == 1


# ── Optional meta / entry fields ──────────────────────────────────────────────

def test_post_logs_persists_optional_daily_meta(
    authenticated_client: TestClient, supabase_mock
) -> None:
    row = _row("2026-02-15", meta={"mood": "good", "sleep_quality": 4})
    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].return_value = row
    supabase_mock["upsert_one"].return_value = _profile_row()
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post(
        "/api/logs",
        json=_log_payload(
            "2026-02-15",
            meta={"mood": "good", "sleep_quality": 4, "hydration_level": "ok"},
        ),
    )

    assert response.status_code == 200
    insert_call = supabase_mock["insert_one"].await_args_list[0].kwargs
    assert insert_call["table"] == "activity_logs"
    assert insert_call["row"]["meta"]["mood"] == "good"
    assert insert_call["row"]["meta"]["sleep_quality"] == 4
    assert insert_call["row"]["meta"]["hydration_level"] == "ok"


def test_post_logs_accepts_optional_entry_confidence(
    authenticated_client: TestClient, supabase_mock
) -> None:
    payload = _log_payload("2026-02-15")
    payload["entries"][0]["confidence"] = "low"
    row = _row("2026-02-15")
    row["entries"] = payload["entries"]
    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].return_value = row
    supabase_mock["upsert_one"].return_value = _profile_row()
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post("/api/logs", json=payload)

    assert response.status_code == 200
    insert_call = supabase_mock["insert_one"].await_args_list[0].kwargs
    assert insert_call["row"]["entries"][0]["confidence"] == "low"


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
    row = {
        "id": "log-window-1",
        "user_id": "00000000-0000-4000-8000-000000000001",
        "date": "2026-02-15",
        "entries": payload["entries"],
        "note": payload["note"],
        "meta": payload["meta"],
    }
    supabase_mock["patch"].return_value = []
    supabase_mock["insert_one"].return_value = row
    supabase_mock["upsert_one"].return_value = _profile_row()
    supabase_mock["select"].return_value = [{"date": "2026-02-15"}]

    response = authenticated_client.post("/api/logs", json=payload)

    assert response.status_code == 200
    insert_call = supabase_mock["insert_one"].await_args_list[0].kwargs
    assert insert_call["row"]["entries"][0]["time_window"] == "afternoon"
    assert insert_call["row"]["entries"][0]["start"] is None
    assert insert_call["row"]["meta"]["parse_issues"]
