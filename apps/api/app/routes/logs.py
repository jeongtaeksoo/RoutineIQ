from __future__ import annotations

from datetime import date as Date

from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.core.security import AuthDep
from app.schemas.logs import ActivityLogRow, UpsertLogRequest
from app.services.error_log import log_system_error
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


async def _save_log_row(
    sb: SupabaseRest,
    *,
    bearer_token: str,
    user_id: str,
    date_iso: str,
    row_with_meta: dict,
    base_row: dict,
) -> dict:
    """Create or update an activity log using PATCH-first, INSERT-fallback pattern.

    PATCH (HTTP PATCH) updates an existing row and never returns 409.
    If no row exists (PATCH returns 0 rows), INSERT creates it.
    A race-condition SELECT guards against concurrent-insert edge cases.
    """
    filter_params = {"user_id": f"eq.{user_id}", "date": f"eq.{date_iso}"}
    include_meta = True
    active_row: dict = row_with_meta

    # ── Step 1: UPDATE existing row (PATCH never 409s on existing rows) ───────
    try:
        updated = await sb.patch(
            "activity_logs",
            bearer_token=bearer_token,
            params=filter_params,
            payload=active_row,
        )
        if updated:
            result = dict(updated[0])
            if not isinstance(result.get("meta"), dict):
                result["meta"] = {}
            return result
        # 0 rows updated → no existing row; fall through to INSERT
    except SupabaseRestError as exc:
        if _is_missing_meta_column(exc):
            include_meta = False
            active_row = base_row
            updated = await sb.patch(
                "activity_logs",
                bearer_token=bearer_token,
                params=filter_params,
                payload=active_row,
            )
            if updated:
                result = dict(updated[0])
                result.setdefault("meta", {})
                return result
            # Still 0 rows → fall through to INSERT
        else:
            raise

    # ── Step 2: INSERT (row didn't exist yet) ─────────────────────────────────
    try:
        inserted = await sb.insert_one(
            "activity_logs",
            bearer_token=bearer_token,
            row=active_row,
        )
        if isinstance(inserted, dict) and inserted:
            if not isinstance(inserted.get("meta"), dict):
                inserted["meta"] = {}
            return inserted
    except SupabaseRestError as exc:
        if _is_conflict_error(exc):
            # Race condition: another request inserted the row between PATCH and INSERT.
            existing = await _select_existing_log_row(
                sb,
                bearer_token=bearer_token,
                user_id=user_id,
                date_iso=date_iso,
                include_meta=include_meta,
            )
            if existing is not None:
                return existing
        raise

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

    row = await _save_log_row(
        sb,
        bearer_token=auth.access_token,
        user_id=auth.user_id,
        date_iso=date_iso,
        row_with_meta=row_with_meta,
        base_row=base_row,
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save log",
        )

    # Keep streak fields persisted on profile for fast dashboard access.
    # This must be best-effort: never fail the main /logs save on auxiliary errors.
    try:
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
        await log_system_error(
            route="/api/logs",
            message="streak/profile side-effect failed (non-blocking)",
            user_id=auth.user_id,
            err=exc,
            meta={
                "code": exc.code,
                "status_code": exc.status_code,
                "date": date_iso,
            },
        )

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
