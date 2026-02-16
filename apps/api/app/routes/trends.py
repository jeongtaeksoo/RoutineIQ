from __future__ import annotations

import hashlib
from datetime import date, timedelta
from typing import Any, Literal, NamedTuple, cast

from fastapi import APIRouter

from app.core.config import settings
from app.core.security import AuthDep
from app.schemas.preferences import (
    CompareDimension,
    CohortTrendEventRequest,
    CohortTrendMetrics,
    CohortTrendResponse,
    CohortThresholdVariant,
)
from app.services.supabase_rest import SupabaseRest
from app.services.usage import insert_usage_event

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


class ThresholdPolicy(NamedTuple):
    variant: CohortThresholdVariant
    preview_n: int
    min_n: int
    high_n: int


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


def _clamp_thresholds(preview_n: int, min_n: int, high_n: int) -> tuple[int, int, int]:
    min_sample = max(int(min_n), 1)
    preview_sample = min(max(int(preview_n), 1), min_sample)
    high_sample = max(int(high_n), min_sample)
    return preview_sample, min_sample, high_sample


def _threshold_policy_for_user(user_id: str) -> ThresholdPolicy:
    control_preview, control_min, control_high = _clamp_thresholds(
        settings.cohort_preview_sample_size,
        settings.cohort_min_sample_size,
        settings.cohort_high_confidence_sample_size,
    )
    if not settings.cohort_threshold_experiment_enabled:
        return ThresholdPolicy(
            variant="control",
            preview_n=control_preview,
            min_n=control_min,
            high_n=control_high,
        )

    exp_preview, exp_min, exp_high = _clamp_thresholds(
        settings.cohort_experiment_preview_sample_size,
        settings.cohort_experiment_min_sample_size,
        settings.cohort_experiment_high_confidence_sample_size,
    )
    rollout = max(0, min(int(settings.cohort_threshold_experiment_rollout_pct), 100))
    bucket = hashlib.sha256(user_id.encode("utf-8")).digest()[0] % 100
    if bucket < rollout:
        return ThresholdPolicy(
            variant="candidate",
            preview_n=exp_preview,
            min_n=exp_min,
            high_n=exp_high,
        )
    return ThresholdPolicy(
        variant="control",
        preview_n=control_preview,
        min_n=control_min,
        high_n=control_high,
    )


def _to_date(value: Any) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _split_rows_by_weeks(
    rows: list[dict[str, Any]],
    *,
    current_start: date,
    previous_start: date,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    current_rows: list[dict[str, Any]] = []
    previous_rows: list[dict[str, Any]] = []
    for row in rows:
        row_day = _to_date(row.get("date"))
        if row_day is None:
            continue
        if row_day >= current_start:
            current_rows.append(row)
        elif row_day >= previous_start:
            previous_rows.append(row)
    return current_rows, previous_rows


def _delta(cur: float | None, prev: float | None) -> float | None:
    if cur is None or prev is None:
        return None
    return round(cur - prev, 2)


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
    cohort_size: int, min_n: int, high_n: int
) -> Literal["low", "medium", "high"]:
    if cohort_size < min_n:
        return "low"
    if cohort_size < high_n:
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

    threshold_policy = _threshold_policy_for_user(auth.user_id)
    min_n = threshold_policy.min_n
    preview_n = threshold_policy.preview_n
    high_n = threshold_policy.high_n

    if not trend_opt_in:
        return CohortTrendResponse(
            enabled=False,
            insufficient_sample=True,
            min_sample_size=min_n,
            preview_sample_size=preview_n,
            high_confidence_sample_size=high_n,
            threshold_variant=threshold_policy.variant,
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

    today = date.today()
    current_week_start = today - timedelta(days=6)
    previous_week_start = today - timedelta(days=13)
    my_rows = await sb_rls.select(
        "activity_logs",
        bearer_token=auth.access_token,
        params={
            "select": "date,entries",
            "user_id": f"eq.{auth.user_id}",
            "date": f"gte.{previous_week_start.isoformat()}",
            "order": "date.asc",
        },
    )
    current_rows, previous_rows = _split_rows_by_weeks(
        my_rows,
        current_start=current_week_start,
        previous_start=previous_week_start,
    )
    my_focus_rate, my_rebound_rate, my_recovery_rate = _compute_my_rates(current_rows)
    prev_focus_rate, prev_rebound_rate, prev_recovery_rate = _compute_my_rates(
        previous_rows
    )
    my_focus_delta = _delta(my_focus_rate, prev_focus_rate)
    my_rebound_delta = _delta(my_rebound_rate, prev_rebound_rate)
    my_recovery_delta = _delta(my_recovery_rate, prev_recovery_rate)

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
    confidence_level = _cohort_confidence_level(cohort_size, min_n, high_n)
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
        high_confidence_sample_size=high_n,
        threshold_variant=threshold_policy.variant,
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
        my_focus_delta_7d=my_focus_delta,
        my_rebound_delta_7d=my_rebound_delta,
        my_recovery_delta_7d=my_recovery_delta,
        rank_label=rank_label,
        actionable_tip=actionable_tip,
    )


@router.post("/trends/cohort/event")
async def track_cohort_event(
    payload: CohortTrendEventRequest, auth: AuthDep
) -> dict[str, bool]:
    try:
        await insert_usage_event(
            user_id=auth.user_id,
            event_date=date.today(),
            event_type=f"cohort_{payload.event_type}",
            model="cohort-card",
            tokens_prompt=None,
            tokens_completion=None,
            tokens_total=None,
            cost_usd=None,
            meta={
                "threshold_variant": payload.threshold_variant,
                "confidence_level": payload.confidence_level,
                "preview_mode": payload.preview_mode,
                "cohort_size": payload.cohort_size,
                "window_days": payload.window_days,
                "compare_by": payload.compare_by,
            },
            access_token=auth.access_token,
        )
        return {"ok": True}
    except Exception:
        return {"ok": False}
