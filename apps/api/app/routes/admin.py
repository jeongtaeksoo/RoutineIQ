from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import stripe
from fastapi import APIRouter, HTTPException, status

from app.core.admin import AdminDep
from app.core.config import settings
from app.services.error_log import log_system_error
from app.services.stripe_service import (
    init_stripe,
    stripe_is_configured,
    upsert_subscription_row,
)
from app.services.supabase_rest import SupabaseRest

router = APIRouter()


def _is_sub_active(status: str | None) -> bool:
    return status in ("active", "trialing")


def _effective_plan(sub_row: dict[str, Any] | None) -> str:
    if not sub_row:
        return "free"
    plan = sub_row.get("plan")
    status = sub_row.get("status")
    if plan == "pro" and _is_sub_active(status):
        return "pro"
    return "free"


@router.get("/admin/users")
async def admin_users(_: AdminDep) -> dict:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)

    profiles = await sb.select(
        "profiles",
        bearer_token=settings.supabase_service_role_key,
        params={
            "select": "id,email,role,created_at",
            "order": "created_at.desc",
            "limit": 200,
        },
    )
    user_ids = [p["id"] for p in profiles if isinstance(p.get("id"), str)]
    if not user_ids:
        return {"users": []}

    # Subscriptions in one call
    subs = await sb.select(
        "subscriptions",
        bearer_token=settings.supabase_service_role_key,
        params={
            "select": "user_id,plan,status,current_period_end,cancel_at_period_end",
            "user_id": f"in.({','.join(user_ids)})",
            "limit": 2000,
        },
    )
    subs_by_user = {
        s.get("user_id"): s for s in subs if isinstance(s.get("user_id"), str)
    }

    # Latest report date per user (scan from newest)
    reports = await sb.select(
        "ai_reports",
        bearer_token=settings.supabase_service_role_key,
        params={
            "select": "user_id,date",
            "user_id": f"in.({','.join(user_ids)})",
            "order": "date.desc",
            "limit": 5000,
        },
    )
    latest_report_date: dict[str, str] = {}
    for r in reports:
        uid = r.get("user_id")
        if isinstance(uid, str) and uid not in latest_report_date and r.get("date"):
            latest_report_date[uid] = str(r["date"])

    users = []
    for p in profiles:
        uid = p.get("id")
        if not isinstance(uid, str):
            continue
        sub = subs_by_user.get(uid)
        users.append(
            {
                "id": uid,
                "email": p.get("email"),
                "role": p.get("role"),
                "created_at": p.get("created_at"),
                "plan": _effective_plan(sub),
                "subscription_status": (
                    sub.get("status") if isinstance(sub, dict) else None
                ),
                "last_analyzed_date": latest_report_date.get(uid),
            }
        )

    return {"users": users}


@router.get("/admin/users/{user_id}")
async def admin_user_detail(user_id: str, _: AdminDep) -> dict:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)

    prof = await sb.select(
        "profiles",
        bearer_token=settings.supabase_service_role_key,
        params={
            "select": "id,email,role,created_at",
            "id": f"eq.{user_id}",
            "limit": 1,
        },
    )
    if not prof:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    subs = await sb.select(
        "subscriptions",
        bearer_token=settings.supabase_service_role_key,
        params={
            "select": "user_id,plan,status,stripe_subscription_id",
            "user_id": f"eq.{user_id}",
            "limit": 1,
        },
    )
    sub = subs[0] if subs else None

    today = datetime.now(timezone.utc).date()
    since = today - timedelta(days=6)

    logs = await sb.select(
        "activity_logs",
        bearer_token=settings.supabase_service_role_key,
        params={
            "select": "id",
            "user_id": f"eq.{user_id}",
            "date": f"gte.{since.isoformat()}",
            "limit": 5000,
        },
    )

    events = await sb.select(
        "usage_events",
        bearer_token=settings.supabase_service_role_key,
        params={
            "select": "id",
            "user_id": f"eq.{user_id}",
            "event_type": "eq.analyze",
            "event_date": f"gte.{since.isoformat()}",
            "limit": 5000,
        },
    )

    latest = await sb.select(
        "ai_reports",
        bearer_token=settings.supabase_service_role_key,
        params={
            "select": "date,report,created_at,model",
            "user_id": f"eq.{user_id}",
            "order": "date.desc",
            "limit": 1,
        },
    )

    return {
        "profile": prof[0],
        "plan": _effective_plan(sub),
        "subscription": sub,
        "last_7d": {
            "activity_logs_count": len(logs),
            "analyze_calls_count": len(events),
        },
        "latest_report": latest[0] if latest else None,
    }


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


@router.post("/admin/sync-subscription/{user_id}")
async def admin_sync_subscription(user_id: str, _: AdminDep) -> dict:
    if not stripe_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe is not configured",
        )

    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)
    subs = await sb.select(
        "subscriptions",
        bearer_token=settings.supabase_service_role_key,
        params={
            "select": "user_id,stripe_subscription_id",
            "user_id": f"eq.{user_id}",
            "limit": 1,
        },
    )
    if not subs or not subs[0].get("stripe_subscription_id"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Stripe subscription on record",
        )

    init_stripe()
    try:
        sub = stripe.Subscription.retrieve(subs[0]["stripe_subscription_id"])
        plan = _derive_plan_from_subscription(sub)
        await upsert_subscription_row(user_id=user_id, sub=sub, plan=plan)
        return {"ok": True, "plan": plan, "status": sub.get("status")}
    except Exception as e:
        await log_system_error(
            route="/api/admin/sync-subscription",
            message="Stripe sync failed",
            user_id=user_id,
            err=e,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe sync failed"
        )


@router.get("/admin/errors")
async def admin_errors(_: AdminDep) -> dict:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)
    rows = await sb.select(
        "system_errors",
        bearer_token=settings.supabase_service_role_key,
        params={
            "select": "id,created_at,route,message,user_id,meta",
            "order": "created_at.desc",
            "limit": 50,
        },
    )
    return {"errors": rows}
