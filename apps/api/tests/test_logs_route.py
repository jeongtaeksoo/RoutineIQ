from __future__ import annotations

from fastapi.testclient import TestClient


def _log_payload(date_value: str) -> dict:
    return {
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


def test_post_logs_creates_entry(
    authenticated_client: TestClient, supabase_mock
) -> None:
    supabase_mock["upsert_one"].return_value = {
        "id": "log-1",
        "user_id": "00000000-0000-4000-8000-000000000001",
        "date": "2026-02-15",
        "entries": _log_payload("2026-02-15")["entries"],
        "note": "good session",
        "created_at": "2026-02-15T00:00:00+00:00",
        "updated_at": "2026-02-15T00:00:00+00:00",
    }

    response = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "log-1"
    assert body["date"] == "2026-02-15"
    assert supabase_mock["upsert_one"].await_count == 1


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
            "id": "log-1",
            "user_id": "00000000-0000-4000-8000-000000000001",
            "date": "2026-02-15",
            "entries": _log_payload("2026-02-15")["entries"],
            "note": "updated",
        },
    ]

    first = authenticated_client.post("/api/logs", json=_log_payload("2026-02-15"))
    second_payload = _log_payload("2026-02-15")
    second_payload["note"] = "updated"
    second = authenticated_client.post("/api/logs", json=second_payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["note"] == "updated"
    assert supabase_mock["upsert_one"].await_count == 2
    last_call = supabase_mock["upsert_one"].await_args_list[-1].kwargs
    assert last_call["on_conflict"] == "user_id,date"


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
        }
    ]

    response = authenticated_client.get("/api/logs", params={"date": "2026-02-15"})

    assert response.status_code == 200
    assert response.json()["date"] == "2026-02-15"
    assert response.json()["note"] == "from db"


def test_logs_requires_auth(client: TestClient) -> None:
    response = client.post("/api/logs", json=_log_payload("2026-02-15"))
    assert response.status_code == 401
