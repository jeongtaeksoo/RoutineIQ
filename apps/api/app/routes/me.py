from __future__ import annotations

from datetime import date
from typing import cast

from fastapi import APIRouter

from app.core.security import AuthDep
from app.core.config import settings
from app.schemas.me import (
    ActivationNextStep,
    ActivationResponse,
    EntitlementLimits,
    EntitlementsResponse,
)
from app.services.plan import (
    analyze_limit_for_plan,
    get_subscription_info,
    retention_days_for_plan,
)
from app.services.supabase_rest import SupabaseRest
from app.services.usage import count_daily_analyze_calls

router = APIRouter()


@router.get("/me/entitlements", response_model=EntitlementsResponse)
async def get_my_entitlements(auth: AuthDep) -> EntitlementsResponse:
    sub = await get_subscription_info(
        user_id=auth.user_id,
        access_token=auth.access_token,
    )
    is_pro = sub.plan == "pro"
    needs_email_setup = auth.is_anonymous or not auth.email
    daily_limit = analyze_limit_for_plan(sub.plan)
    used_today = await count_daily_analyze_calls(
        user_id=auth.user_id,
        event_date=date.today(),
        event_type="analyze",
        access_token=auth.access_token,
    )
    remaining_today = max(daily_limit - used_today, 0)

    return EntitlementsResponse(
        plan=sub.plan,
        is_pro=is_pro,
        status=sub.status,
        current_period_end=sub.current_period_end,
        cancel_at_period_end=sub.cancel_at_period_end,
        needs_email_setup=needs_email_setup,
        can_use_checkout=not needs_email_setup,
        analyze_used_today=used_today,
        analyze_remaining_today=remaining_today,
        limits=EntitlementLimits(
            daily_analyze_limit=daily_limit,
            report_retention_days=retention_days_for_plan(sub.plan),
        ),
    )


def _profile_complete(row: dict | None) -> bool:
    if not isinstance(row, dict):
        return False
    required_keys = ("age_group", "gender", "job_family", "work_mode")
    for key in required_keys:
        value = row.get(key)
        if not isinstance(value, str):
            return False
        normalized = value.strip().lower()
        if not normalized or normalized == "unknown":
            return False
    return True


@router.get("/me/activation", response_model=ActivationResponse)
async def get_my_activation(auth: AuthDep) -> ActivationResponse:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    profile_rows = await sb.select(
        "profiles",
        bearer_token=auth.access_token,
        params={
            "select": "id,age_group,gender,job_family,work_mode",
            "id": f"eq.{auth.user_id}",
            "limit": 1,
        },
    )
    logs_rows = await sb.select(
        "activity_logs",
        bearer_token=auth.access_token,
        params={
            "select": "id,date",
            "user_id": f"eq.{auth.user_id}",
            "order": "date.desc",
            "limit": 1,
        },
    )
    report_rows = await sb.select(
        "ai_reports",
        bearer_token=auth.access_token,
        params={
            "select": "id,date",
            "user_id": f"eq.{auth.user_id}",
            "order": "date.desc",
            "limit": 1,
        },
    )

    profile_complete = _profile_complete(profile_rows[0] if profile_rows else None)
    has_any_log = bool(logs_rows)
    has_any_report = bool(report_rows)
    activation_complete = profile_complete and has_any_log and has_any_report

    if not profile_complete:
        next_step: ActivationNextStep = "profile"
    elif not has_any_log:
        next_step = "log"
    elif not has_any_report:
        next_step = "analyze"
    else:
        next_step = "complete"

    return ActivationResponse(
        profile_complete=profile_complete,
        has_any_log=has_any_log,
        has_any_report=has_any_report,
        activation_complete=activation_complete,
        next_step=cast(ActivationNextStep, next_step),
    )
