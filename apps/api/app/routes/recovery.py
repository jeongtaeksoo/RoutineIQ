from __future__ import annotations

import hashlib
import math
import re
import secrets
from collections import Counter
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any
from uuid import uuid4

import sentry_sdk
from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.core.config import settings
from app.core.idempotency import (
    claim_idempotency_key,
    clear_idempotency_key,
    mark_idempotency_done,
)
from app.core.security import AuthDep
from app.schemas.recovery import (
    CheckinSubmittedEventMeta,
    LapseDetectedEventMeta,
    MinimumActionCompletedEventMeta,
    NudgeScheduledEventMeta,
    NudgeShownEventMeta,
    NudgeSuppressedEventMeta,
    RecoveryActionCompleteRequest,
    RecoveryActiveResponse,
    RecoveryAutoLapseRunResponse,
    RecoveryCheckinRequest,
    RecoveryCompleteRequest,
    RecoveryCompleteResponse,
    RecoveryCompletedEventMeta,
    RecoveryLapseRequest,
    RecoveryModeOpenedEventMeta,
    RecoveryModeOpenedRequest,
    RecoveryNudgeAckRequest,
    RecoveryNudgeEnvelope,
    RecoveryNudgePayload,
    RecoveryNudgeRunResponse,
    RecoveryProtocolStartRequest,
    RecoveryProtocolStartedEventMeta,
    RecoverySessionResponse,
    RecoverySummaryResponse,
)
from app.services.error_log import log_system_error
from app.services.recovery_engine import (
    compute_lapse_start,
    decide_auto_lapse,
    decide_nudge,
    to_utc,
)
from app.services.supabase_rest import SupabaseRest, SupabaseRestError
from app.services.usage import insert_usage_event

router = APIRouter()

_IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9._:\-]{8,128}$")

_NUDGE_MESSAGE_BY_LOCALE: dict[str, str] = {
    "ko": "완벽하게 다시 시작할 필요는 없어요. 2분짜리 최소 행동 1개부터 해볼까요?",
    "en": "You don't need a perfect restart. Try one 2-minute minimum action now.",
    "ja": "完璧に再開しなくて大丈夫です。まずは2分の最小アクションから始めましょう。",
    "zh": "不需要完美重启。先从一个2分钟的最小行动开始。",
    "es": "No necesitas reiniciar perfecto. Empieza con una accion minima de 2 minutos.",
}

_RECOVERY_REQUIRED_TABLES: tuple[str, ...] = (
    "recovery_sessions",
    "user_recovery_state",
    "recovery_nudges",
)
_RECOVERY_PREFLIGHT_SELECT_COLUMN: dict[str, str] = {
    "recovery_sessions": "id",
    "user_recovery_state": "user_id",
    "recovery_nudges": "id",
}
_RECOVERY_MIGRATION_FILES: tuple[str, ...] = (
    "supabase/patches/2026-02-17_recovery_sessions.sql",
    "supabase/patches/2026-02-18_recovery_state_and_nudges.sql",
)


def _ensure_enabled() -> None:
    if not settings.recovery_v1_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _ensure_auto_lapse_enabled() -> None:
    _ensure_enabled()
    if not settings.auto_lapse_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _ensure_nudge_enabled() -> None:
    _ensure_enabled()
    if not settings.recovery_nudge_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _verify_cron_token(request: Request) -> None:
    expected = (settings.recovery_cron_token or "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Recovery cron token is not configured",
        )
    provided = (request.headers.get("X-Recovery-Cron-Token") or "").strip()
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        )


def _normalize_idempotency_key(value: str | None) -> str | None:
    if not value:
        return None
    key = value.strip()
    if not key or not _IDEMPOTENCY_KEY_RE.fullmatch(key):
        return None
    return key


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return to_utc(value)
    if isinstance(value, str):
        raw = value.strip()
        if raw.endswith("Z"):
            raw = f"{raw[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
            return to_utc(parsed)
        except ValueError:
            return None
    return None


def _as_int(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value))
        except ValueError:
            return None
    return None


def _as_str(value: Any, *, default: str = "") -> str:
    return value if isinstance(value, str) else default


def _correlation_id(request: Request, response: Response) -> str:
    incoming = (request.headers.get("X-Correlation-ID") or "").strip()
    cid = incoming if incoming else uuid4().hex[:16]
    response.headers["X-Correlation-ID"] = cid
    return cid


def _is_unique_open_conflict(exc: SupabaseRestError) -> bool:
    msg = str(exc).lower()
    return exc.code == "23505" and "recovery_sessions_one_open_per_user" in msg


def _is_unique_nudge_conflict(exc: SupabaseRestError) -> bool:
    msg = str(exc).lower()
    return exc.code == "23505" and "recovery_nudges_user_session_channel_uniq" in msg


def _is_table_missing_error(exc: SupabaseRestError) -> bool:
    blob = " ".join(
        [
            str(exc.code or ""),
            str(exc),
            str(exc.hint or ""),
            str(exc.details or ""),
        ]
    ).lower()
    if exc.code in {"42P01", "PGRST205"}:
        return True
    return (
        ("does not exist" in blob and "relation" in blob)
        or "table not found" in blob
        or "could not find the table" in blob
    )


def _is_permission_or_rls_error(exc: SupabaseRestError) -> bool:
    blob = " ".join(
        [
            str(exc.code or ""),
            str(exc),
            str(exc.hint or ""),
            str(exc.details or ""),
        ]
    ).lower()
    if exc.status_code in {401, 403}:
        return True
    if exc.code in {"42501", "PGRST301", "PGRST302"}:
        return True
    return (
        "permission denied" in blob
        or "insufficient_privilege" in blob
        or "row-level security" in blob
        or "rls" in blob
    )


async def _log_cron_preflight_error(
    *,
    route: str,
    correlation_id: str,
    detail: dict[str, Any],
    err: BaseException,
) -> None:
    try:
        await _log_recovery_error(
            route=route,
            message="Recovery cron preflight failed",
            user_id=None,
            correlation_id=correlation_id,
            area="cron_preflight",
            err=err,
            meta=detail,
        )
    except Exception:
        pass


