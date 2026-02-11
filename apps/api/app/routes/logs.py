from __future__ import annotations

from datetime import date as Date

from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.core.security import AuthDep
from app.schemas.logs import ActivityLogRow, UpsertLogRequest
from app.services.supabase_rest import SupabaseRest


router = APIRouter()


@router.post("/logs", response_model=ActivityLogRow)
async def upsert_log(body: UpsertLogRequest, auth: AuthDep) -> ActivityLogRow:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    row = await sb.upsert_one(
        "activity_logs",
        bearer_token=auth.access_token,
        on_conflict="user_id,date",
        row={
            "user_id": auth.user_id,
            "date": body.date.isoformat(),
            "entries": [e.model_dump() for e in body.entries],
            "note": body.note,
        },
    )

    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save log")
    return ActivityLogRow.model_validate(row)


@router.get("/logs")
async def get_log(
    auth: AuthDep,
    date: Date = Query(..., description="YYYY-MM-DD"),
) -> dict:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
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
        return {"date": date.isoformat(), "entries": [], "note": None}
    return rows[0]

