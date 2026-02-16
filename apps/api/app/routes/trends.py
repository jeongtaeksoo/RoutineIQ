from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal, cast

from fastapi import APIRouter

from app.core.config import settings
from app.core.security import AuthDep
from app.schemas.preferences import (
    CompareDimension,
    CohortTrendMetrics,
    CohortTrendResponse,
)
from app.services.supabase_rest import SupabaseRest

router = APIRouter()


_DIM_KEYS: tuple[CompareDimension, ...] = (
    "age_group",
    "gender",
    "job_family",
    "work_mode",
)

_RECOVERY_ACTIVITY_KEYWORDS: tuple[str, ...] = (
    "break",
    "rest",
    "walk",
    "stretch",
    "휴식",
    "산책",
    "스트레칭",
    "休憩",
    "拉伸",
    "descanso",
)


def _as_int(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value))
        except ValueError:
            return 0
    return 0


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    if isinstance(value, str):
        try:
            return round(float(value), 2)
        except ValueError:
            return None
    return None


def _to_scale_1_5(value: Any) -> int | None:
    if isinstance(value, int) and 1 <= value <= 5:
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            parsed = int(stripped)
            if 1 <= parsed <= 5:
                return parsed
    return None


def _to_minutes(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if len(text) != 5 or text[2] != ":":
        return None
    hh, mm = text.split(":", 1)
    if not (hh.isdigit() and mm.isdigit()):
        return None
    h = int(hh)
    m = int(mm)
    if h < 0 or h > 23 or m < 0 or m > 59:
        return None
    return (h * 60) + m


def _is_recovery_activity(activity: str) -> bool:
    lowered = activity.lower()
    return any(keyword in lowered for keyword in _RECOVERY_ACTIVITY_KEYWORDS)


def _compute_my_rates(
    rows: list[dict[str, Any]],
) -> tuple[float | None, float | None, float | None]:
    focus_num = 0
    focus_den = 0
    rebound_num = 0
    rebound_den = 0
    active_days: set[str] = set()
    recovery_days: set[str] = set()
    by_day: dict[str, list[dict[str, int | None]]] = {}

    for row in rows:
        day = str(row.get("date") or "")
        entries = row.get("entries")
        if not isinstance(entries, list):
            continue

        parsed_day_entries: list[dict[str, int | None]] = []
        for item in entries:
            if not isinstance(item, dict):
                continue
            start_m = _to_minutes(item.get("start"))
            end_m = _to_minutes(item.get("end"))
            if start_m is None or end_m is None or end_m <= start_m:
                continue

            duration = end_m - start_m
            focus = _to_scale_1_5(item.get("focus"))
            energy = _to_scale_1_5(item.get("energy"))
            activity = str(item.get("activity") or "")

            active_days.add(day)
            parsed_day_entries.append(
                {
                    "start_m": start_m,
                    "end_m": end_m,
                    "focus": focus,
                    "duration": duration,
                }
            )

            if duration >= 30 and focus is not None:
                focus_den += 1
            if duration >= 45 and focus is not None and focus >= 4:
                focus_num += 1

            if _is_recovery_activity(activity) or (
                5 <= duration <= 20
                and (
                    (focus is not None and focus <= 2)
                    or (energy is not None and energy <= 2)
                )
            ):
                recovery_days.add(day)

        if parsed_day_entries:
            by_day.setdefault(day, []).extend(parsed_day_entries)

    for day_entries in by_day.values():
        ordered = sorted(day_entries, key=lambda item: int(item["start_m"] or 0))
        for idx, cur in enumerate(ordered[:-1]):
            cur_focus = cur.get("focus")
            cur_end = cur.get("end_m")
            if cur_focus is None or cur_focus > 2 or cur_end is None:
                continue
            rebound_den += 1
            nxt = ordered[idx + 1]
            nxt_focus = nxt.get("focus")
            nxt_start = nxt.get("start_m")
            if nxt_focus is None or nxt_start is None:
                continue
            gap = nxt_start - cur_end
            if nxt_focus >= 3 and gap >= 0 and gap <= 60:
                rebound_num += 1

    my_focus_rate = round((focus_num * 100.0) / focus_den, 2) if focus_den else None
    my_rebound_rate = (
        round((rebound_num * 100.0) / rebound_den, 2) if rebound_den else None
    )
    my_recovery_rate = (
        round((len(recovery_days) * 100.0) / len(active_days), 2)
        if active_days
        else None
    )
    return my_focus_rate, my_rebound_rate, my_recovery_rate


def _rank_label(locale: str, my_focus: float | None, cohort_focus: float | None) -> str:
    if my_focus is None or cohort_focus is None:
        return ""
    if my_focus >= (cohort_focus * 1.2):
        return "상위 20%" if locale == "ko" else "Top 20%"
    if my_focus >= cohort_focus:
        return "평균 이상" if locale == "ko" else "Above average"
    return "성장 중" if locale == "ko" else "Growing"


def _actionable_tip(
    locale: str,
    *,
    my_focus: float | None,
    my_rebound: float | None,
    my_recovery: float | None,
    cohort_focus: float | None,
    cohort_rebound: float | None,
    cohort_recovery: float | None,
) -> str:
    deficits: list[tuple[float, str]] = []
    if my_focus is not None and cohort_focus is not None:
        deficits.append((my_focus - cohort_focus, "focus"))
    if my_rebound is not None and cohort_rebound is not None:
        deficits.append((my_rebound - cohort_rebound, "rebound"))
    if my_recovery is not None and cohort_recovery is not None:
        deficits.append((my_recovery - cohort_recovery, "recovery"))

    if deficits:
        weakest_gap, weakest_key = min(deficits, key=lambda item: item[0])
        if weakest_gap < 0:
            if weakest_key == "focus":
                return (
                    "내일 오전에 45분 이상 집중 블록 1개를 먼저 확보해 보세요."
                    if locale == "ko"
                    else "Lock one 45+ minute focus block first tomorrow morning."
                )
            if weakest_key == "rebound":
                return (
                    "집중이 깨졌을 때 5분 리셋(물+스트레칭) 후 바로 복귀해 보세요."
                    if locale == "ko"
                    else "When focus breaks, do a 5-minute reset (water + stretch) and return right away."
                )
            return (
                "내일 일정에 15분 회복 버퍼를 1개 추가해 보세요."
                if locale == "ko"
                else "Add one 15-minute recovery buffer to tomorrow's schedule."
            )

    return (
        "좋은 리듬을 유지하고 있어요! 내일도 같은 패턴을 이어가세요."
        if locale == "ko"
        else "You are keeping a solid rhythm. Carry the same pattern into tomorrow."
    )


def _message_for(
    auth_locale: str,
    *,
    focus: float | None,
    rebound: float | None,
    recovery: float | None,
    cohort_size: int,
) -> str:
    if auth_locale == "ko":
        focus_text = (
            f"집중 블록 유지율 {focus:.0f}%"
            if focus is not None
            else "집중 블록 유지율 데이터"
        )
        rebound_text = (
            f"집중 붕괴 후 복귀율 {rebound:.0f}%"
            if rebound is not None
            else "복귀율 데이터"
        )
        recovery_text = (
            f"회복 버퍼 사용일 비율 {recovery:.0f}%"
            if recovery is not None
            else "회복 버퍼 데이터"
        )
        return f"유사 코호트 {cohort_size}명 기준: {focus_text}, {rebound_text}, {recovery_text}. 내일은 회복 버퍼 1개를 먼저 고정해 보세요."
    focus_text = (
        f"focus-window consistency {focus:.0f}%"
        if focus is not None
        else "focus-window data"
    )
    rebound_text = (
        f"rebound rate {rebound:.0f}%" if rebound is not None else "rebound data"
    )
    recovery_text = (
        f"recovery-buffer day rate {recovery:.0f}%"
        if recovery is not None
        else "recovery data"
    )
    return f"Among {cohort_size} similar users: {focus_text}, {rebound_text}, {recovery_text}. For tomorrow, lock one recovery buffer first."


def _cohort_confidence_level(
    cohort_size: int, min_n: int
) -> Literal["low", "medium", "high"]:
    if cohort_size < min_n:
        return "low"
    if cohort_size < (min_n * 2):
        return "medium"
    return "high"


@router.get("/trends/cohort", response_model=CohortTrendResponse)
async def get_cohort_trend(auth: AuthDep) -> CohortTrendResponse:
    sb_rls = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    sb_service = SupabaseRest(
        str(settings.supabase_url), settings.supabase_service_role_key
    )

    own_rows = await sb_rls.select(
        "profiles",
        bearer_token=auth.access_token,
        params={
            "select": "age_group,gender,job_family,work_mode,trend_opt_in,trend_compare_by",
            "id": f"eq.{auth.user_id}",
            "limit": 1,
        },
    )
    own = own_rows[0] if own_rows else {}
    trend_opt_in = bool(own.get("trend_opt_in"))

    compare_by_raw = own.get("trend_compare_by")
    compare_by: list[CompareDimension] = []
    if isinstance(compare_by_raw, list):
        for dim in compare_by_raw:
            if isinstance(dim, str) and dim in _DIM_KEYS and dim not in compare_by:
                compare_by.append(cast(CompareDimension, dim))

    min_n = max(int(settings.cohort_min_sample_size), 1)
    preview_n = min(max(int(settings.cohort_preview_sample_size), 1), min_n)

    if not trend_opt_in:
        return CohortTrendResponse(
            enabled=False,
            insufficient_sample=True,
            min_sample_size=min_n,
            preview_sample_size=preview_n,
            preview_mode=False,
            confidence_level="low",
            cohort_size=0,
            active_users=0,
            window_days=max(int(settings.cohort_window_days), 7),
            compare_by=compare_by,
            filters={},
            metrics=CohortTrendMetrics(),
            message=(
                "개인 설정을 저장하면 유사 사용자 트렌드가 표시됩니다."
                if auth.locale == "ko"
                else "Save your profile in Preferences to unlock similar-user trends."
            ),
        )

    profile_values = {
        "age_group": str(own.get("age_group") or "unknown"),
        "gender": str(own.get("gender") or "unknown"),
        "job_family": str(own.get("job_family") or "unknown"),
        "work_mode": str(own.get("work_mode") or "unknown"),
    }

    seven_days_ago = (date.today() - timedelta(days=6)).isoformat()
    my_rows = await sb_rls.select(
        "activity_logs",
        bearer_token=auth.access_token,
        params={
            "select": "date,entries",
            "user_id": f"eq.{auth.user_id}",
            "date": f"gte.{seven_days_ago}",
            "order": "date.asc",
        },
    )
    my_focus_rate, my_rebound_rate, my_recovery_rate = _compute_my_rates(my_rows)

    effective_compare_by: list[CompareDimension] = []
    filters: dict[str, str] = {}
    for dim in compare_by:
        val = profile_values.get(dim, "unknown")
        if val in {"unknown", "prefer_not_to_say"}:
            continue
        effective_compare_by.append(dim)
        filters[dim] = val

    rows = await sb_service.rpc(
        "cohort_trend_summary",
        bearer_token=settings.supabase_service_role_key,
        params={
            "p_age_group": profile_values["age_group"],
            "p_gender": profile_values["gender"],
            "p_job_family": profile_values["job_family"],
            "p_work_mode": profile_values["work_mode"],
            "p_chronotype": "unknown",
            "p_compare_by": effective_compare_by,
            "p_window_days": max(int(settings.cohort_window_days), 7),
        },
    )

    data = rows[0] if rows else {}
    cohort_size = _as_int(data.get("cohort_size"))
    active_users = _as_int(data.get("active_users"))

    metrics = CohortTrendMetrics(
        focus_window_rate=_as_float(data.get("focus_window_rate")),
        rebound_rate=_as_float(data.get("rebound_rate")),
        recovery_buffer_day_rate=_as_float(data.get("recovery_buffer_day_rate")),
        focus_window_numerator=_as_int(data.get("focus_window_numerator")),
        focus_window_denominator=_as_int(data.get("focus_window_denominator")),
        rebound_numerator=_as_int(data.get("rebound_numerator")),
        rebound_denominator=_as_int(data.get("rebound_denominator")),
        recovery_day_numerator=_as_int(data.get("recovery_day_numerator")),
        recovery_day_denominator=_as_int(data.get("recovery_day_denominator")),
    )

    insufficient = cohort_size < preview_n
    preview_mode = preview_n <= cohort_size < min_n
    confidence_level = _cohort_confidence_level(cohort_size, min_n)
    if insufficient:
        msg = (
            f"코호트 표본이 아직 충분하지 않습니다 ({cohort_size}/{preview_n}). "
            f"참고용 미리보기는 최소 {preview_n}명부터 제공됩니다."
            if auth.locale == "ko"
            else f"Cohort sample is still small ({cohort_size}/{preview_n}). Preview becomes available at {preview_n}+ users."
        )
    elif preview_mode:
        msg = (
            f"참고용 미리보기입니다 ({cohort_size}/{min_n}). 표본이 더 쌓이면 정식 비교를 제공합니다."
            if auth.locale == "ko"
            else f"Preview only ({cohort_size}/{min_n}). Full comparison unlocks after more samples."
        )
    else:
        msg = _message_for(
            auth.locale,
            focus=metrics.focus_window_rate,
            rebound=metrics.rebound_rate,
            recovery=metrics.recovery_buffer_day_rate,
            cohort_size=cohort_size,
        )

    rank_label = (
        ""
        if preview_mode
        else _rank_label(auth.locale, my_focus_rate, metrics.focus_window_rate)
    )
    actionable_tip = (
        ""
        if preview_mode
        else _actionable_tip(
            auth.locale,
            my_focus=my_focus_rate,
            my_rebound=my_rebound_rate,
            my_recovery=my_recovery_rate,
            cohort_focus=metrics.focus_window_rate,
            cohort_rebound=metrics.rebound_rate,
            cohort_recovery=metrics.recovery_buffer_day_rate,
        )
    )

    return CohortTrendResponse(
        enabled=True,
        insufficient_sample=insufficient,
        min_sample_size=min_n,
        preview_sample_size=preview_n,
        preview_mode=preview_mode,
        confidence_level=confidence_level,
        cohort_size=cohort_size,
        active_users=active_users,
        window_days=max(int(settings.cohort_window_days), 7),
        compare_by=effective_compare_by,
        filters=filters,
        metrics=metrics,
        message=msg,
        my_focus_rate=my_focus_rate,
        my_rebound_rate=my_rebound_rate,
        my_recovery_rate=my_recovery_rate,
        rank_label=rank_label,
        actionable_tip=actionable_tip,
    )