async def _ensure_cron_runtime_ready(
    *,
    route: str,
    correlation_id: str,
) -> str:
    service_token = (settings.supabase_service_role_key or "").strip()
    if not service_token:
        detail = {
            "error": "recovery_cron_preflight_failed",
            "reason": "service_role_key_missing",
            "action": "Set SUPABASE_SERVICE_ROLE_KEY before running recovery cron endpoints.",
        }
        err = RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
        await _log_cron_preflight_error(
            route=route,
            correlation_id=correlation_id,
            detail=detail,
            err=err,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        )

    sb = SupabaseRest(str(settings.supabase_url), service_token)
    missing_tables: list[str] = []

    for table in _RECOVERY_REQUIRED_TABLES:
        try:
            await sb.select(
                table,
                bearer_token=service_token,
                params={
                    "select": _RECOVERY_PREFLIGHT_SELECT_COLUMN.get(table, "id"),
                    "limit": 1,
                },
            )
        except SupabaseRestError as exc:
            if _is_table_missing_error(exc):
                missing_tables.append(table)
                continue
            if _is_permission_or_rls_error(exc):
                detail = {
                    "error": "recovery_cron_preflight_failed",
                    "reason": "permission_or_rls",
                    "table": table,
                    "action": "Verify SUPABASE_SERVICE_ROLE_KEY permissions and RLS/policy configuration.",
                }
                await _log_cron_preflight_error(
                    route=route,
                    correlation_id=correlation_id,
                    detail=detail,
                    err=exc,
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=detail,
                )
            detail = {
                "error": "recovery_cron_preflight_failed",
                "reason": "preflight_query_failed",
                "table": table,
                "action": "Inspect API/Supabase logs for details and verify recovery schema health.",
            }
            await _log_cron_preflight_error(
                route=route,
                correlation_id=correlation_id,
                detail=detail,
                err=exc,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=detail,
            )

    if missing_tables:
        detail = {
            "error": "recovery_cron_preflight_failed",
            "reason": "missing_tables",
            "missing_tables": missing_tables,
            "action": "Apply migrations in order: "
            + ", ".join(_RECOVERY_MIGRATION_FILES),
        }
        err = RuntimeError(f"Missing recovery tables: {', '.join(missing_tables)}")
        await _log_cron_preflight_error(
            route=route,
            correlation_id=correlation_id,
            detail=detail,
            err=err,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        )

    return service_token


def _event_request_id(event_type: str, session_id: str) -> str:
    digest = hashlib.sha256(
        f"recovery:{event_type}:{session_id}".encode("utf-8")
    ).hexdigest()
    return digest[:40]


def _metric_request_id(
    metric: str, user_id: str, correlation_id: str, reason: str = ""
) -> str:
    digest = hashlib.sha256(
        f"metric:{metric}:{user_id}:{correlation_id}:{reason}".encode("utf-8")
    ).hexdigest()
    return digest[:40]


def _nudge_message(locale: str) -> str:
    key = (locale or "ko").strip().lower()
    return _NUDGE_MESSAGE_BY_LOCALE.get(key, _NUDGE_MESSAGE_BY_LOCALE["ko"])


def _is_recovery_mode_opened(entry_surface: Any) -> bool:
    if not isinstance(entry_surface, str):
        return False
    return bool(entry_surface.strip())


async def _log_recovery_error(
    *,
    route: str,
    message: str,
    user_id: str | None,
    correlation_id: str,
    area: str,
    err: BaseException,
    meta: dict[str, Any] | None = None,
) -> None:
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("area", area)
        scope.set_tag("correlation_id", correlation_id)
        scope.set_tag("route", route)
        if user_id:
            scope.set_user({"id": user_id})
        sentry_sdk.capture_exception(err)

    await log_system_error(
        route=route,
        message=message,
        user_id=user_id,
        err=err,
        meta={"correlation_id": correlation_id, "area": area, **(meta or {})},
    )


async def _track_event(
    *,
    user_id: str,
    access_token: str,
    event_type: str,
    event_meta: dict[str, Any],
    event_model: Any,
    correlation_id: str,
    request_id: str | None = None,
) -> None:
    validated = event_model.model_validate(event_meta)
    await insert_usage_event(
        user_id=user_id,
        event_date=_utc_now().date(),
        event_type=event_type,
        model="recovery-v1",
        tokens_prompt=None,
        tokens_completion=None,
        tokens_total=None,
        cost_usd=None,
        meta={
            **validated.model_dump(mode="json", exclude_none=True),
            "correlation_id": correlation_id,
        },
        access_token=access_token,
        request_id=request_id,
    )


async def _track_metric(
    *,
    user_id: str,
    access_token: str,
    metric_name: str,
    correlation_id: str,
    reason: str | None = None,
    session_id: str | None = None,
) -> None:
    await insert_usage_event(
        user_id=user_id,
        event_date=_utc_now().date(),
        event_type=metric_name,
        model="recovery-metrics",
        tokens_prompt=None,
        tokens_completion=None,
        tokens_total=None,
        cost_usd=None,
        meta={
            "correlation_id": correlation_id,
            "reason": reason,
            "session_id": session_id,
        },
        access_token=access_token,
        request_id=_metric_request_id(
            metric_name, user_id, correlation_id, reason or ""
        ),
    )


async def _get_open_session(
    sb: SupabaseRest, *, auth: AuthDep
) -> dict[str, Any] | None:
    rows = await sb.select(
        "recovery_sessions",
        bearer_token=auth.access_token,
        params={
            "select": "id,user_id,status,lapse_start_ts,protocol_type,intensity_level,entry_surface,rt_min,created_at,recovery_completed_at,detection_source",
            "user_id": f"eq.{auth.user_id}",
            "status": "eq.open",
            "order": "created_at.desc",
            "limit": 1,
        },
    )
    return rows[0] if rows else None


async def _get_session(
    sb: SupabaseRest, *, auth: AuthDep, session_id: str
) -> dict[str, Any] | None:
    rows = await sb.select(
        "recovery_sessions",
        bearer_token=auth.access_token,
        params={
            "select": "id,user_id,status,lapse_start_ts,protocol_type,intensity_level,entry_surface,rt_min,created_at,recovery_completed_at,detection_source",
            "id": f"eq.{session_id}",
            "user_id": f"eq.{auth.user_id}",
            "limit": 1,
        },
    )
    return rows[0] if rows else None


