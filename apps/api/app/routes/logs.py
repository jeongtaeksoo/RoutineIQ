from __future__ import annotations

from datetime import date as Date

from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.core.security import AuthDep
from app.schemas.logs import ActivityLogRow, UpsertLogRequest
from app.services.streaks import compute_streaks, extract_log_dates
from app.services.supabase_rest import SupabaseRest, SupabaseRestError

router = APIRouter()


def _is_missing_meta_column(exc: SupabaseRestError) -> bool:
    msg = str(exc).lower()
    return exc.code == "42703" or ("column" in msg and "meta" in msg)


@router.post("/logs", response_model=ActivityLogRow)
async def upsert_log(body: UpsertLogRequest, auth: AuthDep) -> ActivityLogRow:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    base_row = {
        "user_id": auth.user_id,
        "date": body.date.isoformat(),
        "entries": [e.model_dump() for e in body.entries],
        "note": body.note,
    }
    row_with_meta = {
        **base_row,
        "meta": body.meta.model_dump(exclude_none=True) if body.meta else {},
    }
    try:
        row = await sb.upsert_one(
            "activity_logs",
            bearer_token=auth.access_token,
            on_conflict="user_id,date",
            row=row_with_meta,
        )
    except SupabaseRestError as exc:
        # Backward-compatible fallback for environments where `activity_logs.meta`
        # has not been migrated yet.
        if not _is_missing_meta_column(exc):
            raise
        row = await sb.upsert_one(
            "activity_logs",
            bearer_token=auth.access_token,
            on_conflict="user_id,date",
            row=base_row,
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save log",
        )

    # Keep streak fields persisted on profile for fast dashboard access.
    streak_rows = await sb.select(
        "activity_logs",
        bearer_token=auth.access_token,
        params={
            "select": "date",
            "user_id": f"eq.{auth.user_id}",
            "date": f"lte.{body.date.isoformat()}",
            "order": "date.asc",
            "limit": 5000,
        },
    )
    current_streak, longest_streak = compute_streaks(
        log_dates=extract_log_dates(streak_rows),
        anchor_date=body.date,
    )
    try:
        await sb.upsert_one(
            "profiles",
            bearer_token=auth.access_token,
            on_conflict="id",
            row={
                "id": auth.user_id,
                "current_streak": current_streak,
                "longest_streak": longest_streak,
            },
        )
    except SupabaseRestError as exc:
        # Backward-compatible fallback for environments where the streak migration
        # has not been applied yet.
        detail = str(exc).lower()
        missing_streak_column = (
            exc.code == "42703"
            or "current_streak" in detail
            or "longest_streak" in detail
        )
        if not missing_streak_column:
            raise

    return ActivityLogRow.model_validate(row)


@router.get("/logs")
async def get_log(
    auth: AuthDep,
    date: Date = Query(..., description="YYYY-MM-DD"),
) -> dict:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    params = {
        "select": "id,user_id,date,entries,note,meta,created_at,updated_at",
        "user_id": f"eq.{auth.user_id}",
        "date": f"eq.{date.isoformat()}",
        "limit": 1,
    }
    try:
        rows = await sb.select(
            "activity_logs",
            bearer_token=auth.access_token,
            params=params,
        )
    except SupabaseRestError as exc:
        if not _is_missing_meta_column(exc):
            raise
        rows = await sb.select(
            "activity_logs",
            bearer_token=auth.access_token,
            params={
                "select": "id,user_id,date,entries,note,created_at,updated_at",
                "user_id": f"eq.{auth.user_id}",
                "date": f"eq.{date.isoformat()}",
                "limit": 1,
            },
        )
    if not rows:
        return {"date": date.isoformat(), "entries": [], "note": None, "meta": {}}
    row = dict(rows[0])
    if not isinstance(row.get("meta"), dict):
        row["meta"] = {}
    return row
