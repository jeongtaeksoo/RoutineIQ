from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.core.security import AuthDep
from app.schemas.preferences import DEFAULT_COMPARE_BY, ProfilePreferences
from app.services.supabase_rest import SupabaseRest


router = APIRouter()


def _normalize_compare_by(value: object) -> list[str]:
    if not isinstance(value, list):
        return list(DEFAULT_COMPARE_BY)
    out: list[str] = []
    for item in value:
        if isinstance(item, str) and item in {"age_group", "gender", "job_family", "work_mode", "chronotype"} and item not in out:
            out.append(item)
    return out or list(DEFAULT_COMPARE_BY)


def _to_preferences(row: dict) -> ProfilePreferences:
    return ProfilePreferences.model_validate(
        {
            "age_group": row.get("age_group") or "unknown",
            "gender": row.get("gender") or "unknown",
            "job_family": row.get("job_family") or "unknown",
            "work_mode": row.get("work_mode") or "unknown",
            "chronotype": row.get("chronotype") or "unknown",
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
            "select": "id,age_group,gender,job_family,work_mode,chronotype,trend_opt_in,trend_compare_by,goal_keyword,goal_minutes_per_day",
            "id": f"eq.{auth.user_id}",
            "limit": 1,
        },
    )
    if rows:
        return _to_preferences(rows[0])
    return ProfilePreferences()


@router.put("/preferences/profile", response_model=ProfilePreferences)
async def upsert_profile_preferences(body: ProfilePreferences, auth: AuthDep) -> ProfilePreferences:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    row = await sb.upsert_one(
        "profiles",
        bearer_token=auth.access_token,
        on_conflict="id",
        row={
            "id": auth.user_id,
            "email": auth.email,
            "age_group": body.age_group,
            "gender": body.gender,
            "job_family": body.job_family,
            "work_mode": body.work_mode,
            "chronotype": body.chronotype,
            "trend_opt_in": body.trend_opt_in,
            "trend_compare_by": body.trend_compare_by,
            "goal_keyword": body.goal_keyword,
            "goal_minutes_per_day": body.goal_minutes_per_day,
        },
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save preferences")
    return _to_preferences(row)
