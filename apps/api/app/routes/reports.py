from __future__ import annotations

from datetime import date as Date

from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.core.security import AuthDep
from app.services.supabase_rest import SupabaseRest

router = APIRouter()


@router.get("/reports")
async def get_report(
    auth: AuthDep, date: Date = Query(..., description="YYYY-MM-DD")
) -> dict:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    rows = await sb.select(
        "ai_reports",
        bearer_token=auth.access_token,
        params={
            "select": "date,report,created_at,updated_at,model",
            "user_id": f"eq.{auth.user_id}",
            "date": f"eq.{date.isoformat()}",
            "limit": 1,
        },
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No AI Coach Report for this date yet. Run Analyze to generate it.",
        )
    row = rows[0]
    return {
        "date": row.get("date"),
        "report": row.get("report"),
        "model": row.get("model"),
    }
