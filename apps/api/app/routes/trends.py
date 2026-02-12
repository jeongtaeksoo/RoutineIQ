from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.core.config import settings
from app.core.security import AuthDep
from app.schemas.preferences import CohortTrendMetrics, CohortTrendResponse
from app.services.supabase_rest import SupabaseRest


router = APIRouter()


_DIM_KEYS = ("age_group", "gender", "job_family", "work_mode", "chronotype")


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


def _message_for(auth_locale: str, *, focus: float | None, rebound: float | None, recovery: float | None, cohort_size: int) -> str:
    if auth_locale == "ko":
        focus_text = f"집중 블록 유지율 {focus:.0f}%" if focus is not None else "집중 블록 유지율 데이터"
        rebound_text = f"집중 붕괴 후 복귀율 {rebound:.0f}%" if rebound is not None else "복귀율 데이터"
        recovery_text = f"회복 버퍼 사용일 비율 {recovery:.0f}%" if recovery is not None else "회복 버퍼 데이터"
        return f"유사 코호트 {cohort_size}명 기준: {focus_text}, {rebound_text}, {recovery_text}. 내일은 회복 버퍼 1개를 먼저 고정해 보세요."
    focus_text = f"focus-window consistency {focus:.0f}%" if focus is not None else "focus-window data"
    rebound_text = f"rebound rate {rebound:.0f}%" if rebound is not None else "rebound data"
    recovery_text = f"recovery-buffer day rate {recovery:.0f}%" if recovery is not None else "recovery data"
    return f"Among {cohort_size} similar users: {focus_text}, {rebound_text}, {recovery_text}. For tomorrow, lock one recovery buffer first."


@router.get("/trends/cohort", response_model=CohortTrendResponse)
async def get_cohort_trend(auth: AuthDep) -> CohortTrendResponse:
    sb_rls = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    sb_service = SupabaseRest(str(settings.supabase_url), settings.supabase_service_role_key)

    own_rows = await sb_rls.select(
        "profiles",
        bearer_token=auth.access_token,
        params={
            "select": "age_group,gender,job_family,work_mode,chronotype,trend_opt_in,trend_compare_by",
            "id": f"eq.{auth.user_id}",
            "limit": 1,
        },
    )
    own = own_rows[0] if own_rows else {}
    trend_opt_in = bool(own.get("trend_opt_in"))

    compare_by_raw = own.get("trend_compare_by")
    compare_by: list[str] = []
    if isinstance(compare_by_raw, list):
        for dim in compare_by_raw:
            if isinstance(dim, str) and dim in _DIM_KEYS and dim not in compare_by:
                compare_by.append(dim)

    if not trend_opt_in:
        return CohortTrendResponse(
            enabled=False,
            insufficient_sample=True,
            min_sample_size=max(int(settings.cohort_min_sample_size), 1),
            cohort_size=0,
            active_users=0,
            window_days=max(int(settings.cohort_window_days), 7),
            compare_by=compare_by,
            filters={},
            metrics=CohortTrendMetrics(),
            message="Enable cohort comparison in Preferences to see similar-user trends.",
        )

    profile_values = {
        "age_group": str(own.get("age_group") or "unknown"),
        "gender": str(own.get("gender") or "unknown"),
        "job_family": str(own.get("job_family") or "unknown"),
        "work_mode": str(own.get("work_mode") or "unknown"),
        "chronotype": str(own.get("chronotype") or "unknown"),
    }

    effective_compare_by: list[str] = []
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
            "p_chronotype": profile_values["chronotype"],
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

    min_n = max(int(settings.cohort_min_sample_size), 1)
    insufficient = cohort_size < min_n
    if insufficient:
        msg = (
            f"코호트 표본이 아직 충분하지 않습니다 ({cohort_size}/{min_n}). "
            "비교 옵션을 줄이거나 조금 더 데이터가 쌓이면 트렌드를 확인할 수 있습니다."
            if auth.locale == "ko"
            else f"Cohort sample is still small ({cohort_size}/{min_n}). Narrow fewer filters or wait for more data."
        )
    else:
        msg = _message_for(
            auth.locale,
            focus=metrics.focus_window_rate,
            rebound=metrics.rebound_rate,
            recovery=metrics.recovery_buffer_day_rate,
            cohort_size=cohort_size,
        )

    return CohortTrendResponse(
        enabled=True,
        insufficient_sample=insufficient,
        min_sample_size=min_n,
        cohort_size=cohort_size,
        active_users=active_users,
        window_days=max(int(settings.cohort_window_days), 7),
        compare_by=effective_compare_by,
        filters=filters,
        metrics=metrics,
        message=msg,
    )
