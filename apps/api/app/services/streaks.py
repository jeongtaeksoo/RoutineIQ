from __future__ import annotations

from datetime import date as Date
from datetime import timedelta
from typing import Any


def _coerce_date(value: Any) -> Date | None:
    if isinstance(value, Date):
        return value
    if isinstance(value, str):
        try:
            return Date.fromisoformat(value)
        except ValueError:
            return None
    return None


def extract_log_dates(rows: list[dict[str, Any]] | None) -> list[Date]:
    if not rows:
        return []
    out: list[Date] = []
    for row in rows:
        dt = _coerce_date(row.get("date"))
        if dt is not None:
            out.append(dt)
    return out


def compute_streaks(*, log_dates: list[Date], anchor_date: Date) -> tuple[int, int]:
    if not log_dates:
        return 0, 0

    unique_dates = sorted(set(log_dates))
    date_set = set(unique_dates)

    current = 0
    cursor = anchor_date
    while cursor in date_set:
        current += 1
        cursor -= timedelta(days=1)

    longest = 0
    run = 0
    prev: Date | None = None
    for day in unique_dates:
        if prev is None or day == prev + timedelta(days=1):
            run += 1
        else:
            run = 1
        prev = day
        if run > longest:
            longest = run

    return current, longest
