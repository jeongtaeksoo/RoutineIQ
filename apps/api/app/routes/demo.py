from __future__ import annotations

from datetime import date as Date
from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.rate_limit import consume
from app.core.security import AuthContext, AuthDep
from app.schemas.ai_report import (
    AIReport,
    FailurePattern,
    IfThenRule,
    ProductivityPeak,
    TomorrowRoutineItem,
    YesterdayPlanVsActual,
)
from app.services.supabase_rest import SupabaseRest

router = APIRouter()


class DemoSeedRequest(BaseModel):
    reset: bool = True
    days: int = Field(default=7, ge=1, le=14)
    include_reports: bool = False


class DemoSeedResponse(BaseModel):
    ok: bool
    seeded_days: int
    from_date: Date
    to_date: Date
    reports_seeded: bool = False


def _is_prod() -> bool:
    return (settings.app_env or "").strip().lower() in {"production", "prod"}


async def _is_admin(auth: AuthContext) -> bool:
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    rows = await sb.select(
        "profiles",
        bearer_token=auth.access_token,
        params={"select": "role", "id": f"eq.{auth.user_id}", "limit": 1},
    )
    return bool(rows and rows[0].get("role") == "admin")


async def _can_seed(auth: AuthContext) -> bool:
    if auth.is_anonymous:
        return True
    if auth.email and auth.email.lower().endswith("@routineiq.test"):
        return True
    if await _is_admin(auth):
        return True
    # Non-demo regular users are blocked in all environments.
    if not _is_prod():
        return False
    return False


def _entries_for_offset(offset: int) -> list[dict]:
    templates = [
        [
            {
                "start": "09:00",
                "end": "09:30",
                "activity": "Planning + setup",
                "energy": 3,
                "focus": 3,
                "tags": ["planning"],
            },
            {
                "start": "09:30",
                "end": "10:30",
                "activity": "Deep work sprint",
                "energy": 4,
                "focus": 5,
                "tags": ["deep-work"],
            },
            {
                "start": "11:00",
                "end": "12:00",
                "activity": "Meetings / collaboration",
                "energy": 3,
                "focus": 3,
                "tags": ["meeting"],
            },
            {
                "start": "14:00",
                "end": "15:00",
                "activity": "Execution block",
                "energy": 4,
                "focus": 4,
                "tags": ["execution"],
            },
            {
                "start": "16:00",
                "end": "16:30",
                "activity": "Wrap-up review",
                "energy": 2,
                "focus": 3,
                "tags": ["review"],
            },
        ],
        [
            {
                "start": "08:30",
                "end": "09:00",
                "activity": "Morning planning",
                "energy": 3,
                "focus": 3,
                "tags": ["planning"],
            },
            {
                "start": "09:00",
                "end": "10:20",
                "activity": "Deep work sprint",
                "energy": 4,
                "focus": 5,
                "tags": ["deep-work"],
            },
            {
                "start": "10:30",
                "end": "11:00",
                "activity": "Recovery break",
                "energy": 2,
                "focus": 2,
                "tags": ["recovery"],
            },
            {
                "start": "13:00",
                "end": "14:00",
                "activity": "Project execution",
                "energy": 4,
                "focus": 4,
                "tags": ["execution"],
            },
            {
                "start": "15:30",
                "end": "16:30",
                "activity": "Admin / communication",
                "energy": 3,
                "focus": 3,
                "tags": ["admin"],
            },
        ],
        [
            {
                "start": "09:00",
                "end": "09:45",
                "activity": "Priority alignment",
                "energy": 3,
                "focus": 3,
                "tags": ["planning"],
            },
            {
                "start": "10:00",
                "end": "11:10",
                "activity": "Deep work sprint",
                "energy": 4,
                "focus": 5,
                "tags": ["deep-work"],
            },
            {
                "start": "11:20",
                "end": "12:00",
                "activity": "Meetings / collaboration",
                "energy": 3,
                "focus": 3,
                "tags": ["meeting"],
            },
            {
                "start": "14:00",
                "end": "15:20",
                "activity": "Focused execution",
                "energy": 4,
                "focus": 4,
                "tags": ["execution"],
            },
            {
                "start": "16:00",
                "end": "16:30",
                "activity": "Wrap-up review",
                "energy": 2,
                "focus": 3,
                "tags": ["review"],
            },
        ],
    ]
    selected = templates[offset % len(templates)]
    return [{**entry, "note": None} for entry in selected]


