from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import app.routes.recovery as recovery_route
from app.services.supabase_rest import SupabaseRestError

TEST_USER_ID = "00000000-0000-4000-8000-000000000001"


@pytest.fixture
def recovery_cron_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(recovery_route.settings, "recovery_v1_enabled", True)
    monkeypatch.setattr(recovery_route.settings, "auto_lapse_enabled", True)
    monkeypatch.setattr(recovery_route.settings, "recovery_nudge_enabled", True)
    monkeypatch.setattr(recovery_route.settings, "recovery_cron_token", "cron-secret")
    monkeypatch.setattr(recovery_route.settings, "recovery_auto_lapse_batch_size", 100)
    monkeypatch.setattr(recovery_route.settings, "recovery_nudge_batch_size", 100)


def test_auto_lapse_cron_run_twice_creates_only_one_open_session(
    client: TestClient,
    supabase_mock,
    recovery_cron_flags,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime(2026, 2, 18, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(recovery_route, "_utc_now", lambda: now)

    states = [
        {
            "user_id": TEST_USER_ID,
            "last_engaged_at": (now - timedelta(hours=30)).isoformat(),
            "lapse_threshold_hours": 12,
            "last_auto_lapse_at": None,
            "last_nudge_at": None,
            "locale": "ko",
            "timezone": "Asia/Seoul",
            "quiet_hours_start": 22,
            "quiet_hours_end": 8,
        }
    ]
    open_sessions: list[dict] = []

    async def _select(*, table: str, bearer_token: str, params: dict):
        if table == "user_recovery_state":
            if "user_id" in params and str(params["user_id"]).startswith("eq."):
                uid = str(params["user_id"])[3:]
                return [row for row in states if row["user_id"] == uid][:1]
            return list(states)
        if table == "recovery_sessions":
            if params.get("status") == "eq.open":
                return [dict(row) for row in open_sessions]
            return []
        return []

    async def _insert_one(*, table: str, bearer_token: str, row: dict):
        if table == "recovery_sessions":
            user_id = row["user_id"]
            if any(
                s
                for s in open_sessions
                if s["user_id"] == user_id and s["status"] == "open"
            ):
                raise SupabaseRestError(
                    status_code=409,
                    code="23505",
                    message='duplicate key value violates unique constraint "recovery_sessions_one_open_per_user"',
                )
            inserted = dict(row)
            inserted.setdefault("created_at", now.isoformat())
            open_sessions.append(inserted)
            return inserted
        return {"id": "ok"}

    async def _upsert_one(
        *, table: str, bearer_token: str, row: dict, on_conflict: str
    ):
        if table == "user_recovery_state":
            uid = row["user_id"]
            for idx, state in enumerate(states):
                if state["user_id"] == uid:
                    merged = dict(state)
                    merged.update(row)
                    states[idx] = merged
                    return merged
            states.append(dict(row))
            return dict(row)
        return dict(row)

    supabase_mock["select"].side_effect = _select
    supabase_mock["insert_one"].side_effect = _insert_one
    supabase_mock["upsert_one"].side_effect = _upsert_one

    headers = {"X-Recovery-Cron-Token": "cron-secret"}
    first = client.post("/api/recovery/cron/auto-lapse", headers=headers)
    second = client.post("/api/recovery/cron/auto-lapse", headers=headers)

    assert first.status_code == 200
    assert first.json()["created_count"] == 1
    assert second.status_code == 200
    assert second.json()["created_count"] == 0
    assert len(open_sessions) == 1


def test_nudge_cron_suppresses_when_user_reengaged_after_lapse(
    client: TestClient,
    supabase_mock,
    recovery_cron_flags,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime(2026, 2, 18, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(recovery_route, "_utc_now", lambda: now)

    lapse_start = now - timedelta(hours=6)
    open_sessions = [
        {
            "id": "sess-auto-1",
            "user_id": TEST_USER_ID,
            "status": "open",
            "entry_surface": None,
            "lapse_start_ts": lapse_start.isoformat(),
            "detection_source": "auto",
            "created_at": (now - timedelta(hours=5)).isoformat(),
        }
    ]
    state = {
        "user_id": TEST_USER_ID,
        "last_engaged_at": (now - timedelta(hours=1)).isoformat(),
        "last_nudge_at": None,
        "locale": "ko",
        "timezone": "Asia/Seoul",
        "quiet_hours_start": 22,
        "quiet_hours_end": 8,
    }

    async def _select(*, table: str, bearer_token: str, params: dict):
        if table == "recovery_sessions":
            return list(open_sessions)
        if table == "user_recovery_state":
            return [dict(state)]
        return []

    supabase_mock["select"].side_effect = _select

    headers = {"X-Recovery-Cron-Token": "cron-secret"}
    response = client.post("/api/recovery/cron/nudge", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["scheduled_count"] == 0
    assert body["suppressed_count"] == 1
    assert body["suppressed_by_reason"].get("reengaged") == 1


def test_auto_lapse_and_nudge_are_disabled_when_feature_flags_off(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(recovery_route.settings, "recovery_v1_enabled", True)
    monkeypatch.setattr(recovery_route.settings, "auto_lapse_enabled", False)
    monkeypatch.setattr(recovery_route.settings, "recovery_nudge_enabled", False)
    monkeypatch.setattr(recovery_route.settings, "recovery_cron_token", "cron-secret")

    headers = {"X-Recovery-Cron-Token": "cron-secret"}
    auto_response = client.post("/api/recovery/cron/auto-lapse", headers=headers)
    nudge_response = client.post("/api/recovery/cron/nudge", headers=headers)

    assert auto_response.status_code == 404
    assert nudge_response.status_code == 404


@pytest.mark.parametrize(
    "headers,expected_status",
    [
        ({}, 401),
        ({"X-Recovery-Cron-Token": "wrong-token"}, 401),
    ],
)
def test_cron_endpoints_require_valid_token(
    client: TestClient,
    recovery_cron_flags,
    headers: dict[str, str],
    expected_status: int,
) -> None:
    auto_response = client.post("/api/recovery/cron/auto-lapse", headers=headers)
    nudge_response = client.post("/api/recovery/cron/nudge", headers=headers)

    assert auto_response.status_code == expected_status
    assert nudge_response.status_code == expected_status


def test_cron_endpoints_return_503_when_token_not_configured(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(recovery_route.settings, "recovery_v1_enabled", True)
    monkeypatch.setattr(recovery_route.settings, "auto_lapse_enabled", True)
    monkeypatch.setattr(recovery_route.settings, "recovery_nudge_enabled", True)
    monkeypatch.setattr(recovery_route.settings, "recovery_cron_token", None)

    auto_response = client.post("/api/recovery/cron/auto-lapse")
    nudge_response = client.post("/api/recovery/cron/nudge")

    assert auto_response.status_code == 503
    assert nudge_response.status_code == 503


def test_auto_lapse_cron_uses_service_role_token_for_queries(
    client: TestClient,
    supabase_mock,
    recovery_cron_flags,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime(2026, 2, 18, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(recovery_route, "_utc_now", lambda: now)

    tokens_seen: list[str] = []

    async def _select(*, table: str, bearer_token: str, params: dict):
        tokens_seen.append(bearer_token)
        if table == "user_recovery_state":
            return []
        if table == "recovery_sessions":
            return []
        return []

    supabase_mock["select"].side_effect = _select

    headers = {"X-Recovery-Cron-Token": "cron-secret"}
    response = client.post("/api/recovery/cron/auto-lapse", headers=headers)

    assert response.status_code == 200
    assert tokens_seen
    assert all(token == recovery_route.settings.supabase_service_role_key for token in tokens_seen)


def test_nudge_cron_rate_limit_uses_last_nudge_at(
    client: TestClient,
    supabase_mock,
    recovery_cron_flags,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime(2026, 2, 18, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(recovery_route, "_utc_now", lambda: now)

    open_sessions = [
        {
            "id": "sess-auto-2",
            "user_id": TEST_USER_ID,
            "status": "open",
            "entry_surface": None,
            "lapse_start_ts": (now - timedelta(hours=5)).isoformat(),
            "detection_source": "auto",
            "created_at": (now - timedelta(hours=5)).isoformat(),
        }
    ]
    state = {
        "user_id": TEST_USER_ID,
        "last_engaged_at": (now - timedelta(hours=20)).isoformat(),
        "last_nudge_at": (now - timedelta(hours=3)).isoformat(),
        "locale": "ko",
        "timezone": "Asia/Seoul",
        "quiet_hours_start": 22,
        "quiet_hours_end": 8,
    }

    async def _select(*, table: str, bearer_token: str, params: dict):
        if table == "recovery_sessions":
            return list(open_sessions)
        if table == "user_recovery_state":
            return [dict(state)]
        return []

    supabase_mock["select"].side_effect = _select

    headers = {"X-Recovery-Cron-Token": "cron-secret"}
    response = client.post("/api/recovery/cron/nudge", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["scheduled_count"] == 0
    assert body["suppressed_by_reason"].get("nudge_rate_limited") == 1


def test_auto_lapse_cron_returns_503_when_required_tables_missing(
    client: TestClient,
    supabase_mock,
    recovery_cron_flags,
) -> None:
    async def _select(*, table: str, bearer_token: str, params: dict):
        if table == "user_recovery_state" and params.get("limit") == 1:
            raise SupabaseRestError(
                status_code=404,
                code="42P01",
                message='relation "public.user_recovery_state" does not exist',
            )
        return []

    supabase_mock["select"].side_effect = _select

    response = client.post(
        "/api/recovery/cron/auto-lapse",
        headers={"X-Recovery-Cron-Token": "cron-secret"},
    )

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["reason"] == "missing_tables"
    assert "user_recovery_state" in detail["missing_tables"]
    assert "migration" in detail["action"].lower()


def test_nudge_cron_returns_503_when_required_tables_missing(
    client: TestClient,
    supabase_mock,
    recovery_cron_flags,
) -> None:
    async def _select(*, table: str, bearer_token: str, params: dict):
        if table == "recovery_nudges" and params.get("limit") == 1:
            raise SupabaseRestError(
                status_code=404,
                code="PGRST205",
                message="Could not find the table 'public.recovery_nudges'",
            )
        return []

    supabase_mock["select"].side_effect = _select

    response = client.post(
        "/api/recovery/cron/nudge",
        headers={"X-Recovery-Cron-Token": "cron-secret"},
    )

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["reason"] == "missing_tables"
    assert "recovery_nudges" in detail["missing_tables"]
    assert "migration" in detail["action"].lower()


def test_cron_returns_503_when_service_role_key_missing(
    client: TestClient,
    recovery_cron_flags,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(recovery_route.settings, "supabase_service_role_key", "")

    auto_response = client.post(
        "/api/recovery/cron/auto-lapse",
        headers={"X-Recovery-Cron-Token": "cron-secret"},
    )
    nudge_response = client.post(
        "/api/recovery/cron/nudge",
        headers={"X-Recovery-Cron-Token": "cron-secret"},
    )

    assert auto_response.status_code == 503
    assert nudge_response.status_code == 503
    assert (
        auto_response.json()["detail"]["reason"]
        == "service_role_key_missing"
    )
    assert (
        nudge_response.json()["detail"]["reason"]
        == "service_role_key_missing"
    )
