from __future__ import annotations

import time
from typing import Any

from app.core.config import settings
from app.services.supabase_rest import get_http

_USER_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_SECONDS = 30.0
_CACHE_MAX_ENTRIES = 2048


def _cache_get(token: str) -> dict[str, Any] | None:
    entry = _USER_CACHE.get(token)
    if not entry:
        return None
    expires_at, user = entry
    if expires_at <= time.time():
        _USER_CACHE.pop(token, None)
        return None
    return user


def _cache_set(token: str, user: dict[str, Any]) -> None:
    # Avoid unbounded growth.
    if len(_USER_CACHE) >= _CACHE_MAX_ENTRIES:
        _USER_CACHE.clear()
    _USER_CACHE[token] = (time.time() + _CACHE_TTL_SECONDS, user)


async def get_current_user(
    *, access_token: str, use_cache: bool = True
) -> dict[str, Any]:
    """
    Fetches the current user from Supabase Auth using the user's access token.

    This is more reliable than extracting email from JWT claims, especially after
    upgrading an anonymous session to email/password.
    """
    if use_cache:
        cached = _cache_get(access_token)
        if cached is not None:
            return cached

    url = str(settings.supabase_url).rstrip("/") + "/auth/v1/user"
    headers = {
        "apikey": settings.supabase_anon_key,
        "authorization": f"Bearer {access_token}",
        "accept": "application/json",
    }
    resp = await get_http().get(url, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict):
        raise ValueError("Unexpected Supabase user response")

    # Cache only "stable" identities (non-anonymous with email) to avoid
    # stale state right after guest->email conversion.
    is_anonymous = bool(data.get("is_anonymous") or False)
    email = data.get("email")
    if use_cache and (not is_anonymous) and isinstance(email, str) and email.strip():
        _cache_set(access_token, data)

    return data
