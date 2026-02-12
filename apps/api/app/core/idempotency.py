from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Literal


IdempotencyState = Literal["acquired", "processing", "done"]


@dataclass
class _Entry:
    state: Literal["processing", "done"]
    expires_at: float


_lock = asyncio.Lock()
_entries: dict[str, _Entry] = {}
_MAX_KEYS = 20_000


def _cleanup(now: float) -> None:
    expired = [k for k, v in _entries.items() if v.expires_at <= now]
    for k in expired:
        _entries.pop(k, None)
    if len(_entries) > _MAX_KEYS:
        _entries.clear()


async def claim_idempotency_key(*, key: str, processing_ttl_seconds: int = 120) -> IdempotencyState:
    now = time.time()
    async with _lock:
        _cleanup(now)
        current = _entries.get(key)
        if current is None:
            _entries[key] = _Entry(state="processing", expires_at=now + max(processing_ttl_seconds, 30))
            return "acquired"
        return current.state


async def mark_idempotency_done(*, key: str, done_ttl_seconds: int = 600) -> None:
    now = time.time()
    async with _lock:
        _entries[key] = _Entry(state="done", expires_at=now + max(done_ttl_seconds, 60))


async def clear_idempotency_key(*, key: str) -> None:
    async with _lock:
        _entries.pop(key, None)

