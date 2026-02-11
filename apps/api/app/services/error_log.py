from __future__ import annotations

import traceback
from typing import Any

from app.core.config import settings
from app.services.supabase_rest import SupabaseRest


async def log_system_error(
    *,
    route: str,
    message: str,
    user_id: str | None = None,
    err: BaseException | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    # Best-effort logging; never raise.
    try:
        stack = None
        if err is not None:
            stack = "".join(traceback.format_exception(type(err), err, err.__traceback__))[:8000]

        row: dict[str, Any] = {
            "route": route,
            "message": message[:1000],
            "stack": stack,
            "user_id": user_id,
            "meta": meta or {},
        }
        sb = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)
        await sb.insert_one("system_errors", bearer_token=settings.supabase_service_role_key, row=row)
    except Exception:
        return

