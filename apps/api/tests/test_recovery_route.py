from __future__ import annotations

from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

import app.routes.recovery as recovery_route
from app.services.supabase_rest import SupabaseRestError


@pytest.fixture
def recovery_flag_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(recovery_route.settings, "recovery_v1_enabled", True)


@pytest.fixture
def recovery_flag_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(recovery_route.settings, "recovery_v1_enabled", False)


def _open_row(session_id: str, lapse_start: datetime) -> dict:
    return {
        "id": session_id,
        "status": "open",
        "lapse_start_ts": lapse_start.isoformat(),
        "protocol_type": "mva_ladder",
        "intensity_level": 2,
        "rt_min": None,
        "created_at": lapse_start.isoformat(),
        "recovery_completed_at": None,
    }


def _completed_row(session_id: str, lapse_start: datetime, rt_min: int) -> dict:
    completed_at = lapse_start + timedelta(minutes=rt_min)
    return {
        "id": session_id,
        "status": "completed",
        "lapse_start_ts": lapse_start.isoformat(),
        "protocol_type": "mva_ladder",
        "intensity_level": 2,
        "rt_min": rt_min,
        "created_at": lapse_start.isoformat(),
        "recovery_completed_at": completed_at.isoformat(),
    }


def test_recovery_route_returns_404_when_flag_off(
    authenticated_client: TestClient,
    recovery_flag_off,
) -> None:
    response = authenticated_client.post("/api/recovery/lapse", json={})

    assert response.status_code == 404


def test_recovery_active_returns_empty_when_flag_off(
    authenticated_client: TestClient,
    recovery_flag_off,
) -> None:
    response = authenticated_client.get("/api/recovery/active")

    assert response.status_code == 200
    body = response.json()
    assert body["has_open_session"] is False
    assert body["session_id"] is None


def test_recovery_nudge_returns_empty_when_flags_off(
    authenticated_client: TestClient,
    recovery_flag_off,
) -> None:
    response = authenticated_client.get("/api/recovery/nudge")

    assert response.status_code == 200
    body = response.json()
    assert body["has_nudge"] is False
    assert body["nudge"] is None


def test_recovery_lapse_returns_existing_open_session(
    authenticated_client: TestClient,
    supabase_mock,
    recovery_flag_on,
) -> None:
    lapse_start = datetime(2026, 2, 17, 9, 0, tzinfo=timezone.utc)
    supabase_mock["select"].return_value = [_open_row("sess-open-1", lapse_start)]

    response = authenticated_client.post("/api/recovery/lapse", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] == "sess-open-1"
    assert body["created"] is False
    assert body["status"] == "open"
    assert supabase_mock["insert_one"].await_count == 0