async def _get_user_state(
    sb: SupabaseRest,
    *,
    bearer_token: str,
    user_id: str,
) -> dict[str, Any] | None:
    rows = await sb.select(
        "user_recovery_state",
        bearer_token=bearer_token,
        params={
            "select": "user_id,last_engaged_at,lapse_threshold_hours,last_auto_lapse_at,last_nudge_at,locale,timezone,quiet_hours_start,quiet_hours_end,updated_at",
            "user_id": f"eq.{user_id}",
            "limit": 1,
        },
    )
    return rows[0] if rows else None


async def _upsert_user_state(
    sb: SupabaseRest,
    *,
    bearer_token: str,
    user_id: str,
    locale: str | None = None,
    timezone_name: str | None = None,
    last_engaged_at: datetime | None = None,
    last_auto_lapse_at: datetime | None = None,
    last_nudge_at: datetime | None = None,
) -> dict[str, Any]:
    current = await _get_user_state(sb, bearer_token=bearer_token, user_id=user_id)

    effective_last_engaged = last_engaged_at
    current_last_engaged = _to_dt(current.get("last_engaged_at")) if current else None
    if current_last_engaged is not None:
        if effective_last_engaged is None:
            effective_last_engaged = current_last_engaged
        else:
            effective_last_engaged = max(
                to_utc(effective_last_engaged), current_last_engaged
            )

    row: dict[str, Any] = {
        "user_id": user_id,
        "locale": locale if locale else (current.get("locale") if current else None),
        "timezone": (
            timezone_name
            if timezone_name
            else (current.get("timezone") if current else None)
        ),
    }

    if effective_last_engaged is not None:
        row["last_engaged_at"] = to_utc(effective_last_engaged).isoformat()
    if last_auto_lapse_at is not None:
        row["last_auto_lapse_at"] = to_utc(last_auto_lapse_at).isoformat()
    if last_nudge_at is not None:
        row["last_nudge_at"] = to_utc(last_nudge_at).isoformat()

    return await sb.upsert_one(
        "user_recovery_state",
        bearer_token=bearer_token,
        on_conflict="user_id",
        row=row,
    )


async def _ensure_open_session(
    sb: SupabaseRest,
    *,
    auth: AuthDep,
    session_id: str,
) -> dict[str, Any]:
    row = await _get_session(sb, auth=auth, session_id=session_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    if str(row.get("status")) != "open":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Recovery session is already completed",
        )
    return row


def _to_session_response(
    *,
    row: dict[str, Any],
    created: bool,
    correlation_id: str,
) -> RecoverySessionResponse:
    lapse_start = _to_dt(row.get("lapse_start_ts"))
    if lapse_start is None:
        lapse_start = _utc_now()
    return RecoverySessionResponse(
        session_id=str(row.get("id")),
        status="completed" if str(row.get("status")) == "completed" else "open",
        lapse_start_ts=lapse_start,
        created=created,
        correlation_id=correlation_id,
    )


def _threshold_hours(row: dict[str, Any]) -> int:
    return max(
        1,
        _as_int(row.get("lapse_threshold_hours"))
        or int(settings.recovery_lapse_default_threshold_hours),
    )


def _quiet_start(row: dict[str, Any]) -> int:
    value = _as_int(row.get("quiet_hours_start"))
    if value is not None:
        return value
    return int(settings.recovery_quiet_hours_start)


def _quiet_end(row: dict[str, Any]) -> int:
    value = _as_int(row.get("quiet_hours_end"))
    if value is not None:
        return value
    return int(settings.recovery_quiet_hours_end)


@router.post("/recovery/lapse", response_model=RecoverySessionResponse)
async def create_lapse_session(
    body: RecoveryLapseRequest,
    request: Request,
    response: Response,
    auth: AuthDep,
) -> RecoverySessionResponse:
    _ensure_enabled()
    correlation_id = _correlation_id(request, response)
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    raw_idem = _normalize_idempotency_key(request.headers.get("Idempotency-Key"))
    idem_key = f"recovery:lapse:{auth.user_id}:{raw_idem}" if raw_idem else None
    idem_acquired = False

    try:
        existing = await _get_open_session(sb, auth=auth)
        if existing:
            return _to_session_response(
                row=existing,
                created=False,
                correlation_id=correlation_id,
            )

        if idem_key:
            idem_state = await claim_idempotency_key(
                key=idem_key, processing_ttl_seconds=90
            )
            if idem_state != "acquired":
                existing = await _get_open_session(sb, auth=auth)
                if existing:
                    return _to_session_response(
                        row=existing,
                        created=False,
                        correlation_id=correlation_id,
                    )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Lapse session is processing",
                )
            idem_acquired = True

        lapse_start = to_utc(body.lapse_start_ts or _utc_now())
        session_id = str(uuid4())
        row = {
            "id": session_id,
            "user_id": auth.user_id,
            "status": "open",
            "detection_source": "self",
            "lapse_start_ts": lapse_start.isoformat(),
            "lapse_type": body.lapse_type,
            "entry_surface": body.entry_surface,
            "correlation_id": correlation_id,
        }
        try:
            created_row = await sb.insert_one(
                "recovery_sessions",
                bearer_token=auth.access_token,
                row=row,
            )
        except SupabaseRestError as exc:
            if _is_unique_open_conflict(exc):
                existing = await _get_open_session(sb, auth=auth)
                if existing:
                    if idem_key:
                        await mark_idempotency_done(key=idem_key, done_ttl_seconds=300)
                    return _to_session_response(
                        row=existing,
                        created=False,
                        correlation_id=correlation_id,
                    )
            raise

        try:
            await _track_event(
                user_id=auth.user_id,
                access_token=auth.access_token,
                event_type="lapse_detected",
                event_meta={
                    "detection_source": "self",
                    "lapse_id": session_id,
                    "lapse_start_ts": lapse_start,
                    "lapse_type": body.lapse_type,
                },
                event_model=LapseDetectedEventMeta,
                request_id=_event_request_id("lapse_detected", session_id),
                correlation_id=correlation_id,
            )
        except Exception as track_err:  # noqa: BLE001
            await _log_recovery_error(
                route="/api/recovery/lapse",
                message="Failed to record lapse_detected event",
                user_id=auth.user_id,
                correlation_id=correlation_id,
                area="recovery_v1",
                err=track_err,
                meta={"session_id": session_id},
            )

        if idem_key:
            await mark_idempotency_done(key=idem_key, done_ttl_seconds=300)
            idem_acquired = False

        return _to_session_response(
            row=created_row or row,
            created=True,
            correlation_id=correlation_id,
        )
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/lapse",
            message="Failed to create recovery lapse session",
            user_id=auth.user_id,
            correlation_id=correlation_id,
            area="recovery_v1",
            err=err,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Recovery service is temporarily unavailable",
        )
    finally:
        if idem_key and idem_acquired:
            await clear_idempotency_key(key=idem_key)


