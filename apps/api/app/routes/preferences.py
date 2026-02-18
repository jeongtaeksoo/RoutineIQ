from __future__ import annotations

import asyncio
from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.security import AuthDep
from app.schemas.preferences import DEFAULT_COMPARE_BY, ProfilePreferences
from app.services.supabase_rest import (
    SupabaseRest,
    SupabaseRestError,
    get_http,
)

router = APIRouter()

_JOB_FAMILY_MIGRATION: dict[str, str] = {
    "engineering": "office_worker",
    "design": "office_worker",
    "marketing": "office_worker",
    "sales": "office_worker",
    "operations": "office_worker",
    "freelance": "self_employed",
}
_ALLOWED_JOB_FAMILY: set[str] = {
    "office_worker",
    "professional",
    "creator",
    "student",
    "self_employed",
    "other",
    "unknown",
}


def _is_rls_write_failure(exc: SupabaseRestError) -> bool:
    msg = str(exc).lower()
    return exc.code == "42501" or "row-level security policy" in msg


def _is_ignorable_delete_failure(exc: SupabaseRestError) -> bool:
    msg = str(exc).lower()
    return (
        exc.status_code == 404
        or exc.code in {"PGRST116", "42P01"}
        or "relation" in msg
        and "does not exist" in msg
    )


def _migrate_job_family(value: object) -> str:
    if not isinstance(value, str):
        return "unknown"
    normalized = value.strip().lower() or "unknown"
    migrated = _JOB_FAMILY_MIGRATION.get(normalized, normalized)
    return migrated if migrated in _ALLOWED_JOB_FAMILY else "unknown"


def _normalize_compare_by(value: object) -> list[str]:
    if not isinstance(value, list):
        return list(DEFAULT_COMPARE_BY)
    out: list[str] = []
    for item in value:
        if (
            isinstance(item, str)
            and item in {"age_group", "gender", "job_family", "work_mode"}
            and item not in out
        ):
            out.append(item)
    return out or list(DEFAULT_COMPARE_BY)


def _to_preferences(row: dict) -> ProfilePreferences:
    return ProfilePreferences.model_validate(
        {
            "age_group": row.get("age_group") or "unknown",
            "gender": row.get("gender") or "unknown",
            "job_family": _migrate_job_family(row.get("job_family")),
            "work_mode": row.get("work_mode") or "unknown",
            "trend_opt_in": bool(row.get("trend_opt_in")),
            "trend_compare_by": _normalize_compare_by(row.get("trend_compare_by")),
            "goal_keyword": row.get("goal_keyword"),
            "goal_minutes_per_day": row.get("goal_minutes_per_day"),
        }
    )


@router.get("/preferences/profile", response_model=ProfilePreferences)
async def get_profile_preferences(auth: AuthDep) -> ProfilePreferences:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    rows = await sb.select(
        "profiles",
        bearer_token=auth.access_token,
        params={
            "select": "id,age_group,gender,job_family,work_mode,trend_opt_in,trend_compare_by,goal_keyword,goal_minutes_per_day",
            "id": f"eq.{auth.user_id}",
            "limit": 1,
        },
    )
    if rows:
        return _to_preferences(rows[0])
    return ProfilePreferences()


@router.put("/preferences/profile", response_model=ProfilePreferences)
async def upsert_profile_preferences(
    body: ProfilePreferences, auth: AuthDep
) -> ProfilePreferences:
    row_data = {
        "id": auth.user_id,
        "email": auth.email,
        "age_group": body.age_group,
        "gender": body.gender,
        "job_family": body.job_family,
        "work_mode": body.work_mode,
        "trend_opt_in": body.trend_opt_in,
        "trend_compare_by": body.trend_compare_by,
        "goal_keyword": body.goal_keyword,
        "goal_minutes_per_day": body.goal_minutes_per_day,
    }

    sb_rls = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    try:
        row = await sb_rls.upsert_one(
            "profiles",
            bearer_token=auth.access_token,
            on_conflict="id",
            row=row_data,
        )
    except SupabaseRestError as exc:
        # Fallback for environments where profile insert/update RLS is temporarily inconsistent.
        if not _is_rls_write_failure(exc):
            raise
        sb_service = SupabaseRest(
            str(settings.supabase_url), settings.supabase_service_role_key
        )
        row = await sb_service.upsert_one(
            "profiles",
            bearer_token=settings.supabase_service_role_key,
            on_conflict="id",
            row=row_data,
        )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save preferences",
        )
    return _to_preferences(row)


@router.delete("/preferences/data")
async def delete_my_data(auth: AuthDep) -> dict[str, bool]:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    # Core user data tables only; profile/auth records stay intact.
    await sb.delete(
        "ai_reports",
        bearer_token=auth.access_token,
        params={"user_id": f"eq.{auth.user_id}"},
    )
    await sb.delete(
        "activity_logs",
        bearer_token=auth.access_token,
        params={"user_id": f"eq.{auth.user_id}"},
    )
    return {"ok": True}


@router.delete("/preferences/account")
async def delete_my_account(auth: AuthDep) -> dict[str, bool]:
    sb_service = SupabaseRest(
        str(settings.supabase_url), settings.supabase_service_role_key
    )
    service_token = settings.supabase_service_role_key

    async def _delete_table(table: str, params: dict[str, str]) -> None:
        for attempt in range(2):
            try:
                await sb_service.delete(table, bearer_token=service_token, params=params)
                return
            except SupabaseRestError as exc:
                if _is_ignorable_delete_failure(exc):
                    return
                if attempt == 0 and exc.status_code >= 500:
                    await asyncio.sleep(0)
                    continue
                raise

    try:
        await asyncio.gather(
            _delete_table("ai_reports", {"user_id": f"eq.{auth.user_id}"}),
            _delete_table("activity_logs", {"user_id": f"eq.{auth.user_id}"}),
            _delete_table("usage_events", {"user_id": f"eq.{auth.user_id}"}),
            _delete_table("subscriptions", {"user_id": f"eq.{auth.user_id}"}),
        )
        await _delete_table("profiles", {"id": f"eq.{auth.user_id}"})
    except SupabaseRestError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account data",
        )

    admin_url = (
        f"{str(settings.supabase_url).rstrip('/')}/auth/v1/admin/users/{auth.user_id}"
    )
    try:
        resp = await get_http().delete(
            admin_url,
            headers={
                "apikey": service_token,
                "Authorization": f"Bearer {service_token}",
            },
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete auth user",
        )
    if resp.status_code >= 400 and resp.status_code != 404:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete auth user",
        )

    return {"ok": True}