def test_recovery_lapse_creates_session_and_tracks_event(
    authenticated_client: TestClient,
    supabase_mock,
    recovery_flag_on,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lapse_start = datetime(2026, 2, 17, 10, 15, tzinfo=timezone.utc)
    monkeypatch.setattr(recovery_route, "_utc_now", lambda: lapse_start)

    supabase_mock["select"].return_value = []
    supabase_mock["insert_one"].return_value = {
        "id": "sess-new-1",
        "status": "open",
        "lapse_start_ts": lapse_start.isoformat(),
    }

    response = authenticated_client.post("/api/recovery/lapse", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "open"
    assert body["created"] is True
    assert body["session_id"]
    assert supabase_mock["insert_one"].await_count == 1
    assert supabase_mock["upsert_one"].await_count == 1


@pytest.mark.parametrize(
    "message",
    [
        'duplicate key value violates unique constraint "recovery_sessions_one_open_per_user"',
        "recovery_sessions_one_open_per_user",
    ],
)
def test_recovery_lapse_handles_unique_open_conflict_by_returning_existing(
    authenticated_client: TestClient,
    supabase_mock,
    recovery_flag_on,
    message: str,
) -> None:
    lapse_start = datetime(2026, 2, 17, 8, 0, tzinfo=timezone.utc)
    supabase_mock["select"].side_effect = [
        [],
        [_open_row("sess-conflict-1", lapse_start)],
    ]
    supabase_mock["insert_one"].side_effect = SupabaseRestError(
        status_code=409,
        code="23505",
        message=message,
    )

    response = authenticated_client.post("/api/recovery/lapse", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] == "sess-conflict-1"
    assert body["created"] is False


def test_recovery_complete_computes_rt_floor_and_prevents_duplicate_event(
    authenticated_client: TestClient,
    supabase_mock,
    recovery_flag_on,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lapse_start = datetime(2026, 2, 17, 8, 0, tzinfo=timezone.utc)
    fixed_now = datetime(2026, 2, 17, 10, 5, 59, tzinfo=timezone.utc)
    monkeypatch.setattr(recovery_route, "_utc_now", lambda: fixed_now)

    select_calls = {"session": 0}

    async def _select(*, table: str, bearer_token: str, params: dict):
        if table == "recovery_sessions":
            select_calls["session"] += 1
            if select_calls["session"] == 1:
                return [_open_row("sess-rt-1", lapse_start)]
            return [_completed_row("sess-rt-1", lapse_start, 125)]
        if table == "user_recovery_state":
            return []
        return []

    supabase_mock["select"].side_effect = _select
    supabase_mock["upsert_one"].return_value = {
        "id": "sess-rt-1",
        "status": "completed",
        "rt_min": 125,
    }

    first = authenticated_client.post(
        "/api/recovery/complete",
        json={"session_id": "sess-rt-1"},
    )
    second = authenticated_client.post(
        "/api/recovery/complete",
        json={"session_id": "sess-rt-1"},
    )

    assert first.status_code == 200
    assert first.json()["rt_min"] == 125
    assert second.status_code == 200
    assert second.json()["rt_min"] == 125
    # First call: session update + recovery_completed event + user_recovery_state update.
    # Second call: idempotent read-only return.
    assert supabase_mock["upsert_one"].await_count == 3
    assert supabase_mock["insert_one"].await_count == 0


def test_recovery_checkin_rejects_invalid_bucket(
    authenticated_client: TestClient,
    recovery_flag_on,
) -> None:
    response = authenticated_client.post(
        "/api/recovery/checkin",
        json={
            "session_id": "sess-1",
            "energy_level": 4,
            "time_budget_bucket": 15,
            "context_tag": "workday",
        },
    )

    assert response.status_code == 422


def test_recovery_summary_returns_rt_p50(
    authenticated_client: TestClient,
    supabase_mock,
    recovery_flag_on,
) -> None:
    now = datetime(2026, 2, 17, 12, 0, tzinfo=timezone.utc)
    rows = [
        {
            "id": "a",
            "status": "completed",
            "rt_min": 10,
            "created_at": (now - timedelta(days=1)).isoformat(),
        },
        {
            "id": "b",
            "status": "completed",
            "rt_min": 20,
            "created_at": (now - timedelta(days=2)).isoformat(),
        },
        {
            "id": "c",
            "status": "completed",
            "rt_min": 40,
            "created_at": (now - timedelta(days=3)).isoformat(),
        },
        {
            "id": "d",
            "status": "open",
            "rt_min": None,
            "created_at": (now - timedelta(days=1)).isoformat(),
        },
    ]
    supabase_mock["select"].return_value = rows

    response = authenticated_client.get(
        "/api/recovery/summary", params={"window_days": 14}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["started_count"] == 4
    assert body["completed_count"] == 3
    assert body["rt_p50_min"] == 20
    assert body["completion_rate"] == 75.0


def test_recovery_endpoints_require_auth(client: TestClient, recovery_flag_on) -> None:
    response = client.get("/api/recovery/summary")
    assert response.status_code == 401


def test_recovery_nudge_ack_is_idempotent(
    authenticated_client: TestClient,
    supabase_mock,
    recovery_flag_on,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(recovery_route.settings, "recovery_nudge_enabled", True)

    supabase_mock["select"].side_effect = [
        [
            {
                "id": "nudge-1",
                "user_id": "00000000-0000-4000-8000-000000000001",
                "session_id": "sess-ack-1",
                "status": "pending",
            }
        ],
        [
            {
                "id": "nudge-1",
                "user_id": "00000000-0000-4000-8000-000000000001",
                "session_id": "sess-ack-1",
                "status": "shown",
            }
        ],
    ]

    first = authenticated_client.post("/api/recovery/nudge/ack", json={"nudge_id": "nudge-1"})
    second = authenticated_client.post("/api/recovery/nudge/ack", json={"nudge_id": "nudge-1"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == {"ok": True}
    assert second.json() == {"ok": True}
    recovery_nudge_upserts = [
        call
        for call in supabase_mock["upsert_one"].await_args_list
        if call.kwargs.get("table") == "recovery_nudges"
    ]
    assert len(recovery_nudge_upserts) == 1