@router.get("/recovery/active", response_model=RecoveryActiveResponse)
async def get_active_session(
    request: Request,
    response: Response,
    auth: AuthDep,
) -> RecoveryActiveResponse:
    correlation_id = _correlation_id(request, response)
    if not settings.recovery_v1_enabled:
        return RecoveryActiveResponse(
            has_open_session=False,
            correlation_id=correlation_id,
        )
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    try:
        row = await _get_open_session(sb, auth=auth)
        if not row:
            return RecoveryActiveResponse(
                has_open_session=False,
                correlation_id=correlation_id,
            )

        lapse_start = _to_dt(row.get("lapse_start_ts"))
        elapsed_min = None
        if lapse_start is not None:
            elapsed_min = max(
                0,
                math.floor((_utc_now() - lapse_start).total_seconds() / 60.0),
            )

        return RecoveryActiveResponse(
            has_open_session=True,
            session_id=str(row.get("id")),
            lapse_start_ts=lapse_start,
            elapsed_min=elapsed_min,
            correlation_id=correlation_id,
        )
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/active",
            message="Failed to load active recovery session",
            user_id=auth.user_id,
            correlation_id=correlation_id,
            area="recovery_v1",
            err=err,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Recovery service is temporarily unavailable",
        )


@router.post("/recovery/mode-opened")
async def track_mode_opened(
    body: RecoveryModeOpenedRequest,
    request: Request,
    response: Response,
    auth: AuthDep,
) -> dict[str, bool]:
    _ensure_enabled()
    correlation_id = _correlation_id(request, response)
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    try:
        await _ensure_open_session(sb, auth=auth, session_id=body.session_id)
        await sb.upsert_one(
            "recovery_sessions",
            bearer_token=auth.access_token,
            on_conflict="id",
            row={
                "id": body.session_id,
                "user_id": auth.user_id,
                "entry_surface": body.entry_surface,
                "correlation_id": correlation_id,
            },
        )

        try:
            await _track_event(
                user_id=auth.user_id,
                access_token=auth.access_token,
                event_type="recovery_mode_opened",
                event_meta={
                    "entry_surface": body.entry_surface,
                    "lapse_id": body.session_id,
                },
                event_model=RecoveryModeOpenedEventMeta,
                correlation_id=correlation_id,
            )
        except Exception as track_err:  # noqa: BLE001
            await _log_recovery_error(
                route="/api/recovery/mode-opened",
                message="Failed to record recovery_mode_opened event",
                user_id=auth.user_id,
                correlation_id=correlation_id,
                area="recovery_v1",
                err=track_err,
                meta={"session_id": body.session_id},
            )

        return {"ok": True}
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/mode-opened",
            message="Failed to handle recovery_mode_opened",
            user_id=auth.user_id,
            correlation_id=correlation_id,
            area="recovery_v1",
            err=err,
            meta={"session_id": body.session_id},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Recovery service is temporarily unavailable",
        )


@router.post("/recovery/checkin")
async def submit_checkin(
    body: RecoveryCheckinRequest,
    request: Request,
    response: Response,
    auth: AuthDep,
) -> dict[str, bool]:
    _ensure_enabled()
    correlation_id = _correlation_id(request, response)
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    try:
        await _ensure_open_session(sb, auth=auth, session_id=body.session_id)
        await sb.upsert_one(
            "recovery_sessions",
            bearer_token=auth.access_token,
            on_conflict="id",
            row={
                "id": body.session_id,
                "user_id": auth.user_id,
                "checkin_energy": body.energy_level,
                "checkin_time_budget": body.time_budget_bucket,
                "checkin_context": body.context_tag,
                "correlation_id": correlation_id,
            },
        )

        try:
            await _track_event(
                user_id=auth.user_id,
                access_token=auth.access_token,
                event_type="checkin_submitted",
                event_meta={
                    "energy_level": body.energy_level,
                    "time_budget_bucket": body.time_budget_bucket,
                    "context_tag": body.context_tag,
                    "lapse_id": body.session_id,
                },
                event_model=CheckinSubmittedEventMeta,
                correlation_id=correlation_id,
            )
        except Exception as track_err:  # noqa: BLE001
            await _log_recovery_error(
                route="/api/recovery/checkin",
                message="Failed to record checkin_submitted event",
                user_id=auth.user_id,
                correlation_id=correlation_id,
                area="recovery_v1",
                err=track_err,
                meta={"session_id": body.session_id},
            )

        return {"ok": True}
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/checkin",
            message="Failed to submit recovery checkin",
            user_id=auth.user_id,
            correlation_id=correlation_id,
            area="recovery_v1",
            err=err,
            meta={"session_id": body.session_id},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Recovery service is temporarily unavailable",
        )


@router.post("/recovery/protocol/start")
async def start_protocol(
    body: RecoveryProtocolStartRequest,
    request: Request,
    response: Response,
    auth: AuthDep,
) -> dict[str, bool]:
    _ensure_enabled()
    correlation_id = _correlation_id(request, response)
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    try:
        await _ensure_open_session(sb, auth=auth, session_id=body.session_id)
        await sb.upsert_one(
            "recovery_sessions",
            bearer_token=auth.access_token,
            on_conflict="id",
            row={
                "id": body.session_id,
                "user_id": auth.user_id,
                "protocol_type": body.protocol_type,
                "intensity_level": body.intensity_level,
                "correlation_id": correlation_id,
            },
        )

        try:
            await _track_event(
                user_id=auth.user_id,
                access_token=auth.access_token,
                event_type="recovery_protocol_started",
                event_meta={
                    "protocol_type": body.protocol_type,
                    "intensity_level": body.intensity_level,
                    "lapse_id": body.session_id,
                },
                event_model=RecoveryProtocolStartedEventMeta,
                correlation_id=correlation_id,
            )
        except Exception as track_err:  # noqa: BLE001
            await _log_recovery_error(
                route="/api/recovery/protocol/start",
                message="Failed to record recovery_protocol_started event",
                user_id=auth.user_id,
                correlation_id=correlation_id,
                area="recovery_v1",
                err=track_err,
                meta={"session_id": body.session_id},
            )

        return {"ok": True}
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/protocol/start",
            message="Failed to start recovery protocol",
            user_id=auth.user_id,
            correlation_id=correlation_id,
            area="recovery_v1",
            err=err,
            meta={"session_id": body.session_id},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Recovery service is temporarily unavailable",
        )


