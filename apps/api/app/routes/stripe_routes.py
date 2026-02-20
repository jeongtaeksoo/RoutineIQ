from __future__ import annotations

from typing import Any

import stripe
from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import settings
from app.core.idempotency import (
    claim_idempotency_key,
    clear_idempotency_key,
    mark_idempotency_done,
)
from app.core.rate_limit import consume
from app.core.security import AuthDep
from app.services.error_log import log_system_error
from app.services.stripe_service import (
    create_pro_checkout_session,
    init_stripe,
    stripe_is_fake_mode,
    stripe_is_ready,
    set_subscription_free,
    stripe_is_configured,
    upsert_subscription_row,
)

router = APIRouter()


@router.get("/stripe/status")
async def stripe_status(_: AuthDep) -> dict:
    # Returns only readiness flags (no secrets).
    return {
        "enabled": stripe_is_configured(),
        "ready": stripe_is_ready(),
        "mode": "fake" if stripe_is_fake_mode() else "live",
    }


@router.post("/stripe/create-checkout-session")
async def create_checkout_session(auth: AuthDep, request: Request) -> dict:
    if not stripe_is_ready(force=True):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "message": "Billing is not configured yet.",
                "hint": "Stripe key/config is missing or invalid on the server. Core features still work in guest mode.",
                "code": "STRIPE_NOT_CONFIGURED",
            },
        )

    # Require a real email identity before billing. Guest (anonymous) sessions must convert first.
    email = auth.email
    if not email or auth.is_anonymous:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message": "Email login required to manage billing.",
                "hint": "Create an email/password account from the Billing page to continue.",
                "code": "EMAIL_REQUIRED",
            },
        )

    source_header = (
        (request.headers.get("x-routineiq-billing-source") or "").strip().lower()
    )
    source = source_header[:32] if source_header else "app_checkout"

    try:
        url = await create_pro_checkout_session(
            user_id=auth.user_id, email=str(email), source=source
        )
        return {"url": url}
    except stripe.AuthenticationError as e:
        await log_system_error(
            route="/api/stripe/create-checkout-session",
            message="Stripe authentication failed",
            user_id=auth.user_id,
            err=e,
            meta={"code": "STRIPE_AUTHENTICATION_ERROR"},
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "message": "Billing is temporarily unavailable.",
                "hint": "Server Stripe key is invalid. Update STRIPE_SECRET_KEY and redeploy API.",
                "code": "STRIPE_AUTH_INVALID",
            },
        ) from e
    except stripe.StripeError as e:
        await log_system_error(
            route="/api/stripe/create-checkout-session",
            message="Stripe checkout provider error",
            user_id=auth.user_id,
            err=e,
            meta={"code": "STRIPE_PROVIDER_ERROR"},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message": "Billing provider error. Try again shortly.",
                "code": "STRIPE_PROVIDER_ERROR",
            },
        ) from e


def _get_user_id_from_metadata(obj: dict[str, Any]) -> str | None:
    md = obj.get("metadata")
    if (
        isinstance(md, dict)
        and isinstance(md.get("user_id"), str)
        and md["user_id"].strip()
    ):
        return md["user_id"].strip()
    if (
        isinstance(obj.get("client_reference_id"), str)
        and obj["client_reference_id"].strip()
    ):
        return obj["client_reference_id"].strip()
    return None


def _get_source_from_metadata(obj: dict[str, Any]) -> str:
    md = obj.get("metadata")
    if isinstance(md, dict) and isinstance(md.get("source"), str):
        source = md["source"].strip().lower()[:32]
        if source:
            return source
    return "stripe_webhook"


