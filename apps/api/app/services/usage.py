from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from app.core.config import settings
from app.services.supabase_rest import SupabaseRest, SupabaseRestError


@dataclass(frozen=True)
class UsageCount:
    used: int
    limit: int


def _is_service_key_failure(exc: SupabaseRestError) -> bool:
    msg = str(exc).lower()
    return exc.status_code in (401, 403) or exc.code == "42501" or "row-level security policy" in msg


def estimate_cost_usd(*, input_tokens: int | None, output_tokens: int | None) -> float | None:
    if input_tokens is None or output_tokens is None:
        return None
    if settings.openai_price_input_per_1k is None or settings.openai_price_output_per_1k is None:
        return None
    return round(
        (input_tokens / 1000.0) * settings.openai_price_input_per_1k
        + (output_tokens / 1000.0) * settings.openai_price_output_per_1k,
        6,
    )


async def count_daily_analyze_calls(*, user_id: str, event_date: date, access_token: str | None = None) -> int:
    params = {
        "select": "id",
        "user_id": f"eq.{user_id}",
        "event_type": "eq.analyze",
        "event_date": f"eq.{event_date.isoformat()}",
    }

    # Primary path: service-role count (stable for admin/server tasks).
    sb_service = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)
    try:
        rows = await sb_service.select(
            "usage_events",
            bearer_token=settings.supabase_service_role_key,
            params=params,
        )
    except SupabaseRestError as exc:
        # Fallback path for local/dev misconfiguration: user-scoped read under RLS.
        if not access_token or not _is_service_key_failure(exc):
            raise
        sb_rls = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
        rows = await sb_rls.select(
            "usage_events",
            bearer_token=access_token,
            params=params,
        )
    return len(rows)


async def insert_usage_event(
    *,
    user_id: str,
    event_date: date,
    model: str,
    tokens_prompt: int | None,
    tokens_completion: int | None,
    tokens_total: int | None,
    cost_usd: float | None,
    meta: dict[str, Any] | None = None,
    access_token: str | None = None,
) -> None:
    row = {
        "user_id": user_id,
        "event_type": "analyze",
        "event_date": event_date.isoformat(),
        "model": model,
        "tokens_prompt": tokens_prompt,
        "tokens_completion": tokens_completion,
        "tokens_total": tokens_total,
        "cost_usd": cost_usd,
        "meta": meta or {},
    }

    # Primary path: service-role write.
    sb_service = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)
    try:
        await sb_service.insert_one(
            "usage_events",
            bearer_token=settings.supabase_service_role_key,
            row=row,
        )
        return
    except SupabaseRestError as exc:
        # Fallback path for local/dev misconfiguration: user-scoped write under RLS.
        if not access_token or not _is_service_key_failure(exc):
            raise

    sb_rls = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    await sb_rls.insert_one(
        "usage_events",
        bearer_token=access_token,
        row=row,
    )
