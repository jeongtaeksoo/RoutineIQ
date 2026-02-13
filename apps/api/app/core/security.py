from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, cast

from fastapi import Depends, HTTPException, Request, status

from app.core.rate_limit import consume
from app.services.supabase_auth import get_current_user


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    email: str | None
    is_anonymous: bool
    locale: str
    access_token: str


_SUPPORTED_LOCALES = {"ko", "en", "ja", "zh", "es"}


def _normalize_locale(value: object) -> str:
    if not isinstance(value, str):
        return "ko"
    s = value.strip().lower()
    return s if s in _SUPPORTED_LOCALES else "ko"


def _get_bearer_token(request: Request) -> str:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token"
        )
    token = auth.split(" ", 1)[1].strip()
    if (not token) or (" " in token) or (len(token) < 20):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token"
        )
    return token


async def get_auth_context(request: Request) -> AuthContext:
    token = _get_bearer_token(request)

    # Pre-auth IP throttling to avoid flooding Supabase Auth.
    ip = request.client.host if request.client else "unknown"
    await consume(key=f"ip:{ip}", limit=240, window_seconds=60)

    # Delegate verification to Supabase Auth (JWKS-compatible).
    try:
        user = await get_current_user(access_token=token, use_cache=True)
    except Exception:
        # Always 401 for auth failures (including invalid/expired tokens).
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        )

    user_id = user.get("id")
    if not isinstance(user_id, str) or not user_id.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        )

    # Post-auth user throttling.
    await consume(key=f"user:{user_id}", limit=240, window_seconds=60)

    email = user.get("email")
    email_str = email if isinstance(email, str) and email.strip() else None
    is_anonymous = bool(user.get("is_anonymous") or False)
    raw_metadata = user.get("user_metadata")
    metadata: dict[str, Any] = (
        cast(dict[str, Any], raw_metadata) if isinstance(raw_metadata, dict) else {}
    )
    locale = _normalize_locale(metadata.get("routineiq_locale"))

    return AuthContext(
        user_id=user_id,
        email=email_str,
        is_anonymous=is_anonymous,
        locale=locale,
        access_token=token,
    )


async def verify_token(request: Request) -> AuthContext:
    return await get_auth_context(request)


AuthDep = Annotated[AuthContext, Depends(verify_token)]