def _report_fixture(locale: str) -> dict:
    coach_line = {
        "ko": "내일은 집중 블록 사이에 10분 버퍼를 넣어 흐름을 지켜보세요.",
        "ja": "明日は集中ブロックの間に10分バッファを入れて流れを守りましょう。",
        "zh": "明天在专注块之间加入10分钟缓冲，保持节奏。",
        "es": "Mañana añade un buffer de 10 minutos entre bloques para sostener el ritmo.",
    }.get(
        locale,
        "Tomorrow, add a 10-minute buffer between focus blocks to protect momentum.",
    )

    return AIReport(
        summary={
            "ko": "기록된 패턴에서 오전 몰입이 가장 높고, 전환 구간에서 흔들림이 있었습니다.",
            "ja": "記録パターンでは午前の集中が高く、切り替え区間で崩れが見られました。",
            "zh": "记录显示上午专注度更高，切换时段容易中断。",
            "es": "Tus registros muestran mejor foco por la mañana y caídas en transiciones.",
        }.get(
            locale,
            "Your logs show stronger morning focus and breakdowns during transitions.",
        ),
        productivity_peaks=[
            ProductivityPeak(
                start="09:30",
                end="11:00",
                reason="High focus with fewer interruptions.",
            ),
        ],
        failure_patterns=[
            FailurePattern(
                pattern="Context switching after meetings",
                trigger="No recovery buffer",
                fix="5-minute reset + restart with a single next action",
            )
        ],
        tomorrow_routine=[
            TomorrowRoutineItem(
                start="09:30",
                end="10:30",
                activity="Protect one core focus block",
                goal="Finish one meaningful output before noon",
            ),
            TomorrowRoutineItem(
                start="10:30",
                end="10:45",
                activity="Add intentional reset after context switches",
                goal="Reduce focus collapse",
            ),
        ],
        if_then_rules=[
            IfThenRule(
                **{
                    "if": "If concentration drops after a switch",
                    "then": "Run a 5-minute reset and start a 25-minute focus sprint",
                }
            )
        ],
        coach_one_liner=coach_line,
        yesterday_plan_vs_actual=YesterdayPlanVsActual(
            comparison_note=(
                "No previous plan baseline yet. Use this as the first reference point."
            ),
            top_deviation="NO_PREVIOUS_PLAN",
        ),
    ).model_dump(by_alias=True)


@router.post("/demo/seed", response_model=DemoSeedResponse)
async def seed_demo_data(body: DemoSeedRequest, auth: AuthDep) -> DemoSeedResponse:
    if not await _can_seed(auth):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo seed is available only for demo sessions or admins.",
        )
    # Abuse guard: keep demo seeding bounded per user.
    await consume(key=f"demo_seed:{auth.user_id}", limit=6, window_seconds=60)

    today = Date.today()
    from_date = today - timedelta(days=body.days - 1)

    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    date_filter = (
        f"(user_id.eq.{auth.user_id},"
        f"date.gte.{from_date.isoformat()},"
        f"date.lte.{today.isoformat()})"
    )

    if body.reset:
        await sb.delete(
            "ai_reports",
            bearer_token=auth.access_token,
            params={"and": date_filter},
        )
        await sb.delete(
            "activity_logs",
            bearer_token=auth.access_token,
            params={"and": date_filter},
        )

    for i in range(body.days):
        day = from_date + timedelta(days=i)
        entries = _entries_for_offset(i)
        await sb.upsert_one(
            "activity_logs",
            bearer_token=auth.access_token,
            on_conflict="user_id,date",
            row={
                "user_id": auth.user_id,
                "date": day.isoformat(),
                "entries": entries,
                "note": "Demo seed day",
            },
        )
        if body.include_reports:
            await sb.upsert_one(
                "ai_reports",
                bearer_token=auth.access_token,
                on_conflict="user_id,date",
                row={
                    "user_id": auth.user_id,
                    "date": day.isoformat(),
                    "report": _report_fixture(auth.locale),
                    "model": "demo-seed|loc=" + auth.locale,
                },
            )

    return DemoSeedResponse(
        ok=True,
        seeded_days=body.days,
        from_date=from_date,
        to_date=today,
        reports_seeded=body.include_reports,
    )
