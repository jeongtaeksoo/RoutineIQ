from __future__ import annotations

from datetime import date

import pytest
from unittest.mock import AsyncMock

from app.services.supabase_rest import SupabaseRest, SupabaseRestError
from app.services.usage import (
    count_daily_analyze_calls,
    estimate_cost_usd,
    insert_usage_event,
)


def test_estimate_cost_usd_returns_value() -> None:
    cost = estimate_cost_usd(input_tokens=1000, output_tokens=500)
    assert cost is not None
    assert cost > 0


@pytest.mark.asyncio
async def test_count_daily_analyze_calls_counts_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    select_mock = AsyncMock(return_value=[{"id": "u1"}, {"id": "u2"}, {"id": "u3"}])
    monkeypatch.setattr(SupabaseRest, "select", select_mock)

    used = await count_daily_analyze_calls(
        user_id="user-1",
        event_date=date(2026, 2, 15),
        access_token="token",
    )

    assert used == 3
    assert select_mock.await_count == 1


@pytest.mark.asyncio
async def test_insert_usage_event_fallbacks_when_service_conflict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upsert_mock = AsyncMock(
        side_effect=[
            SupabaseRestError(
                status_code=403,
                message="row-level security policy",
                code="42501",
            ),
            SupabaseRestError(
                status_code=400,
                message="unique constraint does not include request_id yet",
            ),
        ]
    )
    insert_mock = AsyncMock(return_value={})
    monkeypatch.setattr(SupabaseRest, "upsert_one", upsert_mock)
    monkeypatch.setattr(SupabaseRest, "insert_one", insert_mock)

    await insert_usage_event(
        user_id="user-1",
        event_date=date(2026, 2, 15),
        model="gpt-4o-mini",
        tokens_prompt=10,
        tokens_completion=20,
        tokens_total=30,
        cost_usd=0.001,
        request_id="req-1",
        access_token="token",
    )

    # service upsert fails, then user-scoped upsert also attempts, then fallback insert.
    assert upsert_mock.await_count >= 2
    assert insert_mock.await_count >= 1
