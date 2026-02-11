from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.core.config import settings
from app.core.security import AuthContext, get_auth_context
from app.services.supabase_rest import SupabaseRest


async def require_admin(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    rows = await sb.select(
        "profiles",
        bearer_token=auth.access_token,
        params={"select": "role", "id": f"eq.{auth.user_id}", "limit": 1},
    )
    if not rows or rows[0].get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return auth


AdminDep = Annotated[AuthContext, Depends(require_admin)]