@router.post("/recovery/action/complete")
async def complete_minimum_action(
    body: RecoveryActionCompleteRequest,
    request: Request,
    response: Response,
    auth: AuthDep,
) -> dict[str, bool]:
    _ensure_enabled()
    correlation_id = _correlation_id(request, response)
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    try:
        await _ensure_open_session(sb, auth=auth, session_id=body.session_id)
        now = _utc_now()
        await sb.upsert_one(
            "recovery_sessions",
            bearer_token=auth.access_token,
            on_conflict="id",
            row={
                "id": body.session_id,
                "user_id": auth.user_id,
                "minimum_action_type": body.action_type,
                "minimum_action_duration_min": body.duration_min,
                "correlation_id": correlation_id,
            },
        )

        try:
            await _track_event(
                user_id=auth.user_id,
                access_token=auth.access_token,
                event_type="minimum_action_completed",
                event_meta={
                    "action_type": body.action_type,
                    "duration_min": body.duration_min,
                    "lapse_id": body.session_id,
                },
                event_model=MinimumActionCompletedEventMeta,
                correlation_id=correlation_id,
            )
            await _upsert_user_state(
                sb,
                bearer_token=auth.access_token,
                user_id=auth.user_id,
                locale=auth.locale,
                last_engaged_at=now,
            )
        except Exception as track_err:  # noqa: BLE001
            await _log_recovery_error(
                route="/api/recovery/action/complete",
                message="Failed to record minimum_action_completed event",
                user_id=auth.user_id,
                correlation_id=correlation_id,
                area="recovery_v1",
                err=track_err,
                meta={"session_id": body.session_id},
            )

        return {"ok": True}
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/action/complete",
            message="Failed to complete minimum action",
            user_id=auth.user_id,
            correlation_id=correlation_id,
            area="recovery_v1",
            err=err,
            meta={"session_id": body.session_id},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Recovery service is temporarily unavailable",
        )


@router.post("/recovery/complete", response_model=RecoveryCompleteResponse)
async def complete_recovery(
    body: RecoveryCompleteRequest,
    request: Request,
    response: Response,
    auth: AuthDep,
) -> RecoveryCompleteResponse:
    _ensure_enabled()
    correlation_id = _correlation_id(request, response)
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)
    idem_key = f"recovery:complete:{auth.user_id}:{body.session_id}"

    idem_state = await claim_idempotency_key(key=idem_key, processing_ttl_seconds=120)
    if idem_state == "processing":
        current = await _get_session(sb, auth=auth, session_id=body.session_id)
        if current and str(current.get("status")) == "completed":
            rt_existing = max(0, _as_int(current.get("rt_min")) or 0)
            return RecoveryCompleteResponse(
                session_id=body.session_id,
                status="completed",
                rt_min=rt_existing,
                correlation_id=correlation_id,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Recovery completion is processing",
        )
    if idem_state == "done":
        current = await _get_session(sb, auth=auth, session_id=body.session_id)
        if current and str(current.get("status")) == "completed":
            rt_existing = max(0, _as_int(current.get("rt_min")) or 0)
            return RecoveryCompleteResponse(
                session_id=body.session_id,
                status="completed",
                rt_min=rt_existing,
                correlation_id=correlation_id,
            )

    try:
        current = await _get_session(sb, auth=auth, session_id=body.session_id)
        if not current:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )

        if str(current.get("status")) == "completed":
            rt_existing = max(0, _as_int(current.get("rt_min")) or 0)
            await mark_idempotency_done(key=idem_key, done_ttl_seconds=600)
            return RecoveryCompleteResponse(
                session_id=body.session_id,
                status="completed",
                rt_min=rt_existing,
                correlation_id=correlation_id,
            )

        lapse_start = _to_dt(current.get("lapse_start_ts"))
        if lapse_start is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Session has invalid lapse_start_ts",
            )

        completed_at = _utc_now()
        rt_min = max(0, math.floor((completed_at - lapse_start).total_seconds() / 60.0))

        await sb.upsert_one(
            "recovery_sessions",
            bearer_token=auth.access_token,
            on_conflict="id",
            row={
                "id": body.session_id,
                "user_id": auth.user_id,
                "status": "completed",
                "recovery_completed_at": completed_at.isoformat(),
                "rt_min": rt_min,
                "correlation_id": correlation_id,
            },
        )

        protocol_type = current.get("protocol_type")
        intensity_level = _as_int(current.get("intensity_level"))
        try:
            await _track_event(
                user_id=auth.user_id,
                access_token=auth.access_token,
                event_type="recovery_completed",
                event_meta={
                    "rt_min": rt_min,
                    "protocol_type": protocol_type,
                    "intensity_level": intensity_level,
                    "lapse_id": body.session_id,
                },
                event_model=RecoveryCompletedEventMeta,
                correlation_id=correlation_id,
                request_id=_event_request_id("recovery_completed", body.session_id),
            )
            await _upsert_user_state(
                sb,
                bearer_token=auth.access_token,
                user_id=auth.user_id,
                locale=auth.locale,
                last_engaged_at=completed_at,
            )
        except Exception as track_err:  # noqa: BLE001
            await _log_recovery_error(
                route="/api/recovery/complete",
                message="Failed to record recovery_completed event",
                user_id=auth.user_id,
                correlation_id=correlation_id,
                area="recovery_v1",
                err=track_err,
                meta={"session_id": body.session_id, "rt_min": rt_min},
            )

        await mark_idempotency_done(key=idem_key, done_ttl_seconds=600)

        return RecoveryCompleteResponse(
            session_id=body.session_id,
            status="completed",
            rt_min=rt_min,
            correlation_id=correlation_id,
        )
    except HTTPException:
        await clear_idempotency_key(key=idem_key)
        raise
    except Exception as err:  # noqa: BLE001
        await clear_idempotency_key(key=idem_key)
        await _log_recovery_error(
            route="/api/recovery/complete",
            message="Failed to complete recovery session",
            user_id=auth.user_id,
            correlation_id=correlation_id,
            area="recovery_v1",
            err=err,
            meta={"session_id": body.session_id},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Recovery service is temporarily unavailable",
        )


