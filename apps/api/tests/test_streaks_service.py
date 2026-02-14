from __future__ import annotations

from datetime import date as Date

from app.services.streaks import compute_streaks, extract_log_dates


def test_compute_streaks_returns_five_for_five_consecutive_days() -> None:
    log_dates = [
        Date(2026, 2, 11),
        Date(2026, 2, 12),
        Date(2026, 2, 13),
        Date(2026, 2, 14),
        Date(2026, 2, 15),
    ]
    current, longest = compute_streaks(
        log_dates=log_dates,
        anchor_date=Date(2026, 2, 15),
    )

    assert current == 5
    assert longest == 5


def test_compute_streaks_resets_current_when_anchor_day_missing() -> None:
    log_dates = [
        Date(2026, 2, 10),
        Date(2026, 2, 11),
        Date(2026, 2, 12),
        Date(2026, 2, 13),
        Date(2026, 2, 14),
    ]
    current, longest = compute_streaks(
        log_dates=log_dates,
        anchor_date=Date(2026, 2, 15),
    )

    assert current == 0
    assert longest == 5


def test_extract_log_dates_ignores_invalid_rows() -> None:
    dates = extract_log_dates(
        [
            {"date": "2026-02-10"},
            {"date": "invalid"},
            {"date": Date(2026, 2, 12)},
            {"not_date": "2026-02-13"},
        ]
    )

    assert dates == [Date(2026, 2, 10), Date(2026, 2, 12)]
