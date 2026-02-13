from __future__ import annotations

from datetime import date as Date
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.core.security import AuthDep
from app.schemas.insights import (
    ConsistencyPayload,
    GoalPrefs,
    InsightsWeeklyResponse,
    WeeklySeriesPoint,
    WeeklySummaryPayload,
)
from app.services.supabase_rest import SupabaseRest


router = APIRouter()


def _to_minutes(hhmm: str | None) -> int | None:
    if not isinstance(hhmm, str) or len(hhmm) != 5 or hhmm[2] != ":":
        return None
    try:
        hh = int(hhmm[:2])
        mm = int(hhmm[3:])
    except ValueError:
        return None
    if hh < 0 or hh > 23 or mm < 0 or mm > 59:
        return None
    return hh * 60 + mm


def _coerce_entries(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    out: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            out.append(item)
    return out


def _deep_minutes(entries: list[dict[str, Any]], goal_keyword: str | None) -> int:
    if not goal_keyword:
        return 0
    keyword = goal_keyword.strip().lower()
    if not keyword:
        return 0

    total = 0
    for entry in entries:
        activity = entry.get("activity")
        tags = entry.get("tags")
        hay = str(activity or "")
        if isinstance(tags, list):
            hay = f"{hay} {' '.join(str(t) for t in tags)}"
        if keyword not in hay.lower():
            continue
        start_m = _to_minutes(entry.get("start"))
        end_m = _to_minutes(entry.get("end"))
        if start_m is None or end_m is None or end_m <= start_m:
            continue
        total += end_m - start_m
    return total


@router.get("/insights/weekly", response_model=InsightsWeeklyResponse)
async def get_weekly_insights(
    auth: AuthDep,
    from_date: Date = Query(..., alias="from"),
    to_date: Date = Query(..., alias="to"),
) -> InsightsWeeklyResponse:
    if to_date < from_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'to' must be greater than or equal to 'from'",
        )
    window_days = (to_date - from_date).days + 1
    if window_days > 31:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date window cannot exceed 31 days",
        )

    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    profile_rows = await sb.select(
        "profiles",
        bearer_token=auth.access_token,
        params={
            "select": "goal_keyword,goal_minutes_per_day",
            "id": f"eq.{auth.user_id}",
            "limit": 1,
        },
    )
    profile = profile_rows[0] if profile_rows else {}
    goal_keyword = profile.get("goal_keyword")
    goal_minutes_raw = profile.get("goal_minutes_per_day")
    goal_minutes = int(goal_minutes_raw) if isinstance(goal_minutes_raw, int) else None
    goal = (
        GoalPrefs(keyword=goal_keyword.strip(), minutes_per_day=goal_minutes)
        if isinstance(goal_keyword, str)
        and goal_keyword.strip()
        and isinstance(goal_minutes, int)
        and goal_minutes > 0
        else None
    )

    # For cumulative consistency score (days logged / days since first log).
    until_rows = await sb.select(
        "activity_logs",
        bearer_token=auth.access_token,
        params={
            "select": "date",
            "user_id": f"eq.{auth.user_id}",
            "date": f"lte.{to_date.isoformat()}",
            "order": "date.asc",
            "limit": 5000,
        },
    )
    days_logged_total = len(until_rows)
    if days_logged_total:
        earliest_raw = until_rows[0].get("date")
        earliest = Date.fromisoformat(str(earliest_raw))
        days_total = max(1, (to_date - earliest).days + 1)
    else:
        days_total = window_days
    score = int(round((days_logged_total / days_total) * 100)) if days_total > 0 else 0
    score = min(100, max(0, score))

    range_rows = await sb.select(
        "activity_logs",
        bearer_token=auth.access_token,
        params={
            "select": "date,entries",
            "and": f"(user_id.eq.{auth.user_id},date.gte.{from_date.isoformat()},date.lte.{to_date.isoformat()})",
            "order": "date.asc",
            "limit": 5000,
        },
    )

    by_date: dict[str, list[dict[str, Any]]] = {}
    for row in range_rows:
        key = str(row.get("date") or "")
        by_date[key] = _coerce_entries(row.get("entries"))

    series: list[WeeklySeriesPoint] = []
    total_blocks = 0
    deep_minutes = 0

    cursor = from_date
    while cursor <= to_date:
        key = cursor.isoformat()
        entries = by_date.get(key, [])
        blocks = len(entries)
        total_blocks += blocks
        deep_minutes += _deep_minutes(entries, goal.keyword if goal else None)
        series.append(
            WeeklySeriesPoint(
                date=cursor,
                day=cursor.isoformat()[5:],
                blocks=blocks,
            )
        )
        cursor += timedelta(days=1)

    consistency = ConsistencyPayload(
        score=score,
        days_logged=days_logged_total,
        days_total=days_total,
        series=series,
    )
    weekly = WeeklySummaryPayload(
        days_logged=days_logged_total,
        days_total=days_total,
        total_blocks=total_blocks,
        deep_minutes=deep_minutes,
        goal=goal,
    )

    return InsightsWeeklyResponse(from_date=from_date, to_date=to_date, consistency=consistency, weekly=weekly)