@router.get("/recovery/summary", response_model=RecoverySummaryResponse)
async def get_recovery_summary(
    request: Request,
    response: Response,
    auth: AuthDep,
    window_days: int = Query(default=14, ge=1, le=90),
) -> RecoverySummaryResponse:
    _ensure_enabled()
    correlation_id = _correlation_id(request, response)
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    try:
        start_ts = _utc_now() - timedelta(days=window_days)
        rows = await sb.select(
            "recovery_sessions",
            bearer_token=auth.access_token,
            params={
                "select": "id,status,rt_min,created_at",
                "user_id": f"eq.{auth.user_id}",
                "created_at": f"gte.{start_ts.isoformat()}",
                "order": "created_at.desc",
                "limit": 1000,
            },
        )

        started_count = len(rows)
        rt_values: list[int] = []
        completed_count = 0
        for row in rows:
            if str(row.get("status")) != "completed":
                continue
            completed_count += 1
            value = _as_int(row.get("rt_min"))
            if value is not None and value >= 0:
                rt_values.append(value)

        completion_rate = (
            round((completed_count / started_count) * 100.0, 2)
            if started_count > 0
            else 0.0
        )
        rt_p50_min = int(math.floor(median(rt_values))) if rt_values else None

        return RecoverySummaryResponse(
            window_days=window_days,
            started_count=started_count,
            completed_count=completed_count,
            completion_rate=completion_rate,
            rt_p50_min=rt_p50_min,
            correlation_id=correlation_id,
        )
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/summary",
            message="Failed to load recovery summary",
            user_id=auth.user_id,
            correlation_id=correlation_id,
            area="recovery_v1",
            err=err,
            meta={"window_days": window_days},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Recovery service is temporarily unavailable",
        )


@router.post("/recovery/cron/auto-lapse", response_model=RecoveryAutoLapseRunResponse)
async def run_auto_lapse_cron(
    request: Request,
    response: Response,
) -> RecoveryAutoLapseRunResponse:
    _ensure_auto_lapse_enabled()
    _verify_cron_token(request)
    correlation_id = _correlation_id(request, response)
    service_token = await _ensure_cron_runtime_ready(
        route="/api/recovery/cron/auto-lapse",
        correlation_id=correlation_id,
    )

    sb = SupabaseRest(str(settings.supabase_url), service_token)

    scanned = 0
    created_count = 0
    suppressed = Counter[str]()
    now = _utc_now()
    candidate_last_engaged_lte = now - timedelta(hours=1)
    candidate_last_auto_lapse_lte = now - timedelta(
        hours=int(settings.recovery_auto_lapse_cooldown_hours)
    )

    try:
        states = await sb.select(
            "user_recovery_state",
            bearer_token=service_token,
            params={
                "select": "user_id,last_engaged_at,lapse_threshold_hours,last_auto_lapse_at,last_nudge_at,locale,timezone,quiet_hours_start,quiet_hours_end",
                "last_engaged_at": f"lte.{candidate_last_engaged_lte.isoformat()}",
                "or": (
                    "(last_auto_lapse_at.is.null,"
                    f"last_auto_lapse_at.lte.{candidate_last_auto_lapse_lte.isoformat()})"
                ),
                "order": "last_engaged_at.asc",
                "limit": max(1, int(settings.recovery_auto_lapse_batch_size)),
            },
        )

        open_rows = await sb.select(
            "recovery_sessions",
            bearer_token=service_token,
            params={
                "select": "id,user_id,status,entry_surface,lapse_start_ts",
                "status": "eq.open",
                "limit": 5000,
            },
        )
        open_by_user = {
            _as_str(row.get("user_id")): row
            for row in open_rows
            if _as_str(row.get("user_id"))
        }

        for state in states:
            user_id = _as_str(state.get("user_id"))
            if not user_id:
                continue
            scanned += 1

            last_engaged = _to_dt(state.get("last_engaged_at"))
            threshold = _threshold_hours(state)
            last_auto = _to_dt(state.get("last_auto_lapse_at"))
            has_open = user_id in open_by_user

            decision = decide_auto_lapse(
                now_utc=now,
                last_engaged_at=last_engaged,
                threshold_hours=threshold,
                has_open_session=has_open,
                last_auto_lapse_at=last_auto,
                cooldown_hours=int(settings.recovery_auto_lapse_cooldown_hours),
            )
            if not decision.should_create:
                suppressed[decision.reason] += 1
                try:
                    await _track_metric(
                        user_id=user_id,
                        access_token=service_token,
                        metric_name="auto_lapse_suppressed_count",
                        correlation_id=correlation_id,
                        reason=decision.reason,
                    )
                except Exception:
                    pass
                continue

            if last_engaged is None:
                suppressed["missing_last_engaged"] += 1
                continue

            lapse_start = compute_lapse_start(last_engaged, threshold)
            session_id = str(uuid4())
            row = {
                "id": session_id,
                "user_id": user_id,
                "status": "open",
                "detection_source": "auto",
                "lapse_start_ts": lapse_start.isoformat(),
                "correlation_id": correlation_id,
            }

            try:
                created = await sb.insert_one(
                    "recovery_sessions",
                    bearer_token=service_token,
                    row=row,
                )
            except SupabaseRestError as exc:
                if _is_unique_open_conflict(exc):
                    suppressed["open_session_exists"] += 1
                    try:
                        await _track_metric(
                            user_id=user_id,
                            access_token=service_token,
                            metric_name="auto_lapse_suppressed_count",
                            correlation_id=correlation_id,
                            reason="open_session_exists",
                        )
                    except Exception:
                        pass
                    continue
                raise

            created_count += 1
            try:
                await _upsert_user_state(
                    sb,
                    bearer_token=service_token,
                    user_id=user_id,
                    locale=_as_str(state.get("locale"), default="ko"),
                    timezone_name=_as_str(state.get("timezone"), default=""),
                    last_auto_lapse_at=now,
                )
                await _track_event(
                    user_id=user_id,
                    access_token=service_token,
                    event_type="lapse_detected",
                    event_meta={
                        "detection_source": "auto",
                        "lapse_id": _as_str(created.get("id"), default=session_id),
                        "lapse_start_ts": lapse_start,
                        "lapse_type": None,
                    },
                    event_model=LapseDetectedEventMeta,
                    request_id=_event_request_id("lapse_detected", session_id),
                    correlation_id=correlation_id,
                )
                await _track_metric(
                    user_id=user_id,
                    access_token=service_token,
                    metric_name="auto_lapse_created_count",
                    correlation_id=correlation_id,
                    session_id=session_id,
                )
            except Exception as track_err:  # noqa: BLE001
                await _log_recovery_error(
                    route="/api/recovery/cron/auto-lapse",
                    message="Failed to update auto lapse telemetry/state",
                    user_id=user_id,
                    correlation_id=correlation_id,
                    area="auto_lapse",
                    err=track_err,
                    meta={"session_id": session_id},
                )

        return RecoveryAutoLapseRunResponse(
            scanned_users=scanned,
            created_count=created_count,
            suppressed_count=sum(suppressed.values()),
            suppressed_by_reason=dict(suppressed),
            correlation_id=correlation_id,
        )
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/cron/auto-lapse",
            message="Auto lapse cron failed",
            user_id=None,
            correlation_id=correlation_id,
            area="auto_lapse",
            err=err,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Auto lapse cron failed",
        )