def _subscription_price_ids(sub: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    items = sub.get("items")
    if not isinstance(items, dict):
        return ids
    data = items.get("data")
    if not isinstance(data, list):
        return ids
    for it in data:
        if not isinstance(it, dict):
            continue
        price = it.get("price")
        if isinstance(price, dict) and isinstance(price.get("id"), str):
            ids.add(price["id"])
    return ids


def _derive_plan_from_subscription(sub: dict[str, Any]) -> str:
    status = sub.get("status")
    price_ids = _subscription_price_ids(sub)
    is_pro_price = bool(
        settings.stripe_price_id_pro and settings.stripe_price_id_pro in price_ids
    )
    is_active = status in ("active", "trialing")
    return "pro" if (is_pro_price and is_active) else "free"


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request) -> dict:
    # IP-based throttling for unauthenticated webhook route (best-effort).
    ip = request.client.host if request.client else "unknown"
    await consume(key=f"stripe_webhook_ip:{ip}", limit=600, window_seconds=60)

    if not stripe_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe is not configured",
        )

    init_stripe()

    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    if not sig:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe-Signature header",
        )

    try:
        # settings.stripe_webhook_secret is guaranteed by stripe_is_configured()
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig,
            secret=str(settings.stripe_webhook_secret),
        )
    except Exception as e:
        await log_system_error(
            route="/api/stripe/webhook",
            message="Stripe webhook signature verification failed",
            err=e,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature"
        )

    event_id = event.get("id")
    idem_key: str | None = None
    if isinstance(event_id, str) and event_id.strip():
        idem_key = f"stripe:webhook:{event_id.strip()}"
        idem_state = await claim_idempotency_key(
            key=idem_key, processing_ttl_seconds=900
        )
        if idem_state != "acquired":
            return {"ok": True, "replayed": True}

    etype = event.get("type")
    data = event.get("data", {}).get("object", {})

    try:
        if etype == "checkout.session.completed":
            session = data
            user_id = _get_user_id_from_metadata(session)
            sub_id = session.get("subscription")
            if not user_id or not sub_id:
                await log_system_error(
                    route="/api/stripe/webhook",
                    message="checkout.session.completed missing user_id or subscription",
                    meta={"has_user_id": bool(user_id), "has_sub_id": bool(sub_id)},
                )
                if idem_key:
                    await mark_idempotency_done(key=idem_key, done_ttl_seconds=86400)
                return {"ok": True}

            sub = stripe.Subscription.retrieve(sub_id)
            plan = _derive_plan_from_subscription(sub)
            source = _get_source_from_metadata(sub)
            await upsert_subscription_row(
                user_id=user_id,
                sub=sub,
                plan=plan,
                source=source,
            )
            if idem_key:
                await mark_idempotency_done(key=idem_key, done_ttl_seconds=86400)
            return {"ok": True}

        if etype in (
            "customer.subscription.created",
            "customer.subscription.updated",
        ):
            sub = data
            user_id = _get_user_id_from_metadata(sub)
            if not user_id:
                await log_system_error(
                    route="/api/stripe/webhook",
                    message=f"{etype} missing user_id metadata",
                    meta={"subscription_id": sub.get("id")},
                )
                if idem_key:
                    await mark_idempotency_done(key=idem_key, done_ttl_seconds=86400)
                return {"ok": True}

            plan = _derive_plan_from_subscription(sub)
            source = _get_source_from_metadata(sub)
            await upsert_subscription_row(
                user_id=user_id,
                sub=sub,
                plan=plan,
                source=source,
            )
            if idem_key:
                await mark_idempotency_done(key=idem_key, done_ttl_seconds=86400)
            return {"ok": True}

        if etype == "customer.subscription.deleted":
            sub = data
            user_id = _get_user_id_from_metadata(sub)
            if not user_id:
                await log_system_error(
                    route="/api/stripe/webhook",
                    message="customer.subscription.deleted missing user_id metadata",
                    meta={"subscription_id": sub.get("id")},
                )
                if idem_key:
                    await mark_idempotency_done(key=idem_key, done_ttl_seconds=86400)
                return {"ok": True}

            await set_subscription_free(
                user_id=user_id,
                customer_id=sub.get("customer"),
                subscription_id=sub.get("id"),
                status=sub.get("status"),
                source=_get_source_from_metadata(sub),
            )
            if idem_key:
                await mark_idempotency_done(key=idem_key, done_ttl_seconds=86400)
            return {"ok": True}

        # Ignore other events for MVP
        if idem_key:
            await mark_idempotency_done(key=idem_key, done_ttl_seconds=86400)
        return {"ok": True}
    except Exception as e:
        if idem_key:
            await clear_idempotency_key(key=idem_key)
        await log_system_error(
            route="/api/stripe/webhook",
            message=f"Webhook handler error: {etype}",
            err=e,
            meta={"type": etype},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook handler error",
        )
