from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.recovery_engine import (
    compute_lapse_start,
    decide_auto_lapse,
    decide_nudge,
    is_quiet_hours,
)


def test_compute_lapse_start_uses_last_engaged_plus_threshold_hours() -> None:
    last_engaged = datetime(2026, 2, 17, 10, 0, tzinfo=timezone.utc)

    lapse_start = compute_lapse_start(last_engaged, 12)

    assert lapse_start == datetime(2026, 2, 17, 22, 0, tzinfo=timezone.utc)


def test_auto_lapse_threshold_boundary() -> None:
    last_engaged = datetime(2026, 2, 17, 8, 0, tzinfo=timezone.utc)
    at_boundary = datetime(2026, 2, 17, 20, 0, tzinfo=timezone.utc)
    just_before = datetime(2026, 2, 17, 19, 59, 59, tzinfo=timezone.utc)

    decision_before = decide_auto_lapse(
        now_utc=just_before,
        last_engaged_at=last_engaged,
        threshold_hours=12,
        has_open_session=False,
        last_auto_lapse_at=None,
        cooldown_hours=24,
    )
    decision_boundary = decide_auto_lapse(
        now_utc=at_boundary,
        last_engaged_at=last_engaged,
        threshold_hours=12,
        has_open_session=False,
        last_auto_lapse_at=None,
        cooldown_hours=24,
    )

    assert decision_before.should_create is False
    assert decision_before.reason == "below_threshold"
    assert decision_boundary.should_create is True
    assert decision_boundary.reason == "eligible"


def test_auto_lapse_respects_cooldown() -> None:
    now = datetime(2026, 2, 18, 10, 0, tzinfo=timezone.utc)
    last_engaged = now - timedelta(hours=40)
    last_auto = now - timedelta(hours=8)

    decision = decide_auto_lapse(
        now_utc=now,
        last_engaged_at=last_engaged,
        threshold_hours=12,
        has_open_session=False,
        last_auto_lapse_at=last_auto,
        cooldown_hours=24,
    )

    assert decision.should_create is False
    assert decision.reason == "cooldown"


def test_nudge_respects_24h_rate_limit() -> None:
    now = datetime(2026, 2, 18, 10, 0, tzinfo=timezone.utc)
    lapse_start = now - timedelta(hours=2)

    decision = decide_nudge(
        now_utc=now,
        lapse_start_ts=lapse_start,
        last_engaged_at=None,
        has_open_session=True,
        recovery_mode_opened=False,
        last_nudge_at=now - timedelta(hours=3),
        cooldown_hours=24,
        timezone_name="Asia/Seoul",
        locale="ko",
        quiet_start_hour=22,
        quiet_end_hour=8,
    )

    assert decision.should_send is False
    assert decision.reason == "nudge_rate_limited"


def test_quiet_hours_suppresses_nudge_with_timezone() -> None:
    # 14:30 UTC is 23:30 Asia/Seoul -> within quiet hours 22~08
    now = datetime(2026, 2, 18, 14, 30, tzinfo=timezone.utc)
    lapse_start = now - timedelta(hours=2)

    quiet = is_quiet_hours(
        now_utc=now,
        timezone_name="Asia/Seoul",
        locale="ko",
        quiet_start_hour=22,
        quiet_end_hour=8,
    )
    decision = decide_nudge(
        now_utc=now,
        lapse_start_ts=lapse_start,
        last_engaged_at=None,
        has_open_session=True,
        recovery_mode_opened=False,
        last_nudge_at=None,
        cooldown_hours=24,
        timezone_name="Asia/Seoul",
        locale="ko",
        quiet_start_hour=22,
        quiet_end_hour=8,
    )

    assert quiet is True
    assert decision.should_send is False
    assert decision.reason == "quiet_hours"