@router.post("/recovery/cron/nudge", response_model=RecoveryNudgeRunResponse)
async def run_nudge_cron(
    request: Request,
    response: Response,
) -> RecoveryNudgeRunResponse:
    _ensure_nudge_enabled()
    _verify_cron_token(request)
    correlation_id = _correlation_id(request, response)
    service_token = await _ensure_cron_runtime_ready(
        route="/api/recovery/cron/nudge",
        correlation_id=correlation_id,
    )

    sb = SupabaseRest(str(settings.supabase_url), service_token)
    now = _utc_now()

    scanned = 0
    scheduled_count = 0
    shown_count = 0
    suppressed = Counter[str]()

    try:
        open_rows = await sb.select(
            "recovery_sessions",
            bearer_token=service_token,
            params={
                "select": "id,user_id,status,entry_surface,lapse_start_ts,detection_source",
                "status": "eq.open",
                "order": "created_at.desc",
                "limit": max(1, int(settings.recovery_nudge_batch_size)),
            },
        )

        for row in open_rows:
            session_id = _as_str(row.get("id"))
            user_id = _as_str(row.get("user_id"))
            if not session_id or not user_id:
                continue
            scanned += 1

            lapse_start = _to_dt(row.get("lapse_start_ts"))
            if lapse_start is None:
                suppressed["missing_lapse_start"] += 1
                continue

            state = await _get_user_state(
                sb, bearer_token=service_token, user_id=user_id
            )
            if not state:
                suppressed["missing_state"] += 1
                try:
                    await _track_event(
                        user_id=user_id,
                        access_token=service_token,
                        event_type="nudge_suppressed",
                        event_meta={"lapse_id": session_id, "reason": "missing_state"},
                        event_model=NudgeSuppressedEventMeta,
                        correlation_id=correlation_id,
                    )
                    await _track_metric(
                        user_id=user_id,
                        access_token=service_token,
                        metric_name="nudge_suppressed_count",
                        correlation_id=correlation_id,
                        reason="missing_state",
                        session_id=session_id,
                    )
                except Exception:
                    pass
                continue

            decision = decide_nudge(
                now_utc=now,
                lapse_start_ts=lapse_start,
                last_engaged_at=_to_dt(state.get("last_engaged_at")),
                has_open_session=True,
                recovery_mode_opened=_is_recovery_mode_opened(row.get("entry_surface")),
                last_nudge_at=_to_dt(state.get("last_nudge_at")),
                cooldown_hours=int(settings.recovery_nudge_cooldown_hours),
                timezone_name=_as_str(state.get("timezone"), default=""),
                locale=_as_str(state.get("locale"), default="ko"),
                quiet_start_hour=_quiet_start(state),
                quiet_end_hour=_quiet_end(state),
            )

            if not decision.should_send:
                suppressed[decision.reason] += 1
                try:
                    await _track_event(
                        user_id=user_id,
                        access_token=service_token,
                        event_type="nudge_suppressed",
                        event_meta={"lapse_id": session_id, "reason": decision.reason},
                        event_model=NudgeSuppressedEventMeta,
                        correlation_id=correlation_id,
                    )
                    await _track_metric(
                        user_id=user_id,
                        access_token=service_token,
                        metric_name="nudge_suppressed_count",
                        correlation_id=correlation_id,
                        reason=decision.reason,
                        session_id=session_id,
                    )
                except Exception:
                    pass
                continue

            locale = _as_str(state.get("locale"), default="ko")
            nudge_id = str(uuid4())
            nudge_row = {
                "id": nudge_id,
                "user_id": user_id,
                "session_id": session_id,
                "nudge_channel": "in_app",
                "status": "pending",
                "message": _nudge_message(locale),
                "lapse_start_ts": lapse_start.isoformat(),
                "scheduled_for": now.isoformat(),
                "correlation_id": correlation_id,
            }
            try:
                created = await sb.insert_one(
                    "recovery_nudges",
                    bearer_token=service_token,
                    row=nudge_row,
                )
            except SupabaseRestError as exc:
                if _is_unique_nudge_conflict(exc):
                    suppressed["already_scheduled"] += 1
                    try:
                        await _track_event(
                            user_id=user_id,
                            access_token=service_token,
                            event_type="nudge_suppressed",
                            event_meta={
                                "lapse_id": session_id,
                                "reason": "already_scheduled",
                            },
                            event_model=NudgeSuppressedEventMeta,
                            correlation_id=correlation_id,
                        )
                        await _track_metric(
                            user_id=user_id,
                            access_token=service_token,
                            metric_name="nudge_suppressed_count",
                            correlation_id=correlation_id,
                            reason="already_scheduled",
                            session_id=session_id,
                        )
                    except Exception:
                        pass
                    continue
                raise

            scheduled_count += 1
            created_id = _as_str(created.get("id"), default=nudge_id)
            try:
                await _upsert_user_state(
                    sb,
                    bearer_token=service_token,
                    user_id=user_id,
                    locale=locale,
                    timezone_name=_as_str(state.get("timezone"), default=""),
                    last_nudge_at=now,
                )
                await _track_event(
                    user_id=user_id,
                    access_token=service_token,
                    event_type="nudge_scheduled",
                    event_meta={
                        "lapse_id": session_id,
                        "nudge_id": created_id,
                        "channel": "in_app",
                    },
                    event_model=NudgeScheduledEventMeta,
                    correlation_id=correlation_id,
                    request_id=_event_request_id("nudge_scheduled", session_id),
                )
                await _track_metric(
                    user_id=user_id,
                    access_token=service_token,
                    metric_name="nudge_sent_count",
                    correlation_id=correlation_id,
                    session_id=session_id,
                )
            except Exception as track_err:  # noqa: BLE001
                await _log_recovery_error(
                    route="/api/recovery/cron/nudge",
                    message="Failed to update nudge telemetry/state",
                    user_id=user_id,
                    correlation_id=correlation_id,
                    area="nudge",
                    err=track_err,
                    meta={"session_id": session_id, "nudge_id": created_id},
                )

        return RecoveryNudgeRunResponse(
            scanned_sessions=scanned,
            scheduled_count=scheduled_count,
            shown_count=shown_count,
            suppressed_count=sum(suppressed.values()),
            suppressed_by_reason=dict(suppressed),
            correlation_id=correlation_id,
        )
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/cron/nudge",
            message="Nudge cron failed",
            user_id=None,
            correlation_id=correlation_id,
            area="nudge",
            err=err,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Nudge cron failed",
        )


