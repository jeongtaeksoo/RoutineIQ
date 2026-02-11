from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from app.core.config import settings
from app.services.supabase_rest import SupabaseRest

Plan = Literal["free", "pro"]


@dataclass(frozen=True)
class SubscriptionInfo:
    plan: Plan
    status: str | None
    current_period_end: datetime | None
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    cancel_at_period_end: bool | None


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            # Supabase returns ISO 8601; accept Z or offset.
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def _is_active(status: str | None, period_end: datetime | None) -> bool:
    if status in ("active", "trialing"):
        return True
    # Defensive: sometimes status may be missing; treat not active.
    if not status and period_end:
        return period_end > datetime.now(timezone.utc)
    return False


async def get_subscription_info(
    *,
    user_id: str,
    access_token: str,
) -> SubscriptionInfo:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    rows = await sb.select(
        "subscriptions",
        bearer_token=access_token,
        params={
            "select": "user_id,plan,status,current_period_end,stripe_customer_id,stripe_subscription_id,cancel_at_period_end",
            "user_id": f"eq.{user_id}",
            "limit": 1,
        },
    )
    row = rows[0] if rows else None

    if not row:
        return SubscriptionInfo(
            plan="free",
            status=None,
            current_period_end=None,
            stripe_customer_id=None,
            stripe_subscription_id=None,
            cancel_at_period_end=None,
        )

    plan: Plan = "pro" if row.get("plan") == "pro" else "free"
    status = row.get("status")
    period_end = _parse_dt(row.get("current_period_end"))

    if plan == "pro" and _is_active(status, period_end):
        return SubscriptionInfo(
            plan="pro",
            status=status,
            current_period_end=period_end,
            stripe_customer_id=row.get("stripe_customer_id"),
            stripe_subscription_id=row.get("stripe_subscription_id"),
            cancel_at_period_end=row.get("cancel_at_period_end"),
        )

    return SubscriptionInfo(
        plan="free",
        status=status,
        current_period_end=period_end,
        stripe_customer_id=row.get("stripe_customer_id"),
        stripe_subscription_id=row.get("stripe_subscription_id"),
        cancel_at_period_end=row.get("cancel_at_period_end"),
    )


def retention_days_for_plan(plan: Plan) -> int:
    return (
        settings.pro_report_retention_days
        if plan == "pro"
        else settings.free_report_retention_days
    )


def analyze_limit_for_plan(plan: Plan) -> int:
    return (
        settings.pro_daily_analyze_limit
        if plan == "pro"
        else settings.free_daily_analyze_limit
    )

