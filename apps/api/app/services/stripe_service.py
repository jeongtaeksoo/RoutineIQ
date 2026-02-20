from __future__ import annotations

from datetime import datetime, timezone
from time import monotonic
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import stripe

from app.core.config import settings
from app.services.supabase_rest import SupabaseRest, SupabaseRestError


def stripe_is_configured() -> bool:
    return settings.is_stripe_configured()


def stripe_is_fake_mode() -> bool:
    env = (settings.app_env or "").strip().lower()
    return bool(settings.stripe_smoke_fake and env not in {"production", "prod"})


_READINESS_CACHE_SECONDS = 60.0
_last_readiness_check_at = 0.0
_last_readiness_value = False


def stripe_is_ready(*, force: bool = False) -> bool:
    """
    Returns True only when keys are configured and Stripe accepts the key.
    Caches readiness briefly to avoid excessive provider calls.
    """
    global _last_readiness_check_at, _last_readiness_value

    if not stripe_is_configured():
        _last_readiness_value = False
        _last_readiness_check_at = monotonic()
        return False
    if stripe_is_fake_mode():
        _last_readiness_value = True
        _last_readiness_check_at = monotonic()
        return True

    now = monotonic()
    if not force and (now - _last_readiness_check_at) < _READINESS_CACHE_SECONDS:
        return _last_readiness_value

    init_stripe()
    try:
        stripe.Account.retrieve()
        _last_readiness_value = True
    except stripe.StripeError:
        _last_readiness_value = False
    _last_readiness_check_at = now
    return _last_readiness_value


def init_stripe() -> None:
    key = settings.stripe_secret_key
    if not key:
        raise RuntimeError("Stripe is not configured")
    stripe.api_key = key


async def create_pro_checkout_session(
    *, user_id: str, email: str | None, source: str = "app_checkout"
) -> str:
    if not settings.is_stripe_configured():
        raise RuntimeError("Stripe is not configured")
    init_stripe()
    if not settings.stripe_price_id_pro:
        raise RuntimeError("Stripe is not configured")
    if stripe_is_fake_mode():
        # Staging-only fake checkout URL for deterministic smoke validation when real Stripe
        # credentials are intentionally unavailable.
        base = str(settings.stripe_success_url)
        parsed = urlparse(base)
        q = dict(parse_qsl(parsed.query))
        q["session_id"] = f"cs_test_fake_{user_id[:8]}"
        return urlunparse(
            (
                parsed.scheme,
                parsed.netloc,
                parsed.path,
                parsed.params,
                urlencode(q),
                parsed.fragment,
            )
        )

    source_norm = (source or "app_checkout").strip().lower()[:32] or "app_checkout"
    kwargs: dict[str, Any] = {
        "mode": "subscription",
        "line_items": [{"price": settings.stripe_price_id_pro, "quantity": 1}],
        "success_url": str(settings.stripe_success_url),
        "cancel_url": str(settings.stripe_cancel_url),
        "client_reference_id": user_id,
        "allow_promotion_codes": True,
        "metadata": {"user_id": user_id, "source": source_norm},
        "subscription_data": {"metadata": {"user_id": user_id, "source": source_norm}},
    }
    if email:
        kwargs["customer_email"] = email

    session = stripe.checkout.Session.create(**kwargs)
    if not session.url:
        raise RuntimeError("Stripe checkout session missing url")
    return str(session.url)


def _to_iso(ts: int | None) -> str | None:
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


async def upsert_subscription_row(
    *, user_id: str, sub: dict[str, Any], plan: str, source: str = "stripe_webhook"
) -> None:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)

    source_norm = (source or "stripe_webhook").strip().lower()[:32] or "stripe_webhook"
    row = {
        "user_id": user_id,
        "stripe_customer_id": sub.get("customer"),
        "stripe_subscription_id": sub.get("id"),
        "status": sub.get("status") or "unknown",
        "plan": plan,
        "source": source_norm,
        "current_period_end": _to_iso(sub.get("current_period_end")),
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end") or False),
    }

    try:
        await sb.upsert_one(
            "subscriptions",
            bearer_token=settings.supabase_service_role_key,
            row=row,
            on_conflict="user_id",
        )
    except SupabaseRestError as exc:
        # Backward compatibility for environments where the subscriptions.source
        # column has not been migrated yet.
        if exc.status_code == 400 and "source" in str(exc).lower():
            fallback = dict(row)
            fallback.pop("source", None)
            await sb.upsert_one(
                "subscriptions",
                bearer_token=settings.supabase_service_role_key,
                row=fallback,
                on_conflict="user_id",
            )
            return
        raise


async def set_subscription_free(
    *,
    user_id: str,
    customer_id: str | None,
    subscription_id: str | None,
    status: str | None,
    source: str = "stripe_webhook",
) -> None:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)
    source_norm = (source or "stripe_webhook").strip().lower()[:32] or "stripe_webhook"
    row = {
        "user_id": user_id,
        "stripe_customer_id": customer_id,
        "stripe_subscription_id": subscription_id,
        "status": status or "canceled",
        "plan": "free",
        "source": source_norm,
        "current_period_end": None,
        "cancel_at_period_end": False,
    }
    try:
        await sb.upsert_one(
            "subscriptions",
            bearer_token=settings.supabase_service_role_key,
            row=row,
            on_conflict="user_id",
        )
    except SupabaseRestError as exc:
        if exc.status_code == 400 and "source" in str(exc).lower():
            fallback = dict(row)
            fallback.pop("source", None)
            await sb.upsert_one(
                "subscriptions",
                bearer_token=settings.supabase_service_role_key,
                row=fallback,
                on_conflict="user_id",
            )
            return
        raise