@router.get("/recovery/nudge", response_model=RecoveryNudgeEnvelope)
async def get_pending_nudge(
    request: Request,
    response: Response,
    auth: AuthDep,
) -> RecoveryNudgeEnvelope:
    correlation_id = _correlation_id(request, response)
    if not (settings.recovery_v1_enabled and settings.recovery_nudge_enabled):
        return RecoveryNudgeEnvelope(has_nudge=False, correlation_id=correlation_id)
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    try:
        rows = await sb.select(
            "recovery_nudges",
            bearer_token=auth.access_token,
            params={
                "select": "id,session_id,message,lapse_start_ts,created_at,correlation_id,status",
                "user_id": f"eq.{auth.user_id}",
                "status": "eq.pending",
                "order": "created_at.desc",
                "limit": 1,
            },
        )
        if not rows:
            return RecoveryNudgeEnvelope(has_nudge=False, correlation_id=correlation_id)

        row = rows[0]
        lapse_start = _to_dt(row.get("lapse_start_ts")) or _utc_now()
        created_at = _to_dt(row.get("created_at")) or _utc_now()

        return RecoveryNudgeEnvelope(
            has_nudge=True,
            nudge=RecoveryNudgePayload(
                nudge_id=_as_str(row.get("id")),
                session_id=_as_str(row.get("session_id")),
                message=_as_str(
                    row.get("message"), default=_nudge_message(auth.locale)
                ),
                lapse_start_ts=lapse_start,
                created_at=created_at,
                correlation_id=_as_str(
                    row.get("correlation_id"), default=correlation_id
                ),
            ),
            correlation_id=correlation_id,
        )
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/nudge",
            message="Failed to fetch pending nudge",
            user_id=auth.user_id,
            correlation_id=correlation_id,
            area="nudge",
            err=err,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Recovery nudge service is temporarily unavailable",
        )


@router.post("/recovery/nudge/ack")
async def ack_nudge(
    body: RecoveryNudgeAckRequest,
    request: Request,
    response: Response,
    auth: AuthDep,
) -> dict[str, bool]:
    _ensure_nudge_enabled()
    correlation_id = _correlation_id(request, response)
    sb = SupabaseRest(str(settings.supabase_url), settings.supabase_anon_key)

    try:
        rows = await sb.select(
            "recovery_nudges",
            bearer_token=auth.access_token,
            params={
                "select": "id,user_id,session_id,status",
                "id": f"eq.{body.nudge_id}",
                "user_id": f"eq.{auth.user_id}",
                "limit": 1,
            },
        )
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Nudge not found"
            )

        nudge = rows[0]
        if _as_str(nudge.get("status")) == "shown":
            return {"ok": True}

        now = _utc_now()
        await sb.upsert_one(
            "recovery_nudges",
            bearer_token=auth.access_token,
            on_conflict="id",
            row={
                "id": body.nudge_id,
                "user_id": auth.user_id,
                "status": "shown",
                "shown_at": now.isoformat(),
                "correlation_id": correlation_id,
            },
        )

        session_id = _as_str(nudge.get("session_id"))
        try:
            await _track_event(
                user_id=auth.user_id,
                access_token=auth.access_token,
                event_type="nudge_shown",
                event_meta={
                    "lapse_id": session_id,
                    "nudge_id": body.nudge_id,
                    "channel": "in_app",
                },
                event_model=NudgeShownEventMeta,
                correlation_id=correlation_id,
                request_id=_event_request_id("nudge_shown", session_id),
            )
        except Exception as track_err:  # noqa: BLE001
            await _log_recovery_error(
                route="/api/recovery/nudge/ack",
                message="Failed to record nudge_shown event",
                user_id=auth.user_id,
                correlation_id=correlation_id,
                area="nudge",
                err=track_err,
                meta={"nudge_id": body.nudge_id, "session_id": session_id},
            )

        return {"ok": True}
    except HTTPException:
        raise
    except Exception as err:  # noqa: BLE001
        await _log_recovery_error(
            route="/api/recovery/nudge/ack",
            message="Failed to acknowledge nudge",
            user_id=auth.user_id,
            correlation_id=correlation_id,
            area="nudge",
            err=err,
            meta={"nudge_id": body.nudge_id},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Recovery nudge service is temporarily unavailable",
        )
