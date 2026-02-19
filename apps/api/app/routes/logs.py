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


def _is_conflict_error(exc: SupabaseRestError) -> bool:
    msg = str(exc).lower()
    details = str(exc.details).lower() if exc.details is not None else ""
    return (
        exc.status_code == 409
        or exc.code == "23505"
        or "duplicate key" in msg
        or "duplicate key" in details
        or "conflict" in msg
    )


async def _select_existing_log_row(
    sb: SupabaseRest,
    *,
    bearer_token: str,
    user_id: str,
    date_iso: str,
    include_meta: bool,
) -> dict | None:
    select_fields = (
        "id,user_id,date,entries,note,meta,created_at,updated_at"
        if include_meta
        else "id,user_id,date,entries,note,created_at,updated_at"
    )
    try:
        rows = await sb.select(
            "activity_logs",
            bearer_token=bearer_token,
            params={
                "select": select_fields,
                "user_id": f"eq.{user_id}",
                "date": f"eq.{date_iso}",
                "limit": 1,
            },
        )
    except SupabaseRestError as exc:
        if include_meta and _is_missing_meta_column(exc):
            return await _select_existing_log_row(
                sb,
                bearer_token=bearer_token,
                user_id=user_id,
                date_iso=date_iso,
                include_meta=False,
            )
        raise

    if not rows:
        return None
    row = dict(rows[0])
    if not isinstance(row.get("meta"), dict):
        row["meta"] = {}
    return row


async def _upsert_log_row_with_conflict_recovery(
    sb: SupabaseRest,
    *,
    bearer_token: str,
    on_conflict: str,
    row: dict,
    user_id: str,
    date_iso: str,
    include_meta: bool,
) -> dict:
    last_conflict: SupabaseRestError | None = None
    for _ in range(2):
        try:
            return await sb.upsert_one(
                "activity_logs",
                bearer_token=bearer_token,
                on_conflict=on_conflict,
                row=row,
            )
        except SupabaseRestError as exc:
            if _is_conflict_error(exc):
                last_conflict = exc
                continue
            raise

    recovered = await _select_existing_log_row(
        sb,
        bearer_token=bearer_token,
        user_id=user_id,
        date_iso=date_iso,
        include_meta=include_meta,
    )
    if recovered is not None:
        return recovered
    if last_conflict is not None:
        raise last_conflict
    return {}


@router.post("/logs", response_model=ActivityLogRow)
async def upsert_log(body: UpsertLogRequest, auth: AuthDep) -> ActivityLogRow:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    date_iso = body.date.isoformat()

    base_row = {
        "user_id": auth.user_id,
        "date": date_iso,
        "entries": [e.model_dump() for e in body.entries],
        "note": body.note,
    }
    row_with_meta = {
        **base_row,
        "meta": body.meta.model_dump(exclude_none=True) if body.meta else {},
    }
    try:
        row = await _upsert_log_row_with_conflict_recovery(
            sb,
            bearer_token=auth.access_token,
            on_conflict="user_id,date",
            row=row_with_meta,
            user_id=auth.user_id,
            date_iso=date_iso,
            include_meta=True,
        )
    except SupabaseRestError as exc:
        # Backward-compatible fallback for environments where `activity_logs.meta`
        # has not been migrated yet.
        if not _is_missing_meta_column(exc):
            raise
        row = await _upsert_log_row_with_conflict_recovery(
            sb,
            bearer_token=auth.access_token,
            on_conflict="user_id,date",
            row=base_row,
            user_id=auth.user_id,
            date_iso=date_iso,
            include_meta=False,
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
            "date": f"lte.{date_iso}",
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
        if not missing_streak_column and not _is_conflict_error(exc):
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
