from __future__ import annotations

from typing import Any

import httpx

_http: httpx.AsyncClient | None = None


class SupabaseRestError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        message: str,
        code: str | None = None,
        hint: str | None = None,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.hint = hint
        self.details = details


def get_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=httpx.Timeout(30.0))
    return _http


async def close_http() -> None:
    global _http
    if _http is not None:
        await _http.aclose()
        _http = None


class SupabaseRest:
    def __init__(self, supabase_url: str, api_key: str):
        self._rest_base = supabase_url.rstrip("/") + "/rest/v1"
        self._api_key = api_key

    def _headers(
        self, bearer_token: str, *, prefer: str | None = None
    ) -> dict[str, str]:
        h = {
            "apikey": self._api_key,
            "authorization": f"Bearer {bearer_token}",
            "accept": "application/json",
        }
        if prefer:
            h["prefer"] = prefer
        return h

    def _raise_for_error(self, resp: httpx.Response) -> None:
        if resp.status_code < 400:
            return

        code: str | None = None
        message: str | None = None
        hint: str | None = None
        details: Any | None = None

        try:
            payload = resp.json()
            if isinstance(payload, dict):
                code = (
                    payload.get("code")
                    if isinstance(payload.get("code"), str)
                    else None
                )
                message = (
                    payload.get("message")
                    if isinstance(payload.get("message"), str)
                    else None
                )
                hint = (
                    payload.get("hint")
                    if isinstance(payload.get("hint"), str)
                    else None
                )
                details = payload.get("details")
            elif isinstance(payload, str):
                message = payload
        except Exception:
            payload = None

        if not message:
            try:
                message = resp.text.strip()
            except Exception:
                message = None

        raise SupabaseRestError(
            status_code=resp.status_code,
            code=code,
            message=message or f"Supabase request failed ({resp.status_code})",
            hint=hint,
            details=details,
        )

    async def select(
        self,
        table: str,
        *,
        bearer_token: str,
        params: dict[str, Any],
    ) -> list[dict[str, Any]]:
        url = f"{self._rest_base}/{table}"
        resp = await get_http().get(
            url, headers=self._headers(bearer_token), params=params
        )
        self._raise_for_error(resp)
        data = resp.json()
        if isinstance(data, list):
            return data
        return [data]

    async def upsert_one(
        self,
        table: str,
        *,
        bearer_token: str,
        row: dict[str, Any],
        on_conflict: str,
    ) -> dict[str, Any]:
        url = f"{self._rest_base}/{table}"
        headers = self._headers(
            bearer_token,
            prefer="resolution=merge-duplicates,return=representation",
        )
        resp = await get_http().post(
            url, headers=headers, params={"on_conflict": on_conflict}, json=row
        )
        self._raise_for_error(resp)
        data = resp.json()
        if isinstance(data, list):
            return data[0] if data else {}
        return data

    async def insert_one(
        self,
        table: str,
        *,
        bearer_token: str,
        row: dict[str, Any],
    ) -> dict[str, Any]:
        url = f"{self._rest_base}/{table}"
        headers = self._headers(bearer_token, prefer="return=representation")
        resp = await get_http().post(url, headers=headers, json=row)
        self._raise_for_error(resp)
        data = resp.json()
        if isinstance(data, list):
            return data[0] if data else {}
        return data

    async def delete(
        self,
        table: str,
        *,
        bearer_token: str,
        params: dict[str, Any],
    ) -> None:
        url = f"{self._rest_base}/{table}"
        resp = await get_http().delete(
            url, headers=self._headers(bearer_token), params=params
        )
        self._raise_for_error(resp)

    async def rpc(
        self,
        fn_name: str,
        *,
        bearer_token: str,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        url = f"{self._rest_base}/rpc/{fn_name}"
        resp = await get_http().post(
            url, headers=self._headers(bearer_token), json=params or {}
        )
        self._raise_for_error(resp)
        data = resp.json()
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]
        return []
