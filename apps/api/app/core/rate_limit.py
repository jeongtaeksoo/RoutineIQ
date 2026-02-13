from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from fastapi import HTTPException, status


@dataclass
class WindowCounter:
    start: float
    count: int


_lock = asyncio.Lock()
_counters: dict[str, WindowCounter] = {}
_MAX_KEYS = 20_000


async def consume(*, key: str, limit: int, window_seconds: int) -> None:
    """
    In-memory fixed-window rate limiter.

    Notes:
    - Good enough for MVP/local; for multi-instance production, replace with Redis or similar.
    - We keep the response shape consistent with other API errors.
    """
    if limit <= 0:
        return

    now = time.time()
    async with _lock:
        if len(_counters) > _MAX_KEYS:
            _counters.clear()

        c = _counters.get(key)
        if c is None or (now - c.start) >= window_seconds:
            _counters[key] = WindowCounter(start=now, count=1)
            return

        if c.count >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "message": "Too many requests.",
                    "hint": "Please slow down and try again.",
                    "code": "RATE_LIMITED",
                },
            )

        c.count += 1
