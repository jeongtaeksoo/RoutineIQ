from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_DEFAULT_TZ_BY_LOCALE: dict[str, str] = {
    "ko": "Asia/Seoul",
    "ja": "Asia/Tokyo",
    "zh": "Asia/Shanghai",
    "es": "Europe/Madrid",
    "en": "America/New_York",
}


@dataclass(frozen=True)
class AutoLapseDecision:
    should_create: bool
    reason: str


@dataclass(frozen=True)
class NudgeDecision:
    should_send: bool
    reason: str


def to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def compute_lapse_start(last_engaged_at: datetime, threshold_hours: int) -> datetime:
    return to_utc(last_engaged_at) + timedelta(hours=max(1, int(threshold_hours)))


def decide_auto_lapse(
    *,
    now_utc: datetime,
    last_engaged_at: datetime | None,
    threshold_hours: int,
    has_open_session: bool,
    last_auto_lapse_at: datetime | None,
    cooldown_hours: int,
) -> AutoLapseDecision:
    if has_open_session:
        return AutoLapseDecision(False, "open_session_exists")
    if last_engaged_at is None:
        return AutoLapseDecision(False, "missing_last_engaged")

    now = to_utc(now_utc)
    last_engaged = to_utc(last_engaged_at)
    lapse_start = compute_lapse_start(last_engaged, threshold_hours)

    if now < lapse_start:
        return AutoLapseDecision(False, "below_threshold")

    if last_auto_lapse_at is not None:
        cooldown_until = to_utc(last_auto_lapse_at) + timedelta(
            hours=max(1, int(cooldown_hours))
        )
        if now < cooldown_until:
            return AutoLapseDecision(False, "cooldown")

    return AutoLapseDecision(True, "eligible")


def resolve_user_timezone(locale: str | None, timezone_name: str | None) -> ZoneInfo:
    if timezone_name:
        try:
            return ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError:
            pass
    key = (locale or "ko").strip().lower()
    fallback = _DEFAULT_TZ_BY_LOCALE.get(key, "UTC")
    return ZoneInfo(fallback)


def is_quiet_hours(
    *,
    now_utc: datetime,
    timezone_name: str | None,
    locale: str | None,
    quiet_start_hour: int,
    quiet_end_hour: int,
) -> bool:
    tz = resolve_user_timezone(locale, timezone_name)
    local_now = to_utc(now_utc).astimezone(tz)
    h = int(local_now.hour)
    start = int(quiet_start_hour) % 24
    end = int(quiet_end_hour) % 24

    if start == end:
        return False
    if start < end:
        return start <= h < end
    return h >= start or h < end


def decide_nudge(
    *,
    now_utc: datetime,
    lapse_start_ts: datetime,
    last_engaged_at: datetime | None,
    has_open_session: bool,
    recovery_mode_opened: bool,
    last_nudge_at: datetime | None,
    cooldown_hours: int,
    timezone_name: str | None,
    locale: str | None,
    quiet_start_hour: int,
    quiet_end_hour: int,
) -> NudgeDecision:
    now = to_utc(now_utc)
    lapse_start = to_utc(lapse_start_ts)

    if not has_open_session:
        return NudgeDecision(False, "no_open_session")

    if last_engaged_at is not None and to_utc(last_engaged_at) > lapse_start:
        return NudgeDecision(False, "reengaged")

    if recovery_mode_opened:
        return NudgeDecision(False, "recovery_mode_already_opened")

    if last_nudge_at is not None:
        limit = to_utc(last_nudge_at) + timedelta(hours=max(1, int(cooldown_hours)))
        if now < limit:
            return NudgeDecision(False, "nudge_rate_limited")

    if is_quiet_hours(
        now_utc=now,
        timezone_name=timezone_name,
        locale=locale,
        quiet_start_hour=quiet_start_hour,
        quiet_end_hour=quiet_end_hour,
    ):
        return NudgeDecision(False, "quiet_hours")

    return NudgeDecision(True, "eligible")
