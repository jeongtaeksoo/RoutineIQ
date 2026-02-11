from __future__ import annotations

from datetime import date, timedelta

from app.core.config import settings
from app.services.supabase_rest import SupabaseRest, SupabaseRestError


def _is_service_key_failure(exc: SupabaseRestError) -> bool:
    msg = str(exc).lower()
    return exc.status_code in (401, 403) or exc.code == "42501" or "row-level security policy" in msg


async def cleanup_expired_reports(
    *,
    user_id: str,
    retention_days: int,
    today: date,
    access_token: str | None = None,
) -> None:
    # Keep the most recent N calendar days, inclusive.
    cutoff = today - timedelta(days=max(retention_days - 1, 0))
    params = {
        "user_id": f"eq.{user_id}",
        "date": f"lt.{cutoff.isoformat()}",
    }

    # Primary path: service-role cleanup.
    sb_service = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)
    try:
        await sb_service.delete(
            "ai_reports",
            bearer_token=settings.supabase_service_role_key,
            params=params,
        )
        return
    except SupabaseRestError as exc:
        # Fallback path for local/dev misconfiguration: user-scoped cleanup under RLS.
        if not access_token or not _is_service_key_failure(exc):
            raise

    sb_rls = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    await sb_rls.delete(
        "ai_reports",
        bearer_token=access_token,
        params=params,
    )
