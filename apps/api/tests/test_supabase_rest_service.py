from __future__ import annotations

import httpx
import pytest

from app.services.supabase_rest import SupabaseRest, SupabaseRestError


def _response(
    status_code: int, *, json_body=None, text: str = "error"
) -> httpx.Response:
    req = httpx.Request("GET", "https://example.supabase.co/rest/v1/test")
    if json_body is not None:
        return httpx.Response(status_code, json=json_body, request=req)
    return httpx.Response(status_code, text=text, request=req)


def test_raise_for_error_extracts_supabase_payload() -> None:
    sb = SupabaseRest("https://example.supabase.co", "anon")
    resp = _response(
        403,
        json_body={
            "code": "42501",
            "message": "row-level security policy",
            "hint": "check policy",
            "details": {"table": "usage_events"},
        },
    )

    with pytest.raises(SupabaseRestError) as exc:
        sb._raise_for_error(resp)

    assert exc.value.status_code == 403
    assert exc.value.code == "42501"
    assert "row-level security policy" in str(exc.value)


def test_raise_for_error_uses_text_when_json_missing() -> None:
    sb = SupabaseRest("https://example.supabase.co", "anon")
    resp = _response(500, text="upstream failure")

    with pytest.raises(SupabaseRestError) as exc:
        sb._raise_for_error(resp)

    assert exc.value.status_code == 500
    assert str(exc.value) == "upstream failure"


@pytest.mark.asyncio
async def test_select_wraps_single_object_as_list(monkeypatch: pytest.MonkeyPatch) -> None:
    sb = SupabaseRest("https://example.supabase.co", "anon")

    class _Client:
        async def get(self, *args, **kwargs):
            return _response(200, json_body={"id": "one"})

    monkeypatch.setattr("app.services.supabase_rest.get_http", lambda: _Client())

    rows = await sb.select(
        "usage_events",
        bearer_token="token",
        params={"select": "id"},
    )
    assert rows == [{"id": "one"}]
